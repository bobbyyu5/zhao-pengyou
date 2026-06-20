import React from "react";
import { useTheme } from "../theme/theme.jsx";
import { useLang, LangSwitch } from "../i18n/i18n.jsx";
import { isUnlocked, unlockRuleFor } from "../progress/progress.js";

/** Card-back gallery. Locked backs show their unlock condition and can't be selected yet. */
export default function Settings({ onBack }) {
  const { cardBack, setCardBack, designs } = useTheme();
  const { t } = useLang();

  function ruleText(id) {
    const r = unlockRuleFor(id);
    if (!r) return "";
    if (r.handsWon) return t("unlockHandsWon", { n: r.handsWon });
    if (r.handsPlayed) return t("unlockHandsPlayed", { n: r.handsPlayed });
    if (r.roundsWon) return t("unlockRoundsWon");
    if (r.streak) return t("unlockStreak", { n: r.streak });
    return t("locked");
  }

  return (
    <div className="stack" style={{ paddingTop: 24 }}>
      <div className="title-bar">
        <span className="brand" style={{ fontSize: 26 }}>{t("cardBacks")}</span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}><LangSwitch /><button className="tag" onClick={onBack}>{t("back")}</button></span>
      </div>
      <div className="panel">
        <p className="head" style={{ marginTop: 0 }}>{t("chooseBack")}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {designs.map((d) => {
            const unlocked = isUnlocked(d.id);
            return (
              <button key={d.id} disabled={!unlocked} onClick={() => unlocked && setCardBack(d.id)}
                className={unlocked ? "" : "locked-back"}
                style={{
                  background: "transparent", display: "flex", flexDirection: "column",
                  alignItems: "center", gap: 6, padding: 6, borderRadius: 12, position: "relative",
                  border: cardBack === d.id ? "2px solid var(--brass)" : "1px solid var(--paper-line)",
                  cursor: unlocked ? "pointer" : "not-allowed",
                }}>
                <div style={{ position: "relative" }}>
                  <div className={`card back cb-${d.id} ${d.seal ? "seal-glyph" : ""}`} style={{ width: 52, height: 72, filter: unlocked ? "none" : "grayscale(.8) brightness(.5)" }} />
                  {!unlocked && <span className="lock-badge">🔒</span>}
                </div>
                <span style={{ fontSize: 12 }}>{d.name}</span>
                <span className="en" style={{ fontSize: 9, color: unlocked ? "var(--jade)" : "var(--cinnabar)" }}>
                  {unlocked ? (d.en || d.id) : ruleText(d.id)}
                </span>
              </button>
            );
          })}
        </div>
        <hr className="hairline" />
        <p className="muted" style={{ fontSize: 11, marginBottom: 0 }}>{t("backsUpdateNote")}</p>
      </div>
    </div>
  );
}
