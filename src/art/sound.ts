/** Web Audio score and effects. A user gesture unlocks the audio context. */
const BEAT = 60 / 92;
const STEP = BEAT / 2;
const CHORDS = [
  [43, 55, 59, 62], [38, 54, 57, 62], [40, 55, 59, 64], [36, 55, 60, 64],
  [43, 55, 59, 62], [45, 57, 60, 64], [38, 54, 57, 62], [43, 55, 59, 62],
] as const;
const MELODY = [
  [74, 0, 71, 69, 67, 0, 71, 0], [69, 0, 66, 69, 74, 0, 0, 0],
  [76, 0, 74, 71, 67, 0, 71, 74], [72, 0, 67, 64, 67, 0, 0, 0],
  [71, 0, 74, 76, 79, 0, 74, 0], [76, 0, 72, 69, 72, 0, 76, 0],
  [74, 0, 69, 66, 69, 0, 74, 0], [71, 69, 67, 0, 62, 0, 0, 0],
] as const;

let ctx: AudioContext | undefined;
let master: GainNode | undefined;
let noise: AudioBuffer | undefined;
let muted = false;
let nextNote = 0;
let step = 0;

function note(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo?: number) {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(freq, t);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  oscillator.connect(gain).connect(master);
  oscillator.start(t);
  oscillator.stop(t + dur);
}

function rustle(vol: number, frequency: number) {
  if (!ctx || !master || !noise || muted) return;
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  const t = ctx.currentTime;
  filter.type = 'lowpass';
  filter.frequency.value = frequency;
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
  source.buffer = noise;
  source.connect(filter).connect(gain).connect(master);
  source.start(t, Math.random() * 0.09, 0.085);
}

function scheduleMusic() {
  if (!ctx || ctx.state !== 'running' || muted || document.hidden) return;
  if (nextNote < ctx.currentTime) nextNote = ctx.currentTime + 0.03;
  while (nextNote < ctx.currentTime + 0.22) {
    const bar = Math.floor(step / 8);
    const beat = step % 8;
    const chord = CHORDS[bar]!;
    const lead = MELODY[bar]![beat];
    const delay = nextNote - ctx.currentTime;
    tone(note(chord[1 + beat % 3]!), 0.37, 'sine', 0.043, delay);
    if (beat === 0 || beat === 4) tone(note(chord[0]), 0.86, 'triangle', 0.057, delay);
    if (lead) {
      tone(note(lead), 0.46, 'triangle', 0.069, delay);
      tone(note(lead + 12), 0.17, 'sine', 0.012, delay);
    }
    if ((bar === 1 || bar === 5) && beat === 6) {
      tone(1480, 0.09, 'sine', 0.014, delay, 1750);
      tone(1870, 0.14, 'sine', 0.012, delay + 0.11, 1480);
    }
    step = (step + 1) % (CHORDS.length * 8);
    nextNote += STEP;
  }
}

function updateVolume() {
  if (ctx && master) master.gain.setTargetAtTime(muted || document.hidden ? 0 : 0.8, ctx.currentTime, 0.025);
}

export const sfx = {
  place() { rustle(0.16, 1100); tone(330, 0.15, 'triangle', 0.12, 0, 250); tone(660, 0.13, 'sine', 0.09, 0.047); },
  remove() { rustle(0.13, 790); tone(740, 0.14, 'triangle', 0.08); tone(988, 0.19, 'sine', 0.08, 0.075); },
  rotate() { tone(440, 0.085, 'triangle', 0.08, 0, 535); },
  reject() { tone(165, 0.17, 'triangle', 0.10, 0, 110); },
  walk() { rustle(0.083, 600 + Math.random() * 350); },
  produce() { tone(660, 0.12, 'triangle', 0.068); tone(880, 0.17, 'sine', 0.052, 0.065); },
  sell() { tone(784, 0.19, 'triangle', 0.11); tone(988, 0.19, 'triangle', 0.09, 0.08); tone(1175, 0.29, 'sine', 0.12, 0.15); },
  setMuted(value: boolean) {
    muted = value;
    updateVolume();
    if (!muted) sfx.unlock();
  },
  isMuted() { return muted; },
  unlock() {
    if (muted) return;
    const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    if (!ctx) {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate / 5), ctx.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      window.setInterval(scheduleMusic, 75);
      document.addEventListener('visibilitychange', updateVolume);
    }
    if (ctx.state !== 'running') void ctx.resume().then(scheduleMusic).catch(() => {});
    else scheduleMusic();
  },
};

if (typeof window !== 'undefined') {
  const unlock = () => sfx.unlock();
  window.addEventListener('pointerdown', unlock, { capture: true, once: true });
  window.addEventListener('pointerup', unlock, { capture: true, once: true });
  window.addEventListener('keydown', unlock, { capture: true, once: true });
}
