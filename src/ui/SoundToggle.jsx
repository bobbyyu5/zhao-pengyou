import React, { useState } from "react";
import { isMuted, setMuted, sound } from "../sound/sound.js";

/** 🔊/🔇 toggle for the synthesized sound kit. State persists in localStorage. */
export default function SoundToggle() {
  const [muted, setM] = useState(isMuted());
  return (
    <button className="tag" title="sound" onClick={() => {
      const next = !muted;
      setMuted(next); setM(next);
      if (!next) sound.tap(); // little confirmation chirp when turning on
    }}>
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
