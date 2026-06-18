# 找朋友 Zhao Pengyou — Commercialization Roadmap

The current build is intentionally **accountless and frictionless** — perfect for family + friends
(open link → type name → room code → play). This doc captures what a *commercial* version would
add, honestly scoped, so we can decide when (and whether) to invest. None of it is needed for the
family playtest.

---

## Where we are (Phase 0 — shipped)
- Full ruleset engine (4–10 players), unit-tested.
- Mobile PWA on Vercel; realtime room-code server on Railway.
- Live video/audio (WebRTC), swappable card backs, 中/EN/日, stats, rules reference.
- **No accounts, no database** — rooms live in server memory; identity = a display name.
- Invite via room code or a `?room=CODE` share link.

## Phase 1 — "Sticky" without a store (low lift, high value)
Things that make people come back, still no app store:
- **Accounts + a database.** This is the unlock for everything below. Add Postgres (Railway has
  it) + a users table. Start with one provider:
  - **Google sign-in** — easiest (~1 day): Google Cloud project, OAuth consent screen, a library
    like `@react-oauth/google`, store the user. Good first choice.
  - **Apple sign-in** — needed later for iOS App Store (Apple requires it if you offer other
    social logins).
  - **WeChat login** — *not* a quick add. WeChat Open Platform (开放平台) requires business
    verification and, for web/app login, typically a **China-registered company / 营业执照**. For a
    US LLC this is a real bureaucratic project, not a weekend. Treat as a separate workstream, or
    skip in favor of a WeChat **Mini Program** (小程序) build (different stack — runs inside WeChat).
- **Persistent identity & reconnect** — survive longer drops, rejoin by account not just token.
- **Friends / recent players, lifetime stats, leaderboards** — needs the DB.
- **Push notifications** ("your table is starting") — web push on Android easily; iOS web push is
  limited, another reason to wrap natively later.

## Phase 2 — App Store + Play Store
- **Wrap the PWA natively** with **Capacitor** (keeps the existing React app; adds a native shell).
  Android can also use a **TWA** (Trusted Web Activity) via PWABuilder.
- **Costs / gates:** Apple Developer **$99/yr** + review (days); Google Play **$25 one-time** + review.
- **Apple caveat:** Apple often rejects "just a wrapped website." Ship native value first — native
  sign-in (Apple/Google), push notifications, in-app purchases — so it reads as a real app.
- **Store assets:** icon set, screenshots, privacy policy, age rating, listing copy (中/EN/日).

## Phase 3 — Monetization (only if it has legs)
- **Cosmetics** — premium card backs / table themes (we already have a swappable card-back system
  + remote manifest; this slots in cleanly). Lowest-friction, non-pay-to-win.
- **Subscription** — private clubs, longer history, HD video, more concurrent tables.
- **Ads** — possible but corrosive to a calm family experience; avoid unless necessary.
- Payments via the app stores' IAP (they take 15–30%) or Stripe on web.

## Honest sequencing
1. **Now:** family playtest on the free link. Collect rule corrections + UX notes.
2. **If they love it:** Phase 1 — add Postgres + Google sign-in + persistent stats/friends. This is
   the highest-leverage step and keeps people coming back without store friction.
3. **If it spreads:** Phase 2 — Capacitor wrap + Apple/Google sign-in + push, submit to stores.
4. **If it scales:** Phase 3 — cosmetics first, then subscription.

## Technical notes for whoever picks this up
- The engine (`engine/`) is pure and transport-agnostic — it carries into any future client
  (native wrapper, Mini Program) unchanged. Protect that boundary.
- The server (`server/`) is in-memory today. Phase 1 swaps the room registry / adds a user store
  behind the same socket API; the client barely changes.
- WebRTC mesh suits ~4–7; for big public lobbies you'd move to an SFU (LiveKit / mediasoup).
- Video on cellular needs **TURN** (env-wired already: `VITE_TURN_*`); a free metered.ca key flips
  it on. See README.
