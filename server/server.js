// 找朋友 Zhao Pengyou — authoritative realtime server (ENGINE_SPEC §1).
//
// Node + Socket.IO. In-memory room registry keyed by a 4-char code. The engine owns all game
// state here; clients receive only viewFor(state, theirSeat). Empty seats can be filled with
// bots so a partial room still plays. Disconnect/reconnect (by token) and turn timeouts keep
// a real game across phones from stalling.

import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  newGame, dealCardsOnly, closeDraw, bid, buryKitty, callFriends, playMove, legalMoves,
  nextHand as engineNextHand, viewFor,
  botBid, botBury, botCallFriends, botPlay,
  getConfig,
} from "../engine/index.js";
import {
  initStore, createGuest, userIdForToken, getProgress, mergeProgress, upsertGoogleUser,
  getMe, addFriendByCode, getLeaderboard,
} from "./store.js";

const PORT = process.env.PORT || 8787;
const ORIGIN = process.env.CLIENT_ORIGIN || "*";
const BID_WINDOW_MS = Number(process.env.BID_WINDOW_MS || 12000);
const BOT_DELAY_MS = Number(process.env.BOT_DELAY_MS || 700);
const TURN_TIMEOUT_MS = Number(process.env.TURN_TIMEOUT_MS || 45000);

// ── Accounts + progress API (additive; dormant until DATABASE_URL/VITE_CLOUD_SYNC) ──
function sendJSON(res, code, obj) {
  res.writeHead(code, {
    "content-type": "application/json",
    "access-control-allow-origin": ORIGIN,
    "access-control-allow-headers": "content-type,authorization",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let d = ""; req.on("data", (c) => { d += c; if (d.length > 1e5) req.destroy(); });
    req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
  });
}
function bearer(req) { const h = req.headers.authorization || ""; return h.startsWith("Bearer ") ? h.slice(7) : null; }

async function handleApi(req, res, pathname) {
  if (req.method === "OPTIONS") { sendJSON(res, 204, {}); return; }
  try {
    if (pathname === "/api/auth/guest" && req.method === "POST") {
      const b = await readBody(req); sendJSON(res, 200, await createGuest(b.name)); return;
    }
    if (pathname === "/api/auth/google" && req.method === "POST") {
      const b = await readBody(req);
      const { OAuth2Client } = await import("google-auth-library");
      const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
      const ticket = await client.verifyIdToken({ idToken: b.idToken, audience: process.env.GOOGLE_CLIENT_ID });
      const p = ticket.getPayload();
      const out = await upsertGoogleUser(p.sub, b.name || p.name, b.guestToken);
      sendJSON(res, 200, { ...out, name: p.name }); return;
    }
    if (pathname === "/api/progress") {
      const uid = await userIdForToken(bearer(req));
      if (!uid) { sendJSON(res, 401, { error: "unauthorized" }); return; }
      if (req.method === "GET") { sendJSON(res, 200, await getProgress(uid)); return; }
      if (req.method === "POST") { const b = await readBody(req); sendJSON(res, 200, await mergeProgress(uid, b)); return; }
    }
    if (pathname === "/api/me" && req.method === "GET") {
      const uid = await userIdForToken(bearer(req));
      if (!uid) { sendJSON(res, 401, { error: "unauthorized" }); return; }
      sendJSON(res, 200, await getMe(uid)); return;
    }
    if (pathname === "/api/friends/add" && req.method === "POST") {
      const uid = await userIdForToken(bearer(req));
      if (!uid) { sendJSON(res, 401, { error: "unauthorized" }); return; }
      const b = await readBody(req);
      const f = await addFriendByCode(uid, b.code);
      if (!f) { sendJSON(res, 404, { error: "friend code not found" }); return; }
      sendJSON(res, 200, { ok: true, friend: f }); return;
    }
    if (pathname === "/api/leaderboard" && req.method === "GET") {
      const uid = await userIdForToken(bearer(req));
      if (!uid) { sendJSON(res, 401, { error: "unauthorized" }); return; }
      sendJSON(res, 200, await getLeaderboard(uid)); return;
    }
    sendJSON(res, 404, { error: "not found" });
  } catch (e) { sendJSON(res, 400, { error: String(e.message || e) }); }
}

const http = createServer((req, res) => {
  const pathname = (req.url || "/").split("?")[0];
  if (pathname === "/health") { res.writeHead(200); res.end("ok"); return; }
  if (pathname.startsWith("/api/")) { handleApi(req, res, pathname); return; }
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("找朋友 Zhao Pengyou server is running.");
});
const io = new Server(http, { cors: { origin: ORIGIN, methods: ["GET", "POST"] } });

/** @type {Map<string, Room>} code → room */
const rooms = new Map();
let tokenCounter = 1;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no easily-confused chars
function newCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function makeRoom(players, hostName, hostToken) {
  const code = newCode();
  const room = {
    code, players, host: 0, started: false,
    seats: Array.from({ length: players }, () => null), // { name, bot, token, socketId, connected }
    state: null,
    timers: { bid: null, turn: null, bot: null },
  };
  room.seats[0] = { name: hostName, bot: false, token: hostToken, socketId: null, connected: true };
  rooms.set(code, room);
  return room;
}

function roomPublic(room) {
  return {
    code: room.code, players: room.players, host: room.host, started: room.started,
    seats: room.seats.map((s) => (s ? { name: s.name, bot: s.bot, connected: s.connected } : null)),
  };
}

function clearTimers(room) {
  for (const k of Object.keys(room.timers)) { if (room.timers[k]) { clearTimeout(room.timers[k]); room.timers[k] = null; } }
}

function seatOfSocket(room, socketId) {
  return room.seats.findIndex((s) => s && s.socketId === socketId);
}

/** Push each connected human their redacted view; bots get nothing. */
function broadcastViews(room) {
  if (!room.state) return;
  room.seats.forEach((s, seat) => {
    if (s && !s.bot && s.socketId && s.connected) {
      io.to(s.socketId).emit("view", viewFor(room.state, seat));
    }
  });
}

function broadcastRoom(room) {
  room.seats.forEach((s) => {
    if (s && !s.bot && s.socketId) io.to(s.socketId).emit("room", roomPublic(room));
  });
}

function emitSeal(room, seat) {
  const name = room.seats[seat]?.name || `玩家${seat}`;
  room.seats.forEach((s) => {
    if (s && !s.bot && s.socketId && s.connected) io.to(s.socketId).emit("seal", { seat, name });
  });
}

// ── Game lifecycle ───────────────────────────────────────────────────────────
function startGame(room) {
  // fill any empty seats with bots
  for (let i = 0; i < room.players; i++) {
    if (!room.seats[i]) room.seats[i] = { name: `机器人${i}`, bot: true, token: null, socketId: null, connected: true };
  }
  room.started = true;
  let s = newGame(room.players);
  s = dealCardsOnly(s);
  s = applyBotBids(room, s);
  room.state = s;
  broadcastRoom(room);
  broadcastViews(room);
  // bid window: humans may bid; then close
  clearTimers(room);
  room.timers.bid = setTimeout(() => closeDrawAndContinue(room), BID_WINDOW_MS);
}

function applyBotBids(room, s) {
  let out = s;
  for (let seat = 0; seat < out.players; seat++) {
    if (room.seats[seat]?.bot) {
      const b = botBid(out, seat);
      if (b) { try { out = bid(out, seat, b); } catch { /* skip */ } }
    }
  }
  return out;
}

function closeDrawAndContinue(room) {
  if (!room.state || room.state.phase !== "draw") return;
  room.state = closeDraw(room.state);
  afterDraw(room);
}

function afterDraw(room) {
  const s = room.state;
  if (room.seats[s.dealer]?.bot) {
    let st = buryKitty(s, s.dealer, botBury(s, s.dealer));
    st = callFriends(st, st.dealer, botCallFriends(st, st.dealer));
    room.state = st;
    broadcastViews(room);
    drive(room);
  } else {
    broadcastViews(room);
    armDealerTimeout(room); // dealer is a human; auto-bury if they stall
  }
}

function armDealerTimeout(room) {
  clearTimeout(room.timers.turn);
  room.timers.turn = setTimeout(() => {
    const s = room.state;
    if (!s) return;
    if (s.phase === "bury") {
      let st = buryKitty(s, s.dealer, botBury(s, s.dealer));
      st = callFriends(st, st.dealer, botCallFriends(st, st.dealer));
      room.state = st; broadcastViews(room); drive(room);
    } else if (s.phase === "call") {
      room.state = callFriends(s, s.dealer, botCallFriends(s, s.dealer));
      broadcastViews(room); drive(room);
    }
  }, TURN_TIMEOUT_MS);
}

/** Step bot (and timed-out) seats during play until a connected human must act or hand ends. */
function drive(room) {
  clearTimeout(room.timers.turn);
  const s = room.state;
  if (!s || s.phase !== "play") { broadcastViews(room); return; }
  const seat = s.turn;
  const occupant = room.seats[seat];
  const isBot = occupant?.bot || !occupant?.connected;
  if (isBot) {
    room.timers.bot = setTimeout(() => stepSeat(room, seat), BOT_DELAY_MS);
  } else {
    broadcastViews(room);
    // human turn: arm a timeout to auto-play so the table never stalls
    room.timers.turn = setTimeout(() => stepSeat(room, seat, true), TURN_TIMEOUT_MS);
  }
}

function stepSeat(room, seat, timedOut = false) {
  const s = room.state;
  if (!s || s.phase !== "play" || s.turn !== seat) return;
  let ns;
  try {
    const move = botPlay(s, seat);
    ns = playMove(s, seat, move.cards);
  } catch {
    const lm = legalMoves(s, seat);
    if (!lm.length) return;
    ns = playMove(s, seat, lm[0].cards);
  }
  applyTransition(room, s, ns);
}

function applyTransition(room, prev, next) {
  if (next.friendSeats.length > prev.friendSeats.length) {
    const seat = next.friendSeats.find((x) => !prev.friendSeats.includes(x));
    if (seat != null) { room.state = next; emitSeal(room, seat); }
  }
  room.state = next;
  if (next.phase === "scoring" || next.phase === "done") {
    broadcastViews(room);
    return;
  }
  drive(room);
}

// ── Socket wiring ────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  socket.on("createRoom", ({ name, players }) => {
    const n = Math.max(4, Math.min(10, Number(players) || 4));
    try { getConfig(n); } catch { socket.emit("errorMsg", "无效人数"); return; }
    const token = `t${tokenCounter++}`;
    const room = makeRoom(n, (name || "玩家").slice(0, 10), token);
    room.seats[0].socketId = socket.id;
    socket.join(room.code);
    socket.data = { code: room.code, token };
    socket.emit("joined", { you: 0, room: roomPublic(room), token });
    broadcastRoom(room);
  });

  socket.on("joinRoom", ({ name, code }) => {
    const room = rooms.get(String(code || "").toUpperCase());
    if (!room) { socket.emit("errorMsg", "房间不存在 room not found"); return; }
    if (room.started) { socket.emit("errorMsg", "游戏已开始 game already started"); return; }
    const seat = room.seats.findIndex((s) => !s);
    if (seat < 0) { socket.emit("errorMsg", "房间已满 room full"); return; }
    const token = `t${tokenCounter++}`;
    room.seats[seat] = { name: (name || "玩家").slice(0, 10), bot: false, token, socketId: socket.id, connected: true };
    socket.join(room.code);
    socket.data = { code: room.code, token };
    socket.emit("joined", { you: seat, room: roomPublic(room), token });
    broadcastRoom(room);
  });

  socket.on("resume", ({ code, token }) => {
    const room = rooms.get(String(code || "").toUpperCase());
    if (!room) { socket.emit("errorMsg", "房间已过期"); return; }
    const seat = room.seats.findIndex((s) => s && s.token === token);
    if (seat < 0) { socket.emit("errorMsg", "无法恢复座位"); return; }
    room.seats[seat].socketId = socket.id;
    room.seats[seat].connected = true;
    socket.join(room.code);
    socket.data = { code: room.code, token };
    socket.emit("joined", { you: seat, room: roomPublic(room), token });
    broadcastRoom(room);
    if (room.state) { io.to(socket.id).emit("view", viewFor(room.state, seat)); drive(room); }
  });

  socket.on("addBots", () => withHostRoom(socket, (room) => {
    for (let i = 0; i < room.players; i++) if (!room.seats[i]) room.seats[i] = { name: `机器人${i}`, bot: true, token: null, socketId: null, connected: true };
    broadcastRoom(room);
  }));

  socket.on("startGame", () => withHostRoom(socket, (room) => {
    if (room.started) return;
    const filled = room.seats.filter(Boolean).length;
    if (filled < 2) { socket.emit("errorMsg", "至少需要两名玩家"); return; }
    startGame(room);
  }));

  socket.on("bid", ({ bid: b }) => withSeat(socket, (room, seat) => {
    if (room.state?.phase !== "draw") return;
    if (b) { try { room.state = bid(room.state, seat, b); broadcastViews(room); } catch (e) { socket.emit("errorMsg", e.message); } }
    else { /* pass — no-op; window timer closes the draw */ }
  }));

  socket.on("bury", ({ cardIds }) => withSeat(socket, (room, seat) => {
    const s = room.state;
    if (s?.phase !== "bury" || seat !== s.dealer) return;
    const cards = s.hands[seat].filter((c) => cardIds.includes(c.id));
    try { room.state = buryKitty(s, seat, cards); broadcastViews(room); armDealerTimeout(room); }
    catch (e) { socket.emit("errorMsg", e.message); }
  }));

  socket.on("call", ({ cards }) => withSeat(socket, (room, seat) => {
    const s = room.state;
    if (s?.phase !== "call" || seat !== s.dealer) return;
    try { room.state = callFriends(s, seat, cards); broadcastViews(room); drive(room); }
    catch (e) { socket.emit("errorMsg", e.message); }
  }));

  socket.on("play", ({ cardIds }) => withSeat(socket, (room, seat) => {
    const s = room.state;
    if (s?.phase !== "play" || s.turn !== seat) return;
    const cards = s.hands[seat].filter((c) => cardIds.includes(c.id));
    let ns;
    try { ns = playMove(s, seat, cards); }
    catch (e) { socket.emit("errorMsg", e.message); return; }
    applyTransition(room, s, ns);
  }));

  socket.on("nextHand", () => withSeat(socket, (room) => {
    const s = room.state;
    if (s?.phase !== "scoring") return;
    let ns = engineNextHand(s);
    if (ns.phase === "done") { room.state = ns; broadcastViews(room); return; }
    ns = dealCardsOnly(ns);
    ns = applyBotBids(room, ns);
    room.state = ns;
    broadcastViews(room);
    clearTimers(room);
    room.timers.bid = setTimeout(() => closeDrawAndContinue(room), BID_WINDOW_MS);
  }));

  // ── WebRTC signaling relay (video/audio mesh) — server only forwards SDP/ICE ──
  socket.on("rtc-join", () => withSeat(socket, (room, seat) => {
    if (!room.call) room.call = new Set();
    const others = [...room.call].filter((s) => s !== seat);
    room.call.add(seat);
    io.to(socket.id).emit("rtc-peers", { seats: others }); // joiner connects to existing peers
    others.forEach((s) => { const sid = room.seats[s]?.socketId; if (sid) io.to(sid).emit("rtc-peer-joined", { seat }); });
  }));

  socket.on("rtc-signal", ({ toSeat, data }) => withSeat(socket, (room, fromSeat) => {
    const sid = room.seats[toSeat]?.socketId;
    if (sid) io.to(sid).emit("rtc-signal", { fromSeat, data });
  }));

  socket.on("rtc-leave", () => withSeat(socket, (room, seat) => leaveCall(room, seat)));

  socket.on("leaveRoom", () => handleLeave(socket));
  socket.on("disconnect", () => handleDisconnect(socket));
});

function leaveCall(room, seat) {
  if (!room.call || !room.call.has(seat)) return;
  room.call.delete(seat);
  room.call.forEach((s) => { const sid = room.seats[s]?.socketId; if (sid) io.to(sid).emit("rtc-peer-left", { seat }); });
}

function withSeat(socket, fn) {
  const code = socket.data?.code; if (!code) return;
  const room = rooms.get(code); if (!room) return;
  const seat = seatOfSocket(room, socket.id); if (seat < 0) return;
  fn(room, seat);
}
function withHostRoom(socket, fn) {
  const code = socket.data?.code; if (!code) return;
  const room = rooms.get(code); if (!room) return;
  const seat = seatOfSocket(room, socket.id);
  if (seat !== room.host) { socket.emit("errorMsg", "仅房主可操作"); return; }
  fn(room);
}

function handleDisconnect(socket) {
  const code = socket.data?.code; if (!code) return;
  const room = rooms.get(code); if (!room) return;
  const seat = seatOfSocket(room, socket.id);
  if (seat < 0) return;
  room.seats[seat].connected = false;
  room.seats[seat].socketId = null;
  leaveCall(room, seat);
  broadcastRoom(room);
  // if it was their turn mid-play, let the bot driver cover for them
  if (room.state?.phase === "play" && room.state.turn === seat) drive(room);
  // clean up empty, unstarted rooms
  if (!room.started && room.seats.every((s) => !s || !s.connected)) { clearTimers(room); rooms.delete(code); }
}

function handleLeave(socket) {
  const code = socket.data?.code; if (!code) return;
  const room = rooms.get(code); if (!room) return;
  const seat = seatOfSocket(room, socket.id);
  if (seat < 0) return;
  leaveCall(room, seat);
  if (!room.started) {
    room.seats[seat] = null;
    if (room.seats.every((s) => !s)) { clearTimers(room); rooms.delete(code); return; }
    if (seat === room.host) room.host = room.seats.findIndex(Boolean);
  } else {
    room.seats[seat].connected = false;
    room.seats[seat].socketId = null;
    if (room.state?.phase === "play" && room.state.turn === seat) drive(room);
  }
  broadcastRoom(room);
  socket.leave(code);
  socket.data = {};
}

initStore()
  .then((info) => console.log(`找朋友 store: ${info.mode}`))
  .catch((e) => console.error("store init failed (continuing in memory):", e.message));

http.listen(PORT, () => {
  console.log(`找朋友 server listening on :${PORT} (origin ${ORIGIN})`);
});
