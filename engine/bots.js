// Legal-but-reasonable bots. They use only legalMoves + the PUBLIC table state — never peek
// at other hands — so the same decision function is safe to run anywhere. Not a strong AI;
// good enough for rules-checking and a solo game vs. the table.

import { legalMoves, dealerSideSeats } from "./engine.js";
import { isTrump, sortHand, pointValue } from "./cards.js";
import { sumPoints, detectFormation } from "./formations.js";

/**
 * Choose a bid during the draw from a seat's own hand. Returns a bid or null (pass).
 *
 * Deliberately CONSERVATIVE so a human player usually gets to declare trump: bots only bid a
 * suit when they hold 2+ of the level rank (a real holding), and only bid no-trump with a
 * strong joker count (3+). A human with a single rank card can then claim trump unopposed.
 */
export function botBid(state, seat) {
  const hand = state.hands[seat];
  const level = state.level;
  const jokers = hand.filter((c) => c.suit === "JOKER").length;

  const counts = { S: 0, H: 0, C: 0, D: 0 };
  for (const c of hand) if (c.suit !== "JOKER" && c.rank === level) counts[c.suit]++;
  let bestSuit = null, bestCount = 0;
  for (const s of Object.keys(counts)) if (counts[s] > bestCount) { bestSuit = s; bestCount = counts[s]; }

  const cur = state.bid;
  // Suited bid only with a genuine holding (2+), and only if it beats the standing bid.
  if (bestCount >= 2 && (!cur || bestCount > cur.count)) return { suit: bestSuit, count: bestCount };
  // No-trump only with a strong joker holding (3+).
  if (jokers >= 3 && (!cur || jokers > cur.count || (jokers === cur.count && !cur.noTrump))) {
    return { noTrump: true, count: jokers };
  }
  return null;
}

/** Pick which cards to bury (dealer). Discards lowest non-point, non-trump cards. */
export function botBury(state, seat) {
  const hand = state.hands[seat];
  const level = state.level, trump = state.trumpSuit;
  const n = state.config.kitty;
  // rank cards: lower priority to keep are non-trump non-point low singles
  const scored = hand.map((c) => ({
    c,
    keep:
      (isTrump(c, level, trump) ? 1000 : 0) +
      pointValue(c) * 5 +
      c.rank,
  }));
  scored.sort((a, b) => a.keep - b.keep); // lowest keep-score first = bury first
  // avoid burying point cards if possible
  const nonPoint = scored.filter((x) => pointValue(x.c) === 0);
  const pool = nonPoint.length >= n ? nonPoint : scored;
  return pool.slice(0, n).map((x) => x.c);
}

/** Pick the friend card(s) to call (dealer). Calls a high non-trump rank (never the level rank). */
export function botCallFriends(state, seat) {
  const need = state.friendsToCall;
  const trump = state.trumpSuit;
  // Highest rank that isn't the level rank (which is trump and can't be called).
  const callRank = [14, 13, 12, 11, 10].find((r) => r !== state.level) || 13;
  const suitsByPreference = ["S", "H", "C", "D"].filter((s) => s !== trump).concat(trump ? [trump] : []);
  const calls = [];
  for (const s of suitsByPreference) {
    if (calls.length >= need) break;
    calls.push({ suit: s, rank: callRank });
  }
  while (calls.length < need) calls.push({ suit: suitsByPreference[0] || "S", rank: callRank });
  return calls.slice(0, need);
}

/** Is this card one the dealer called to find a friend? */
function isCalledFriendCard(card, state) {
  return (state.friendCards || []).some((f) => f.suit === card.suit && f.rank === card.rank);
}

/** Choose a play during a trick. Uses legalMoves + public points only. */
export function botPlay(state, seat) {
  let moves = legalMoves(state, seat);
  if (moves.length === 0) return null;
  const level = state.level, trump = state.trumpSuit;
  const dealerSide = dealerSideSeats(state);
  const onDealerSide = dealerSide.has(seat);

  // Don't reveal by slapping down the called friend card (e.g. the Ace when a K is led) unless
  // it's the only legal option — hold it. Once the bot is already a revealed friend, this is moot.
  const alreadyFriend = state.friendSeats?.includes(seat);
  if (!alreadyFriend && (state.friendCards || []).length) {
    const noReveal = moves.filter((m) => !m.cards.some((c) => isCalledFriendCard(c, state)));
    if (noReveal.length) moves = noReveal;
  }

  const trickPts = sumPoints(state.trick.flatMap((t) => t.cards));

  if (state.trick.length === 0) {
    // Leading: lead a low single most of the time; occasionally a low pair/tractor.
    const tractors = moves.filter((m) => m.type === "tractor");
    const pairs = moves.filter((m) => m.type === "pair");
    const singles = moves.filter((m) => m.type === "single");
    const lowestSingle = minBy(singles, (m) => strength(m.cards[0], level, trump));
    // lead a non-point low single to probe
    return lowestSingle || pairs[0] || tractors[0] || moves[0];
  }

  // Following: if we're on the side that wants the points and we can likely win, play strong;
  // else dump lowest. We approximate "can win" by whether our move is trump or high.
  const led = state.ledFormation;
  const winningCandidates = moves.filter((m) => {
    const f = detectFormation(m.cards, level, trump);
    return f.type === led.type && f.length === led.length;
  });

  // current best on table
  const curBest = bestOnTable(state);
  const wantWin = shouldTryWin(state, seat, onDealerSide, trickPts);

  if (wantWin) {
    // among winning candidates, pick the cheapest that beats the current best
    const beatsAll = winningCandidates.filter((m) =>
      strength(detectFormation(m.cards, level, trump).top, level, trump) > curBest);
    const pick = minBy(beatsAll, (m) => strength(detectFormation(m.cards, level, trump).top, level, trump));
    if (pick) return pick;
  }
  // otherwise: if on dealer side and the trick already belongs to our side, feed points
  const tableWinnerIsOurs = dealerSide.has(currentWinnerSeat(state)) === onDealerSide;
  if (tableWinnerIsOurs) {
    const pointful = maxBy(moves, (m) => sumPoints(m.cards));
    if (pointful && sumPoints(pointful.cards) > 0) return pointful;
  }
  // default: dump the lowest cards
  return minBy(moves, (m) => moveStrength(m, level, trump)) || moves[0];
}

function shouldTryWin(state, seat, onDealerSide, trickPts) {
  // try to win if there are points on the table, or to take the lead occasionally
  return trickPts >= 5;
}

function bestOnTable(state) {
  const level = state.level, trump = state.trumpSuit;
  const led = state.ledFormation;
  let best = -Infinity;
  for (const t of state.trick) {
    const f = detectFormation(t.cards, level, trump);
    if (f.type === led.type && f.length === led.length) {
      best = Math.max(best, strength(f.top, level, trump));
    }
  }
  return best;
}

function currentWinnerSeat(state) {
  const level = state.level, trump = state.trumpSuit;
  const led = state.ledFormation;
  let bestSeat = state.trick[0]?.seat;
  let best = -Infinity;
  for (const t of state.trick) {
    const f = detectFormation(t.cards, level, trump);
    if (f.type === led.type && f.length === led.length) {
      const st = strength(f.top, level, trump);
      if (st > best) { best = st; bestSeat = t.seat; }
    }
  }
  return bestSeat;
}

function strength(card, level, trump) {
  if (isTrump(card, level, trump)) {
    // mirror trumpStrength ordering with a big offset
    if (card.suit === "JOKER") return card.rank === 16 ? 2000 : 1900;
    if (card.rank === level) return trump && card.suit === trump ? 1800 : 1700;
    return 1100 + card.rank;
  }
  return card.rank;
}

function moveStrength(m, level, trump) {
  return Math.max(...m.cards.map((c) => strength(c, level, trump)));
}

function minBy(arr, f) {
  let best = null, bestV = Infinity;
  for (const x of arr) { const v = f(x); if (v < bestV) { bestV = v; best = x; } }
  return best;
}
function maxBy(arr, f) {
  let best = null, bestV = -Infinity;
  for (const x of arr) { const v = f(x); if (v > bestV) { bestV = v; best = x; } }
  return best;
}
