# 找朋友 Zhao Pengyou · Find Friends

A Chinese family trick-taking card game (Tractor / 升级 variant) for **4–10 players**, built
as a server-authoritative engine + a polished mobile **PWA** + **room-code multiplayer** with
**live video/audio**. Chinese-primary UI, English secondary. Built for Robert's parents and
their friends to play across their phones.

> Built against `docs/ENGINE_SPEC.md` (the locked ruleset). Anything the spec marks
> UNCONFIRMED lives as a single editable constant — see **Confirm before lock** below.

---

## What's here

```
engine/        Pure, UI- & transport-agnostic game engine (plain ESM JS). Same module runs
               in the browser (bots) and on the server (online) → identical rules.
  config.js      Data-driven 4–10 seat table + house-rule constants + scoring tiers
  cards.js       Deck, trump set, ordering, tractor sequence index
  formations.js  Singles / pairs / tractors + the §7 follow-rule validator
  engine.js      State machine: draw+bid → bury → call → play → score (J-specials, 钩到底)
  bots.js        Legal-but-reasonable AI (uses only public state)
  tests/         34 unit tests (node --test): follow rules, tractors, all scoring tiers,
                 J-level transitions, full bot hands 4–7p, redaction
src/           React PWA front-end (consumes design-tokens.css verbatim)
  ui/            Card faces, table/seat geometry (4–10), HUD, bidding/bury/call panels,
                 友 seal reveal animation, stats charts, video tiles
  game/          useLocalGame — single-device controller (you + bots)
  net/           useOnlineGame (socket client) + useWebRTC (video/audio mesh)
  theme/         Swappable card-back designs + remote manifest loader
server/        Node + Socket.IO authoritative server (in-memory rooms, bot-fill,
               disconnect/reconnect, turn timeouts, WebRTC signaling relay)
public/        manifest, icons, service worker (offline shell), card-backs.json manifest
docs/          ENGINE_SPEC.md (source of truth) + design-mockup.svg
```

## Run it locally

```bash
npm install
npm test          # 34 engine unit tests
npm run dev       # front-end at http://localhost:5173 (single-device play works offline)
```

Online play needs the server too:

```bash
npm run server    # realtime server at http://localhost:8787
npm run smoke      # end-to-end multiplayer test over the wire
```

Point the client at the server by setting `VITE_SERVER_URL` (see `.env.example`). Without it,
**single-device vs-bots play is fully functional** — only online rooms are disabled.

## Deploy (the path Robert wanted: link → add to home screen)

**Front-end → Vercel** (static PWA):
1. Push this repo to GitHub, import into Vercel. It auto-detects Vite (`vercel.json` is included).
2. Set env `VITE_SERVER_URL` to the Railway server URL (below). Redeploy.
3. Open the `…vercel.app` link on a phone → Share → **Add to Home Screen**. It installs with an
   icon and opens fullscreen — indistinguishable from a store app, no store friction.

**Server → Railway** (realtime):
1. New Railway service from the same repo; start command is `npm start` (runs `server/server.js`).
2. Set `CLIENT_ORIGIN` to your Vercel domain. Railway provides `PORT` automatically.
3. Copy the public URL back into Vercel's `VITE_SERVER_URL` and redeploy the front-end.

> Native App Store / Play Store wrapping is deliberately deferred — the PWA is the weekend path.

## Features

- **Full ruleset** — live-draw bidding, naked dealer, Zhua Guang (6p), 1–2 friend calling,
  tractors (incl. trump-ladder linking), point capture, all four scoring tiers, J-level
  counters, and Gou Dao Di (钩到底).
- **4–10 seats** — one config row per count; the table reflows the seat geometry automatically.
- **Single-device** vs bots (full rules, offline) **and online** room-code multiplayer on
  separate phones — both backed by the *same* engine, so they behave identically.
- **Live video + audio** — a WebRTC mesh among room members; media is peer-to-peer (the server
  only relays signaling). Tap 📷 to join the call; players appear on each other's seats.
- **Swappable card backs** — six built-in designs plus a remote manifest
  (`public/card-backs.json`): edit that file on the host and new backs appear for everyone on
  next load, no redeploy.
- **Stats** — per-hand level progression and grabber-points charts (战绩).
- **PWA** — installable, offline shell, iOS home-screen polish, reduced-motion respected.

## Confirm before lock (Robert)

After a real playtest, correct these in **`engine/config.js`** — single constants, no refactor:

1. **Pass-line scaling** — `PASS_LINE_FRACTION` (assumed 40% of total points per deck count).
2. **Kitty points** — `KITTY_POINTS_COUNT` / `KITTY_POINTS_DOUBLED` (assumed excluded).
3. **Throws (甩牌)** — `ALLOW_THROWS` (off by default until the family confirms they're used).
4. **8–10 player configs** — `CONFIG[8..10]` rows are derived arithmetic (`confirmed: false`),
   shown with a 未校准 / UNCONFIRMED badge in the UI. Friend count, team split, and pass line
   above 7 need the family's real rules.

Level-progression edge cases (next dealer after a loss, grabber advancement, the friend J
counter) are gathered in the `LEVEL_RULES` block at the top of `engine/engine.js` for the same
reason — playtest, then adjust there.

## Notes / known limits

- The WebRTC mesh suits a family table (~4–7). Past ~8 peers a mesh gets heavy; an SFU would be
  the upgrade. Camera/mic needs HTTPS + permission (works on the deployed site).
- Bots are legal-but-simple — fine for rules-checking and a solo game, not a tough opponent.
- The live draw is modelled faithfully in the engine; the single-device UI uses a post-deal
  bid window (same outcome) for reliability. Online uses a timed bid window.
```
