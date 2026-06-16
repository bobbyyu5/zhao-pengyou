import React, { useEffect, useState } from "react";

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
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => { setShow(false); onDone?.(); }, 1600);
    return () => clearTimeout(t);
  }, [onDone]);
  if (!show) return null;
  return (
    <div className="seal-overlay" onClick={() => { setShow(false); onDone?.(); }} role="alert">
      <Seal />
      <div className="caption">
        <div className="head" style={{ fontSize: 22 }}>找到朋友！</div>
        <div className="en">{seatName} joins the dealer's side</div>
      </div>
    </div>
  );
}
