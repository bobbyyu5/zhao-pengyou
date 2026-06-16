// 找朋友 Zhao Pengyou — seat config + house-rule constants (single source of truth).
//
// Rows 4–7 are from Robert's family rules sheet. Rows 8–10 are arithmetic extensions
// (54 cards / 100 pts per deck) and are UNCONFIRMED — friend count, team split, and pass
// line above 7 need the family's real rules. Everything Robert flagged "confirm before
// lock" lives here as a named constant so it can be corrected after a playtest WITHOUT a
// refactor. Change a number here, not in the engine.

/** @typedef {"S"|"H"|"C"|"D"|"JOKER"} Suit */

export const LEVEL_START = 6; // table level starts at 6 per the rules sheet

// Point cards: 5 → 5 pts, 10 → 10 pts, K(13) → 10 pts. Everything else 0.
export const POINTS = { 5: 5, 10: 10, 13: 10 };

// ─── CONFIRM-BEFORE-LOCK (Robert) ────────────────────────────────────────────
// 1. Pass line scaling — assumed 40% of total points for every deck count.
export const PASS_LINE_FRACTION = 0.4;
// 2. Kitty points — assumed EXCLUDED from the grabber total. Set true if the family
//    awards the kitty (sometimes doubled) to grabbers who win the last trick.
export const KITTY_POINTS_COUNT = false;
export const KITTY_POINTS_DOUBLED = false; // only relevant if KITTY_POINTS_COUNT
// 3. Throws (甩牌) — off by default; the prototype author advised not shipping subtle
//    throw bugs unplaytested. Flip on once the family confirms they allow throws.
export const ALLOW_THROWS = false;
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} SeatConfig
 * @property {number} players
 * @property {number} decks
 * @property {number} totalCards
 * @property {number} perPlayer
 * @property {number} kitty
 * @property {number} friends    cards the dealer calls
 * @property {number} totalPoints 100 per deck
 * @property {number} passLine    PASS_LINE_FRACTION of totalPoints
 * @property {boolean} confirmed  false = derived, not from the rules sheet
 * @property {boolean} zhuaGuang  dealer may expose+discard kitty to claim 2 friends (6p)
 */

function row(players, decks, perPlayer, kitty, friends, confirmed, zhuaGuang = false) {
  const totalCards = decks * 54;
  const totalPoints = decks * 100;
  return {
    players, decks, totalCards, perPlayer, kitty, friends, totalPoints,
    passLine: Math.round(totalPoints * PASS_LINE_FRACTION),
    confirmed, zhuaGuang,
  };
}

/** @type {Record<number, SeatConfig>} */
export const CONFIG = {
  4:  row(4,  2, 25, 8,  1, true),
  5:  row(5,  3, 31, 7,  1, true),
  6:  row(6,  4, 34, 12, 1, true, true), // +Zhua Guang → 2 friends
  7:  row(7,  4, 29, 13, 2, true),
  8:  row(8,  5, 32, 14, 2, false),
  9:  row(9,  5, 29, 9,  2, false),
  10: row(10, 6, 31, 14, 3, false),
};

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 10;

export function getConfig(players) {
  const c = CONFIG[players];
  if (!c) throw new Error(`No seat config for ${players} players (4–10 supported)`);
  // Sanity: perPlayer*players + kitty must equal the deck total.
  if (c.perPlayer * c.players + c.kitty !== c.totalCards) {
    throw new Error(`Config ${players} inconsistent: ${c.perPlayer}*${c.players}+${c.kitty} ≠ ${c.totalCards}`);
  }
  return c;
}

/**
 * Scoring deltas per ENGINE_SPEC §8, expressed as level changes. Thresholds scale by the
 * config's pass line. Returns the tier plus the dealer/friend level deltas.
 * @param {number} grabberPts
 * @param {number} passLine
 */
export function scoreTier(grabberPts, passLine) {
  if (grabberPts >= passLine)     return { tier: "dealer_loses", key: "dealer_loses", dealer: -2, friend: -1 };
  if (grabberPts >= passLine / 2) return { tier: "dealer_wins",  key: "dealer_wins",  dealer: +2, friend: +1 };
  if (grabberPts >= 1)            return { tier: "small_sweep",  key: "small_sweep",  dealer: +3, friend: +2 };
  return                                { tier: "big_sweep",    key: "big_sweep",    dealer: +4, friend: +3 };
}
