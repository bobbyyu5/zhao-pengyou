import { useEffect, useReducer, useRef } from "react";
import {
  newGame, dealRound, drawComplete, closeDraw, bid, exposedCardsForBid,
  buryKitty, callFriends, playMove, legalMoves,
  nextHand as engineNextHand, viewFor,
  botBid, botBury, botCallFriends, botPlay,
} from "../../engine/index.js";

const BOT_DELAY = 650;
const TRICK_PAUSE = 1500;     // linger after a trick resolves so players can see who won
// ── live-draw (ENGINE_SPEC §4): deal out over ~15s; tap Bid to expose 6s on the table ──
const DRAW_TARGET_MS = 15000; // total deal time, spread across the rounds
const BID_WINDOW_MS = 5000;   // how long the human's expose window stays open
const FINAL_CALL_MS = 2500;   // last chance to bid after the deal completes
const BOT_BID_PROB = 0.35;    // chance a capable bot exposes on a given round

/**
 * Single-device controller: the human is seat 0, the rest are bots. Holds the full
 * server-authoritative GameState in a ref; the human only ever SEES viewFor(state, 0).
 */
export function useLocalGame() {
  const [, force] = useReducer((x) => x + 1, 0);
  const ref = useRef({
    state: null, you: 0, seal: null, toast: null, names: null, lastTricks: 0,
    draw: null,        // { active, paused, exposed:{seat,cards}, windowEndsAt, lastCall }
    tickMs: 600,
  });
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const set = (state) => { ref.current.state = state; force(); };
  const schedule = (fn, ms) => { const t = setTimeout(fn, ms); timers.current.push(t); };
  const toast = (msg) => { ref.current.toast = msg; force(); schedule(() => { ref.current.toast = null; force(); }, 2200); };

  // ── start a hand: begin the live draw ──────────────────────────────────────
  function start(players, seed) {
    ref.current.names = null;
    ref.current.lastTricks = 0;
    beginDraw(newGame(players, seed));
  }

  function beginDraw(s) {
    ref.current.draw = { active: true, paused: false, exposed: null, windowEndsAt: null, lastCall: false };
    ref.current.tickMs = Math.max(320, Math.min(680, Math.round(DRAW_TARGET_MS / s.config.perPlayer)));
    set(s); // phase "draw", nothing dealt yet
    schedule(dealTick, 500);
  }

  function dealTick() {
    const s = ref.current.state;
    const d = ref.current.draw;
    if (!s || s.phase !== "draw" || !d || !d.active) return;
    if (d.paused) { schedule(dealTick, 150); return; } // wait out an open bid window
    if (drawComplete(s)) { startFinalCall(); return; }
    set(dealRound(s));
    botBidCheck();
    schedule(dealTick, ref.current.tickMs);
  }

  // a capable bot may expose its trump this round (one at most), shown on the table
  function botBidCheck() {
    const s = ref.current.state;
    if (s.dealtCount < s.config.perPlayer * s.players * 0.3) return;
    for (let seat = 1; seat < s.players; seat++) {
      const b = botBid(s, seat);
      if (b && Math.random() < BOT_BID_PROB) { placeBid(seat, b); return; }
    }
  }

  function placeBid(seat, b) {
    let s2;
    try { s2 = bid(ref.current.state, seat, b); }
    catch { return; }
    // show the standing high bid's exposed cards on the table
    if (s2.bid) ref.current.draw.exposed = { seat: s2.bid.seat, cards: exposedCardsForBid(s2, s2.bid) };
    set(s2);
  }

  // ── human bidding (the Bid button → 5s expose window) ──────────────────────
  function openBid() {
    const d = ref.current.draw;
    if (!d || !d.active || d.paused) return;
    d.paused = true;
    d.windowEndsAt = Date.now() + BID_WINDOW_MS;
    force();
    schedule(() => { if (ref.current.draw?.windowEndsAt) closeBidWindow(); }, BID_WINDOW_MS);
  }

  function humanBid(b) {
    const d = ref.current.draw;
    if (!d) return;
    if (b) {
      const before = ref.current.state.bid;
      placeBid(0, b);
      const after = ref.current.state.bid;
      if (!after || after.seat !== 0) toast("出得不够大 — 别人亮的更多。Someone exposed more.");
    }
    closeBidWindow();
  }

  function cancelBid() { closeBidWindow(); }

  function closeBidWindow() {
    const d = ref.current.draw;
    if (!d) return;
    d.paused = false;
    d.windowEndsAt = null;
    force();
  }

  function startFinalCall() {
    const d = ref.current.draw;
    if (!d) return;
    d.lastCall = true;
    force();
    const tryFinish = () => {
      if (ref.current.draw?.paused) { schedule(tryFinish, 300); return; } // wait for an open window
      finishDrawNow();
    };
    schedule(tryFinish, FINAL_CALL_MS);
  }

  function finishDrawNow() {
    const s = ref.current.state;
    if (!s || s.phase !== "draw") return;
    if (ref.current.draw) ref.current.draw.active = false;
    afterDraw(closeDraw(s));
  }

  function afterDraw(s) {
    if (s.dealer !== 0) {
      let st = buryKitty(s, s.dealer, botBury(s, s.dealer));
      st = callFriends(st, st.dealer, botCallFriends(st, st.dealer));
      set(st);
      runBots(st);
    } else {
      set(s); // human is dealer → bury UI
    }
  }

  // ── bury / call / play (unchanged) ─────────────────────────────────────────
  function humanBury(cards) {
    try { set(buryKitty(ref.current.state, 0, cards)); }
    catch (e) { toast(e.message); }
  }
  function humanCall(cards) {
    try { const s = callFriends(ref.current.state, 0, cards); set(s); runBots(s); }
    catch (e) { toast(e.message); }
  }
  function humanPlay(cards) {
    let s;
    try { s = playMove(ref.current.state, 0, cards); }
    catch (e) { toast(e.message); return; }
    detectSeal(ref.current.state, s);
    set(s);
    if (s.phase === "play") runBots(s);
  }

  function runBots(s) {
    if (s.phase !== "play") { set(s); return; }
    if (s.turn === ref.current.you) { set(s); return; }
    if (s.tricksPlayed < (ref.current.lastTricks ?? 0)) ref.current.lastTricks = 0;
    const justResolved = s.tricksPlayed > (ref.current.lastTricks ?? 0);
    ref.current.lastTricks = s.tricksPlayed;
    const delay = justResolved ? TRICK_PAUSE : BOT_DELAY;
    schedule(() => {
      const seat = s.turn;
      let ns;
      try { ns = playMove(s, seat, botPlay(s, seat).cards); }
      catch { const lm = legalMoves(s, seat); ns = playMove(s, seat, lm[0].cards); }
      detectSeal(s, ns);
      set(ns);
      runBots(ns);
    }, delay);
  }

  function detectSeal(prev, next) {
    if (next.friendSeats.length > prev.friendSeats.length) {
      const newSeat = next.friendSeats.find((x) => !prev.friendSeats.includes(x));
      if (newSeat != null && newSeat !== ref.current.you) ref.current.seal = { seat: newSeat };
    }
  }
  function dismissSeal() { ref.current.seal = null; force(); }

  function nextHand() {
    const s = engineNextHand(ref.current.state);
    if (s.phase === "done") { set(s); return; }
    ref.current.lastTricks = 0;
    beginDraw(s); // a fresh live draw each hand
  }

  const state = ref.current.state;
  const view = state ? viewFor(state, ref.current.you) : null;

  return {
    mode: "local",
    view,
    names: ref.current.names,
    seal: ref.current.seal,
    toast: ref.current.toast,
    draw: ref.current.draw,
    actions: {
      start, openBid, humanBid, cancelBid, humanBury, humanCall, humanPlay, nextHand, dismissSeal,
      legalMovesFor: (seat) => (state ? legalMoves(state, seat) : []),
    },
  };
}
