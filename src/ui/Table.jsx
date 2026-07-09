import React from "react";
import Card from "./Card.jsx";
import { Seal } from "./Seal.jsx";
import { useTheme } from "../theme/theme.jsx";
import { useLang, seatName } from "../i18n/i18n.jsx";
import { rankLabel } from "../../engine/index.js";

/**
 * The felt table. `you` sits at the bottom (their hand is rendered separately below); the
 * other seats are distributed evenly around an ellipse. Works for 4–10 by spreading the
 * remaining seats across the arc — the real spatial problem from the design brief.
 */
export default function Table({ view, names, videoTiles, exposed }) {
  const theme = useTheme();
  const { t } = useLang();
  const backCls = `cb-${theme?.cardBack || "cinnabar-seal"}`;
  const { players, you, dealer, friendSeats, turn, handCounts, levelsBySeat, trick, leader } = view;
  const pointsBySeat = view.pointsBySeat || [];
  // Per-player captured points show until the friend is revealed; then they combine (HUD total).
  const friendRevealed = (view.friendCards?.length || 0) > 0 && friendSeats.length >= view.friendCards.length;
  const showPerSeat = view.phase === "play" && !friendRevealed;

  // place seat `s` at an angle starting from the bottom (you), going clockwise
  function pos(s) {
    const r = ((s - you + players) % players); // 0 = you (bottom)
    const theta = (Math.PI / 2) + (r * (2 * Math.PI / players)); // radians, bottom-origin
    const rx = 41, ry = players <= 5 ? 33 : 37;
    const x = 50 + rx * Math.cos(theta);
    const y = 50 + ry * Math.sin(theta);
    return { left: `${x}%`, top: `${y}%` };
  }

  return (
    <div className="table-wrap">
      <div className="felt-oval" />

      {/* opponents (everyone except you) */}
      {Array.from({ length: players }, (_, s) => s)
        .filter((s) => s !== you)
        .map((s) => {
          const isDealer = s === dealer;
          const isFriend = friendSeats.includes(s);
          const isTurn = s === turn && view.phase === "play";
          const cls = ["seat"];
          if (isDealer) cls.push("is-dealer");
          if (isFriend) cls.push("is-friend");
          if (isTurn) cls.push("is-turn");
          const count = handCounts[s] ?? 0;
          const backs = Math.min(6, count);
          return (
            <div key={s} className={cls.join(" ")} style={pos(s)}>
              <div className="avatar">
                {videoTiles?.[s] || seatGlyph(s, names)}
                {isDealer && <span className="badge-dealer">{t("dealerBadge")}</span>}
                {isFriend && <div className="badge-friend"><Seal /></div>}
              </div>
              <div className="name">{seatName(s, players, you, names, t)}{isFriend ? <span className="friend-label"> · {t("roleFriend")}</span> : ""}</div>
              <div className="lvl">打{rankLabel(levelsBySeat[s])}{count > 0 ? ` · ${count}` : ""}</div>
              {showPerSeat && !isDealer && (pointsBySeat[s] || 0) > 0 && <div className="seat-score">{pointsBySeat[s]} 分</div>}
              <div className="backs">{Array.from({ length: backs }, (_, i) => <span key={i} className={`back ${backCls}`} />)}</div>
            </div>
          );
        })}

      {/* center: exposed bid cards during the draw, otherwise the current trick */}
      <div className="trick-center">
        {view.phase === "draw" && exposed && exposed.cards?.length > 0 && (
          <div className="trick-play">
            <div className="cards">
              {exposed.cards.map((c) => (
                <Card key={c.id} card={c} size="sm" level={view.level} trumpSuit={view.trumpSuit} />
              ))}
            </div>
            <span className="who">{seatName(exposed.seat, players, you, names, t)} ▸ 主</span>
          </div>
        )}
        {trick.length === 0 && view.phase === "play" && (
          turn === you
            ? <span className="turn-cue">{t("yourTurnLead")}</span>
            : <span className="muted" style={{ fontSize: 12 }}>{t("waitingPlay")}</span>
        )}
        {trick.map((tp, i) => {
          const isWinner = view.trickResolved && view.trickResolved.winner === tp.seat;
          return (
            <div key={i} className={`trick-play ${isWinner ? "trick-winner" : ""}`}>
              <div className="cards">
                {tp.cards.map((c) => (
                  <Card key={c.id} card={c} size="sm" level={view.level} trumpSuit={view.trumpSuit} />
                ))}
              </div>
              <span className="who">
                {seatName(tp.seat, players, you, names, t)}{tp.seat === leader ? " ▸" : ""}
                {isWinner && <span className="won-badge">{t("wonTag")}{view.trickResolved.points > 0 ? ` +${view.trickResolved.points}` : ""}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function seatGlyph(s, names) {
  const n = names?.[s];
  if (n) return n.slice(0, 1);
  return String.fromCharCode(65 + (s % 26)); // A, B, C…
}
