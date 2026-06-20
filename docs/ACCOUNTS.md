# Accounts + Database phase — architecture

Goal: make **streaks, unlocks, and stats persist across devices**, and unlock **friends &
leaderboards**. Today those live in `localStorage` (per device). This phase moves the
source of truth to the server while keeping the game fully playable offline.

> **Status: scaffolded and DORMANT.** All the code below ships in the repo but is gated OFF
> (`VITE_CLOUD_SYNC` unset on the client, `DATABASE_URL` unset on the server → in-memory).
> Nothing changes for the family until you flip the switches in **Activation**. The game,
> the engine, and online play are untouched.

---

## Identity model — guest first, Google optional
- **Guest accounts (no login):** on first run the client asks the server for an anonymous
  account → gets an opaque **token** stored in `localStorage`. Progress syncs under that token.
  Zero friction — your parents never see a login.
- **Google sign-in (optional upgrade):** signing in *claims* the guest account — the server
  finds-or-creates a user by Google `sub`, **merges the guest's progress in**, and returns a new
  token. This is what lets a streak follow you to a new phone. (Apple sign-in later for iOS.)
- WeChat login stays out of scope here (business-verification heavy — see ROADMAP).

## Data model (Postgres)
```
users(id uuid pk, google_sub text unique null, display_name text, created_at, last_seen)
auth_tokens(token text pk, user_id uuid → users, created_at)
progress(user_id uuid pk → users, hands_played, hands_won, rounds_won,
         streak, best_streak, last_played text, unlocked text[], updated_at)
friends(user_id uuid, friend_id uuid, created_at, pk(user_id,friend_id))
```
Leaderboard = `SELECT … FROM progress JOIN friends …` ordered by `best_streak` / `hands_won`.

## Sync protocol (additive HTTP on the existing server)
- `POST /api/auth/guest {name}` → `{token, userId, name}`
- `POST /api/auth/google {idToken, guestToken?}` → verifies the Google ID token, merges guest
  progress, returns `{token, userId, name}`
- `GET  /api/progress` (Bearer token) → server progress
- `POST /api/progress` (Bearer token, body = local progress) → **merges** and returns the result

**Merge rule** (last-writer-wins is wrong for multi-device): counts take the **max**, `unlocked`
takes the **union**, `streak`/`best_streak` the max, `last_played` the latest. So syncing from two
phones never loses progress.

## Client flow
1. On load (if enabled): `ensureGuest()` → `syncProgress(localProgress)` → `mergeRemote(result)`.
   Local and cloud converge; offline still works (sync is best-effort, failures are silent).
2. After each hand, the local progress changes; a debounced `syncProgress()` pushes it up.
3. Optional "Sign in with Google" button (only shown when `VITE_GOOGLE_CLIENT_ID` is set) calls
   `googleSignIn(idToken)` and re-syncs.

Files: `server/store.js` (Postgres or in-memory), `/api/*` routes in `server/server.js`,
`src/account/account.js` (client), `progress.mergeRemote()` (merge server → local).

---

## Activation (when you're ready — none of this affects the live family app until done)
1. **Provision Postgres** on Railway (Add → Database → Postgres). It sets `DATABASE_URL` on the
   service automatically. On boot the server creates the tables and switches from in-memory to
   real persistence. (`pg` is already in dependencies.)
2. **Turn on client sync:** set `VITE_CLOUD_SYNC=1` in Vercel and redeploy. Guests now sync.
3. **(Optional) Google sign-in:** create an OAuth **Web** client in Google Cloud, set
   `GOOGLE_CLIENT_ID` (server) and `VITE_GOOGLE_CLIENT_ID` (client). Add the sign-in button
   (small follow-up — the server verify endpoint is already built).
4. **Friends / leaderboards:** add the `friends` endpoints + a leaderboard screen (server store
   has the tables; this is the next slice once accounts are live).

## Cost
- Railway Postgres: free/starter tier is plenty at family scale.
- Google OAuth: free.
- No new monthly cost to turn this on.

## Why this order is safe
The engine and gameplay never touch the database — only the meta-progression does. If the DB is
down or sync fails, players keep playing and the local store carries them; sync reconciles next
time. That's why it can ship dormant and be switched on without risk.
