import React, { useEffect, useRef } from "react";
import { useLang } from "../i18n/i18n.jsx";

/** A single live video element bound to a MediaStream (used as a seat avatar overlay). */
export function VideoTile({ stream, muted, className }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) { ref.current.srcObject = stream; ref.current.play?.().catch(() => {}); }
  }, [stream]);
  return <video ref={ref} className={className} autoPlay playsInline muted={muted}
    style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />;
}

/** Floating self-view (picture-in-picture) while the camera is on. */
export function SelfView({ stream, camOn }) {
  if (!stream) return null;
  return (
    <div style={{
      position: "fixed", right: 12, bottom: 96, width: 64, height: 64, borderRadius: 14,
      overflow: "hidden", border: "2px solid var(--brass)", zIndex: 40, background: "#000",
      boxShadow: "var(--shadow-lift)",
    }}>
      {camOn
        ? <VideoTile stream={stream} muted className="self" />
        : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--jade)", fontSize: 22 }}>🙈</div>}
    </div>
  );
}

/** Start/stop camera + mic and mute toggles, shown in the title bar during an online game. */
export function VideoControls({ rtc }) {
  const { t } = useLang();
  if (!rtc) return null;
  if (!rtc.active) {
    return <button className="tag" onClick={rtc.start}>{t("videoTag")}</button>;
  }
  return (
    <>
      <button className="tag" onClick={rtc.toggleMic}>{rtc.micOn ? "🎤" : "🔇"}</button>
      <button className="tag" onClick={rtc.toggleCam}>{rtc.camOn ? "📹" : "🚫"}</button>
      <button className="tag" onClick={rtc.stop} style={{ color: "var(--cinnabar)" }}>✕</button>
    </>
  );
}
