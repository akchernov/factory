/** Procedural audio: sfx + ambient meadow (wind, buzz, birds) + soft generative music. No files. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let ambBus: GainNode | null = null;
let started = false;
let muted = localStorage.getItem('bf_muted') === '1';

function ac(): AudioContext | null {
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.55;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.16;
    musicBus.connect(master);
    ambBus = ctx.createGain();
    ambBus.gain.value = 0.22;
    ambBus.connect(master);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.2, slide?: number, bus = sfxBus, delay = 0) {
  const a = ac();
  if (!a || !bus) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  env(g, t, 0.008, vol, dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

let noiseBuf: AudioBuffer | null = null;
function noise(dur: number, vol: number, freq: number, q = 1, bus = sfxBus, type: BiquadFilterType = 'bandpass') {
  const a = ac();
  if (!a || !bus) return;
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = a.currentTime;
  const s = a.createBufferSource();
  s.buffer = noiseBuf;
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  env(g, t, 0.005, vol, dur);
  s.connect(f).connect(g).connect(bus);
  s.start(t, Math.random());
  s.stop(t + dur + 0.05);
}

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];

function startAmbient() {
  const a = ac();
  if (!a || !ambBus || !musicBus) return;
  // Wind: looping filtered noise with slow LFO.
  if (!noiseBuf) noise(0.01, 0.0001, 1000);
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const lp = a.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 500;
  const wg = a.createGain();
  wg.gain.value = 0.25;
  const lfo = a.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoG = a.createGain();
  lfoG.gain.value = 220;
  lfo.connect(lfoG).connect(lp.frequency);
  src.connect(lp).connect(wg).connect(ambBus);
  src.start();
  lfo.start();
  // Hive buzz: detuned saws through bandpass, slow tremolo.
  const buzzG = a.createGain();
  buzzG.gain.value = 0.0;
  buzzG.connect(ambBus);
  for (const f of [118, 121.5, 236.4]) {
    const o = a.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const bp = a.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 480;
    bp.Q.value = 2;
    o.connect(bp).connect(buzzG);
    o.start();
  }
  const trem = a.createOscillator();
  trem.frequency.value = 5.3;
  const tg = a.createGain();
  tg.gain.value = 0.01;
  trem.connect(tg).connect(buzzG.gain);
  trem.start();
  buzzNode = buzzG;

  // Generative music: soft plucked pentatonic over slow pads.
  const root = 220 * Math.pow(2, 3 / 12); // C
  let bar = 0;
  const chords = [0, 5, 7, 3];
  const play = () => {
    if (!ctx) return;
    const ch = chords[bar % chords.length]!;
    // pad
    for (const iv of [0, 7, 16]) {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = 'triangle';
      o.frequency.value = (root / 2) * Math.pow(2, (ch + iv) / 12);
      const t = a.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 1.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 6.2);
      o.connect(g).connect(musicBus!);
      o.start(t);
      o.stop(t + 6.5);
    }
    // melody
    for (let i = 0; i < 8; i++) {
      if (Math.random() < 0.45) continue;
      const n = PENTA[Math.floor(Math.random() * PENTA.length)]!;
      tone(root * Math.pow(2, (ch + n) / 12), 0.9, 'sine', 0.12, undefined, musicBus, i * 0.75);
    }
    bar++;
  };
  play();
  setInterval(play, 6000);
  // Birds during day.
  setInterval(() => {
    if (dayLevel < 0.5 || Math.random() < 0.5) return;
    const f = 2400 + Math.random() * 1400;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) tone(f + Math.random() * 300, 0.07, 'sine', 0.05, f * 1.3, ambBus, i * 0.11);
  }, 2600);
  // Crickets at night.
  setInterval(() => {
    if (dayLevel > 0.3) return;
    for (let i = 0; i < 3; i++) tone(4300, 0.03, 'square', 0.012, undefined, ambBus, i * 0.06);
  }, 900);
}

let buzzNode: GainNode | null = null;
let dayLevel = 1;

export const audio = {
  start() {
    if (started) return;
    if (!ac()) return;
    started = true;
    startAmbient();
  },
  setMuted(m: boolean) {
    muted = m;
    localStorage.setItem('bf_muted', m ? '1' : '0');
    if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05);
  },
  isMuted: () => muted,
  /** Buzz loudness from number of hives on screen, day 0..1. */
  setScene(hivesOnScreen: number, day: number) {
    dayLevel = day;
    if (buzzNode && ctx) buzzNode.gain.setTargetAtTime(Math.min(0.06, hivesOnScreen * 0.012) * (0.3 + day * 0.7), ctx.currentTime, 0.4);
  },
  place() { noise(0.09, 0.35, 900, 1.5); tone(180, 0.12, 'triangle', 0.25, 90); },
  belt() { noise(0.04, 0.12, 2200, 3); },
  remove() { noise(0.18, 0.3, 500, 0.8); tone(260, 0.2, 'square', 0.06, 80); },
  click() { tone(900, 0.04, 'triangle', 0.08); },
  error() { tone(200, 0.12, 'square', 0.08); tone(150, 0.16, 'square', 0.08, undefined, sfxBus, 0.09); },
  coin() { const p = 1 + Math.random() * 0.12; tone(1318 * p, 0.09, 'triangle', 0.1); tone(1975 * p, 0.16, 'triangle', 0.09, undefined, sfxBus, 0.06); },
  produce() { tone(660 + Math.random() * 60, 0.05, 'sine', 0.05); },
  tech() { [0, 4, 7, 12, 16].forEach((n, i) => tone(523 * Math.pow(2, n / 12), 0.5, 'triangle', 0.12, undefined, sfxBus, i * 0.09)); },
  quest() { [0, 7, 12].forEach((n, i) => tone(659 * Math.pow(2, n / 12), 0.35, 'sine', 0.14, undefined, sfxBus, i * 0.11)); },
  mutation() {
    [0, 3, 7, 10, 14, 19].forEach((n, i) => tone(392 * Math.pow(2, n / 12), 0.6, 'sine', 0.1, undefined, sfxBus, i * 0.07));
    noise(1.2, 0.08, 6000, 0.6, sfxBus, 'highpass');
  },
  win() { [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((n, i) => tone(392 * Math.pow(2, n / 12), 0.7, 'triangle', 0.13, undefined, sfxBus, i * 0.14)); },
};

window.addEventListener('pointerdown', () => audio.start(), { once: true });
window.addEventListener('keydown', () => audio.start(), { once: true });
