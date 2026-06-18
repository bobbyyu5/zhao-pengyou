import React, { useEffect, useMemo, useRef, useState } from "react";
import Hud from "./Hud.jsx";
import Table from "./Table.jsx";
import Card from "./Card.jsx";
import Stats from "./Stats.jsx";
import Rules from "./Rules.jsx";
import { SealReveal } from "./Seal.jsx";
import { useLang, LangSwitch, seatName } from "../i18n/i18n.jsx";
import { SUIT_SYMBOL, SUIT_IS_RED, rankLabel } from "../../engine/index.js";

const SUITS = ["S", "H", "C", "D"];

/** The whole in-game experience for one seat (`view`), local or online. */
export default function Game({ view, names, seal, toast, actions, onExit, videoTiles, videoControls }) {
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

  function toggle(id) {
    setSel((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  const selectedCards = view.yourHand.filter((c) => sel.has(c.id));

  return (
    <div className="app">
      {seal && <SealReveal seatName={seal.name || seatName(seal.seat, view.players, you, names, t)} onDone={actions.dismissSeal} />}
      {toast && <div className="toast">{toast}</div>}
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

      <Table view={view} names={names} videoTiles={videoTiles} />

      {view.phase === "draw" && <BidPanel view={view} onBid={actions.humanBid} />}
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
              {isDealer && <span className="you-friend" style={{ background: "var(--brass)", color: "var(--felt-deep)" }}>{t("youAreDealer")}</span>}
              {!isDealer && view.friendSeats.includes(you) && <span className="you-friend">{t("youAreFriend")}</span>}
            </span>
            {view.friendCards?.length > 0 && view.phase === "play" && (
              <span className="muted" style={{ fontSize: 11 }}>
                {t("friendCardsLabel")}{view.friendCards.map((f) => `${SUIT_SYMBOL[f.suit] || ""}${rankLabel(f.rank)}`).join(" ")}
              </span>
            )}
          </div>
          <div className="hand">
            {view.yourHand.map((c) => {
              const selectable = view.phase === "bury" || view.phase === "call" || myTurn;
              const legal = legalIds ? legalIds.has(c.id) : null;
              return (
                <Card key={c.id} card={c}
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
              onClick={() => { actions.humanPlay(selectedCards); setSel(new Set()); }}>
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

function ScorePanel({ view, names, onNext }) {
  const { t } = useLang();
  const r = view.result;
  const win = r.dealerWon;
  return (
    <div className={`banner ${win ? "win" : "lose"}`}>
      <div className="head" style={{ fontSize: 18 }}>{r.gouDaoDi ? t("gouDaoDi") : t(`tier_${r.tier}`)}</div>
      <div className="en" style={{ color: "rgba(255,255,255,.85)" }}>
        {t("scoreGrab", { g: r.grabberPoints, line: r.passLine })}
        {r.kittyAwarded ? t("kittyBonus", { k: r.kittyAwarded }) : ""}
      </div>
      <div style={{ fontSize: 12, margin: "8px 0", lineHeight: 1.6 }}>
        {r.changes.map((c, i) => (
          <div key={i}>
            {seatName(c.seat, view.players, view.you, names, t)} · {c.role === "dealer" ? t("roleDealer") : t("roleFriend")} {t("toLevel", { lvl: rankLabel(c.to) })}
            {c.note ? ` (${c.note})` : ""}
          </div>
        ))}
        {r.solo && <div className="muted">{t("soloDealer")}</div>}
      </div>
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
