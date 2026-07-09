// Tiny synthesized sound kit (Web Audio API) — no asset files, works offline. All sounds are
// generated from oscillators, so the bundle stays small and there's nothing to download.
// Muted state persists in localStorage. The AudioContext is created lazily on the first sound
// (which always follows a user tap, satisfying browser autoplay rules).

let ctx = null;
let muted = load();

function load() { try { return localStorage.getItem("zhao.muted") === "1"; } catch { return false; } }
export function isMuted() { return muted; }
export function setMuted(m) { muted = !!m; try { localStorage.setItem("zhao.muted", muted ? "1" : "0"); } catch {} }

function ac() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  if (ctx.state === "suspended") ctx.resume?.();
  return ctx;
}

function tone(freq, dur, { type = "sine", gain = 0.14, when = 0, slideTo = null } = {}) {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function chord(freqs, dur, opts) { freqs.forEach((f, i) => tone(f, dur, { ...opts, when: (opts?.when || 0) + i * (opts?.stagger ?? 0) })); }

// Short decaying noise burst (card riffle / landing) through a band-pass.
function noise(dur, { gain = 0.08, freq = 2600, when = 0 } = {}) {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + when;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(); src.buffer = buf;
  const filt = c.createBiquadFilter(); filt.type = "bandpass"; filt.frequency.value = freq; filt.Q.value = 0.8;
  const g = c.createGain(); g.gain.value = gain;
  src.connect(filt).connect(g).connect(c.destination);
  src.start(t0);
}

export const sound = {
  tap()   { if (!muted) tone(440, 0.05, { type: "triangle", gain: 0.06 }); },
  play()  { if (!muted) tone(300, 0.13, { type: "sawtooth", gain: 0.06, slideTo: 170 }); },
  trick() { if (!muted) { tone(540, 0.09, { gain: 0.09 }); tone(720, 0.12, { gain: 0.08, when: 0.07 }); } },
  reveal(){ if (!muted) { tone(523, 0.12, { gain: 0.11 }); tone(784, 0.18, { gain: 0.11, when: 0.1 }); } },
  win()   { if (!muted) chord([523, 659, 784, 1047], 0.24, { gain: 0.11, stagger: 0.1 }); },
  lose()  { if (!muted) tone(340, 0.3, { gain: 0.09, slideTo: 150 }); },
  levelUp(){ if (!muted) chord([659, 880, 1175], 0.18, { type: "triangle", gain: 0.1, stagger: 0.07 }); },
  // A single card landing on the felt — soft tick + a short paper rustle.
  deal()  { if (!muted) { tone(680, 0.035, { type: "triangle", gain: 0.05 }); noise(0.04, { gain: 0.03, freq: 3200 }); } },
  // The riffle-shuffle before a deal: three quick decaying noise bursts.
  shuffle(){ if (!muted) { noise(0.12, { gain: 0.06, freq: 2400 }); noise(0.1, { gain: 0.05, freq: 2800, when: 0.1 }); noise(0.09, { gain: 0.04, freq: 2200, when: 0.2 }); } },
  // A bright little blip when a reaction pops over a seat.
  pop()   { if (!muted) tone(760, 0.09, { type: "sine", gain: 0.08, slideTo: 1180 }); },
};
