/**
 * The detective's voice: tiny sounds synthesised with Web Audio, so nothing is downloaded and
 * nothing plays that the person did not cause.
 *
 * Rules (the edge cases):
 * - Silent until the person has pressed something of ours on this page (browser autoplay policy,
 *   and good manners on someone else's website).
 * - Only after pointer input: keyboard-triggered actions are repeated often, so they stay silent.
 * - Never while the tab is hidden, never two sounds within 90ms, always quiet (master gain .14).
 * - One switch mutes everything, remembered on this device.
 */

export type Cue = 'pop' | 'blip' | 'ding' | 'coin' | 'bonk' | 'boing' | 'whoosh' | 'tick' | 'lock' | 'select' | 'chime' | 'shimmer' | 'swish' | 'success';

const MUTE_KEY = 'pixelpeeper.muted';

export function createSound() {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = false;
  let lastPointer = 0;
  let lastCue = 0;

  try { void chrome.storage?.local.get(MUTE_KEY).then((r) => { muted = !!r?.[MUTE_KEY]; }); } catch { /* preview or tests */ }

  /** Call from a real pointerdown on our UI: the only moment audio may be unlocked. */
  function gesture() {
    lastPointer = performance.now();
    if (ctx || typeof AudioContext === 'undefined') { void ctx?.resume(); return; }
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.14;
    master.connect(ctx.destination);
  }

  function tone(type: OscillatorType, from: number, to: number, start: number, dur: number, peak = 1) {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, start);
    o.frequency.exponentialRampToValueAtTime(to, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(master!);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  function noise(start: number, dur: number, fromHz: number, toHz: number, peak = 0.5) {
    const len = Math.ceil(ctx!.sampleRate * dur);
    const buf = ctx!.createBuffer(1, len, ctx!.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx!.createBufferSource();
    src.buffer = buf;
    const f = ctx!.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(fromHz, start);
    f.frequency.exponentialRampToValueAtTime(toHz, start + dur);
    const g = ctx!.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(master!);
    src.start(start);
  }

  /** Play a cue if every rule allows it. `force` skips the pointer check (results that arrive later). */
  function play(cue: Cue, force = false) {
    if (!ctx || !master || muted || document.hidden) return;
    const now = performance.now();
    if (now - lastCue < 90) return;
    if (!force && now - lastPointer > 900) return;
    lastCue = now;
    const t = ctx.currentTime + 0.005;
    switch (cue) {
      case 'pop': tone('sine', 420, 980, t, 0.11); break;
      case 'blip': tone('triangle', 880, 1040, t, 0.06, 0.6); break;
      case 'tick': tone('square', 1800, 1700, t, 0.025, 0.12); break;
      case 'ding': tone('sine', 1318.5, 1318.5, t, 0.5, 0.7); tone('sine', 1975.5, 1975.5, t + 0.07, 0.6, 0.45); break;
      case 'coin': tone('triangle', 987.8, 987.8, t, 0.08, 0.8); tone('triangle', 1318.5, 1318.5, t + 0.08, 0.32, 0.8); break;
      case 'bonk': tone('sine', 240, 120, t, 0.16, 0.9); break;
      case 'boing': tone('sine', 260, 640, t, 0.18, 0.7); tone('sine', 640, 300, t + 0.18, 0.22, 0.5); break;
      case 'whoosh': noise(t, 0.28, 2400, 500, 0.6); break;
      // The selection locks: a soft double click that rises a fifth.
      case 'lock': tone('triangle', 660, 660, t, 0.05, 0.5); tone('sine', 990, 990, t + 0.05, 0.14, 0.45); break;
      case 'select': tone('sine', 740, 880, t, 0.07, 0.45); break;
      // A bright major arpeggio for good news.
      case 'chime': [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone('sine', f, f, t + i * 0.06, 0.5 - i * 0.06, 0.38)); break;
      case 'shimmer': noise(t, 0.6, 6000, 9000, 0.12); [1568, 2093, 2637].forEach((f, i) => tone('sine', f, f, t + 0.1 + i * 0.09, 0.3, 0.12)); break;
      case 'swish': noise(t, 0.22, 1800, 900, 0.22); break;
      case 'success': [784, 987.8, 1174.7, 1568].forEach((f, i) => tone('triangle', f, f, t + i * 0.08, 0.34, 0.5)); break;
    }
  }

  function setMuted(next: boolean) {
    muted = next;
    try { void chrome.storage?.local.set({ [MUTE_KEY]: next }); } catch { /* preview or tests */ }
  }

  /** The unlocked audio graph, shared with the onboarding music so one switch governs both. */
  const audio = () => (ctx && master ? { ctx, master } : null);

  return { gesture, play, setMuted, isMuted: () => muted, audio };
}

export type Sound = ReturnType<typeof createSound>;
