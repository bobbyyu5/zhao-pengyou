import React from "react";
import { useLang } from "../i18n/i18n.jsx";
import { CONFIG } from "../../engine/index.js";

/**
 * Rules & scoring reference overlay — answers "how much do I need to win?" using THIS table's
 * actual numbers (pass line scales with deck count). Fully translated.
 */
export default function Rules({ config, onClose }) {
  const { t } = useLang();
  const cfg = config || CONFIG[4];
  const line = cfg.passLine;
  const half = Math.ceil(line / 2);

  const Section = ({ h, children }) => (
    <div className="panel" style={{ padding: "12px 14px" }}>
      <p className="head" style={{ margin: "0 0 6px", fontSize: 15 }}>{h}</p>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(247,242,231,.9)" }}>{children}</div>
    </div>
  );

  return (
    <div className="seal-overlay" style={{ alignItems: "stretch", padding: 16, overflowY: "auto" }} onClick={onClose}>
      <div className="app" style={{ justifyContent: "flex-start", maxWidth: 460, gap: 10 }} onClick={(e) => e.stopPropagation()}>
        <div className="title-bar" style={{ position: "sticky", top: 0, background: "var(--felt-deep)", paddingBottom: 8, zIndex: 1 }}>
          <span className="brand" style={{ fontSize: 24 }}>{t("rulesTitle")}</span>
          <button className="tag" onClick={onClose}>{t("close")}</button>
        </div>

        <Section h={t("rulesObjectiveH")}>{t("rulesObjective")}</Section>

        <Section h={t("rulesPassH")}>
          <p style={{ margin: "0 0 8px" }}>{t("rulesPass", { p: cfg.decks, tp: cfg.totalPoints, line })}</p>
          <div className="center" style={{ background: "var(--felt-deep)", borderRadius: 10, padding: "10px 8px" }}>
            <div className="data" style={{ fontSize: 30, color: "var(--brass-light)" }}>{line}</div>
            <div className="muted" style={{ fontSize: 11 }}>/ {cfg.totalPoints}</div>
          </div>
        </Section>

        <Section h={t("rulesTiersH")}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li style={{ color: "var(--cinnabar)" }}>{t("rulesTierLose", { line })}</li>
            <li style={{ color: "var(--jade)" }}>{t("rulesTierWin", { half, lineless: line - 1 })}</li>
            <li style={{ color: "var(--jade)" }}>{t("rulesTierSmall", { halfless: half - 1 })}</li>
            <li style={{ color: "var(--jade)" }}>{t("rulesTierBig")}</li>
          </ul>
        </Section>

        <Section h={t("rulesWinH")}>{t("rulesWin")}</Section>
        <Section h={t("rulesFriendH")}>{t("rulesFriend")}</Section>
        <Section h={t("rulesTrumpH")}>{t("rulesTrump")}</Section>
        <Section h={t("rulesPointsH")}>{t("rulesPoints")}</Section>
      </div>
    </div>
  );
}
