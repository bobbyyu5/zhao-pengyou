import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newGame, dealAll, dealNext, bid, buryKitty, callFriends, playMove, clearTrick, legalMoves, viewFor,
} from "../engine.js";
import { botBid, botBury, botCallFriends, botPlay } from "../bots.js";
import { getConfig } from "../config.js";

// Drive a complete bot-vs-bot hand for each seat count and assert invariants hold.
function playFullHand(players, seed) {
  const cfg = getConfig(players);
  let s = newGame(players, seed);
  s = dealAll(s);

  // simplified post-deal bidding: each seat offers its best bid once
  for (let seat = 0; seat < players; seat++) {
    const b = botBid(s, seat);
    if (b) { try { s = bid(s, seat, b); } catch { /* illegal, skip */ } }
  }
  // finishDraw already ran inside dealAll, so re-resolve dealer if a bid changed things:
  // (in this simplified path dealAll fixed the dealer; bids here only matter pre-finish.
  //  For a faithful test we instead bid BEFORE dealAll — see liveDraw test below.)

  assert.equal(s.phase, "bury");
  s = buryKitty(s, s.dealer, botBury(s, s.dealer));
  assert.equal(s.phase, "call");
  s = callFriends(s, s.dealer, botCallFriends(s, s.dealer));
  assert.equal(s.phase, "play");

  let guard = 0;
  while (s.phase === "play") {
    if (++guard > 5000) throw new Error("play loop did not terminate");
    if (s.trickResolved) { s = clearTrick(s); continue; } // trick is held face-up; advance
    const seat = s.turn;
    const move = botPlay(s, seat);
    assert.ok(move && move.cards && move.cards.length > 0, `seat ${seat} produced a move`);
    s = playMove(s, seat, move.cards);
  }
  return { s, cfg };
}

for (const players of [4, 5, 6, 7]) {
  test(`full bot hand completes and conserves cards — ${players} players`, () => {
    const { s, cfg } = playFullHand(players, `seed-${players}`);
    assert.equal(s.phase, "scoring");
    // every hand emptied
    assert.ok(s.hands.every((h) => h.length === 0), "all hands played out");
    // buried equals the kitty size
    assert.equal(s.buried.length, cfg.kitty);
    // a valid tier was produced
    assert.ok(["dealer_loses", "dealer_wins", "small_sweep", "big_sweep"].includes(s.result.tier));
    // grabber points never exceed total points
    assert.ok(s.result.grabberPoints <= cfg.totalPoints);
  });
}

test("live-draw bidding sets dealer and trump before the deal finishes", () => {
  let s = newGame(4, "livedraw");
  // deal until someone can bid a 6
  let bidPlaced = false;
  let guard = 0;
  while (s.phase === "draw" && ++guard < 500) {
    s = dealNext(s);
    if (s.phase !== "draw") break;
    for (let seat = 0; seat < s.players && !bidPlaced; seat++) {
      const has6 = s.hands[seat].some((c) => c.suit !== "JOKER" && c.rank === 6);
      if (has6) {
        const suit = s.hands[seat].find((c) => c.rank === 6 && c.suit !== "JOKER").suit;
        s = bid(s, seat, { suit, count: 1 });
        bidPlaced = true;
      }
    }
  }
  assert.equal(s.phase, "bury");
  assert.ok(s.dealer !== null, "a dealer was chosen");
  if (bidPlaced) assert.ok(s.trumpSuit !== undefined);
});

test("viewFor never leaks other hands, deck, or kitty", () => {
  let s = newGame(4, "redact");
  s = dealAll(s);
  s = buryKitty(s, s.dealer, botBury(s, s.dealer));
  s = callFriends(s, s.dealer, botCallFriends(s, s.dealer));
  const view = viewFor(s, 0);
  assert.ok(!("hands" in view), "no hands array");
  assert.ok(!("deck" in view), "no deck");
  assert.ok(!("buried" in view), "no buried");
  assert.equal(view.yourHand.length, s.hands[0].length);
  assert.equal(view.handCounts.length, 4);
});

test("playMove rejects an out-of-turn play", () => {
  let s = newGame(4, "turns");
  s = dealAll(s);
  s = buryKitty(s, s.dealer, botBury(s, s.dealer));
  s = callFriends(s, s.dealer, botCallFriends(s, s.dealer));
  const notTurn = (s.turn + 1) % 4;
  assert.throws(() => playMove(s, notTurn, [s.hands[notTurn][0]]), /not your turn/);
});
