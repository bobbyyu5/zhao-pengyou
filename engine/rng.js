// Deterministic PRNG so games are reproducible from a seed string (spec: newGame(players, seed?)).
// A reproducible shuffle matters for the server: replay, debugging, and identical
// single-device vs. online behavior.

/** xmur3 string hash → 32-bit seed. */
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32 PRNG → float in [0,1). */
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @returns {() => number} a float-in-[0,1) generator seeded by the string. */
export function makeRng(seed) {
  const seedFn = xmur3(String(seed));
  return mulberry32(seedFn());
}

/** Fisher–Yates using a provided rng; returns a new array. */
export function shuffle(arr, rng) {
  const b = arr.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/** A reasonable default seed when none is supplied. Caller may pass Date-based entropy. */
export function randomSeed() {
  // Avoid Date.now()/Math.random() coupling assumptions; combine both where available.
  const t = (typeof Date !== "undefined" ? Date.now() : 0);
  const r = (typeof Math !== "undefined" ? Math.random() : 0);
  return `s${t.toString(36)}${Math.floor(r * 1e9).toString(36)}`;
}
