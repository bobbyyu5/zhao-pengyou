import React, { useEffect, useMemo, useRef, useState } from "react";
import Hud from "./Hud.jsx";
import Table from "./Table.jsx";
import Card from "./Card.jsx";
import Stats from "./Stats.jsx";
import { SealReveal } from "./Seal.jsx";
import {
  SUIT_SYMBOL, SUIT_NAME_ZH, SUIT_IS_RED, rankLabel, isTrump,
} from "../../engine/index.js";

const SUITS = ["S", "H", "C", "D"];

/** The whole in-game experience for one seat (`view`), local or online. */
export default function Game({ view, names, seal, toast, actions, onExit, videoTiles, videoControls }) {
  const [sel, setSel] = useState(() => new Set());
  const [showStats, setShowStats] = useState(false);
  // clear selection whenever the phase or turn changes
  useEffect(() => { setSel(new Set()); }, [view.phase, view.turn, view.handNumber]);

  // accumulate a per-hand history snapshot for the stats charts (dedup by hand number)
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
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const selectedCards = view.yourHand.filter((c) => sel.has(c.id));

  return (
    <div className="app">
      {seal && <SealReveal seatName={seal.name} onDone={actions.dismissSeal} />}
      {toast && <div className="toast">{toast}</div>}
      {showStats && <Stats history={historyRef.current} names={names} players={view.players} onClose={() => setShowStats(false)} />}

      <div className="title-bar">
        <span className="brand">找朋友</span>
        <span style={{ display: "flex", gap: 6 }}>
          {videoControls}
          <button className="tag" onClick={() => setShowStats(true)}>战绩</button>
          <button className="tag" onClick={onExit}>
            {view.roundOver ? "结束" : `第${view.handNumber}手·${view.players}人`}
          </button>
        </span>
      </div>

      <Hud trumpSuit={view.trumpSuit} level={view.level}
        grabberPoints={view.grabberPoints} passLine={view.passLine} />

      <Table view={view} names={names} videoTiles={videoTiles} />

      {/* phase-specific panel */}
      {view.phase === "draw" && <BidPanel view={view} onBid={actions.humanBid} />}
      {view.phase === "bury" && isDealer && (
        <BuryPanel view={view} sel={sel} selectedCards={selectedCards} onBury={() => actions.humanBury(selectedCards)} />
      )}
      {view.phase === "bury" && !isDealer && <Waiting text="庄家正在埋牌…" en="Dealer is burying the kitty" />}
      {view.phase === "call" && isDealer && <CallPanel view={view} onCall={actions.humanCall} />}
      {view.phase === "call" && !isDealer && <Waiting text="庄家正在叫朋友…" en="Dealer is calling friends" />}
      {view.phase === "scoring" && <ScorePanel view={view} names={names} onNext={actions.nextHand} />}
      {view.phase === "done" && <RoundOver view={view} names={names} onExit={onExit} />}

      {/* the hand */}
      {view.yourHand.length > 0 && (
        <div className="hand-wrap">
          <div className="hand-meta">
            <span className="muted" style={{ fontSize: 12 }}>
              你的手牌 <span className="en">your hand</span> ({view.yourHand.length})
            </span>
            {view.friendCards?.length > 0 && view.phase === "play" && (
              <span className="muted" style={{ fontSize: 11 }}>
                朋友牌：{view.friendCards.map((f) => `${SUIT_SYMBOL[f.suit] || ""}${rankLabel(f.rank)}`).join(" ")}
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
                  legal={legal === true}
                  glow={legal === true}
                  illegal={legal === false}
                  onClick={selectable ? () => toggle(c.id) : undefined}
                />
              );
            })}
          </div>
          {myTurn && (
            <button className="btn btn-primary" disabled={selectedCards.length === 0}
              onClick={() => { actions.humanPlay(selectedCards); setSel(new Set()); }}>
              出牌 Play ({selectedCards.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Waiting({ text, en }) {
  return <div className="panel center"><div className="zh">{text}</div><div className="en">{en}</div></div>;
}

/** Live-draw bid window: expose rank cards to set trump, or pass (forced dealer if nobody bids). */
function BidPanel({ view, onBid }) {
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

  return (
    <div className="panel">
      <p className="head" style={{ margin: "0 0 4px" }}>叫牌 · 亮{rankLabel(level)}定主</p>
      <p className="en" style={{ marginTop: 0 }}>
        Expose your {rankLabel(level)}s to claim trump. {cur ? `当前最高：${bidLabel(cur)}` : "无人叫主"}.
      </p>
      <div className="seg" style={{ marginBottom: 8 }}>
        {SUITS.map((s) => (
          <button key={s} disabled={counts[s] < 1 || !canBeat(counts[s], false)}
            onClick={() => onBid({ suit: s, count: counts[s] })}>
            <span className={SUIT_IS_RED[s] ? "suit-red" : ""}>{SUIT_SYMBOL[s]}</span>
            {SUIT_NAME_ZH[s]}{counts[s] > 0 ? ` ×${counts[s]}` : ""}
          </button>
        ))}
      </div>
      <div className="row">
        <button className="btn btn-ghost btn-sm" disabled={jokers < 1 || !canBeat(jokers, true)}
          onClick={() => onBid({ noTrump: true, count: jokers })}>
          无主 (王 ×{jokers})
        </button>
        <button className="btn btn-cinnabar btn-sm" onClick={() => onBid(null)}>
          {anything ? "不叫 Pass" : "无本级牌 · 过"}
        </button>
      </div>
    </div>
  );
}

function bidLabel(b) {
  if (!b) return "—";
  return b.noTrump ? `无主×${b.count}` : `${SUIT_NAME_ZH[b.suit]}×${b.count}`;
}

function BuryPanel({ view, selectedCards, onBury }) {
  const need = view.config.kitty;
  const have = selectedCards.length;
  return (
    <div className="panel">
      <p className="head" style={{ margin: "0 0 4px" }}>埋牌 · 扣 {need} 张</p>
      <p className="en" style={{ marginTop: 0 }}>Pick {need} cards to bury (selected {have}/{need}).</p>
      <button className="btn btn-primary" disabled={have !== need} onClick={onBury}>
        确认埋牌 Bury ({have}/{need})
      </button>
    </div>
  );
}

/** Dealer calls the friend card(s): first player to PLAY one joins the dealer's side. */
function CallPanel({ view, onCall }) {
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
      <p className="head" style={{ margin: "0 0 2px" }}>叫朋友 · 选 {need} 张</p>
      <p className="en" style={{ marginTop: 0 }}>First player to PLAY a called card joins your side.</p>
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
          已选：{picks.map((p) => `${SUIT_SYMBOL[p.suit]}${rankLabel(p.rank)}`).join("  ") || "—"}
        </span>
        {picks.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setPicks([])}>清除</button>
        )}
      </div>
      <button className="btn btn-primary" disabled={picks.length !== need} onClick={() => onCall(picks)}>
        确认叫朋友 Call ({picks.length}/{need})
      </button>
    </div>
  );
}

function ScorePanel({ view, names, onNext }) {
  const r = view.result;
  const win = r.dealerWon;
  const tierZh = { dealer_loses: "庄家失败", dealer_wins: "庄家胜", small_sweep: "小光 Small sweep", big_sweep: "大光 Big sweep" }[r.tier];
  return (
    <div className={`banner ${win ? "win" : "lose"}`}>
      <div className="head" style={{ fontSize: 18 }}>{r.gouDaoDi ? "钩到底 Gou Dao Di!" : tierZh}</div>
      <div className="en" style={{ color: "rgba(255,255,255,.85)" }}>
        抓分方 grabbers {r.grabberPoints} / {r.passLine}
        {r.kittyAwarded ? ` (+${r.kittyAwarded} 底)` : ""}
      </div>
      <div style={{ fontSize: 12, margin: "8px 0", lineHeight: 1.6 }}>
        {r.changes.map((c, i) => (
          <div key={i}>
            {names?.[c.seat] || `玩家${c.seat}`} · {c.role === "dealer" ? "庄" : "友"} → 打{rankLabel(c.to)}
            {c.note ? ` (${c.note})` : ""}
          </div>
        ))}
        {r.solo && <div className="muted">庄家单干 solo dealer — 无朋友调整</div>}
      </div>
      <button className="btn" style={{ background: "rgba(255,255,255,.92)", color: "var(--felt-deep)" }} onClick={onNext}>
        {view.roundOver ? "查看结果" : "下一手 Next hand"}
      </button>
    </div>
  );
}

function RoundOver({ view, names, onExit }) {
  return (
    <div className="banner win">
      <div className="head" style={{ fontSize: 20 }}>本轮结束 Round over</div>
      <div className="en" style={{ color: "rgba(255,255,255,.9)" }}>
        {view.roundWinner === "dealer" ? "庄家方过 A，赢得本轮！" : "Round complete."}
      </div>
      <button className="btn" style={{ background: "rgba(255,255,255,.92)", color: "var(--felt-deep)", marginTop: 10 }} onClick={onExit}>
        回到首页 Home
      </button>
    </div>
  );
}
