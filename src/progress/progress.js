// Local progression — daily streak, lifetime stats, and card-back unlocks. Persisted in
// localStorage so it works today with no backend (per device). When the accounts/DB phase
// lands, this same shape syncs to the server. App-layer code, so Date is fine here.

const KEY = "zhao.progress";
const DEFAULTS = {
  handsPlayed: 0, handsWon: 0, roundsWon: 0,
  streak: 0, bestStreak: 0, lastPlayed: null,
  unlocked: ["cinnabar-seal", "pine-lattice"], // two backs free from the start
};

// Card-back unlock rules. Backs not listed here (e.g. remote/new ones) are unlocked by default.
export const UNLOCK_RULES = {
  "brass-medallion": { handsWon: 1 },
  "plum-blossom": { handsPlayed: 10 },
  "cloud-thunder": { roundsWon: 1 },
  "wave-seigaiha": { streak: 3 },
};

function load() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || "{}")) }; }
  catch { return { ...DEFAULTS }; }
}
let cache = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {} }

export function getProgress() { return cache; }

function todayStr() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
function dayDiff(prev, today) {
  const [py, pm, pd] = prev.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return Math.round((new Date(ty, tm - 1, td) - new Date(py, pm - 1, pd)) / 86400000);
}

/** Call when the app opens / a game starts. Updates the daily streak. Returns progress. */
export function recordSession() {
  const today = todayStr();
  if (cache.lastPlayed === today) return cache;
  const diff = cache.lastPlayed ? dayDiff(cache.lastPlayed, today) : null;
  cache.streak = diff === 1 ? (cache.streak || 0) + 1 : 1;
  cache.lastPlayed = today;
  cache.bestStreak = Math.max(cache.bestStreak || 0, cache.streak);
  save();
  return cache;
}

/** Condition for a card back currently satisfied? (unknown ids = always unlocked) */
export function conditionMet(id) {
  const r = UNLOCK_RULES[id];
  if (!r) return true;
  return Object.entries(r).every(([k, v]) => (cache[k] || 0) >= v);
}
export function isUnlocked(id) { return cache.unlocked.includes(id) || conditionMet(id); }
export function unlockRuleFor(id) { return UNLOCK_RULES[id] || null; }

/** Recompute unlocks against current stats; persist + return any NEWLY unlocked ids. */
export function checkUnlocks() {
  const newly = [];
  for (const id of Object.keys(UNLOCK_RULES)) {
    if (!cache.unlocked.includes(id) && conditionMet(id)) { cache.unlocked.push(id); newly.push(id); }
  }
  if (newly.length) save();
  return newly;
}

/** Merge server-side progress into the local cache (used by cloud sync). Returns merged. */
export function mergeRemote(remote) {
  if (!remote) return cache;
  cache = {
    ...cache,
    handsPlayed: Math.max(cache.handsPlayed || 0, remote.handsPlayed || 0),
    handsWon: Math.max(cache.handsWon || 0, remote.handsWon || 0),
    roundsWon: Math.max(cache.roundsWon || 0, remote.roundsWon || 0),
    streak: Math.max(cache.streak || 0, remote.streak || 0),
    bestStreak: Math.max(cache.bestStreak || 0, remote.bestStreak || 0),
    lastPlayed: [cache.lastPlayed, remote.lastPlayed].filter(Boolean).sort().pop() || null,
    unlocked: Array.from(new Set([...(cache.unlocked || []), ...(remote.unlocked || [])])),
  };
  save();
  return cache;
}

/** Record a finished hand. Returns newly-unlocked card-back ids (for a celebration). */
export function recordHandResult({ won, roundWon }) {
  cache.handsPlayed = (cache.handsPlayed || 0) + 1;
  if (won) cache.handsWon = (cache.handsWon || 0) + 1;
  if (roundWon) cache.roundsWon = (cache.roundsWon || 0) + 1;
  save();
  return checkUnlocks();
}
