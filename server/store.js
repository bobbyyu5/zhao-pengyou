// Storage layer for accounts + progress. Uses Postgres when DATABASE_URL is set, otherwise an
// in-memory fallback so the server runs identically with no database (progress just doesn't
// survive a restart). `pg` is imported dynamically only when a DB is configured, so the server
// boots fine even if pg isn't installed. See docs/ACCOUNTS.md.

import { randomUUID } from "node:crypto";

const DATABASE_URL = process.env.DATABASE_URL || null;
let pool = null;

const mem = { users: new Map(), tokens: new Map(), progress: new Map(), friends: new Map() };
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genCode() { let s = ""; for (let i = 0; i < 7; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]; return s; }
const DEFAULT_UNLOCKED = ["cinnabar-seal", "pine-lattice"];
function emptyProgress() {
  return { handsPlayed: 0, handsWon: 0, roundsWon: 0, streak: 0, bestStreak: 0, lastPlayed: null, unlocked: [...DEFAULT_UNLOCKED] };
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY, google_sub text UNIQUE, display_name text, friend_code text UNIQUE,
  created_at timestamptz DEFAULT now(), last_seen timestamptz DEFAULT now());
ALTER TABLE users ADD COLUMN IF NOT EXISTS friend_code text UNIQUE;
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
  const code = genCode();
  const nm = String(name || "玩家").slice(0, 16);
  if (pool) {
    await pool.query("INSERT INTO users(id, display_name, friend_code) VALUES($1,$2,$3)", [id, nm, code]);
    await pool.query("INSERT INTO auth_tokens(token, user_id) VALUES($1,$2)", [token, id]);
    await pool.query("INSERT INTO progress(user_id, unlocked) VALUES($1,$2)", [id, DEFAULT_UNLOCKED]);
  } else {
    mem.users.set(id, { id, display_name: nm, friend_code: code });
    mem.tokens.set(token, id);
    mem.progress.set(id, emptyProgress());
  }
  return { token, userId: id, name: nm, friendCode: code };
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
      await pool.query("INSERT INTO users(id,google_sub,display_name,friend_code) VALUES($1,$2,$3,$4)", [userId, sub, String(name || "玩家").slice(0, 16), genCode()]);
      await pool.query("INSERT INTO progress(user_id,unlocked) VALUES($1,$2) ON CONFLICT DO NOTHING", [userId, DEFAULT_UNLOCKED]);
    }
  } else {
    for (const [id, u] of mem.users) if (u.google_sub === sub) userId = id;
    if (!userId) { userId = randomUUID(); mem.users.set(userId, { id: userId, google_sub: sub, display_name: String(name || "玩家").slice(0, 16), friend_code: genCode() }); mem.progress.set(userId, emptyProgress()); }
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

// ── Friends + leaderboard ──────────────────────────────────────────────────
export async function getMe(userId) {
  if (pool) { const r = await pool.query("SELECT display_name, friend_code FROM users WHERE id=$1", [userId]); const u = r.rows[0]; return u ? { userId, name: u.display_name, friendCode: u.friend_code } : null; }
  const u = mem.users.get(userId); return u ? { userId, name: u.display_name, friendCode: u.friend_code } : null;
}

async function userIdForCode(code) {
  const c = String(code || "").toUpperCase();
  if (pool) { const r = await pool.query("SELECT id FROM users WHERE friend_code=$1", [c]); return r.rows[0]?.id || null; }
  for (const [id, u] of mem.users) if (u.friend_code === c) return id;
  return null;
}

/** Add a friend by their code (bidirectional). Returns the friend's name, or null if not found. */
export async function addFriendByCode(userId, code) {
  const friendId = await userIdForCode(code);
  if (!friendId || friendId === userId) return null;
  if (pool) {
    await pool.query("INSERT INTO friends(user_id,friend_id) VALUES($1,$2),($2,$1) ON CONFLICT DO NOTHING", [userId, friendId]);
  } else {
    if (!mem.friends.has(userId)) mem.friends.set(userId, new Set());
    if (!mem.friends.has(friendId)) mem.friends.set(friendId, new Set());
    mem.friends.get(userId).add(friendId);
    mem.friends.get(friendId).add(userId);
  }
  const f = await getMe(friendId);
  return f ? { name: f.name } : null;
}

/** Leaderboard = you + your friends, ranked by best streak then wins. */
export async function getLeaderboard(userId) {
  let rows = [];
  if (pool) {
    const r = await pool.query(
      `SELECT u.id, u.display_name AS name, COALESCE(pr.hands_won,0) AS hands_won,
              COALESCE(pr.best_streak,0) AS best_streak, COALESCE(pr.streak,0) AS streak
       FROM users u LEFT JOIN progress pr ON pr.user_id = u.id
       WHERE u.id = $1 OR u.id IN (SELECT friend_id FROM friends WHERE user_id = $1)`, [userId]);
    rows = r.rows.map((x) => ({ id: x.id, name: x.name, handsWon: x.hands_won, bestStreak: x.best_streak, streak: x.streak }));
  } else {
    const ids = new Set([userId, ...(mem.friends.get(userId) || [])]);
    for (const id of ids) {
      const u = mem.users.get(id); const p = mem.progress.get(id) || {};
      if (u) rows.push({ id, name: u.display_name, handsWon: p.handsWon || 0, bestStreak: p.bestStreak || 0, streak: p.streak || 0 });
    }
  }
  rows.sort((a, b) => b.bestStreak - a.bestStreak || b.handsWon - a.handsWon);
  return rows.map((x, i) => ({ ...x, rank: i + 1, you: x.id === userId }));
}
