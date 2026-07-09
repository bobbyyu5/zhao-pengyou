// Verify the WebRTC SIGNALING path works on the LIVE server: two clients in a room,
// both "join the call", and a signaling message relays A→B. (Media itself is peer-to-peer
// and needs real cameras; this proves the server plumbing that connects them.)
//
// Run: node server/rtc-smoke.mjs   (defaults to the live Railway URL)

import { io as Client } from "socket.io-client";

const URL = process.argv[2] || "https://web-production-42478.up.railway.app";
let failed = false;
const ok = (c, m) => { if (!c) { failed = true; console.error("✖", m); } else console.log("✔", m); };

const A = Client(URL, { transports: ["websocket"] });
const B = Client(URL, { transports: ["websocket"] });
let code = null;
let aGotPeerJoined = false, bGotPeers = false, bGotSignal = false, bGotEmote = false;

A.on("connect", () => A.emit("createRoom", { name: "A", players: 4 }));
A.on("joined", ({ room }) => { code = room.code; console.log("room:", code); B.emit("joinRoom", { name: "B", code }); });

A.on("rtc-peer-joined", ({ seat }) => { aGotPeerJoined = true; console.log("A sees peer join at seat", seat); });

B.on("joined", () => {
  // table banter: A's reaction should relay to everyone in the room (B included)
  setTimeout(() => A.emit("emote", { kind: "emoji", value: "🎉" }), 100);
  // both join the call; A is already present, so B should receive A in rtc-peers
  A.emit("rtc-join");
  setTimeout(() => B.emit("rtc-join"), 300);
});
B.on("emote", ({ seat, kind, value }) => { bGotEmote = (seat === 0 && kind === "emoji" && value === "🎉"); console.log("B got emote from seat", seat, value); });
B.on("rtc-peers", ({ seats }) => { bGotPeers = seats.includes(0); console.log("B's existing peers:", seats); });
B.on("rtc-signal", ({ fromSeat, data }) => { bGotSignal = (fromSeat === 0 && data?.test); console.log("B got relayed signal from seat", fromSeat); finish(); });

// once B has joined the call, A relays a test signal to B (seat 1)
A.on("rtc-peer-joined", () => setTimeout(() => A.emit("rtc-signal", { toSeat: 1, data: { test: true } }), 200));

function finish() {
  ok(aGotPeerJoined, "A notified when B joins the call (rtc-peer-joined)");
  ok(bGotPeers, "B receives existing call peers (rtc-peers)");
  ok(bGotSignal, "signaling message relays A→B (rtc-signal)");
  ok(bGotEmote, "emote reaction relays to the room (emote)");
  A.close(); B.close();
  setTimeout(() => { console.log(failed ? "\nRTC SIGNALING FAILED" : "\nRTC SIGNALING OK ✅"); process.exit(failed ? 1 : 0); }, 200);
}
setTimeout(() => { console.error("✖ timed out"); process.exit(1); }, 15000);
