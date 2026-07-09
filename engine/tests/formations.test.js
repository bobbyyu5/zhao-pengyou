import { test } from "node:test";
import assert from "node:assert/strict";
import { detectFormation, findPairs, findTractors, validateFollow } from "../formations.js";

const LEVEL = 6;
const TRUMP = "H";
function card(suit, rank, deck = 0) { return { id: `${deck}:${suit}:${rank}`, suit, rank, deck }; }

test("detect single and pair", () => {
  assert.equal(detectFormation([card("S", 9)], LEVEL, TRUMP).type, "single");
  const pair = detectFormation([card("S", 9, 0), card("S", 9, 1)], LEVEL, TRUMP);
  assert.equal(pair.type, "pair");
  assert.equal(pair.pairs, 1);
});

test("two different cards are not a pair", () => {
  assert.equal(detectFormation([card("S", 9), card("S", 10)], LEVEL, TRUMP).valid, false);
  assert.equal(detectFormation([card("S", 9), card("C", 9)], LEVEL, TRUMP).valid, false);
});

test("detect a non-trump tractor 5-5-7-7 (level 6 squeezes the 6 out)", () => {
  const cards = [card("S", 5, 0), card("S", 5, 1), card("S", 7, 0), card("S", 7, 1)];
  const f = detectFormation(cards, LEVEL, TRUMP);
  assert.equal(f.type, "tractor");
  assert.equal(f.pairs, 2);
});

test("non-consecutive pairs are not a tractor", () => {
  const cards = [card("S", 5, 0), card("S", 5, 1), card("S", 9, 0), card("S", 9, 1)];
  assert.equal(detectFormation(cards, LEVEL, TRUMP).type, "mixed");
});

test("trump tractor links trump-suit A to off-suit rank pair", () => {
  // hearts trump, level 6: H-A pair (seq 13) + off-suit rank pair S6 (seq 14) → tractor
  const cards = [card("H", 14, 0), card("H", 14, 1), card("S", 6, 0), card("S", 6, 1)];
  const f = detectFormation(cards, LEVEL, TRUMP);
  assert.equal(f.type, "tractor", "A-pair + off-suit-rank pair should be a trump tractor");
});

test("findTractors finds a 3-link run", () => {
  const cards = [
    card("C", 8, 0), card("C", 8, 1),
    card("C", 9, 0), card("C", 9, 1),
    card("C", 10, 0), card("C", 10, 1),
  ];
  const tractors = findTractors(cards, LEVEL, TRUMP);
  assert.equal(tractors.length, 1);
  assert.equal(tractors[0].length, 3);
});

test("detect a triple (three identical copies)", () => {
  const t = detectFormation([card("S", 9, 0), card("S", 9, 1), card("S", 9, 2)], LEVEL, TRUMP);
  assert.equal(t.type, "triple");
  assert.equal(t.length, 3);
  assert.equal(t.groupSize, 3);
});

test("three of the same RANK but different suits is NOT a triple", () => {
  const f = detectFormation([card("S", 9), card("H", 9), card("C", 9)], LEVEL, TRUMP);
  assert.equal(f.valid, false); // must be identical suit+rank
});

test("Big + Small joker cannot form a pair (different ranks)", () => {
  const f = detectFormation([card("JOKER", 16), card("JOKER", 15)], LEVEL, TRUMP);
  assert.equal(f.valid, false);
});

test("must keep a triple together when following a triple lead", () => {
  const hand = [card("S", 3, 0), card("S", 3, 1), card("S", 3, 2), card("S", 9)];
  const led = detectFormation([card("S", 14, 0), card("S", 14, 1), card("S", 14, 2)], LEVEL, TRUMP);
  // breaking the triple (2 of it + a single) is illegal when you hold the full triple
  assert.equal(validateFollow(hand, led, [card("S", 3, 0), card("S", 3, 1), card("S", 9)], LEVEL, TRUMP).ok, false);
  assert.equal(validateFollow(hand, led, [card("S", 3, 0), card("S", 3, 1), card("S", 3, 2)], LEVEL, TRUMP).ok, true);
});

test("findPairs counts identical copies", () => {
  const cards = [card("S", 9, 0), card("S", 9, 1), card("S", 10, 0)];
  assert.equal(findPairs(cards).length, 1);
});

// ── follow rules (§7) ────────────────────────────────────────────────────────
test("must follow suit on a single lead when holding the suit", () => {
  const hand = [card("S", 3), card("C", 9)];
  const led = detectFormation([card("S", 14)], LEVEL, TRUMP); // led spade single
  // playing the off-suit club while holding a spade is illegal
  assert.equal(validateFollow(hand, led, [card("C", 9)], LEVEL, TRUMP).ok, false);
  assert.equal(validateFollow(hand, led, [card("S", 3)], LEVEL, TRUMP).ok, true);
});

test("must play a pair of the led suit when holding one", () => {
  const hand = [card("S", 3, 0), card("S", 3, 1), card("S", 9)];
  const led = detectFormation([card("S", 14, 0), card("S", 14, 1)], LEVEL, TRUMP); // pair led
  // splitting the pair while holding it is illegal
  assert.equal(validateFollow(hand, led, [card("S", 3, 0), card("S", 9)], LEVEL, TRUMP).ok, false);
  assert.equal(validateFollow(hand, led, [card("S", 3, 0), card("S", 3, 1)], LEVEL, TRUMP).ok, true);
});

test("when void in the led suit, following is free (may ruff)", () => {
  const hand = [card("H", 9), card("C", 4)]; // hearts trump
  const led = detectFormation([card("S", 14)], LEVEL, TRUMP);
  assert.equal(validateFollow(hand, led, [card("H", 9)], LEVEL, TRUMP).ok, true);
  assert.equal(validateFollow(hand, led, [card("C", 4)], LEVEL, TRUMP).ok, true);
});

test("must match the led card count", () => {
  const hand = [card("S", 3, 0), card("S", 3, 1)];
  const led = detectFormation([card("S", 14, 0), card("S", 14, 1)], LEVEL, TRUMP);
  assert.equal(validateFollow(hand, led, [card("S", 3, 0)], LEVEL, TRUMP).ok, false); // only 1 card
});
