import React, { useEffect, useState } from "react";
import { useLang } from "../i18n/i18n.jsx";

/** The 友 cinnabar seal — app identity mark. */
export function Seal({ className }) {
  return (
    <div className={`seal ${className || ""}`} aria-label="友 friend seal">
      <span>友</span>
    </div>
  );
}

/**
 * The signature animation: the seal stamps onto the screen the instant a friend is revealed.
 * Skippable / reduced-motion respected (the overlay just fades fast). Auto-dismisses.
 */
export function SealReveal({ seatName, onDone }) {
  const { t } = useLang();
  const [show, setShow] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => { setShow(false); onDone?.(); }, 1600);
    return () => clearTimeout(timer);
  }, [onDone]);
  if (!show) return null;
  return (
    <div className="seal-overlay friend-reveal" onClick={() => { setShow(false); onDone?.(); }} role="alert">
      <div className="seal-burst">
        <span className="ray-ring" aria-hidden="true" />
        <span className="glow-ring" aria-hidden="true" />
        <Seal />
      </div>
      <div className="caption">
        <div className="head" style={{ fontSize: 22 }}>{t("friendFound")}</div>
        <div className="en">{t("joinsSide", { name: seatName })}</div>
      </div>
    </div>
  );
}
