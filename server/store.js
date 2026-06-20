// Storage layer for accounts + progress. Uses Postgres when DATABASE_URL is set, otherwise an
// in-memory fallback so the server runs identically with no database (progress just doesn't
// survive a restart). `pg` is imported dynamically only when a DB is configured, so the server
// boots fine even if pg isn't installed. See docs/ACCOUNTS.md.

import { randomUUID } from "node:crypto";

const DATABASE_URL = process.env.DATABASE_URL || null;
let pool = null;

const mem = { users: new Map(), tokens: new Map(), progress: new Map() };
const DEFAULT_UNLOCKED = ["cinnabar-seal", "pine-lattice"];
function emptyProgress() {
  return { handsPlayed: 0, handsWon: 0, roundsWon: 0, streak: 0, bestStreak: 0, lastPlayed: null, unlocked: [...DEFAULT_UNLOCKED] };
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY, google_sub text UNIQUE, display_name text,
  created_at timestamptz DEFAULT now(), last_seen timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS auth_tokens (
  token text PRIMARY KEY, user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS progress (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hands_played int DEFAULT 0, hands_won int DEFAULT 0, rounds_won int DEFAULT 0,
  streak int DEFAULT 0, best_streak int DEFAULT 0, last_played text,
  unlocked text[] DEFAULT '{}', updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS friends (
  user_id uuid, friend_id uuid, created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, friend_id));`;

export async function initStore() {
  if (!DATABASE_URL) return { mode: "memory" };
  const pg = await import("pg");
  const Pool = (pg.default || pg).Pool;
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.PGSSL === "0" ? false : { rejectUnauthorized: false },
  });
  await pool.query(SCHEMA);
  return { mode: "postgres" };
}

function rowToProgress(p) {
  return {
    handsPlayed: p.hands_played, handsWon: p.hands_won, roundsWon: p.rounds_won,
    streak: p.streak, bestStreak: p.best_streak, lastPlayed: p.last_played, unlocked: p.unlocked || [],
  };
}

// Multi-device-safe merge: counts max, unlocked union, latest lastPlayed.
function merge(a, b) {
  const x = a || emptyProgress(), y = b || {};
  return {
    handsPlayed: Math.max(x.handsPlayed || 0, y.handsPlayed || 0),
    handsWon: Math.max(x.handsWon || 0, y.handsWon || 0),
    roundsWon: Math.max(x.roundsWon || 0, y.roundsWon || 0),
    streak: Math.max(x.streak || 0, y.streak || 0),
    bestStreak: Math.max(x.bestStreak || 0, y.bestStreak || 0),
    lastPlayed: [x.lastPlayed, y.lastPlayed].filter(Boolean).sort().pop() || null,
    unlocked: Array.from(new Set([...(x.unlocked || []), ...(y.unlocked || [])])),
  };
}

export async function createGuest(name) {
  const id = randomUUID();
  const token = randomUUID().replace(/-/g, "");
  const nm = String(name || "玩家").slice(0, 16);
  if (pool) {
    await pool.query("INSERT INTO users(id, display_name) VALUES($1,$2)", [id, nm]);
    await pool.query("INSERT INTO auth_tokens(token, user_id) VALUES($1,$2)", [token, id]);
    await pool.query("INSERT INTO progress(user_id, unlocked) VALUES($1,$2)", [id, DEFAULT_UNLOCKED]);
  } else {
    mem.users.set(id, { id, display_name: nm });
    mem.tokens.set(token, id);
    mem.progress.set(id, emptyProgress());
  }
  return { token, userId: id, name: nm };
}

export async function userIdForToken(token) {
  if (!token) return null;
  if (pool) { const r = await pool.query("SELECT user_id FROM auth_tokens WHERE token=$1", [token]); return r.rows[0]?.user_id || null; }
  return mem.tokens.get(token) || null;
}

export async function getProgress(userId) {
  if (pool) { const r = await pool.query("SELECT * FROM progress WHERE user_id=$1", [userId]); return r.rows[0] ? rowToProgress(r.rows[0]) : emptyProgress(); }
  return mem.progress.get(userId) || emptyProgress();
}

export async function mergeProgress(userId, incoming) {
  const m = merge(await getProgress(userId), incoming);
  if (pool) {
    await pool.query(
      `INSERT INTO progress(user_id,hands_played,hands_won,rounds_won,streak,best_streak,last_played,unlocked,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())
       ON CONFLICT(user_id) DO UPDATE SET hands_played=$2,hands_won=$3,rounds_won=$4,streak=$5,best_streak=$6,last_played=$7,unlocked=$8,updated_at=now()`,
      [userId, m.handsPlayed, m.handsWon, m.roundsWon, m.streak, m.bestStreak, m.lastPlayed, m.unlocked],
    );
  } else { mem.progress.set(userId, m); }
  return m;
}

// Find-or-create a Google user; merge a guest account's progress into it ("claim").
export async function upsertGoogleUser(sub, name, guestToken) {
  let userId;
  if (pool) {
    const r = await pool.query("SELECT id FROM users WHERE google_sub=$1", [sub]);
    if (r.rows[0]) userId = r.rows[0].id;
    else {
      userId = randomUUID();
      await pool.query("INSERT INTO users(id,google_sub,display_name) VALUES($1,$2,$3)", [userId, sub, String(name || "玩家").slice(0, 16)]);
      await pool.query("INSERT INTO progress(user_id,unlocked) VALUES($1,$2) ON CONFLICT DO NOTHING", [userId, DEFAULT_UNLOCKED]);
    }
  } else {
    for (const [id, u] of mem.users) if (u.google_sub === sub) userId = id;
    if (!userId) { userId = randomUUID(); mem.users.set(userId, { id: userId, google_sub: sub, display_name: String(name || "玩家").slice(0, 16) }); mem.progress.set(userId, emptyProgress()); }
  }
  if (guestToken) {
    const guestId = await userIdForToken(guestToken);
    if (guestId && guestId !== userId) await mergeProgress(userId, await getProgress(guestId));
  }
  const token = randomUUID().replace(/-/g, "");
  if (pool) await pool.query("INSERT INTO auth_tokens(token,user_id) VALUES($1,$2)", [token, userId]);
  else mem.tokens.set(token, userId);
  return { token, userId };
}
