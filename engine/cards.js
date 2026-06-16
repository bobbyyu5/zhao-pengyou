// Cards, trump set, and ordering — ENGINE_SPEC §3.
//
// Trump set, high→low: big jokers > small jokers > rank-card-in-trump-suit >
// rank-cards-off-suit > trump-suit non-rank cards (A→2). Everything else is non-trump,
// ranked A→2 within its suit. The level rank (start 6) makes ALL copies of that rank
// trump.

import { POINTS } from "./config.js";

/** @typedef {import("./config.js").Suit} Suit */
/** @typedef {{ id: string, suit: Suit, rank: number, deck: number }} Card */

export const SUITS = /** @type {Suit[]} */ (["S", "H", "C", "D"]);
export const SMALL_JOKER = 15;
export const BIG_JOKER = 16;

export const SUIT_SYMBOL = { S: "♠", H: "♥", C: "♣", D: "♦", JOKER: "★" };
export const SUIT_NAME_ZH = { S: "黑桃", H: "红桃", C: "梅花", D: "方块", JOKER: "王" };
export const SUIT_IS_RED = { S: false, H: true, C: false, D: true, JOKER: false };
const RANK_LABEL = { 11: "J", 12: "Q", 13: "K", 14: "A", 15: "小王", 16: "大王" };

export function rankLabel(rank) {
  return RANK_LABEL[rank] || String(rank);
}

export function cardLabel(card) {
  if (card.suit === "JOKER") return card.rank === BIG_JOKER ? "大王" : "小王";
  return SUIT_SYMBOL[card.suit] + rankLabel(card.rank);
}

/** Build N decks. Each card id is unique across decks. */
export function buildDeck(decks) {
  /** @type {Card[]} */
  const cards = [];
  for (let d = 0; d < decks; d++) {
    for (const s of SUITS) {
      for (let r = 2; r <= 14; r++) cards.push({ id: `${d}:${s}:${r}`, suit: s, rank: r, deck: d });
    }
    cards.push({ id: `${d}:J:${SMALL_JOKER}`, suit: "JOKER", rank: SMALL_JOKER, deck: d });
    cards.push({ id: `${d}:J:${BIG_JOKER}`, suit: "JOKER", rank: BIG_JOKER, deck: d });
  }
  return cards;
}

/** Point value of a card per §2. Jokers and non-point ranks are 0. */
export function pointValue(card) {
  if (card.suit === "JOKER") return 0;
  return POINTS[card.rank] || 0;
}

export function isJoker(card) {
  return card.suit === "JOKER";
}

/** Is this card part of the trump set, given the current level + trump suit? */
export function isTrump(card, level, trumpSuit) {
  if (card.suit === "JOKER") return true;
  if (card.rank === level) return true;            // rank cards are always trump
  return trumpSuit != null && card.suit === trumpSuit;
}

/**
 * Suit "category" for follow rules: all trumps collapse to "T"; otherwise the card's own
 * suit. Two cards are in the same led category iff suitCategory equal.
 */
export function suitCategory(card, level, trumpSuit) {
  return isTrump(card, level, trumpSuit) ? "T" : card.suit;
}

/**
 * Strength ordering for TRICK resolution among trump cards (higher wins). Off-suit rank
 * cards are deliberately equal (700) — among identical-strength trumps the first played
 * wins the trick, which the resolver handles.
 */
export function trumpStrength(card, level, trumpSuit) {
  if (card.rank === BIG_JOKER) return 1000;
  if (card.rank === SMALL_JOKER) return 900;
  if (card.rank === level) {
    return trumpSuit != null && card.suit === trumpSuit ? 800 : 700;
  }
  return 100 + card.rank; // trump-suit non-rank, A(14) high
}

/** Strength of a non-trump card within its own suit (A high). */
export function plainStrength(card) {
  return card.rank;
}

/**
 * Total ordering value for SORTING a hand (display). Trumps sort highest, then by trump
 * strength; non-trumps grouped by suit then rank.
 */
export function sortValue(card, level, trumpSuit) {
  if (isTrump(card, level, trumpSuit)) return 2000 + trumpStrength(card, level, trumpSuit);
  // Keep suits grouped deterministically: S,H,C,D buckets of 100.
  const suitBucket = { S: 0, H: 1, C: 2, D: 3 }[card.suit] ?? 4;
  return suitBucket * 100 + card.rank;
}

/** Sort a hand high→low within trump, then by suit groups. Returns a new array. */
export function sortHand(hand, level, trumpSuit) {
  return hand.slice().sort((a, b) => sortValue(b, level, trumpSuit) - sortValue(a, level, trumpSuit));
}

/**
 * Sequence index used for TRACTOR adjacency (consecutive pairs). Within a single category
 * (a non-trump suit, or the unified trump set), two pairs are tractor-adjacent iff their
 * seqIndex differ by exactly 1.
 *
 * Non-trump suit: the level rank is removed (it's trump), so e.g. 5 and 7 become adjacent
 * when level=6. Trump set: trump-suit non-rank (2..A) < off-suit rank < trump-suit rank <
 * small joker < big joker, all on one ladder so trump tractors can link across tiers.
 */
export function seqIndex(card, level, trumpSuit) {
  if (isTrump(card, level, trumpSuit)) {
    if (card.rank === BIG_JOKER) return 17;
    if (card.rank === SMALL_JOKER) return 16;
    if (card.rank === level) {
      return trumpSuit != null && card.suit === trumpSuit ? 15 : 14;
    }
    return reducedRank(card.rank, level); // trump-suit non-rank: 2..13
  }
  return reducedRank(card.rank, level); // non-trump: 2..13
}

/** Map a rank to its position with the level rank squeezed out (ranks above level shift down 1). */
function reducedRank(rank, level) {
  return rank > level ? rank - 1 : rank;
}

/**
 * Compare two cards for trick resolution given the led suit category. Returns >0 if `a`
 * beats `b`, <0 if worse, 0 if equal strength (caller breaks ties by play order).
 * Only meaningful for cards of the same formation TYPE; tops are passed in.
 */
export function compareTops(a, b, level, trumpSuit, ledCategory) {
  const at = isTrump(a, level, trumpSuit);
  const bt = isTrump(b, level, trumpSuit);
  if (at && !bt) return 1;
  if (!at && bt) return -1;
  if (at && bt) return trumpStrength(a, level, trumpSuit) - trumpStrength(b, level, trumpSuit);
  // both non-trump: only the led suit can win
  const aLed = a.suit === ledCategory;
  const bLed = b.suit === ledCategory;
  if (aLed && !bLed) return 1;
  if (!aLed && bLed) return -1;
  if (!aLed && !bLed) return 0; // neither can win; first-played stays ahead
  return plainStrength(a) - plainStrength(b);
}
