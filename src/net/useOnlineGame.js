import { useEffect, useReducer, useRef } from "react";
import { io } from "socket.io-client";
import { clientLegalMoves } from "../../engine/index.js";

export const SERVER_URL = import.meta.env?.VITE_SERVER_URL || "";

const SESSION_KEY = "zhao.session";
function saveSession(s) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {} }
function loadSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; } }
function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch {} }

/**
 * Online controller. The authoritative GameState lives on the server; this hook only ever
 * holds the redacted PlayerView the server sends for our seat. Actions are emitted as socket
 * events and the server validates every move. Mirrors useLocalGame's return shape so <Game>
 * is identical for local and online.
 */
export function useOnlineGame() {
  const [, force] = useReducer((x) => x + 1, 0);
  const ref = useRef({
    socket: null, connected: false, error: null,
    room: null, you: null, view: null, names: null, seal: null, toast: null, phase: "menu",
    emotes: [], emoteSeq: 0, chatLog: [],
  });

  function update(patch) { Object.assign(ref.current, patch); force(); }

  function connect() {
    if (ref.current.socket || !SERVER_URL) return ref.current.socket;
    const socket = io(SERVER_URL, { transports: ["websocket"], reconnection: true });
    ref.current.socket = socket;

    socket.on("connect", () => {
      update({ connected: true, error: null });
      // survive a phone lock/unlock or dropped connection: reclaim our seat by token
      const saved = loadSession();
      if (saved && (c.phase === "lobby" || c.phase === "game")) socket.emit("resume", saved);
    });
    socket.on("disconnect", () => update({ connected: false }));
    socket.on("connect_error", () => update({ error: "无法连接服务器 server unreachable", connected: false }));

    socket.on("room", (room) => update({ room, names: room.seats.map((s) => s?.name || null), phase: room.started ? "game" : "lobby" }));
    socket.on("joined", ({ you, room, token }) => {
      saveSession({ code: room.code, token });
      update({ you, room, names: room.seats.map((s) => s?.name || null), phase: room.started ? "game" : "lobby" });
    });
    socket.on("view", (view) => update({ view, phase: "game" }));
    socket.on("seal", ({ seat, name }) => { update({ seal: { seat, name } }); });
    socket.on("errorMsg", (msg) => { update({ toast: msg }); setTimeout(() => update({ toast: null }), 2400); });
    socket.on("emote", ({ seat, kind, value }) => {
      const id = ++ref.current.emoteSeq;
      ref.current.emotes = [...ref.current.emotes, { id, seat, kind, value }];
      ref.current.chatLog = [...ref.current.chatLog, { id, seat, kind, value }].slice(-60);
      force();
      const ttl = kind === "text" ? 3600 : 2600;
      setTimeout(() => { ref.current.emotes = ref.current.emotes.filter((e) => e.id !== id); force(); }, ttl);
    });
    return socket;
  }

  useEffect(() => () => { ref.current.socket?.disconnect(); }, []);

  const c = ref.current;
  return {
    mode: "online",
    available: !!SERVER_URL,
    socket: c.socket,
    connected: c.connected,
    error: c.error,
    room: c.room,
    you: c.you,
    view: c.view,
    names: c.names,
    seal: c.seal,
    toast: c.toast,
    emotes: c.emotes,
    chatLog: c.chatLog,
    phase: c.phase, // menu | lobby | game
    actions: {
      createRoom: (name, players) => { connect()?.emit("createRoom", { name, players }); },
      joinRoom: (name, code) => { connect()?.emit("joinRoom", { name, code: code.toUpperCase() }); },
      startGame: () => c.socket?.emit("startGame"),
      addBots: () => c.socket?.emit("addBots"),
      leave: () => { c.socket?.emit("leaveRoom"); clearSession(); update({ room: null, you: null, view: null, phase: "menu" }); },
      humanBid: (bid) => c.socket?.emit("bid", { bid }),
      humanBury: (cards) => c.socket?.emit("bury", { cardIds: cards.map((x) => x.id) }),
      humanCall: (cards) => c.socket?.emit("call", { cards: cards.map((x) => ({ suit: x.suit, rank: x.rank })) }),
      humanPlay: (cards) => c.socket?.emit("play", { cardIds: cards.map((x) => x.id) }),
      nextHand: () => c.socket?.emit("nextHand"),
      dismissSeal: () => update({ seal: null }),
      emote: (kind, value) => c.socket?.emit("emote", { kind, value }),
      legalMovesFor: () => clientLegalMoves(c.view),
    },
  };
}
