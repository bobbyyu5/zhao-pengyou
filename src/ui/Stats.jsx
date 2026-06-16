import React from "react";
import { useLang, seatName } from "../i18n/i18n.jsx";
import { rankLabel } from "../../engine/index.js";

const SEAT_COLORS = ["#E8CE6B", "#4FA785", "#C8341F", "#9FE3C4", "#E89B3C", "#7FA8E8", "#C77FE8", "#E87FB0", "#7FE8C0", "#E8E07F"];

/**
 * Stats overlay: level progression per seat across hands, and grabber points per hand vs the
 * pass line. Pure inline SVG (no chart dependency) so it stays light on phones.
 */
export default function Stats({ history, names, players, you = 0, onClose }) {
  const { t } = useLang();
  return (
    <div className="seal-overlay" style={{ alignItems: "stretch", padding: 16 }} onClick={onClose}>
      <div className="app" style={{ justifyContent: "flex-start", maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="title-bar">
          <span className="brand" style={{ fontSize: 24 }}>{t("statsTitle")}</span>
          <button className="tag" onClick={onClose}>{t("close")}</button>
        </div>
        {history.length === 0 ? (
          <div className="panel center muted">{t("noHands")}</div>
        ) : (
          <>
            <div className="panel">
              <p className="head" style={{ margin: "0 0 8px" }}>{t("levelProgress")}</p>
              <LevelChart history={history} players={players} names={names} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {Array.from({ length: players }, (_, s) => (
                  <span key={s} style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <i style={{ width: 10, height: 10, borderRadius: 2, background: SEAT_COLORS[s % SEAT_COLORS.length], display: "inline-block" }} />
                    {seatName(s, players, you, names, t)}
                  </span>
                ))}
              </div>
            </div>
            <div className="panel">
              <p className="head" style={{ margin: "0 0 8px" }}>{t("pointsPerHand")}</p>
              <PointsChart history={history} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LevelChart({ history, players, names }) {
  const W = 420, H = 160, padL = 30, padB = 22, padT = 8, padR = 8;
  const hands = history.length;
  const xs = (i) => padL + (hands <= 1 ? 0 : (i * (W - padL - padR)) / (hands - 1));
  const ys = (lvl) => padT + ((14 - lvl) / 12) * (H - padT - padB); // 2..14
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="level progression chart">
      {[2, 6, 11, 14].map((lvl) => (
        <g key={lvl}>
          <line x1={padL} y1={ys(lvl)} x2={W - padR} y2={ys(lvl)} stroke="rgba(247,242,231,.12)" />
          <text x={4} y={ys(lvl) + 4} fill="#7FAE98" fontSize="10" fontFamily="monospace">{rankLabel(lvl)}</text>
        </g>
      ))}
      {Array.from({ length: players }, (_, s) => {
        const pts = history.map((h, i) => `${xs(i)},${ys(h.levels[s] ?? 6)}`).join(" ");
        return <polyline key={s} points={pts} fill="none" stroke={SEAT_COLORS[s % SEAT_COLORS.length]} strokeWidth="2" strokeLinejoin="round" />;
      })}
      {history.map((h, i) => (
        <text key={i} x={xs(i)} y={H - 6} fill="#7FAE98" fontSize="9" textAnchor="middle">{i + 1}</text>
      ))}
    </svg>
  );
}

function PointsChart({ history }) {
  const W = 420, H = 120, padL = 30, padB = 18, padT = 8, padR = 8;
  const maxPts = Math.max(...history.map((h) => h.passLine), ...history.map((h) => h.grabberPoints), 1);
  const bw = (W - padL - padR) / history.length;
  const ys = (v) => padT + (1 - v / maxPts) * (H - padT - padB);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="grabber points chart">
      {history.length > 0 && (
        <line x1={padL} y1={ys(history[0].passLine)} x2={W - padR} y2={ys(history[0].passLine)}
          stroke="#C8341F" strokeDasharray="4 3" strokeWidth="1.5" />
      )}
      {history.map((h, i) => {
        const x = padL + i * bw + bw * 0.18;
        const w = bw * 0.64;
        const y = ys(h.grabberPoints);
        const over = h.grabberPoints >= h.passLine;
        return (
          <g key={i}>
            <rect x={x} y={y} width={w} height={H - padB - y} fill={over ? "#C8341F" : "#4FA785"} rx="2" />
            <text x={x + w / 2} y={H - 5} fill="#7FAE98" fontSize="9" textAnchor="middle">{i + 1}</text>
            <text x={x + w / 2} y={y - 2} fill="#CDEAD9" fontSize="9" textAnchor="middle">{h.grabberPoints}</text>
          </g>
        );
      })}
    </svg>
  );
}
