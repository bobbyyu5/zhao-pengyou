// Formations + follow rules — ENGINE_SPEC §7.
//
// Formations: single; pair (two identical rank+suit copies); tractor (consecutive pairs in
// one suit category, with trump tractors linking across the trump ladder). Throws (甩牌)
// are config-gated (ALLOW_THROWS) and off by default.
//
// Follow rule: if you can follow the led suit category AND match the formation, you must.

import { suitCategory, seqIndex, isTrump, trumpStrength, compareTops, pointValue } from "./cards.js";
import { ALLOW_THROWS } from "./config.js";

/** @typedef {import("./cards.js").Card} Card */
/** @typedef {"single"|"pair"|"triple"|"set"|"tractor"|"throw"|"mixed"} FormationType */
/**
 * @typedef {Object} Formation
 * @property {FormationType} type
 * @property {Card[]} cards
 * @property {number} length   number of cards (single=1, pair=2, tractor=2k)
 * @property {number} pairs    number of pairs (tractor=k, pair=1, else 0)
 * @property {string} category suitCategory of the led cards ("T" or a suit)
 * @property {Card} top        the strongest card (for comparison)
 * @property {boolean} valid   structurally a recognized lead formation
 */

function key(card) {
  return `${card.suit}:${card.rank}`;
}

/** Group identical (suit+rank) cards into pairs; returns { pairs: Card[][], leftovers: Card[] }. */
export function groupPairs(cards) {
  const byKey = new Map();
  for (const c of cards) {
    const k = key(c);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(c);
  }
  const pairs = [];
  const leftovers = [];
  for (const group of byKey.values()) {
    let i = 0;
    for (; i + 1 < group.length; i += 2) pairs.push([group[i], group[i + 1]]);
    if (i < group.length) leftovers.push(group[i]);
  }
  return { pairs, leftovers };
}

/** All distinct pairs available in a set of cards (each pair = two identical copies). */
export function findPairs(cards) {
  return groupPairs(cards).pairs;
}

/** How many identical-groups of exactly `size` copies can be formed (e.g. size 2 = pairs, 3 = triples). */
export function countGroups(cards, size) {
  const byKey = new Map();
  for (const c of cards) byKey.set(key(c), (byKey.get(key(c)) || 0) + 1);
  let count = 0;
  for (const n of byKey.values()) count += Math.floor(n / size);
  return count;
}

/** All identical-groups of `size` copies from the cards (each returns `size` cards). */
export function findGroups(cards, size) {
  const byKey = new Map();
  for (const c of cards) { const k = key(c); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(c); }
  const out = [];
  for (const g of byKey.values()) for (let i = 0; i + size <= g.length; i += size) out.push(g.slice(i, i + size));
  return out;
}

/**
 * Find all maximal tractors (runs of consecutive pairs) within ONE category of cards.
 * Returns arrays of pairs; e.g. [[55],[66],[77]] for a 3-link tractor.
 */
export function findTractors(cards, level, trumpSuit) {
  // bucket cards by category
  const byCat = new Map();
  for (const c of cards) {
    const cat = suitCategory(c, level, trumpSuit);
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(c);
  }
  const tractors = [];
  for (const group of byCat.values()) {
    const { pairs } = groupPairs(group);
    if (pairs.length < 2) continue;
    // index pairs by seqIndex; if two pairs share an index (e.g. two off-suit-rank pairs of
    // different suits), they cannot both extend the same run — keep one per index per run.
    const byIdx = new Map();
    for (const p of pairs) {
      const idx = seqIndex(p[0], level, trumpSuit);
      if (!byIdx.has(idx)) byIdx.set(idx, []);
      byIdx.get(idx).push(p);
    }
    const indices = [...byIdx.keys()].sort((a, b) => a - b);
    let run = [];
    let prev = null;
    const flush = () => {
      if (run.length >= 2) tractors.push(run.map((idx) => byIdx.get(idx)[0]));
      run = [];
    };
    for (const idx of indices) {
      if (prev != null && idx === prev + 1) run.push(idx);
      else { flush(); run = [idx]; }
      prev = idx;
    }
    flush();
  }
  return tractors;
}

/**
 * Classify a set of played cards as a lead formation. `top` is the strongest card for
 * trick comparison. Sets valid=false for unrecognized shapes (unless ALLOW_THROWS makes a
 * same-category multi-group a "throw").
 */
export function detectFormation(cards, level, trumpSuit) {
  const n = cards.length;
  const category = n > 0 ? suitCategory(cards[0], level, trumpSuit) : null;
  const top = topCard(cards, level, trumpSuit);
  const base = { cards, length: n, category, top };

  if (n === 1) return { ...base, type: "single", pairs: 0, groupSize: 1, units: 1, valid: true };

  // Identical set: all n cards the same rank+suit — pair (2), triple (3), or larger. The family
  // plays three-of-a-kind (needs 3+ decks); Big/Small jokers can't mix (different ranks → not
  // identical, so a joker "pair"/"triple" must be all-Big or all-Small — enforced here).
  const allIdentical = cards.every((c) => c.suit === cards[0].suit && c.rank === cards[0].rank);
  if (n >= 2 && allIdentical) {
    const type = n === 2 ? "pair" : n === 3 ? "triple" : "set";
    return { ...base, type, pairs: n === 2 ? 1 : 0, groupSize: n, units: 1, valid: true };
  }

  // Tractor: even length, all one category, k consecutive pairs covering exactly these cards.
  if (n >= 4 && n % 2 === 0) {
    const allSameCat = cards.every((c) => suitCategory(c, level, trumpSuit) === category);
    if (allSameCat) {
      const { pairs, leftovers } = groupPairs(cards);
      if (leftovers.length === 0 && pairs.length === n / 2) {
        const idx = pairs.map((p) => seqIndex(p[0], level, trumpSuit)).sort((a, b) => a - b);
        const consecutive = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
        const distinct = new Set(idx).size === idx.length;
        if (consecutive && distinct) {
          return { ...base, type: "tractor", pairs: pairs.length, groupSize: 2, units: pairs.length, valid: true };
        }
      }
    }
  }

  // Throw (甩牌): multiple groups led at once, all of one category. Off by default.
  if (ALLOW_THROWS && n >= 2) {
    const allSameCat = cards.every((c) => suitCategory(c, level, trumpSuit) === category);
    if (allSameCat) return { ...base, type: "throw", pairs: findPairs(cards).length, valid: true };
  }

  return { ...base, type: "mixed", pairs: 0, valid: false };
}

/** Strongest card in a set, by trump strength then plain rank. */
export function topCard(cards, level, trumpSuit) {
  let best = cards[0];
  for (let i = 1; i < cards.length; i++) {
    if (cmpCard(cards[i], best, level, trumpSuit) > 0) best = cards[i];
  }
  return best;
}

function cmpCard(a, b, level, trumpSuit) {
  const at = isTrump(a, level, trumpSuit);
  const bt = isTrump(b, level, trumpSuit);
  if (at && bt) return trumpStrength(a, level, trumpSuit) - trumpStrength(b, level, trumpSuit);
  if (at) return 1;
  if (bt) return -1;
  if (a.suit === b.suit) return a.rank - b.rank;
  return 0;
}

/** Sum of point values in a card list. */
export function sumPoints(cards) {
  return cards.reduce((acc, c) => acc + pointValue(c), 0);
}

/**
 * Whether a FOLLOWING play of `cards` is legal given the led formation. Returns
 * { ok: true } or { ok: false, reason }. Enforces §7: follow the led category as much as
 * possible, keep pairs together when the lead is paired/tractor, match the card count.
 */
export function validateFollow(hand, led, cards, level, trumpSuit) {
  const n = led.length;
  if (cards.length !== n) return { ok: false, reason: `必须出 ${n} 张牌 · must play ${n} cards` };

  const inHandCat = hand.filter((c) => suitCategory(c, level, trumpSuit) === led.category);
  const playedCat = cards.filter((c) => suitCategory(c, level, trumpSuit) === led.category);
  const isTrumpLead = led.category === "T";

  // Rule A: you must commit all your category cards, up to n (can't hold the suit and dump).
  // Trump leads say "follow trump" — a rank card like 3♦ IS trump even though it's a diamond.
  const mustCat = Math.min(inHandCat.length, n);
  if (playedCat.length < mustCat) {
    const what = isTrumpLead
      ? `必须跟主牌（含级牌/王）· must follow trump (${mustCat})`
      : `必须跟${SUIT_ZH[led.category] || "该门"}花色 · must follow the ${led.category} suit (${mustCat})`;
    return { ok: false, reason: what };
  }

  // Rule B: keep identical-groups together. A pair/triple lead needs one group of that size; a
  // tractor needs its k pairs. Use as many groups as the lead needs and you can supply.
  const G = led.groupSize || 1;
  if (G >= 2) {
    const avail = countGroups(inHandCat, G);
    const need = Math.min(avail, led.units || 1);
    const played = countGroups(playedCat, G);
    if (played < need) {
      const label = G === 2 ? "对子 pair(s)" : G === 3 ? "三张 triple(s)" : `${G} 张 set(s)`;
      return { ok: false, reason: `必须跟${need} 组${label} · must keep ${need} ${label} together` };
    }
  }

  return { ok: true };
}

const SUIT_ZH = { S: "黑桃", H: "红桃", C: "梅花", D: "方块" };

/**
 * Compare two SAME-TYPE formations for trick winner. Returns >0 if `challenger` beats
 * `current`. Only formations of the led type & length are candidates (checked by caller).
 */
export function beats(challenger, current, level, trumpSuit, ledCategory) {
  return compareTops(challenger.top, current.top, level, trumpSuit, ledCategory) > 0;
}

/** Does a following play qualify as a winner-candidate? (same type AND same length as lead) */
export function isWinnerCandidate(form, led) {
  if (!form) return false;
  if (form.type !== led.type) return false;
  if (form.length !== led.length) return false;
  return true;
}
