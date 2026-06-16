import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDeck, isTrump, trumpStrength, suitCategory, pointValue, seqIndex, compareTops,
} from "../cards.js";

const LEVEL = 6;
const TRUMP = "H"; // hearts trump

function card(suit, rank, deck = 0) {
  return { id: `${deck}:${suit}:${rank}`, suit, rank, deck };
}

test("deck size scales with deck count", () => {
  assert.equal(buildDeck(1).length, 54);
  assert.equal(buildDeck(2).length, 108);
  assert.equal(buildDeck(4).length, 216);
});

test("trump set membership", () => {
  assert.ok(isTrump(card("JOKER", 16), LEVEL, TRUMP), "big joker is trump");
  assert.ok(isTrump(card("JOKER", 15), LEVEL, TRUMP), "small joker is trump");
  assert.ok(isTrump(card("S", 6), LEVEL, TRUMP), "off-suit rank card is trump");
  assert.ok(isTrump(card("H", 6), LEVEL, TRUMP), "trump-suit rank card is trump");
  assert.ok(isTrump(card("H", 9), LEVEL, TRUMP), "trump-suit non-rank is trump");
  assert.ok(!isTrump(card("S", 9), LEVEL, TRUMP), "off-suit non-rank is not trump");
});

test("trump strength ordering: big > small > trump-rank > off-rank > trump-suit A", () => {
  const order = [
    card("JOKER", 16), card("JOKER", 15), card("H", 6), card("S", 6), card("H", 14),
  ];
  const strengths = order.map((c) => trumpStrength(c, LEVEL, TRUMP));
  for (let i = 1; i < strengths.length; i++) {
    assert.ok(strengths[i - 1] > strengths[i], `idx ${i - 1} should beat ${i}`);
  }
});

test("off-suit rank cards are equal strength", () => {
  assert.equal(trumpStrength(card("S", 6), LEVEL, TRUMP), trumpStrength(card("C", 6), LEVEL, TRUMP));
});

test("point values", () => {
  assert.equal(pointValue(card("S", 5)), 5);
  assert.equal(pointValue(card("S", 10)), 10);
  assert.equal(pointValue(card("S", 13)), 10);
  assert.equal(pointValue(card("S", 9)), 0);
  assert.equal(pointValue(card("JOKER", 16)), 0);
});

test("suit category collapses all trumps to T", () => {
  assert.equal(suitCategory(card("H", 9), LEVEL, TRUMP), "T");
  assert.equal(suitCategory(card("S", 6), LEVEL, TRUMP), "T");
  assert.equal(suitCategory(card("S", 9), LEVEL, TRUMP), "S");
});

test("seqIndex makes 5 and 7 adjacent in a non-trump suit when level=6", () => {
  // hearts is trump here; test spades (non-trump)
  const five = seqIndex(card("S", 5), LEVEL, TRUMP);
  const seven = seqIndex(card("S", 7), LEVEL, TRUMP);
  assert.equal(Math.abs(five - seven), 1, "5 and 7 should be tractor-adjacent");
});

test("compareTops: trump beats non-trump; led suit beats off-suit", () => {
  // trump 9H beats non-trump A of led suit
  assert.ok(compareTops(card("H", 9), card("S", 14), LEVEL, TRUMP, "S") > 0);
  // among non-trump, only led suit (S) can win over off-suit (C)
  assert.ok(compareTops(card("S", 3), card("C", 14), LEVEL, TRUMP, "S") > 0);
  // off-suit vs off-suit when neither is led: tie (0)
  assert.equal(compareTops(card("C", 14), card("D", 13), LEVEL, TRUMP, "S"), 0);
});
