import React, { useState } from "react";
import { hapticsOn, setHaptics, buzz } from "../haptics/haptics.js";

/** 📳/📴 toggle for vibration feedback. State persists in localStorage. */
export default function HapticToggle() {
  const [on, setOn] = useState(hapticsOn());
  return (
    <button className="tag" title="vibration" onClick={() => {
      const next = !on;
      setHaptics(next); setOn(next);
      if (next) buzz(20); // a little confirmation buzz when turning it on
    }}>
      {on ? "📳" : "📴"}
    </button>
  );
}
