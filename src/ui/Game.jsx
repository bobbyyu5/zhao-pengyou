import React, { useEffect, useMemo, useRef, useState } from "react";
import Hud from "./Hud.jsx";
import Table from "./Table.jsx";
import Card from "./Card.jsx";
import Stats from "./Stats.jsx";
import Rules from "./Rules.jsx";
import Confetti from "./Confetti.jsx";
import SoundToggle from "./SoundToggle.jsx";
import { SealReveal } from "./Seal.jsx";
import { useLang, LangSwitch, seatName } from "../i18n/i18n.jsx";
import { sound } from "../sound/sound.js";
import { recordHandResult } from "../progress/progress.js";
import { BUILTIN_BACKS } from "../theme/theme.jsx";
import { SUIT_SYMBOL, SUIT_IS_RED, rankLabel } from "../../engine/index.js";

const SUITS = ["S", "H", "C", "D"];

/** The whole in-game experience for one seat (`view`), local or online. */
export default function Game({ view, names, seal, toast, actions, onExit, videoTiles, videoControls, draw }) {
  const { t } = useLang();
  const [sel, setSel] = useState(() => new Set());
  const [showStats, setShowStats] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  useEffect(() => { setSel(new Set()); }, [view.phase, view.turn, view.handNumber]);

  const historyRef = useRef([]);
  const recordedRef = useRef(new Set());
  if (view.phase === "scoring" && view.result && !recordedRef.current.has(view.handNumber)) {
    recordedRef.current.add(view.handNumber);
    historyRef.current = [...historyRef.current, {
      hand: view.handNumber,
      levels: view.result.levelsBySeat || view.levelsBySeat,
      grabberPoints: view.result.grabberPoints,
      passLine: view.result.passLine ?? view.passLine,
      tier: view.result.tier,
      dealerSeat: view.result.dealerSeat,
      dealerWon: view.result.dealerWon,
    }];
  }

  const you = view.you;
  const myTurn = view.turn === you && view.phase === "play";
  const isDealer = view.dealer === you;

  const legalIds = useMemo(() => {
    if (!myTurn || !actions.legalMovesFor) return null;
    const moves = actions.legalMovesFor(you);
    const ids = new Set();
    for (const m of moves) for (const c of m.cards) ids.add(c.id);
    return ids;
  }, [myTurn, view.handNumber, view.trick.length, view.phase, you]);

  function haptic(ms) { try { navigator.vibrate?.(ms); } catch {} }
  function toggle(id) {
    haptic(8); sound.tap();
    setSel((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  // trick-win sound + a "who won · how many points" toast so the game is followable
  const prevTricks = useRef(0);
  const [trickMsg, setTrickMsg] = useState(null);
  const trickTimer = useRef(null);
  useEffect(() => {
    if (view.tricksPlayed > prevTricks.current) {
      prevTricks.current = view.tricksPlayed;
      sound.trick();
      const w = view.lastTrickWinner;
      if (w != null) {
        const name = seatName(w, view.players, you, names, t);
        const pts = view.lastTrickPoints || 0;
        setTrickMsg(pts > 0 ? t("trickWon", { name, pts }) : t("trickWonNoPts", { name }));
        clearTimeout(trickTimer.current);
        trickTimer.current = setTimeout(() => setTrickMsg(null), 1800);
      }
    }
    if (view.tricksPlayed < prevTricks.current) prevTricks.current = view.tricksPlayed; // new hand
  }, [view.tricksPlayed]);
  useEffect(() => { if (seal) sound.reveal(); }, [seal]);

  // scroll the first legal (glowing) card into view so playable cards are never below the fold
  const handRef = useRef(null);
  useEffect(() => {
    if (!myTurn || !handRef.current) return;
    const el = handRef.current.querySelector(".card.legal.glow");
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [myTurn, view.trick.length]);

  const selectedCards = view.yourHand.filter((c) => sel.has(c.id));

  return (
    <div className="app">
      {seal && <SealReveal seatName={seal.name || seatName(seal.seat, view.players, you, names, t)} onDone={actions.dismissSeal} />}
      {toast && <div className="toast">{toast}</div>}
      {trickMsg && <div className="trick-toast">{trickMsg}</div>}
      {showStats && <Stats history={historyRef.current} names={names} players={view.players} you={view.you} onClose={() => setShowStats(false)} />}
      {showRules && <Rules config={view.config} onClose={() => setShowRules(false)} />}
      {confirmExit && (
        <div className="seal-overlay" onClick={() => setConfirmExit(false)}>
          <div className="panel" style={{ maxWidth: 320, margin: 16 }} onClick={(e) => e.stopPropagation()}>
            <p className="head" style={{ marginTop: 0, fontSize: 18 }}>{t("leaveConfirmTitle")}</p>
            <p className="muted" style={{ fontSize: 13 }}>{t("leaveConfirmBody")}</p>
            <div className="row">
              <button className="btn btn-ghost" onClick={() => setConfirmExit(false)}>{t("leaveConfirmNo")}</button>
              <button className="btn btn-cinnabar" onClick={onExit}>{t("leaveConfirmYes")}</button>
            </div>
          </div>
        </div>
      )}

      <div className="title-bar">
        <span className="brand">找朋友</span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <LangSwitch />
          <SoundToggle />
          {videoControls}
          <button className="tag" onClick={() => setShowRules(true)}>{t("rulesBtn")}</button>
          <button className="tag" onClick={() => setShowStats(true)}>{t("stats")}</button>
          <button className="tag" onClick={() => (view.roundOver ? onExit() : setConfirmExit(true))}>
            {view.roundOver ? t("roundOverTag") : t("handTag", { n: view.handNumber, p: view.players })}
          </button>
        </span>
      </div>

      <Hud trumpSuit={view.trumpSuit} level={view.level}
        grabberPoints={view.grabberPoints} passLine={view.passLine} />

      <Table view={view} names={names} videoTiles={videoTiles} exposed={draw?.exposed} />

      {view.phase === "draw" && (draw
        ? <LiveDraw view={view} draw={draw} actions={actions} names={names} />
        : <BidPanel view={view} onBid={actions.humanBid} />)}
      {view.phase === "bury" && isDealer && (
        <BuryPanel view={view} selectedCards={selectedCards} onBury={() => actions.humanBury(selectedCards)} />
      )}
      {view.phase === "bury" && !isDealer && <Waiting text={t("dealerBurying")} />}
      {view.phase === "call" && isDealer && <CallPanel view={view} onCall={actions.humanCall} />}
      {view.phase === "call" && !isDealer && <Waiting text={t("dealerCalling")} />}
      {view.phase === "scoring" && <ScorePanel view={view} names={names} onNext={actions.nextHand} />}
      {view.phase === "done" && <RoundOver view={view} onExit={onExit} />}

      {view.yourHand.length > 0 && (
        <div className="hand-wrap">
          <div className="hand-meta">
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="muted" style={{ fontSize: 12 }}>{t("yourHand")} ({view.yourHand.length})</span>
              {myTurn && <span className="turn-pill">{t("yourTurn")}</span>}
              {isDealer && <span className="you-friend" style={{ background: "var(--brass)", color: "var(--felt-deep)" }}>{t("youAreDealer")}</span>}
              {!isDealer && view.friendSeats.includes(you) && <span className="you-friend">{t("youAreFriend")}</span>}
            </span>
            {view.friendCards?.length > 0 && view.phase === "play" && (
              <span className="muted" style={{ fontSize: 11 }}>
                {t("friendCardsLabel")}{view.friendCards.map((f) => `${SUIT_SYMBOL[f.suit] || ""}${rankLabel(f.rank)}`).join(" ")}
              </span>
            )}
          </div>
          <div className="hand" key={view.handNumber} ref={handRef}>
            {view.yourHand.map((c, i) => {
              const selectable = view.phase === "bury" || view.phase === "call" || myTurn;
              const legal = legalIds ? legalIds.has(c.id) : null;
              return (
                <Card key={c.id} card={c} style={{ "--i": i }}
                  level={view.level} trumpSuit={view.trumpSuit}
                  selected={sel.has(c.id)}
                  legal={legal === true} glow={legal === true} illegal={legal === false}
                  onClick={selectable ? () => toggle(c.id) : undefined}
                />
              );
            })}
          </div>
          {myTurn && (
            <button className="btn btn-primary" disabled={selectedCards.length === 0}
              onClick={() => { haptic(14); sound.play(); actions.humanPlay(selectedCards); setSel(new Set()); }}>
              {t("play")} ({selectedCards.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Waiting({ text }) {
  return <div className="panel center"><div className="zh">{text}</div></div>;
}

/** Live-draw UI (single-device): cards deal out; tap Bid to expose your 6s within a 5s window. */
function LiveDraw({ view, draw, actions, names }) {
  const { t, suitName } = useLang();
  const level = view.level;
  const counts = { S: 0, H: 0, C: 0, D: 0 };
  let jokers = 0;
  for (const c of view.yourHand) { if (c.suit === "JOKER") jokers++; else if (c.rank === level) counts[c.suit]++; }
  const hasOptions = jokers > 0 || Object.values(counts).some((n) => n > 0);
  const cur = view.bid;
  const curLabel = cur ? (cur.noTrump ? `${t("noTrump")}×${cur.count}` : `${suitName(cur.suit)}×${cur.count}`) : null;
  const open = !!draw.windowEndsAt;

  const [remain, setRemain] = useState(5);
  useEffect(() => {
    if (!open) return;
    const tick = () => setRemain(Math.max(0, Math.ceil((draw.windowEndsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [open, draw.windowEndsAt]);

  if (open) {
    return (
      <div className="panel">
        <p className="head" style={{ margin: "0 0 4px" }}>{t("bidWindowTitle", { n: remain })}</p>
        {cur && <p className="en" style={{ marginTop: 0 }}>{t("bidCurrent", { bid: curLabel })}</p>}
        {!hasOptions ? (
          <p className="muted" style={{ marginBottom: 8 }}>{t("nothingToExpose")}</p>
        ) : (
          <div className="seg" style={{ marginBottom: 8 }}>
            {SUITS.map((s) => (
              <button key={s} disabled={counts[s] < 1} onClick={() => actions.humanBid({ suit: s, count: counts[s] })}>
                <span className={SUIT_IS_RED[s] ? "suit-red" : ""}>{SUIT_SYMBOL[s]}</span>{suitName(s)}{counts[s] > 0 ? ` ×${counts[s]}` : ""}
              </button>
            ))}
          </div>
        )}
        <div className="row">
          {jokers > 0 && <button className="btn btn-ghost btn-sm" onClick={() => actions.humanBid({ noTrump: true, count: jokers })}>{t("bidNoTrump", { n: jokers })}</button>}
          <button className="btn btn-cinnabar btn-sm" onClick={() => actions.cancelBid()}>{t("cancel")}</button>
        </div>
      </div>
    );
  }

  const total = view.config.perPlayer * view.players;
  const pct = Math.round((view.dealtCount / total) * 100);
  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <p className="head" style={{ margin: 0 }}>{draw.lastCall ? t("finalCall") : t("dealing")}</p>
        {cur && <span className="muted" style={{ fontSize: 12 }}>{t("exposedBy", { name: seatName(cur.seat, view.players, view.you, names, t), label: curLabel })}</span>}
      </div>
      <div className="draw-progress"><span style={{ width: `${pct}%` }} /></div>
      <p className="en" style={{ marginTop: 2 }}>{t("drawTapBid")}</p>
      <button className="btn btn-primary" disabled={!hasOptions} onClick={() => actions.openBid()}>
        {t("bidBtn")}
      </button>
    </div>
  );
}

function BidPanel({ view, onBid }) {
  const { t, suitName } = useLang();
  const level = view.level;
  const counts = { S: 0, H: 0, C: 0, D: 0 };
  let jokers = 0;
  for (const c of view.yourHand) {
    if (c.suit === "JOKER") jokers++;
    else if (c.rank === level) counts[c.suit]++;
  }
  const cur = view.bid;
  const canBeat = (count, noTrump) => {
    if (!cur) return true;
    if (count > cur.count) return true;
    if (count === cur.count && noTrump && !cur.noTrump) return true;
    return false;
  };
  const anything = Object.values(counts).some((n) => n > 0) || jokers > 0;
  const curLabel = cur ? (cur.noTrump ? t("noTrump") + `×${cur.count}` : `${suitName(cur.suit)}×${cur.count}`) : t("bidNobody");
  const canBeatAny = SUITS.some((s) => counts[s] >= 1 && canBeat(counts[s], false)) || (jokers >= 1 && canBeat(jokers, true));

  return (
    <div className="panel">
      <p className="head" style={{ margin: "0 0 4px" }}>{t("bidTitle", { r: rankLabel(level) })}</p>
      <p className="en" style={{ marginTop: 0 }}>{t("bidBody", { r: rankLabel(level) })} {t("bidCurrent", { bid: curLabel })}</p>
      {cur && !canBeatAny && <p className="cinnabar-text" style={{ fontSize: 12, marginTop: -2 }}>{t("bidCantBeat")}</p>}
      <div className="seg" style={{ marginBottom: 8 }}>
        {SUITS.map((s) => (
          <button key={s} disabled={counts[s] < 1 || !canBeat(counts[s], false)} onClick={() => onBid({ suit: s, count: counts[s] })}>
            <span className={SUIT_IS_RED[s] ? "suit-red" : ""}>{SUIT_SYMBOL[s]}</span>
            {suitName(s)}{counts[s] > 0 ? ` ×${counts[s]}` : ""}
          </button>
        ))}
      </div>
      <div className="row">
        <button className="btn btn-ghost btn-sm" disabled={jokers < 1 || !canBeat(jokers, true)} onClick={() => onBid({ noTrump: true, count: jokers })}>
          {t("bidNoTrump", { n: jokers })}
        </button>
        <button className="btn btn-cinnabar btn-sm" onClick={() => onBid(null)}>
          {anything ? t("pass") : t("passNoRank")}
        </button>
      </div>
    </div>
  );
}

function BuryPanel({ view, selectedCards, onBury }) {
  const { t } = useLang();
  const need = view.config.kitty;
  const have = selectedCards.length;
  return (
    <div className="panel">
      <p className="head" style={{ margin: "0 0 4px" }}>{t("buryTitle", { n: need })}</p>
      <p className="en" style={{ marginTop: 0 }}>{t("buryBody", { n: need, h: have })}</p>
      <button className="btn btn-primary" disabled={have !== need} onClick={onBury}>{t("buryBtn")} ({have}/{need})</button>
    </div>
  );
}

function CallPanel({ view, onCall }) {
  const { t, suitName } = useLang();
  const need = view.friendsToCall;
  const [picks, setPicks] = useState([]);
  const [rank, setRank] = useState(14);
  const ranks = [14, 13, 12, 11, 10];

  function add(suit) {
    if (picks.length >= need) return;
    if (picks.some((p) => p.suit === suit && p.rank === rank)) return;
    setPicks([...picks, { suit, rank }]);
  }
  return (
    <div className="panel">
      <p className="head" style={{ margin: "0 0 2px" }}>{t("callTitle", { n: need })}</p>
      <p className="en" style={{ marginTop: 0 }}>{t("callBody")}</p>
      <div className="seg" style={{ marginBottom: 8 }}>
        {ranks.map((r) => (
          <button key={r} className={rank === r ? "active" : ""} onClick={() => setRank(r)}>{rankLabel(r)}</button>
        ))}
      </div>
      <div className="seg" style={{ marginBottom: 8 }}>
        {SUITS.map((s) => (
          <button key={s} onClick={() => add(s)} disabled={picks.length >= need}>
            <span className={SUIT_IS_RED[s] ? "suit-red" : ""}>{SUIT_SYMBOL[s]}</span>{rankLabel(rank)}
          </button>
        ))}
      </div>
      <div className="row" style={{ alignItems: "center", marginBottom: 8 }}>
        <span className="muted" style={{ fontSize: 12 }}>
          {t("selected")}{picks.map((p) => `${SUIT_SYMBOL[p.suit]}${rankLabel(p.rank)}`).join("  ") || "—"}
        </span>
        {picks.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setPicks([])}>{t("clear")}</button>}
      </div>
      <button className="btn btn-primary" disabled={picks.length !== need} onClick={() => onCall(picks)}>{t("callBtn")} ({picks.length}/{need})</button>
    </div>
  );
}

function CountUp({ to, dur = 850 }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf; const start = performance.now();
    const ease = (p) => 1 - Math.pow(1 - p, 3);
    const tick = (now) => { const p = Math.min(1, (now - start) / dur); setN(Math.round(to * ease(p))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <span className="countup">{n}</span>;
}

function ScorePanel({ view, names, onNext }) {
  const { t } = useLang();
  const r = view.result;
  const dealerWon = r.dealerWon;
  // did MY side win? dealer side = dealer + friends
  const myDealerSide = view.you === r.dealerSeat || r.friendSeats.includes(view.you);
  const iWon = myDealerSide ? dealerWon : !dealerWon;
  const [unlocked, setUnlocked] = useState([]);

  useEffect(() => {
    if (iWon) sound.win(); else sound.lose();
    const mine = r.changes.find((c) => c.seat === view.you);
    if (mine && iWon) setTimeout(() => sound.levelUp(), 450);
    // record the hand toward streak/stats/unlocks (once per score screen)
    const newly = recordHandResult({ won: iWon, roundWon: view.roundOver && iWon });
    if (newly.length) { setUnlocked(newly); setTimeout(() => sound.levelUp(), 700); }
  }, []);

  const backName = (id) => BUILTIN_BACKS.find((b) => b.id === id)?.name || id;

  return (
    <div className={`banner ${iWon ? "win" : "lose"}`}>
      {iWon && <Confetti />}
      <div className="head" style={{ fontSize: 18 }}>{r.gouDaoDi ? t("gouDaoDi") : t(`tier_${r.tier}`)}</div>
      <div className="en" style={{ color: "rgba(255,255,255,.85)" }}>
        {t("grabbers")} <CountUp to={r.grabberPoints} /> / {r.passLine}
        {r.kittyAwarded ? t("kittyBonus", { k: r.kittyAwarded }) : ""}
      </div>
      <div style={{ fontSize: 12, margin: "8px 0", lineHeight: 1.7 }}>
        {r.changes.map((c, i) => (
          <div key={i} className={`score-row ${c.seat === view.you ? "me" : ""}`} style={{ animationDelay: `${i * 90}ms` }}>
            {c.seat === view.you && <span className="seal-mini">友</span>}
            {seatName(c.seat, view.players, view.you, names, t)} · {c.role === "dealer" ? t("roleDealer") : t("roleFriend")}{" "}
            <span className="lvl-to" style={{ animationDelay: `${i * 90 + 150}ms` }}>{t("toLevel", { lvl: rankLabel(c.to) })}</span>
            {c.note ? ` (${c.note})` : ""}
          </div>
        ))}
        {r.solo && <div className="muted">{t("soloDealer")}</div>}
      </div>
      {unlocked.map((id) => (
        <div key={id} className="unlock-note">
          <div className={`card back cb-${id} ${BUILTIN_BACKS.find((b) => b.id === id)?.seal ? "seal-glyph" : ""}`} />
          <span>{t("newBackUnlocked", { name: backName(id) })}</span>
        </div>
      ))}
      <button className="btn" style={{ background: "rgba(255,255,255,.92)", color: "var(--felt-deep)" }} onClick={onNext}>
        {view.roundOver ? t("seeResult") : t("nextHand")}
      </button>
    </div>
  );
}

function RoundOver({ view, onExit }) {
  const { t } = useLang();
  return (
    <div className="banner win">
      <div className="head" style={{ fontSize: 20 }}>{t("roundOver")}</div>
      <div className="en" style={{ color: "rgba(255,255,255,.9)" }}>
        {view.roundWinner === "dealer" ? t("dealerPassedA") : t("roundComplete")}
      </div>
      <button className="btn" style={{ background: "rgba(255,255,255,.92)", color: "var(--felt-deep)", marginTop: 10 }} onClick={onExit}>{t("home")}</button>
    </div>
  );
}
