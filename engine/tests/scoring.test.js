import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreTier } from "../config.js";
import { newGame, scoreHand } from "../engine.js";

// ── tier thresholds (§8), 4-deck pass line = 160 ──────────────────────────────
test("all four scoring tiers at the 4-player (80) line", () => {
  const line = 80;
  assert.equal(scoreTier(80, line).key, "dealer_loses"); // ≥ line
  assert.equal(scoreTier(120, line).key, "dealer_loses");
  assert.equal(scoreTier(40, line).key, "dealer_wins");  // ½ line .. line
  assert.equal(scoreTier(79, line).key, "dealer_wins");
  assert.equal(scoreTier(1, line).key, "small_sweep");   // 1 .. ½ line
  assert.equal(scoreTier(39, line).key, "small_sweep");
  assert.equal(scoreTier(0, line).key, "big_sweep");     // 0
});

test("tier level deltas match the rules table", () => {
  assert.deepEqual({ d: scoreTier(80, 80).dealer, f: scoreTier(80, 80).friend }, { d: -2, f: -1 });
  assert.deepEqual({ d: scoreTier(40, 80).dealer, f: scoreTier(40, 80).friend }, { d: +2, f: +1 });
  assert.deepEqual({ d: scoreTier(20, 80).dealer, f: scoreTier(20, 80).friend }, { d: +3, f: +2 });
  assert.deepEqual({ d: scoreTier(0, 80).dealer, f: scoreTier(0, 80).friend }, { d: +4, f: +3 });
});

// helper: a scorable state with explicit level/points
function scorable({ level, grabberPoints, dealer = 0, friend = 2, friendRevealed = true, lastTrickByGrabber = false }) {
  const s = newGame(4, "scoretest");
  s.dealer = dealer;
  s.level = level;
  s.levelsBySeat = s.levelsBySeat.map((_, i) => (i === dealer || i === friend ? level : 6));
  s.friendCards = [{ suit: "D", rank: 14 }];
  s.friendSeats = friendRevealed ? [friend] : [];
  s.grabberPoints = grabberPoints;
  s.lastTrickByGrabber = lastTrickByGrabber;
  s.hands = s.hands.map(() => []); // hand is over
  return s;
}

test("normal: dealer at 6 wins a big sweep → +4 = level 10; friend +3 = 9", () => {
  const r = scoreHand(scorable({ level: 6, grabberPoints: 0 }));
  assert.equal(r.result.tier, "big_sweep");
  assert.equal(r.result.dealerWon, true);
  assert.equal(r.levelsBySeat[0], 10);
  assert.equal(r.levelsBySeat[2], 9);
});

test("normal: dealer loses (grabbers ≥ line) → dealer -2, friend -1; dealership passes", () => {
  const r = scoreHand(scorable({ level: 10, grabberPoints: 80 }));
  assert.equal(r.result.tier, "dealer_loses");
  assert.equal(r.result.dealerWon, false);
  assert.equal(r.levelsBySeat[0], 8); // 10 - 2
  assert.equal(r.levelsBySeat[2], 9); // 10 - 1
  assert.equal(r._nextDealer, 1, "dealer loss passes the deal anti-clockwise");
});

test("after a banker win, the winning banker's friend deals next round", () => {
  const r = scoreHand(scorable({ level: 8, grabberPoints: 30, dealer: 0, friend: 2 })); // dealer wins
  assert.equal(r.result.dealerWon, true);
  assert.equal(r._nextDealer, 2, "the friend (seat 2) opens the next round");
});

test("J special — dealer at J wins → jumps to K (13)", () => {
  const r = scoreHand(scorable({ level: 11, grabberPoints: 30 })); // small_sweep, a win
  assert.equal(r.result.dealerWon, true);
  assert.equal(r.levelsBySeat[0], 13);
});

test("J special — dealer at J loses → drops to 9", () => {
  const r = scoreHand(scorable({ level: 11, grabberPoints: 80 }));
  assert.equal(r.result.dealerWon, false);
  assert.equal(r.levelsBySeat[0], 9);
});

test("J special — friend at J advances by counter J→J+1→J+2→Q", () => {
  let s = scorable({ level: 11, grabberPoints: 30, friendRevealed: true });
  // win once: still J, counter 1
  let r = scoreHand(s);
  assert.equal(r.levelsBySeat[2], 11, "friend stays at J after first win");
  // carry counter forward and win twice more → Q (12)
  s = { ...r, phase: "play", hands: r.hands.map(() => []) };
  r = scoreHand(s);
  s = { ...r, phase: "play", hands: r.hands.map(() => []) };
  r = scoreHand(s);
  assert.equal(r.levelsBySeat[2], 12, "friend reaches Q after three wins");
});

test("round ends when a dealer at A wins (passes A)", () => {
  const r = scoreHand(scorable({ level: 14, grabberPoints: 30 }));
  assert.equal(r.result.dealerWon, true);
  assert.equal(r.roundOver, true);
  assert.equal(r.roundWinner, "dealer");
});
