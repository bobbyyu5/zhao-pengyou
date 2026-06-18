import React, { useMemo } from "react";

// Brand-colored confetti burst for wins. Pure CSS animation; pieces are placed deterministically
// (index math, no Math.random) so they stay stable across re-renders.
const COLORS = ["#E8CE6B", "#C8341F", "#4FA785", "#F7F2E7", "#C9A227"];

export default function Confetti({ count = 48 }) {
  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => ({
    left: ((i * 2654435761) % 100),
    delay: ((i * 97) % 700) / 1000,
    dur: 2 + ((i * 53) % 140) / 100,
    color: COLORS[i % COLORS.length],
    rot: (i * 137) % 360,
    w: 6 + ((i * 17) % 6),
  })), [count]);

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span key={i} style={{
          left: `${p.left}%`, width: p.w, height: Math.round(p.w * 0.5),
          background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`,
          ["--r"]: `${p.rot}deg`,
        }} />
      ))}
    </div>
  );
}
