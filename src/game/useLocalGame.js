import { useEffect, useReducer, useRef } from "react";
import {
  newGame, dealCardsOnly, closeDraw, bid, buryKitty, callFriends, playMove, legalMoves,
  nextHand as engineNextHand, viewFor,
  botBid, botBury, botCallFriends, botPlay,
} from "../../engine/index.js";

const BOT_DELAY = 650;

/**
 * Single-device controller: the human is seat 0, the rest are bots. Holds the full
 * server-authoritative GameState in a ref (the human only ever SEES viewFor(state, 0)) and
 * steps the bots on timers. Same engine the online server uses → identical rules.
 */
export function useLocalGame() {
  const [, force] = useReducer((x) => x + 1, 0);
  const ref = useRef({
    state: null,
    you: 0,
    seal: null,       // { seat, name } when a friend was just revealed
    toast: null,
    names: null,
  });
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const set = (state) => { ref.current.state = state; force(); };
  const schedule = (fn, ms) => { const t = setTimeout(fn, ms); timers.current.push(t); };
  const toast = (msg) => { ref.current.toast = msg; force(); schedule(() => { ref.current.toast = null; force(); }, 2200); };

  function names(players) {
    if (players === 4) return ["你", "下家", "对家", "上家"];
    return Array.from({ length: players }, (_, i) => (i === 0 ? "你" : `玩家${i}`));
  }

  function start(players, seed) {
    ref.current.names = names(players);
    let s = newGame(players, seed);
    s = dealCardsOnly(s);
    s = applyBotBids(s);
    set(s); // phase "draw" — awaiting the human's bid decision
  }

  function applyBotBids(s) {
    let out = s;
    for (let seat = 1; seat < out.players; seat++) {
      const b = botBid(out, seat);
      if (b) { try { out = bid(out, seat, b); } catch { /* illegal, skip */ } }
    }
    return out;
  }

  function humanBid(b) {
    let s = ref.current.state;
    if (b) {
      try { s = bid(s, 0, b); } catch (e) { toast(e.message); return; }
    }
    s = closeDraw(s);
    afterDraw(s);
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

  function humanBury(cards) {
    try {
      const s = buryKitty(ref.current.state, 0, cards);
      set(s); // phase "call" — human picks friend card(s)
    } catch (e) { toast(e.message); }
  }

  function humanCall(cards) {
    try {
      const s = callFriends(ref.current.state, 0, cards);
      set(s);
      runBots(s);
    } catch (e) { toast(e.message); }
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
    if (s.turn === ref.current.you) { set(s); return; } // wait for the human
    schedule(() => {
      const seat = s.turn;
      let ns;
      try {
        const move = botPlay(s, seat);
        ns = playMove(s, seat, move.cards);
      } catch {
        const lm = legalMoves(s, seat);
        ns = playMove(s, seat, lm[0].cards);
      }
      detectSeal(s, ns);
      set(ns);
      runBots(ns);
    }, BOT_DELAY);
  }

  function detectSeal(prev, next) {
    if (next.friendSeats.length > prev.friendSeats.length) {
      const newSeat = next.friendSeats.find((x) => !prev.friendSeats.includes(x));
      if (newSeat != null && newSeat !== ref.current.you) {
        ref.current.seal = { seat: newSeat, name: ref.current.names?.[newSeat] || `玩家${newSeat}` };
      }
    }
  }

  function dismissSeal() { ref.current.seal = null; force(); }

  function nextHand() {
    let s = engineNextHand(ref.current.state);
    if (s.phase === "done") { set(s); return; }
    // new hand dealt + bot bids, await human bid
    s = dealCardsOnly(s);
    s = applyBotBids(s);
    set(s);
  }

  const state = ref.current.state;
  const view = state ? viewFor(state, ref.current.you) : null;

  return {
    mode: "local",
    view,
    names: ref.current.names,
    seal: ref.current.seal,
    toast: ref.current.toast,
    actions: {
      start, humanBid, humanBury, humanCall, humanPlay, nextHand, dismissSeal,
      legalMovesFor: (seat) => (state ? legalMoves(state, seat) : []),
    },
  };
}
