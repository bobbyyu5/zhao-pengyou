import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame, dealCardsOnly, bid, closeDraw } from "../engine.js";

// ENGINE_SPEC §4: more copies beats fewer; no-trump (jokers) beats suited at EQUAL count;
// highest/last-standing bid fixes dealer + trump suit. These tests pin that matrix down.

function card(suit, rank, deck = 0) { return { id: `${deck}:${suit}:${rank}`, suit, rank, deck }; }

function freshDrawn() {
  let s = newGame(4, "bidseed");
  return dealCardsOnly(s); // phase "draw", all cards dealt, level 6
}

test("first suited bid → that seat is dealer, trump = its suit", () => {
  let s = freshDrawn();
  s.hands[1] = [card("H", 6), ...s.hands[1]];
  s = bid(s, 1, { suit: "H", count: 1 });
  s = closeDraw(s);
  assert.equal(s.dealer, 1);
  assert.equal(s.trumpSuit, "H");
  assert.equal(s.phase, "bury");
});

test("YOUR CASE: holding both a 6 and a joker, choosing the suited 6 works and fixes that suit", () => {
  let s = freshDrawn();
  s.hands[0] = [card("H", 6), card("JOKER", 16), ...s.hands[0]];
  // choose the SUITED option (not no-trump)
  s = bid(s, 0, { suit: "H", count: 1 });
  s = closeDraw(s);
  assert.equal(s.dealer, 0);
  assert.equal(s.trumpSuit, "H", "suited choice must fix the trump suit, not fall through to no-trump");
});

test("and choosing no-trump instead also works (player's choice)", () => {
  let s = freshDrawn();
  s.hands[0] = [card("H", 6), card("JOKER", 16), ...s.hands[0]];
  s = bid(s, 0, { noTrump: true, count: 1 });
  s = closeDraw(s);
  assert.equal(s.dealer, 0);
  assert.equal(s.trumpSuit, null, "no-trump game has no trump suit");
});

test("no-trump beats a suited bid of EQUAL count", () => {
  let s = freshDrawn();
  s.hands[1] = [card("H", 6), ...s.hands[1]];
  s.hands[2] = [card("JOKER", 15), ...s.hands[2]];
  s = bid(s, 1, { suit: "H", count: 1 });
  s = bid(s, 2, { noTrump: true, count: 1 });
  s = closeDraw(s);
  assert.equal(s.dealer, 2);
  assert.equal(s.trumpSuit, null);
});

test("MORE copies (suited ×2) beats no-trump ×1", () => {
  let s = freshDrawn();
  s.hands[1] = [card("JOKER", 15), ...s.hands[1]];
  s.hands[2] = [card("C", 6, 0), card("C", 6, 1), ...s.hands[2]];
  s = bid(s, 1, { noTrump: true, count: 1 });
  s = bid(s, 2, { suit: "C", count: 2 });
  s = closeDraw(s);
  assert.equal(s.dealer, 2);
  assert.equal(s.trumpSuit, "C");
});

test("an equal-count suited overcall does NOT override (first standing wins)", () => {
  let s = freshDrawn();
  s.hands[1] = [card("H", 6), ...s.hands[1]];
  s.hands[2] = [card("S", 6), ...s.hands[2]];
  s = bid(s, 1, { suit: "H", count: 1 });
  s = bid(s, 2, { suit: "S", count: 1 });
  s = closeDraw(s);
  assert.equal(s.dealer, 1);
  assert.equal(s.trumpSuit, "H");
});

test("bidding a suit whose 6 you don't hold is rejected", () => {
  let s = freshDrawn();
  s.hands[1] = s.hands[1].filter((c) => !(c.suit === "D" && c.rank === 6));
  assert.throws(() => bid(s, 1, { suit: "D", count: 1 }), /invalid bid/);
});

test("no bid at all → shuffler is the forced (naked) dealer", () => {
  let s = freshDrawn();
  s = closeDraw(s);
  assert.equal(s.dealer, s.shuffler);
  assert.equal(s.phase, "bury");
});
