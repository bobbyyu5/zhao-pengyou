import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame, dealCardsOnly, closeDraw, buryKitty, callFriends, playMove, viewFor } from "../engine.js";

// ENGINE_SPEC §5: the first player to PLAY a called card becomes the dealer's friend.

function setupToCall(seed) {
  let s = newGame(4, seed);
  s = dealCardsOnly(s);
  s = closeDraw(s); // no bids → shuffler (seat 0) is dealer
  s = buryKitty(s, s.dealer, s.hands[s.dealer].slice(0, s.config.kitty));
  return s;
}
// A card that can be called as a friend: not a joker and not the level rank (which is trump).
function callable(hand, level) {
  return hand.find((c) => c.suit !== "JOKER" && c.rank !== level) || hand[0];
}

test("the first player to play a called card becomes a friend", () => {
  let s = setupToCall("friend-a");
  // call a card that seat 1 holds, so we can have them play it
  const target = callable(s.hands[1], s.level);
  s = callFriends(s, s.dealer, [{ suit: target.suit, rank: target.rank }]);
  assert.equal(s.phase, "play");
  assert.deepEqual(s.friendSeats, [], "no friend revealed yet");

  // let seat 1 lead the called card (leading any formation is legal)
  s.turn = 1; s.leader = 1; s.trick = []; s.ledFormation = null;
  const card = s.hands[1].find((c) => c.suit === target.suit && c.rank === target.rank);
  s = playMove(s, 1, [card]);

  assert.ok(s.friendSeats.includes(1), "seat 1 should be marked as the friend");
});

test("the dealer never becomes their own friend", () => {
  let s = setupToCall("friend-b");
  // call a card the dealer holds
  const target = callable(s.hands[s.dealer], s.level);
  s = callFriends(s, s.dealer, [{ suit: target.suit, rank: target.rank }]);
  const card = s.hands[s.dealer].find((c) => c.suit === target.suit && c.rank === target.rank);
  s = playMove(s, s.dealer, [card]);
  assert.deepEqual(s.friendSeats, [], "dealer playing the called card does not reveal a friend");
});

test("cannot call the level rank as a friend (it's trump)", () => {
  let s = setupToCall("friend-lvl"); // level 6
  assert.throws(() => callFriends(s, s.dealer, [{ suit: "H", rank: 6 }]), /level rank/);
  assert.doesNotThrow(() => callFriends(s, s.dealer, [{ suit: "H", rank: 14 }]));
});

test("the revealed friend is visible to all seats in their view", () => {
  let s = setupToCall("friend-c");
  const target = callable(s.hands[2], s.level);
  s = callFriends(s, s.dealer, [{ suit: target.suit, rank: target.rank }]);
  s.turn = 2; s.leader = 2; s.trick = []; s.ledFormation = null;
  const card = s.hands[2].find((c) => c.suit === target.suit && c.rank === target.rank);
  s = playMove(s, 2, [card]);

  for (let seat = 0; seat < 4; seat++) {
    assert.ok(viewFor(s, seat).friendSeats.includes(2), `seat ${seat}'s view shows the friend`);
  }
});
