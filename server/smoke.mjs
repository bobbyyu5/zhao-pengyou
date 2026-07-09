// End-to-end server smoke test: boot the real server, connect a human host over Socket.IO,
// fill the table with bots, start a game, and play a full hand through the wire protocol —
// asserting the host only ever sees its own hand (redaction) and the hand scores correctly.
//
// Run: node server/smoke.mjs   (exits 0 on success, 1 on failure)

process.env.PORT = process.env.PORT || "8799";
process.env.BID_WINDOW_MS = "400";
process.env.BOT_DELAY_MS = "60";
process.env.TURN_TIMEOUT_MS = "4000";
process.env.TRICK_HOLD_MS = "0"; // don't hold finished tricks in the test — run the hand at speed

import { io as Client } from "socket.io-client";
import { clientLegalMoves } from "../engine/index.js";

await import("./server.js"); // side-effect: starts listening on PORT
await sleep(300);

const URL = `http://localhost:${process.env.PORT}`;
let failed = false;
const assert = (cond, msg) => { if (!cond) { failed = true; console.error("✖", msg); } else { console.log("✔", msg); } };

const host = Client(URL, { transports: ["websocket"] });
let acted = "";
let done = false;

host.on("connect", () => host.emit("createRoom", { name: "Robert", players: 4 }));

host.on("joined", ({ you, room }) => {
  assert(you === 0, "host seated at 0");
  assert(room.code?.length === 4, "got a 4-char room code");
  host.emit("addBots");
  setTimeout(() => host.emit("startGame"), 100);
});

host.on("errorMsg", (m) => console.error("server error:", m));

host.on("view", (v) => {
  // redaction checks (first time we see a hand)
  assert(!("hands" in v) && !("deck" in v) && !("buried" in v), "view never leaks hidden state");
  assert(Array.isArray(v.handCounts) && v.handCounts.length === 4, "handCounts present for all seats");

  const tag = `${v.phase}:${v.turn}:${v.handNumber}:${v.handCounts[v.you]}:${v.trick.length}`;
  if (tag === acted || done) return;
  acted = tag;

  if (v.phase === "bury" && v.dealer === v.you) {
    const ids = v.yourHand.slice(0, v.config.kitty).map((c) => c.id);
    host.emit("bury", { cardIds: ids });
  } else if (v.phase === "call" && v.dealer === v.you) {
    const cards = Array.from({ length: v.friendsToCall }, (_, i) => ({ suit: ["S", "H", "C", "D"][i % 4], rank: 14 }));
    host.emit("call", { cards });
  } else if (v.phase === "play" && v.turn === v.you) {
    const moves = clientLegalMoves(v);
    assert(moves.length > 0, "host has a legal move when it's their turn");
    host.emit("play", { cardIds: moves[0].cards.map((c) => c.id) });
  } else if (v.phase === "scoring") {
    done = true;
    assert(["dealer_loses", "dealer_wins", "small_sweep", "big_sweep"].includes(v.result.tier), "hand scored to a valid tier");
    assert(v.handCounts.every((n) => n === 0), "all hands emptied");
    console.log(`\nFinal: tier=${v.result.tier} grabbers=${v.result.grabberPoints}/${v.result.passLine} dealer=${v.result.dealerSeat} won=${v.result.dealerWon}`);
    finish();
  }
});

function finish() {
  host.close();
  setTimeout(() => {
    console.log(failed ? "\nSMOKE FAILED" : "\nSMOKE PASSED");
    process.exit(failed ? 1 : 0);
  }, 150);
}

// safety timeout
setTimeout(() => { console.error("✖ timed out before scoring"); process.exit(1); }, 20000);

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
