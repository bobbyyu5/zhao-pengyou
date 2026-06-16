import React from "react";
import { useTheme } from "../theme/theme.jsx";

/** Card-back gallery. Built-in designs plus any pushed via the remote manifest appear here. */
export default function Settings({ onBack }) {
  const { cardBack, setCardBack, designs } = useTheme();
  return (
    <div className="stack" style={{ paddingTop: 24 }}>
      <div className="title-bar">
        <span className="brand" style={{ fontSize: 26 }}>牌背设计</span>
        <button className="tag" onClick={onBack}>返回</button>
      </div>
      <div className="panel">
        <p className="head" style={{ marginTop: 0 }}>选择牌背 <span className="en">Card back</span></p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {designs.map((d) => (
            <button key={d.id} onClick={() => setCardBack(d.id)}
              style={{
                background: "transparent", display: "flex", flexDirection: "column",
                alignItems: "center", gap: 6, padding: 6, borderRadius: 12,
                border: cardBack === d.id ? "2px solid var(--brass)" : "1px solid var(--paper-line)",
              }}>
              <div className={`card back cb-${d.id} ${d.seal ? "seal-glyph" : ""}`} style={{ width: 52, height: 72 }} />
              <span style={{ fontSize: 12 }}>{d.name}</span>
              <span className="en" style={{ fontSize: 9 }}>{d.en || d.id}</span>
            </button>
          ))}
        </div>
        <hr className="hairline" />
        <p className="muted" style={{ fontSize: 11, marginBottom: 0 }}>
          新牌背会不定期更新（无需重新安装）。<br />
          <span className="en">New designs arrive over time automatically — they're served from a manifest, no reinstall needed.</span>
        </p>
      </div>
    </div>
  );
}
