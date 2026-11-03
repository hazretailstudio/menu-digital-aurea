let audioCtx = null;
let currentSoundPreset = localStorage.getItem('kds_sound_preset') || 'bell';

function getAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(freq, startTime, duration, type = 'sine', gainLevel = 0.25) {
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
  } catch (e) {}
}

const SOUND_ENGINES = {
  bell: (ctx, t) => { playTone(1046.50, t, 0.35, 'triangle', 0.3); playTone(1567.98, t + 0.14, 0.55, 'sine', 0.35); },
  chime: (ctx, t) => { playTone(523.25, t, 0.2, 'sine', 0.25); playTone(659.25, t + 0.08, 0.2, 'sine', 0.28); playTone(783.99, t + 0.16, 0.4, 'triangle', 0.32); },
  dingdong: (ctx, t) => { playTone(1318.51, t, 0.35, 'triangle', 0.35); playTone(987.77, t + 0.18, 0.65, 'sine', 0.3); },
  arcade: (ctx, t) => {
    try {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.setValueAtTime(440, t); osc.frequency.exponentialRampToValueAtTime(1200, t + 0.18);
      gain.gain.setValueAtTime(0.3, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.22);
    } catch(e) {}
  },
  fanfare: (ctx, t) => { playTone(783.99, t, 0.12, 'square', 0.18); playTone(1046.50, t + 0.18, 0.38, 'square', 0.25); },
  zen: (ctx, t) => { playTone(432.00, t, 0.9, 'sine', 0.4); },
  jazz: (ctx, t) => { playTone(523.25, t, 0.4, 'triangle', 0.22); playTone(659.25, t + 0.04, 0.4, 'triangle', 0.22); playTone(783.99, t + 0.08, 0.4, 'triangle', 0.22); },
  drop: (ctx, t) => {
    try {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(1800, t); osc.frequency.exponentialRampToValueAtTime(600, t + 0.15);
      gain.gain.setValueAtTime(0.35, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.18);
    } catch(e) {}
  },
  reward: (ctx, t) => { playTone(523.25, t, 0.15, 'triangle', 0.22); playTone(659.25, t + 0.09, 0.15, 'triangle', 0.25); playTone(783.99, t + 0.18, 0.18, 'triangle', 0.28); playTone(1046.50, t + 0.27, 0.5, 'sine', 0.35); },
  pulse: (ctx, t) => { playTone(900, t, 0.08, 'sawtooth', 0.15); playTone(1400, t + 0.06, 0.18, 'triangle', 0.3); }
};

export function playSoundByName(presetName) {
  try {
    const ctx = getAudioContext();
    const engine = SOUND_ENGINES[presetName] || SOUND_ENGINES.bell;
    engine(ctx, ctx.currentTime);
  } catch (err) {}
}

export function changeSoundPreset(presetKey) {
  currentSoundPreset = presetKey;
  localStorage.setItem('kds_sound_preset', presetKey);
  playSoundByName(presetKey);
}

export function previewCurrentSound() {
  playSoundByName(currentSoundPreset);
}

export function playFlowSound(eventType) {
  if (eventType === 'new_order') playSoundByName(currentSoundPreset);
  else if (eventType === 'preparing') playSoundByName('arcade');
  else if (eventType === 'delivered') playSoundByName('dingdong');
  else if (eventType === 'paid') playSoundByName('reward');
  else if (eventType === 'archive') playSoundByName('fanfare');
  else if (eventType === 'rewind') playSoundByName('zen');
}
