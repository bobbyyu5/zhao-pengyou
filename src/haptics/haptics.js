// Centralized haptic feedback with a persisted on/off preference. navigator.vibrate is a no-op
// on desktop and iOS Safari, so this is purely additive on phones that support it — but the
// preference lets players who find buzzing distracting turn it off. Mirrors sound.js's shape.

let on = load();
function load() { try { return localStorage.getItem("zhao.haptics") !== "0"; } catch { return true; } }
export function hapticsOn() { return on; }
export function setHaptics(v) { on = !!v; try { localStorage.setItem("zhao.haptics", on ? "1" : "0"); } catch {} }

/** Buzz a pattern (number ms or [on,off,on,…]) — silently ignored when the preference is off. */
export function buzz(pattern) {
  if (!on || !pattern) return;
  try { navigator.vibrate?.(pattern); } catch {}
}
