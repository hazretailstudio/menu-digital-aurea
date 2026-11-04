let audioCtx = null;

export function getAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

export function playTone(freq, startTime, duration, type = 'sine', gainLevel = 0.25) {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(gainLevel, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  } catch (e) {
    console.warn("Audio playTone error:", e);
  }
}

export const SOUND_ENGINES = {
  bell: (ctx, t) => { playTone(1046.5, t, 0.35, 'triangle', 0.3); playTone(1567.9, t + 0.12, 0.5, 'sine', 0.35); },
  chime: (ctx, t) => { playTone(523.25, t, 0.2, 'sine', 0.25); playTone(659.25, t + 0.08, 0.2, 'sine', 0.28); playTone(783.99, t + 0.16, 0.4, 'triangle', 0.32); },
  dingdong: (ctx, t) => { playTone(1318.5, t, 0.3, 'triangle', 0.3); playTone(987.7, t + 0.15, 0.5, 'sine', 0.3); },
  arcade: (ctx, t) => { playTone(440, t, 0.15, 'triangle', 0.25); playTone(880, t + 0.08, 0.25, 'triangle', 0.25); },
  fanfare: (ctx, t) => { playTone(783.99, t, 0.1, 'square', 0.18); playTone(1046.5, t + 0.15, 0.35, 'square', 0.25); },
  zen: (ctx, t) => { playTone(432.0, t, 0.9, 'sine', 0.4); },
  jazz: (ctx, t) => { playTone(523.25, t, 0.4, 'triangle', 0.22); playTone(783.99, t + 0.08, 0.4, 'triangle', 0.22); },
  drop: (ctx, t) => { playTone(1800, t, 0.12, 'sine', 0.35); playTone(600, t + 0.08, 0.15, 'sine', 0.35); },
  reward: (ctx, t) => { playTone(523, t, 0.1, 'triangle', 0.2); playTone(659, t + 0.08, 0.1, 'triangle', 0.2); playTone(1046, t + 0.16, 0.4, 'sine', 0.3); },
  pulse: (ctx, t) => { playTone(900, t, 0.08, 'sawtooth', 0.15); playTone(1400, t + 0.06, 0.18, 'triangle', 0.3); }
};

export function playSoundByName(presetName) {
  if (!presetName || presetName === 'none') return;
  try {
    const ctx = getAudioContext();
    const engine = SOUND_ENGINES[presetName] || SOUND_ENGINES.bell;
    engine(ctx, ctx.currentTime);
  } catch (e) {
    console.warn("playSoundByName error:", e);
  }
}