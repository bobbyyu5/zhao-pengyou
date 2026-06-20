// Client account + cloud-sync layer. DORMANT by default: only active when VITE_CLOUD_SYNC=1
// AND an online server is configured. Everything is best-effort — if the server or network is
// unavailable, calls no-op and the game continues on the local progress store. See docs/ACCOUNTS.md.

import { SERVER_URL } from "../net/useOnlineGame.js";

export const cloudEnabled = !!SERVER_URL && (import.meta.env?.VITE_CLOUD_SYNC === "1");
export const googleClientId = import.meta.env?.VITE_GOOGLE_CLIENT_ID || "";

const TKEY = "zhao.acctToken";
const NKEY = "zhao.acctName";
function getToken() { try { return localStorage.getItem(TKEY); } catch { return null; } }
function setToken(t) { try { localStorage.setItem(TKEY, t); } catch {} }
export function getAccountName() { try { return localStorage.getItem(NKEY) || null; } catch { return null; } }
function setAccountName(n) { try { if (n) localStorage.setItem(NKEY, n); } catch {} }

async function api(path, opts = {}) {
  const r = await fetch(`${SERVER_URL}${path}`, opts);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

/** Ensure we have an account token (creates an anonymous guest if needed). Returns token|null. */
export async function ensureGuest(name) {
  if (!cloudEnabled) return null;
  if (getToken()) return getToken();
  try {
    const j = await api("/api/auth/guest", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }),
    });
    if (j.token) { setToken(j.token); return j.token; }
  } catch {}
  return null;
}

/** Push local progress to the server and return the merged result (or null if disabled/failed). */
export async function syncProgress(localProgress) {
  if (!cloudEnabled) return null;
  const t = (await ensureGuest(localProgress?.name)) || getToken();
  if (!t) return null;
  try {
    return await api("/api/progress", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify(localProgress || {}),
    });
  } catch { return null; }
}

function authHeader() { const t = getToken(); return t ? { authorization: `Bearer ${t}` } : {}; }

/** This account's profile incl. shareable friend code. Ensures a guest exists first. */
export async function getMe() {
  if (!cloudEnabled) return null;
  await ensureGuest();
  try { return await api("/api/me", { headers: authHeader() }); } catch { return null; }
}

/** Add a friend by their code. Returns { friend: { name } } or null. */
export async function addFriend(code) {
  if (!cloudEnabled) return null;
  await ensureGuest();
  try {
    return await api("/api/friends/add", {
      method: "POST", headers: { "content-type": "application/json", ...authHeader() }, body: JSON.stringify({ code }),
    });
  } catch { return null; }
}

/** Leaderboard: you + friends, ranked. Returns [] if disabled/failed. */
export async function getLeaderboard() {
  if (!cloudEnabled) return [];
  await ensureGuest();
  try { return await api("/api/leaderboard", { headers: authHeader() }); } catch { return []; }
}

/** Claim the guest account with Google (merges guest progress). Returns {token,name}|null. */
export async function googleSignIn(idToken, name) {
  if (!cloudEnabled) return null;
  try {
    const j = await api("/api/auth/google", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken, name, guestToken: getToken() }),
    });
    if (j.token) { setToken(j.token); setAccountName(j.name); return j; }
  } catch {}
  return null;
}
