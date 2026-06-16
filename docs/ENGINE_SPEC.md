# 找朋友 Zhao Pengyou — Engine Spec (build source of truth)

Version 1.0 · for the production build. The v0.1 prototype (`zhao-pengyou-app.tar.gz`)
covers singles+pairs+scoring against bots; this spec defines the *complete* game the
production build must implement.

---

## 0. CONFIRM BEFORE LOCK (Robert)

These three are assumptions in the prototype. They live as single constants — trivial to
change — but get them right before wide playtesting:

1. **Pass line scaling.** Rules table is written for the 4-deck game (160 of 400 pts).
   Assumed: pass line = 40% of total points for every deck count
   (2-deck=80, 3-deck=120, 4-deck=160, 5-deck=200, 6-deck=240). Confirm or override per count.
2. **Kitty points.** Assumed: kitty points are **excluded** from the grabber total.
   Standard Tractor often awards the kitty (sometimes doubled) to grabbers who win the
   last trick. Confirm which your family plays.
3. **8–10 player configs.** Not in the rules sheet; derived below and marked UNCONFIRMED.
   Ship 4–7 validated; 8–10 are editable rows, not invented rules going live.

---

## 1. Authority model (non-negotiable)

This is a hidden-information game, so it MUST be **server-authoritative**. The engine runs
on the server. Clients never receive the full deck, the kitty, or other players' hands —
only their own hand + public table state (current trick, points, whose turn, trump, etc.).
A client sends an intended move; the server validates it against `legalMoves` and rejects
anything illegal. Never trust the client with state it shouldn't see.

---

## 2. Data-driven seat config (4–10)

The whole point: player count is one row in a table. Add a row → new table size. UI reads
this as a dropdown. Rows 4–7 are from Robert's rules sheet. Rows 8–10 are arithmetic
extensions (54 cards / 100 pts per deck; decks scale to keep ~29–34 cards/hand) and are
**UNCONFIRMED** — friend count, team split, and pass line above 7 need Robert's family rules.

| Players | Decks | Total cards | Per player | Kitty | Friends | Total pts | Pass line (40%) | Status |
|---|---|---|---|---|---|---|---|---|
| 4  | 2 | 108 | 25 | 8  | 1     | 200 | 80  | from rules |
| 5  | 3 | 162 | 31 | 7  | 1     | 300 | 120 | from rules |
| 6  | 4 | 216 | 34 | 12 | 1–2*  | 400 | 160 | from rules |
| 7  | 4 | 216 | 29 | 13 | 2     | 400 | 160 | from rules |
| 8  | 5 | 270 | 32 | 14 | 2 (?) | 500 | 200 | UNCONFIRMED |
| 9  | 5 | 270 | 29 | 9  | 2–3(?)| 500 | 200 | UNCONFIRMED |
| 10 | 6 | 324 | 31 | 14 | 3 (?) | 600 | 240 | UNCONFIRMED |

\*6-player: dealer may choose 2 friends via Zhua Guang (§6).

Constants: level starts at **6**. Points: 5 → 5, 10 → 10, K → 10.

---

## 3. Cards & trump

- Deck = 54 cards (A–2 in four suits + small joker + big joker). Build N decks per config.
- **Level rank** = current table level (start 6). All cards of that rank are *rank cards*.
- **Trump set** = big jokers > small jokers > rank-card-in-trump-suit > rank-cards-off-suit
  > trump-suit non-rank cards (A→2). Everything else is non-trump, ranked A→2 within its suit.
- `isTrump(card, level, trumpSuit)`; `trumpStrength(card)` for ordering within trumps.

---

## 4. Live-draw bidding (anti-clockwise, forced dealer)

1. Dealer shuffles all decks; player to the right cuts.
2. Deal one card at a time anti-clockwise starting at dealer's right until hands are full;
   the kitty stays face-down.
3. **During the draw**, a player may expose rank cards to bid (e.g. "1 Heart 6", "2 Club 6s").
   More copies beats fewer; no-trump (jokers) beats suited with equal count. Highest/last
   standing bid when the draw ends becomes dealer and fixes the trump suit.
4. **No passing.** If nobody bids, the shuffler is the forced dealer.
5. **Naked dealer** (0 rank cards at draw end): dealer takes the kitty, exposes one random
   card; its suit = trump. Others may still overcall if they draw rank cards before draw ends.

> Production must implement the *timed* live draw (bidding can happen mid-deal). The v0.1
> prototype simplified this to a post-deal window — same outcome, less drama. Restore the
> real timing here; it changes strategy.

---

## 5. Kitty & friend calling

1. Dealer takes the kitty into hand, buries the same number face-down.
2. Dealer calls 1–2 specific cards (per config), e.g. "Ace of Diamonds".
3. **First player to PLAY a called card becomes a friend** (dealer's side) for the whole hand.
   Points in that trick count for the dealer side. If the dealer holds all called copies, the
   dealer is solo vs. all.

## 6. Zhua Guang (6-player only)

Before looking at the kitty, the dealer may expose+discard it to claim **2 friends** instead
of 1.

---

## 7. Play

- **Formations:** single; pair (two identical rank+suit copies); **tractor** = consecutive
  pairs in the same suit category (e.g. 55-66, and trump tractors where rank cards/jokers
  link, e.g. 55-66-77 when 7 is trump). **Throws (甩牌)** optional — flag if family allows.
- **Follow rule:** if you can follow the led suit category AND match the formation, you must.
  Pair led → must play a pair of that suit if you hold one; tractor led → must match length in
  suit if able; else play singles of the suit; else free (may ruff with trump).
- **Trick winner:** highest formation of the led type; trump beats non-trump; among trumps,
  by `trumpStrength`; among non-trumps only the led suit can win.
- **Leading:** winner of a trick leads the next.

> v0.1 implemented singles + pairs + follow rules + trump resolution. Production must add
> **tractors and (if used) throws**, including trump-tractor linking.

## 8. Scoring (per hand) — 4-deck table, scale per §0.1

Grabber total vs pass line (4-deck numbers shown; scale by deck count):

| Grabber total | Result | Dealer | Friend(s) |
|---|---|---|---|
| ≥ 160 (≥ pass line) | Dealer loses | −2 levels | −1 level |
| 80–159 (½ line–line) | Dealer wins | +2 | +1 |
| 1–79 (small sweep 小光) | +3 | +2 |
| 0 (big sweep 大光) | +4 | +3 |

Max dealer loss is −2, friend −1 (no "big drop"). 7-player: both friends move together.
Solo dealer: dealer takes the full ± and there is no friend adjustment.

## 9. Level J specials (implement fully — deferred in v0.1)

- **Dealer at J:** win → jump to K; lose → drop to 9.
- **Grabber vs J dealer:** normal +1 to Q on a win; no effect on loss.
- **Friend at J — counter:** personal counter J → J+1 → J+2 → Q on wins (or reverse on
  losses), non-consecutive allowed; still plays at table level J until reaching Q.

## 10. Gou Dao Di 钩到底 (J level only — deferred in v0.1)

All five must hold: playing J; last trick of hand; a grabber wins the last trick by playing a
J; dealer side cannot beat it; this pushes grabbers to ≥ pass line. **Penalty:** dealer →
level 2 instantly; friends → level halved, min 2 (Q→6, K→7).

## 11. Round end

First player to pass A and win a hand ends the round. Reshuffle, restart at level 6.
No flow, no passing, every hand plays to the end.

---

## 12. Module API (server-side, pure functions)

```ts
type Suit = "S" | "H" | "C" | "D" | "JOKER";
interface Card { id: string; suit: Suit; rank: number; deck: number; }
interface Config { players: number; decks: number; perPlayer: number; kitty: number;
                   friends: number; totalPoints: number; passLine: number; }
interface GameState { /* full, server-only: deck, hands[], kitty, trump, level,
                         dealer, friends[], trick, points, turn, phase, history */ }
interface PlayerView { /* per-seat redaction of GameState: ownHand + public table */ }

const CONFIG: Record<number, Config>;          // the §2 table, single source of truth
function newGame(players: number, seed?: string): GameState;
function bid(s: GameState, seat: number, b: Bid): GameState;     // live-draw bidding
function buryKitty(s: GameState, cards: Card[]): GameState;
function callFriends(s: GameState, cards: Card[]): GameState;
function legalMoves(s: GameState, seat: number): Move[];         // enforces §7 follow rules
function playMove(s: GameState, seat: number, move: Move): GameState; // validates server-side
function scoreHand(s: GameState): HandResult;                    // §8–§10
function viewFor(s: GameState, seat: number): PlayerView;        // redaction for clients
```

Engine is UI- and transport-agnostic. The same module backs single-device (bots) and online
(server) play, which is what guarantees identical behavior. Unit-test §7 follow rules, §8
scoring tiers, tractor detection, and J-level transitions before wiring any UI.
