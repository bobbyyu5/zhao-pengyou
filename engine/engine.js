// 找朋友 Zhao Pengyou — server-authoritative game engine (ENGINE_SPEC §1–§12).
//
// Pure, UI- and transport-agnostic. The SAME module backs single-device (bots) and online
// (server) play, which is what guarantees identical behavior. Full GameState lives only on
// the server; clients receive a redacted PlayerView (viewFor).
//
// House-rule decisions Robert must confirm after a playtest are isolated in config.js and
// in the LEVEL_RULES block below — never invented inline.

import { getConfig, LEVEL_START, scoreTier, KITTY_POINTS_COUNT, KITTY_POINTS_DOUBLED } from "./config.js";
import { makeRng, shuffle, randomSeed } from "./rng.js";
import {
  buildDeck, sortHand, isTrump, suitCategory, pointValue, SMALL_JOKER, BIG_JOKER,
} from "./cards.js";
import {
  detectFormation, validateFollow, findPairs, findTractors, isWinnerCandidate, beats, sumPoints,
} from "./formations.js";

/** @typedef {import("./cards.js").Card} Card */

// ─── LEVEL PROGRESSION RULES (ENGINE_SPEC §9–§11) — playtest-adjustable ──────────
// These encode how personal levels move. Kept as one readable block so Robert can correct
// after a real game without hunting through logic.
const LEVEL_MIN = 2;
const LEVEL_A = 14;       // passing A ends the round
const LEVEL_J = 11;
const LEVEL_Q = 12;
const LEVEL_K = 13;
// When the dealer loses, dealership passes to the next seat anti-clockwise (a grabber).
// Grabbers do not gain personal levels for winning a hand (only the dealership) except the
// J-dealer case in §9. Flip/extend here if the family plays it differently.
// ─────────────────────────────────────────────────────────────────────────────

function nextSeat(players, s) {
  return (s + 1) % players;
}

/** Deep-ish clone of mutable state (cards are immutable, so shallow-copy arrays). */
function clone(s) {
  return {
    ...s,
    levelsBySeat: s.levelsBySeat.slice(),
    jCounter: s.jCounter.slice(),
    hands: s.hands.map((h) => h.slice()),
    kitty: s.kitty.slice(),
    buried: s.buried.slice(),
    deck: s.deck.slice(),
    trick: s.trick.map((t) => ({ ...t, cards: t.cards.slice() })),
    friendCards: s.friendCards.map((f) => ({ ...f })),
    friendSeats: s.friendSeats.slice(),
    bids: s.bids.slice(),
    log: s.log.slice(),
    capturedPoints: s.capturedPoints.slice(),
  };
}

function pushLog(s, zh, en) {
  s.log = [{ zh, en }, ...s.log].slice(0, 60);
}

/**
 * Create a fresh game (one round, starting hand). Players sit at seats 0..n-1; seat 0 is the
 * shuffler / forced dealer if nobody bids.
 * @param {number} players
 * @param {string} [seed]
 */
export function newGame(players, seed = randomSeed()) {
  const config = getConfig(players);
  const rng = makeRng(seed);
  const s = {
    config,
    players,
    seed,
    _rng: rng,
    level: LEVEL_START,
    levelsBySeat: Array(players).fill(LEVEL_START),
    jCounter: Array(players).fill(0),
    trumpSuit: null,
    phase: "lobby",
    deck: [],
    hands: Array.from({ length: players }, () => []),
    kitty: [],
    buried: [],
    shuffler: 0,
    dealer: null,
    bid: null,          // { seat, suit|null, count, noTrump }
    bids: [],
    zhuaGuang: false,
    friendsToCall: config.friends,
    friendCards: [],
    friendSeats: [],
    turn: 0,
    leader: 0,
    trick: [],          // [{ seat, cards }]
    ledFormation: null,
    grabberPoints: 0,
    capturedPoints: [], // 0/1 per trick: 1 if grabbers took that trick's points
    tricksPlayed: 0,
    lastTrickWinner: null,
    lastTrickByGrabber: false,
    result: null,
    roundOver: false,
    roundWinner: null,
    handNumber: 1,
    dealtCount: 0,
    log: [],
  };
  return startDraw(s);
}

/** Begin the deal/draw: shuffle all decks, set phase to "draw". */
function startDraw(s) {
  const out = clone(s);
  out.level = out.levelsBySeat[out.dealer ?? out.shuffler];
  out.deck = shuffle(buildDeck(out.config.decks), out._rng);
  out.hands = Array.from({ length: out.players }, () => []);
  out.kitty = [];
  out.buried = [];
  out.dealer = null;
  out.bid = null;
  out.bids = [];
  out.zhuaGuang = false;
  out.friendsToCall = out.config.friends;
  out.friendCards = [];
  out.friendSeats = [];
  out.trick = [];
  out.ledFormation = null;
  out.grabberPoints = 0;
  out.capturedPoints = [];
  out.tricksPlayed = 0;
  out.lastTrickWinner = null;
  out.lastTrickByGrabber = false;
  out.result = null;
  out.dealtCount = 0;
  out.trumpSuit = null;
  out.phase = "draw";
  pushLog(out, "发牌中：边发边叫。亮出本级牌定主。", "Live draw: expose rank cards to bid trump.");
  return out;
}

/** Deal one card to the next seat in rotation (anti-clockwise from shuffler's right). */
export function dealNext(s) {
  if (s.phase !== "draw") throw new Error("dealNext only during draw");
  const out = clone(s);
  const total = out.config.perPlayer * out.players;
  if (out.dealtCount >= total) return finishDraw(out);
  // start dealing to the seat right of the shuffler, go around
  const seat = (out.shuffler + 1 + out.dealtCount) % out.players;
  out.hands[seat].push(out.deck[out.dealtCount]);
  out.dealtCount += 1;
  if (out.dealtCount >= total) return finishDraw(out);
  return out;
}

/**
 * Deal all cards but STAY in the draw phase (no dealer/trump resolved yet). Lets the UI run
 * a post-deal bid window before closing the draw with closeDraw().
 */
export function dealCardsOnly(s) {
  if (s.phase !== "draw") throw new Error("dealCardsOnly only during draw");
  const out = clone(s);
  const total = out.config.perPlayer * out.players;
  for (let i = out.dealtCount; i < total; i++) {
    const seat = (out.shuffler + 1 + i) % out.players;
    out.hands[seat].push(out.deck[i]);
  }
  out.dealtCount = total;
  out.hands = out.hands.map((h) => sortHand(h, out.level, out.trumpSuit));
  return out;
}

/** Close the draw: resolve dealer + trump and move to the bury phase. */
export function closeDraw(s) {
  if (s.phase !== "draw") throw new Error("closeDraw only during draw");
  return finishDraw(s);
}

/** Deal everything at once (used by tests and the simplified single-device flow). */
export function dealAll(s) {
  let out = clone(s);
  const total = out.config.perPlayer * out.players;
  for (let i = 0; i < total; i++) {
    const seat = (out.shuffler + 1 + i) % out.players;
    out.hands[seat].push(out.deck[i]);
  }
  out.dealtCount = total;
  return finishDraw(out);
}

/**
 * Record a bid during the draw. A bid exposes `count` copies of the level rank in `suit`
 * (or `count` jokers when noTrump). More copies beats fewer; no-trump beats suited at equal
 * count; ties keep the standing (earlier) bid.
 */
export function bid(s, seat, b) {
  if (s.phase !== "draw") throw new Error("bid only during draw");
  const out = clone(s);
  const hand = out.hands[seat];
  // validate the seat actually holds what they expose
  if (b.noTrump) {
    const jokers = hand.filter((c) => c.suit === "JOKER").length;
    if (jokers < b.count || b.count < 1) throw new Error("invalid no-trump bid: jokers not held");
  } else {
    const held = hand.filter((c) => c.suit === b.suit && c.rank === out.level).length;
    if (held < b.count || b.count < 1) throw new Error("invalid bid: rank cards not held");
  }
  const cur = out.bid;
  const better =
    !cur ||
    b.count > cur.count ||
    (b.count === cur.count && b.noTrump && !cur.noTrump);
  out.bids.push({ seat, ...b });
  if (better) {
    out.bid = { seat, suit: b.noTrump ? null : b.suit, count: b.count, noTrump: !!b.noTrump };
    out.trumpSuit = out.bid.suit;
    pushLog(out, `${seat} 叫主：${b.noTrump ? "无主" : suitName(b.suit)} ×${b.count}`,
      `Seat ${seat} bids ${b.noTrump ? "no-trump" : b.suit} ×${b.count}`);
  }
  return out;
}

function suitName(suit) {
  return { S: "黑桃", H: "红桃", C: "梅花", D: "方块" }[suit] || "无主";
}

/** Resolve dealer + trump at the end of the draw; handle naked dealer; hand the kitty in. */
function finishDraw(s) {
  const out = clone(s);
  const total = out.config.perPlayer * out.players;
  out.kitty = out.deck.slice(total, total + out.config.kitty);

  if (out.bid) {
    out.dealer = out.bid.seat;
    out.trumpSuit = out.bid.suit; // null => no-trump (jokers/rank only)
  } else {
    // No bid: shuffler is the forced, naked dealer (§4.4–4.5). Expose one kitty card for trump.
    out.dealer = out.shuffler;
    const revealed = out.kitty.find((c) => c.suit !== "JOKER") || out.kitty[0];
    out.trumpSuit = revealed.suit === "JOKER" ? null : revealed.suit;
    pushLog(out, `无人叫主，洗牌者 ${out.dealer} 被迫坐庄；翻底定主 ${suitName(out.trumpSuit)}。`,
      `No bid: shuffler ${out.dealer} is naked dealer; kitty sets trump.`);
  }

  out.level = out.levelsBySeat[out.dealer];
  // Dealer takes the kitty into hand; will bury an equal number.
  out.hands[out.dealer] = out.hands[out.dealer].concat(out.kitty);
  out.kitty = [];
  out.hands = out.hands.map((h) => sortHand(h, out.level, out.trumpSuit));
  out.phase = "bury";
  out.friendsToCall = out.config.friends;
  pushLog(out, `庄家：${out.dealer}；主：${suitName(out.trumpSuit)}；打 ${out.level}。拿底牌、埋牌。`,
    `Dealer ${out.dealer}; trump ${out.trumpSuit ?? "none"}; level ${out.level}. Bury the kitty.`);
  return out;
}

/** 6-player only (§6): before looking at the kitty, dealer claims 2 friends by exposing it. */
export function setZhuaGuang(s, on) {
  if (s.phase !== "bury") throw new Error("zhuaGuang only before burying");
  if (!s.config.zhuaGuang) throw new Error("zhuaGuang not available at this seat count");
  const out = clone(s);
  out.zhuaGuang = !!on;
  out.friendsToCall = on ? 2 : s.config.friends;
  return out;
}

/** Dealer buries exactly `config.kitty` cards from hand. */
export function buryKitty(s, seat, cards) {
  if (s.phase !== "bury") throw new Error("not in bury phase");
  if (seat !== s.dealer) throw new Error("only the dealer buries");
  if (cards.length !== s.config.kitty) throw new Error(`must bury exactly ${s.config.kitty}`);
  const out = clone(s);
  const ids = new Set(cards.map((c) => c.id));
  if (ids.size !== cards.length) throw new Error("duplicate cards in bury");
  for (const id of ids) if (!out.hands[seat].some((c) => c.id === id)) throw new Error("card not in hand");
  out.buried = out.hands[seat].filter((c) => ids.has(c.id));
  out.hands[seat] = out.hands[seat].filter((c) => !ids.has(c.id));
  out.phase = "call";
  pushLog(out, "埋牌完成。叫朋友：指定 1–2 张牌，第一个打出者成为庄家方朋友。",
    "Kitty buried. Call friend card(s): first to play one joins the dealer's side.");
  return out;
}

/** Dealer names the friend card(s). First player to PLAY a called card becomes a friend. */
export function callFriends(s, seat, cards) {
  if (s.phase !== "call") throw new Error("not in call phase");
  if (seat !== s.dealer) throw new Error("only the dealer calls");
  if (cards.length !== s.friendsToCall) throw new Error(`must call exactly ${s.friendsToCall}`);
  const out = clone(s);
  out.friendCards = cards.map((c) => ({ suit: c.suit, rank: c.rank }));
  out.friendSeats = [];
  out.turn = out.dealer;     // dealer leads the first trick
  out.leader = out.dealer;
  out.trick = [];
  out.ledFormation = null;
  out.phase = "play";
  const names = out.friendCards.map((f) => `${f.suit}${f.rank}`).join(", ");
  pushLog(out, `叫朋友：${names}。庄家先出。`, `Friends called: ${names}. Dealer leads.`);
  // If the dealer holds ALL called copies across the table, dealer is solo (handled at scoring).
  return out;
}

function dealerSideSeats(s) {
  return new Set([s.dealer, ...s.friendSeats]);
}

/**
 * Legal candidate moves for a seat. When leading: singles, pairs, tractors the seat can
 * form. When following: the constrained set per §7. The server validates the actual play
 * via playMove; this list drives bots and the UI legal-move glow.
 * @returns {{type:string, cards:Card[]}[]}
 */
export function legalMoves(s, seat) {
  if (s.phase !== "play" || s.turn !== seat) return [];
  const hand = s.hands[seat];
  const level = s.level, trump = s.trumpSuit;

  if (s.trick.length === 0) {
    // Leading: any single, any pair, any tractor.
    const moves = hand.map((c) => ({ type: "single", cards: [c] }));
    for (const p of findPairs(hand)) moves.push({ type: "pair", cards: p });
    for (const t of findTractors(hand, level, trump)) {
      moves.push({ type: "tractor", cards: t.flat() });
    }
    return moves;
  }

  const led = s.ledFormation;
  const inCat = hand.filter((c) => suitCategory(c, level, trump) === led.category);
  const n = led.length;

  // Build a faithful set of legal following plays without enumerating the full power set.
  /** @type {{type:string,cards:Card[]}[]} */
  const out = [];
  const catPairs = findPairs(inCat);

  if (led.type === "single") {
    const pool = inCat.length ? inCat : hand;
    for (const c of pool) out.push({ type: "single", cards: [c] });
    return dedupeMoves(out);
  }

  if (led.type === "pair") {
    if (catPairs.length) {
      for (const p of catPairs) out.push({ type: "pair", cards: p });
      return dedupeMoves(out);
    }
    if (inCat.length >= 2) {
      // must play 2 of the category (no pair available)
      out.push({ type: "follow", cards: inCat.slice(0, 2) });
      return out;
    }
    if (inCat.length === 1) {
      const other = hand.find((c) => c.id !== inCat[0].id);
      out.push({ type: "follow", cards: [inCat[0], other].filter(Boolean) });
      return out;
    }
    // free: prefer a trump pair to ruff, else any 2
    const trumpPairs = findPairs(hand.filter((c) => isTrump(c, level, trump)));
    for (const p of trumpPairs) out.push({ type: "pair", cards: p });
    if (hand.length >= 2) out.push({ type: "follow", cards: pickLowest(hand, level, trump, 2) });
    return out.length ? dedupeMoves(out) : [{ type: "follow", cards: hand.slice(0, n) }];
  }

  // tractor lead: produce one compliant play (follow suit, keep pairs, match count).
  out.push({ type: "follow", cards: buildTractorFollow(hand, inCat, catPairs, led, level, trump) });
  // also offer a same-length trump tractor to ruff, when free of the category
  if (inCat.length === 0) {
    for (const t of findTractors(hand, level, trump)) {
      if (t.length === led.pairs) out.push({ type: "tractor", cards: t.flat() });
    }
  }
  return dedupeMoves(out);
}

/**
 * Compute the viewing seat's legal moves from a PlayerView alone (own hand + public trick).
 * Used client-side for the legal-move glow; the server still validates authoritatively.
 */
export function clientLegalMoves(view) {
  if (!view || view.phase !== "play" || view.turn !== view.you) return [];
  const hands = [];
  for (let i = 0; i < view.players; i++) hands[i] = i === view.you ? view.yourHand : [];
  const led = view.trick.length
    ? detectFormation(view.trick[0].cards, view.level, view.trumpSuit)
    : null;
  const pseudo = {
    phase: "play", turn: view.you, players: view.players, hands,
    trick: view.trick, ledFormation: led, level: view.level, trumpSuit: view.trumpSuit,
  };
  return legalMoves(pseudo, view.you);
}

function pickLowest(hand, level, trump, k) {
  const sorted = sortHand(hand, level, trump); // high→low
  return sorted.slice(-k);
}

function buildTractorFollow(hand, inCat, catPairs, led, level, trump) {
  const n = led.length;
  const chosen = [];
  const used = new Set();
  // 1) commit category pairs first (keep pairs together)
  for (const p of catPairs) {
    if (chosen.length + 2 > n) break;
    chosen.push(p[0], p[1]); used.add(p[0].id); used.add(p[1].id);
  }
  // 2) fill with remaining category singles
  for (const c of inCat) {
    if (chosen.length >= n) break;
    if (!used.has(c.id)) { chosen.push(c); used.add(c.id); }
  }
  // 3) fill from the rest of the hand (lowest first)
  if (chosen.length < n) {
    for (const c of sortHand(hand, level, trump).reverse()) {
      if (chosen.length >= n) break;
      if (!used.has(c.id)) { chosen.push(c); used.add(c.id); }
    }
  }
  return chosen.slice(0, n);
}

function dedupeMoves(moves) {
  const seen = new Set();
  const out = [];
  for (const m of moves) {
    const k = m.cards.map((c) => c.id).sort().join(",");
    if (!seen.has(k)) { seen.add(k); out.push(m); }
  }
  return out;
}

/**
 * Validate + apply a play. Server-authoritative: rejects anything illegal. Cards are matched
 * by id against the seat's hand.
 * @returns new GameState
 */
export function playMove(s, seat, cards) {
  if (s.phase !== "play") throw new Error("not in play phase");
  if (s.turn !== seat) throw new Error("not your turn");
  if (!Array.isArray(cards) || cards.length === 0) throw new Error("no cards");

  const hand = s.hands[seat];
  const handIds = new Set(hand.map((c) => c.id));
  const realCards = cards.map((c) => {
    const found = hand.find((h) => h.id === c.id);
    if (!found) throw new Error(`card ${c.id} not in hand`);
    return found;
  });
  if (new Set(realCards.map((c) => c.id)).size !== realCards.length) throw new Error("duplicate cards");

  const level = s.level, trump = s.trumpSuit;
  const isLead = s.trick.length === 0;

  if (isLead) {
    const form = detectFormation(realCards, level, trump);
    if (!form.valid) throw new Error("非法牌型 (illegal formation for a lead)");
  } else {
    const led = s.ledFormation;
    const check = validateFollow(hand, led, realCards, level, trump);
    if (!check.ok) throw new Error(check.reason);
  }

  const out = clone(s);
  // remove cards from hand
  out.hands[seat] = out.hands[seat].filter((c) => !realCards.some((r) => r.id === c.id));

  // friend reveal: first to PLAY a called card joins the dealer's side
  if (out.friendSeats.length < out.friendCards.length && seat !== out.dealer && !out.friendSeats.includes(seat)) {
    for (let i = 0; i < out.friendCards.length; i++) {
      const fc = out.friendCards[i];
      const alreadyClaimed = out.friendSeats.length; // simple: each call consumed in order
      const hit = realCards.find((c) => c.suit === fc.suit && c.rank === fc.rank);
      if (hit && !out.friendSeats.includes(seat) && out.friendSeats.length < out.friendCards.length) {
        // only claim if this specific called card hasn't been matched yet
        if (!out._claimedFriendCards) out._claimedFriendCards = [];
        if (!out._claimedFriendCards.includes(i)) {
          out._claimedFriendCards.push(i);
          out.friendSeats.push(seat);
          pushLog(out, `${seat} 打出朋友牌 ${fc.suit}${fc.rank}，成为庄家方朋友！`,
            `Seat ${seat} played the friend card — joins the dealer's side!`);
          break;
        }
      }
    }
  }

  out.trick.push({ seat, cards: realCards });
  if (isLead) out.ledFormation = detectFormation(realCards, level, trump);

  if (out.trick.length === out.players) {
    return resolveTrick(out);
  }
  out.turn = nextSeat(out.players, seat);
  return out;
}

/** Resolve a completed trick: find the winner, award points if grabbers won. */
function resolveTrick(s) {
  const out = s; // already a clone
  const led = out.ledFormation;
  const level = out.level, trump = out.trumpSuit;
  let winnerIdx = 0;
  let bestForm = detectFormation(out.trick[0].cards, level, trump);
  for (let i = 1; i < out.trick.length; i++) {
    const form = detectFormation(out.trick[i].cards, level, trump);
    if (isWinnerCandidate(form, led) && beats(form, bestForm, level, trump, led.category)) {
      bestForm = form; winnerIdx = i;
    }
  }
  const winnerSeat = out.trick[winnerIdx].seat;
  const points = sumPoints(out.trick.flatMap((t) => t.cards));
  const grabbers = !dealerSideSeats(out).has(winnerSeat);
  if (grabbers && points > 0) out.grabberPoints += points;
  out.capturedPoints.push(grabbers ? points : 0);
  out.tricksPlayed += 1;
  out.lastTrickWinner = winnerSeat;
  out.lastTrickByGrabber = grabbers;
  out._lastTrickCards = out.trick.map((t) => ({ seat: t.seat, cards: t.cards.slice() }));
  out._lastTrickWinnerForm = bestForm;
  pushLog(out, `${winnerSeat} 赢墩 (${points} 分)${grabbers ? " · 抓分方" : ""}。`,
    `Seat ${winnerSeat} wins the trick (${points} pts)${grabbers ? " — grabbers" : ""}.`);

  out.trick = [];
  out.ledFormation = null;
  out.leader = winnerSeat;
  out.turn = winnerSeat;

  // hand over when all hands empty
  if (out.hands.every((h) => h.length === 0)) {
    return scoreHand(out);
  }
  return out;
}

/**
 * Score the hand (§8–§10): grabber total vs pass line → tier → level changes, with J-level
 * specials and Gou Dao Di. Sets result, advances levels, picks the next dealer, flags round
 * end. Returns the scored state (phase "scoring").
 */
export function scoreHand(s) {
  const out = clone(s);
  const passLine = out.config.passLine;
  let grabberPoints = out.grabberPoints;

  // Optional: kitty points to grabbers if they won the last trick (house rule, off by default).
  let kittyAwarded = 0;
  if (KITTY_POINTS_COUNT && out.lastTrickByGrabber) {
    kittyAwarded = sumPoints(out.buried) * (KITTY_POINTS_DOUBLED ? 2 : 1);
    grabberPoints += kittyAwarded;
  }

  const solo = out.friendSeats.length === 0 && out.friendCards.length > 0
    ? dealerHoldsAllFriendCards(s) : out.friendSeats.length === 0;
  const tier = scoreTier(grabberPoints, passLine);

  // Gou Dao Di (§10): J-level only, grabber wins last trick with a J, pushing ≥ pass line.
  const gdd = detectGouDaoDi(out, grabberPoints, passLine);

  const dealer = out.dealer;
  const friends = out.friendSeats.slice();
  const dealerWon = tier.key !== "dealer_loses" && !gdd;

  const changes = [];
  if (gdd) {
    // Penalty: dealer → 2; each friend → ceil(level/2), min 2 (Q→6, K→7).
    out.levelsBySeat[dealer] = LEVEL_MIN;
    changes.push({ seat: dealer, role: "dealer", to: LEVEL_MIN, note: "钩到底" });
    for (const f of friends) {
      const lv = Math.max(LEVEL_MIN, Math.ceil(out.levelsBySeat[f] / 2));
      out.levelsBySeat[f] = lv;
      changes.push({ seat: f, role: "friend", to: lv, note: "钩到底" });
    }
  } else {
    // Dealer change (with J special)
    out.levelsBySeat[dealer] = applyLevel(out, dealer, "dealer", tier, dealerWonForRole(tier));
    changes.push({ seat: dealer, role: "dealer", to: out.levelsBySeat[dealer] });
    if (!solo) {
      for (const f of friends) {
        out.levelsBySeat[f] = applyLevel(out, f, "friend", tier, dealerWonForRole(tier));
        changes.push({ seat: f, role: "friend", to: out.levelsBySeat[f] });
      }
    }
  }

  // Round end: a dealer-side win while the dealer was at A passes A and ends the round.
  let roundOver = false;
  let roundWinner = null;
  if (dealerWon && out.level === LEVEL_A) {
    roundOver = true;
    roundWinner = "dealer";
  }

  out.result = {
    tier: tier.key,
    grabberPoints,
    kittyAwarded,
    passLine,
    dealerSeat: dealer,
    friendSeats: friends,
    solo,
    gouDaoDi: gdd,
    dealerWon,
    changes,
    levelsBySeat: out.levelsBySeat.slice(),
  };
  out.roundOver = roundOver;
  out.roundWinner = roundWinner;
  out.phase = "scoring";

  // pick next dealer
  if (!roundOver) {
    out._nextDealer = dealerWon ? dealer : nextSeat(out.players, dealer);
  }
  pushLog(out, scoreSummaryZh(out.result), scoreSummaryEn(out.result));
  return out;
}

function dealerWonForRole(tier) {
  return tier.key !== "dealer_loses";
}

function dealerHoldsAllFriendCards() {
  // If no friend ever revealed and the dealer side has no friends, the dealer played solo.
  // (We can't see other hands post-hand reliably; treat "no friend revealed" as solo.)
  return true;
}

/**
 * Apply a level change for one seat per §9. `won` true if the dealer side won the hand.
 * Returns the new level for that seat.
 */
function applyLevel(s, seat, role, tier, won) {
  const cur = s.levelsBySeat[seat];

  if (cur === LEVEL_J) {
    if (role === "dealer") {
      if (won) return LEVEL_K;           // J win → jump to K (skip Q)
      return 9;                          // J loss → drop to 9
    }
    if (role === "friend") {
      // personal counter J → J+1 → J+2 → Q on wins; reverse on losses (non-consecutive ok)
      if (won) {
        s.jCounter[seat] = Math.min(3, s.jCounter[seat] + 1);
        if (s.jCounter[seat] >= 3) { s.jCounter[seat] = 0; return LEVEL_Q; }
        return LEVEL_J;                  // still plays at J until reaching Q
      }
      s.jCounter[seat] = Math.max(0, s.jCounter[seat] - 1);
      return LEVEL_J;
    }
  }

  // normal progression: apply the tier delta, clamp to [2, A]
  const delta = role === "dealer" ? tier.dealer : tier.friend;
  return clamp(cur + delta, LEVEL_MIN, LEVEL_A);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Gou Dao Di detection (§10) — best-effort; all five conditions must hold. */
function detectGouDaoDi(s, grabberPoints, passLine) {
  if (s.level !== LEVEL_J) return false;
  if (!s.lastTrickByGrabber) return false;
  // grabber won the last trick by playing a J
  const winForm = s._lastTrickWinnerForm;
  if (!winForm) return false;
  const winnerPlay = (s._lastTrickCards || []).find((t) => t.seat === s.lastTrickWinner);
  const playedJ = winnerPlay && winnerPlay.cards.some((c) => c.rank === LEVEL_J);
  if (!playedJ) return false;
  // this push crossed the pass line
  if (grabberPoints < passLine) return false;
  return true;
}

function scoreSummaryZh(r) {
  const tierZh = {
    dealer_loses: "庄家失败", dealer_wins: "庄家胜", small_sweep: "小光", big_sweep: "大光",
  }[r.tier];
  if (r.gouDaoDi) return `钩到底！庄家降至 2 级，朋友减半。`;
  return `${tierZh}：抓分方 ${r.grabberPoints}/${r.passLine} 分。`;
}
function scoreSummaryEn(r) {
  const tierEn = {
    dealer_loses: "Dealer loses", dealer_wins: "Dealer wins", small_sweep: "Small sweep 小光", big_sweep: "Big sweep 大光",
  }[r.tier];
  if (r.gouDaoDi) return `Gou Dao Di! Dealer → level 2, friends halved.`;
  return `${tierEn}: grabbers ${r.grabberPoints}/${r.passLine}.`;
}

/** Start the next hand of the same round (after scoring), or signal round over. */
export function nextHand(s) {
  if (s.phase !== "scoring") throw new Error("can only advance after scoring");
  if (s.roundOver) return { ...clone(s), phase: "done" };
  const out = clone(s);
  out.shuffler = out._nextDealer;
  out.dealer = out._nextDealer;
  out.handNumber += 1;
  delete out._nextDealer;
  delete out._lastTrickCards;
  delete out._lastTrickWinnerForm;
  delete out._claimedFriendCards;
  return startDraw(out);
}

// ─── Redaction ───────────────────────────────────────────────────────────────
/**
 * Per-seat PlayerView (§12). Never includes other hands, the deck, the kitty, or the buried
 * cards. Safe to send to a client.
 */
export function viewFor(s, seat) {
  return {
    you: seat,
    yourHand: (s.hands[seat] || []).slice(),
    phase: s.phase,
    level: s.level,
    trumpSuit: s.trumpSuit,
    dealer: s.dealer,
    shuffler: s.shuffler,
    friendSeats: s.friendSeats.slice(),
    friendCards: seat === s.dealer ? s.friendCards.slice() : maskFriendCards(s),
    zhuaGuang: s.zhuaGuang,
    friendsToCall: s.friendsToCall,
    turn: s.turn,
    leader: s.leader,
    trick: s.trick.map((t) => ({ seat: t.seat, cards: t.cards.slice() })),
    ledFormation: s.ledFormation ? { type: s.ledFormation.type, length: s.ledFormation.length } : null,
    grabberPoints: s.grabberPoints,
    passLine: s.config.passLine,
    handCounts: s.hands.map((h) => h.length),
    levelsBySeat: s.levelsBySeat.slice(),
    tricksPlayed: s.tricksPlayed,
    config: s.config,
    players: s.players,
    bid: s.bid,
    result: s.result,
    roundOver: s.roundOver,
    roundWinner: s.roundWinner,
    handNumber: s.handNumber,
    dealtCount: s.dealtCount,
    log: s.log.slice(0, 20),
    lastTrickWinner: s.lastTrickWinner,
  };
}

// Friend cards are public once called (everyone needs to know what to watch for), but we
// only expose the card identities, not who holds them.
function maskFriendCards(s) {
  return s.phase === "play" || s.phase === "scoring" || s.phase === "done"
    ? s.friendCards.slice()
    : [];
}

export { dealerSideSeats };
