/** Tiny procedural WebAudio sfx. No files. Silent until the first user gesture (browser rule). */
let ctx: AudioContext | null = null;
let muted = false;

function audio(): AudioContext | null {
  if (muted || typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
  const a = audio();
  if (!a || a.state !== 'running') return;
  const t = a.currentTime;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur);
}

export const sfx = {
  place() { tone(520, 0.08, 'square', 0.05); setTimeout(() => tone(780, 0.07, 'square', 0.04), 50); },
  remove() { tone(300, 0.15, 'sawtooth', 0.04, 120); },
  produce() { tone(880, 0.06, 'triangle', 0.03); },
  sell() { tone(1046, 0.08, 'triangle', 0.05); setTimeout(() => tone(1568, 0.12, 'triangle', 0.05), 70); },
  setMuted(value: boolean) { muted = value; },
  isMuted() { return muted; },
  /** Call once from any click/keydown so the context unlocks. */
  unlock() { audio(); },
};

if (typeof window !== 'undefined') {
  const unlock = () => sfx.unlock();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}
