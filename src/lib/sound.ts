let ctx: AudioContext | null = null;

function tone(freq: number, duration: number, volume = 0.08, type: OscillatorType = 'triangle') {
  try {
    if (localStorage.getItem('sound') === 'off') return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = ctx ?? new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    /* звук необязателен */
  }
}

export type SoundKind = 'move' | 'capture' | 'check' | 'end' | 'wrong' | 'correct' | 'notify';

export function playSound(kind: SoundKind) {
  switch (kind) {
    case 'move':
      tone(320, 0.07);
      break;
    case 'capture':
      tone(220, 0.12, 0.12, 'square');
      break;
    case 'check':
      tone(520, 0.15, 0.1);
      break;
    case 'end':
      tone(440, 0.25, 0.1);
      setTimeout(() => tone(330, 0.3, 0.1), 180);
      break;
    case 'wrong':
      tone(150, 0.25, 0.12, 'sawtooth');
      break;
    case 'correct':
      tone(600, 0.12, 0.08);
      setTimeout(() => tone(800, 0.15, 0.08), 100);
      break;
    case 'notify':
      tone(880, 0.1, 0.06, 'sine');
      setTimeout(() => tone(1175, 0.18, 0.06, 'sine'), 110);
      break;
  }
}

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem('sound') !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem('sound', on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}
