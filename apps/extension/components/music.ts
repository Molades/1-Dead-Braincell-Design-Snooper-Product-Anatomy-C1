/**
 * The onboarding score: a short generative piece, synthesised live (no files, nothing downloaded).
 *
 * A soft detuned pad walks a four-chord loop (Fmaj9, Am7, Dm9, Bbmaj7), a round sine bass marks each bar,
 * and sparse plucks pick notes from the chord through a gentle echo, so it never repeats exactly and never
 * gets in the way of reading. `intensity` (0 to 1) lets each step add a little more life.
 *
 * Manners: starts only after a person's gesture (browser policy), fades in and out, pauses while the tab is
 * hidden, and one switch (shared with the sound effects) turns it off.
 */

type Audio = { ctx: AudioContext; master: GainNode };

const BPM = 84;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
// MIDI notes. Pad voicings and the bass root for each chord.
const CHORDS = [
  { pad: [53, 57, 60, 64, 67], bass: 41 }, // Fmaj9
  { pad: [57, 60, 64, 67], bass: 45 }, // Am7
  { pad: [50, 57, 60, 64, 65], bass: 38 }, // Dm9
  { pad: [58, 62, 65, 69, 64], bass: 46 }, // Bbmaj7(9)
];
// Pluck pool per chord: pentatonic tones that sit inside the harmony.
const PLUCKS = [
  [72, 74, 76, 79, 81, 84],
  [72, 76, 79, 81, 84, 88],
  [69, 72, 74, 76, 81, 86],
  [70, 74, 77, 79, 81, 86],
];
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

export function createMusic(getAudio: () => Audio | null) {
  let bus: GainNode | null = null;
  let echo: DelayNode | null = null;
  let timer = 0;
  let nextBar = 0;
  let bar = 0;
  let playing = false;
  let intensity = 0.3;

  function graph(a: Audio) {
    if (bus) return;
    const { ctx } = a;
    bus = ctx.createGain();
    bus.gain.value = 0.0001;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 5200;
    // A soft dotted-eighth echo for the plucks only.
    echo = ctx.createDelay(1);
    echo.delayTime.value = BEAT * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    echo.connect(fb).connect(echo);
    echo.connect(wet).connect(tone);
    bus.connect(tone).connect(ctx.destination);
  }

  function voice(a: Audio, type: OscillatorType, freq: number, start: number, dur: number, peak: number, attack: number, cutoff: number, toEcho = false) {
    const { ctx } = a;
    const o = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(f).connect(g).connect(bus!);
    if (toEcho && echo) g.connect(echo);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  function scheduleBar(a: Audio, t: number) {
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length]!;
    const pool = PLUCKS[Math.floor(bar / 2) % PLUCKS.length]!;
    // Pad: only on the chord's first bar, held across both.
    if (bar % 2 === 0) {
      for (const m of chord.pad) {
        for (const detune of [-0.004, 0.004]) voice(a, 'triangle', hz(m) * (1 + detune), t, BAR * 2 + 1.2, 0.022, 1.1, 1100);
      }
    }
    // Bass: a round note on beat one, a softer one on beat three.
    voice(a, 'sine', hz(chord.bass), t, BEAT * 1.8, 0.11, 0.02, 400);
    voice(a, 'sine', hz(chord.bass), t + BEAT * 2, BEAT * 1.4, 0.06, 0.02, 400);
    // Plucks on eighth notes, sparse; more of them as intensity rises.
    for (let i = 0; i < 8; i++) {
      if (Math.random() > 0.18 + intensity * 0.42) continue;
      const m = pool[Math.floor(Math.random() * pool.length)]!;
      const at = t + i * (BEAT / 2) + (Math.random() - 0.5) * 0.012;
      voice(a, 'sine', hz(m), at, 0.9, 0.05, 0.006, 3800, true);
      voice(a, 'triangle', hz(m) * 2, at, 0.25, 0.012, 0.004, 5000);
    }
    // A soft shaker on the off-beats once things are moving.
    if (intensity > 0.55) {
      for (let i = 0; i < 4; i++) {
        const at = t + i * BEAT + BEAT / 2;
        const len = Math.ceil(a.ctx.sampleRate * 0.05);
        const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let j = 0; j < len; j++) d[j] = (Math.random() * 2 - 1) * (1 - j / len);
        const src = a.ctx.createBufferSource();
        const hp = a.ctx.createBiquadFilter();
        const g = a.ctx.createGain();
        src.buffer = buf;
        hp.type = 'highpass';
        hp.frequency.value = 7000;
        g.gain.value = 0.035;
        src.connect(hp).connect(g).connect(bus!);
        src.start(at);
      }
    }
    bar++;
  }

  function tick() {
    const a = getAudio();
    if (!a || !playing) return;
    while (nextBar < a.ctx.currentTime + 0.6) {
      scheduleBar(a, nextBar);
      nextBar += BAR;
    }
  }

  function fade(to: number, seconds: number) {
    const a = getAudio();
    if (!a || !bus) return;
    const now = a.ctx.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), now);
    bus.gain.exponentialRampToValueAtTime(Math.max(0.0001, to), now + seconds);
  }

  /** Begin (or resume) the score. Returns false if audio is not unlocked yet. */
  function start() {
    const a = getAudio();
    if (!a) return false;
    graph(a);
    if (playing) return true;
    playing = true;
    void a.ctx.resume();
    nextBar = Math.max(nextBar, a.ctx.currentTime + 0.08);
    fade(0.9, 2.4);
    tick();
    timer = window.setInterval(tick, 200);
    return true;
  }

  function stop(seconds = 0.8) {
    if (!playing) return;
    playing = false;
    clearInterval(timer);
    fade(0.0001, seconds);
  }

  document.addEventListener('visibilitychange', () => {
    if (!bus) return;
    if (document.hidden) fade(0.0001, 0.4);
    else if (playing) fade(0.9, 1.2);
  });

  return {
    start,
    stop,
    isPlaying: () => playing,
    /** 0 to 1: how lively the plucks and percussion are. */
    setIntensity(v: number) { intensity = Math.max(0, Math.min(1, v)); },
  };
}

export type Music = ReturnType<typeof createMusic>;
