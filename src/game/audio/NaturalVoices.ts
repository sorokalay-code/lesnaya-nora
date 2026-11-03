import type { AttackCue } from './AttackCue';

export type SoundEvent =
  | 'hop'
  | 'pickup'
  | 'eat'
  | 'dig'
  | 'chirp'
  | 'danger'
  | 'baby'
  | 'save'
  | 'rain'
  | 'drink'
  | 'nest'
  | 'step';

/** Синтезирует короткие природные голоса и шумы; общий буфер исключает выделение PCM на каждый шаг. */
export class NaturalVoices {
  readonly noiseBuffer: AudioBuffer;

  constructor(
    private readonly context: AudioContext,
    private readonly destination: AudioNode,
  ) {
    this.noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  }

  private route(source: AudioNode, volume: number, duration: number, delay: number, pan: number) {
    const gain = this.context.createGain(),
      stereo = this.context.createStereoPanner();
    const time = this.context.currentTime + delay;
    stereo.pan.value = pan;
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.002, volume), time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    source.connect(gain);
    gain.connect(stereo);
    stereo.connect(this.destination);
    return {
      time,
      disconnect: () => {
        source.disconnect();
        gain.disconnect();
        stereo.disconnect();
      },
    };
  }

  tone(start: number, end: number, duration: number, volume: number, delay = 0, pan = 0): void {
    const oscillator = this.context.createOscillator();
    const voice = this.route(oscillator, volume, duration, delay, pan);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(start, voice.time);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, end), voice.time + duration);
    oscillator.onended = voice.disconnect;
    oscillator.start(voice.time);
    oscillator.stop(voice.time + duration + 0.02);
  }

  noise(frequency: number, duration: number, volume: number, delay = 0, pan = 0): void {
    const source = this.context.createBufferSource(),
      filter = this.context.createBiquadFilter();
    source.buffer = this.noiseBuffer;
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 0.7;
    source.connect(filter);
    const voice = this.route(filter, volume, duration, delay, pan);
    source.onended = () => {
      source.disconnect();
      voice.disconnect();
    };
    source.start(voice.time, Math.random());
    source.stop(voice.time + duration + 0.02);
  }

  effect(event: SoundEvent): void {
    const variation = 0.85 + Math.random() * 0.3;
    const pan = (Math.random() - 0.5) * 0.25;
    switch (event) {
      case 'step':
        this.noise(850 * variation, 0.07, 0.11, 0, pan);
        this.tone(95, 48, 0.08, 0.045);
        break;
      case 'hop':
        this.noise(480, 0.16, 0.15);
        this.tone(110, 55, 0.1, 0.08);
        break;
      case 'dig':
        for (let i = 0; i < 3; i++)
          this.noise((450 + i * 220) * variation, 0.11, 0.19, i * 0.07, i % 2 ? -0.2 : 0.2);
        break;
      case 'eat':
        for (let i = 0; i < 3; i++) this.noise(1800 * variation, 0.06, 0.12, i * 0.09, pan);
        break;
      case 'drink':
        for (let i = 0; i < 3; i++) {
          this.tone(450 * variation, 180, 0.09, 0.08, i * 0.1);
          this.noise(2600, 0.05, 0.05, i * 0.1);
        }
        break;
      case 'nest':
      case 'pickup':
        this.noise(1400 * variation, 0.23, 0.14);
        break;
      case 'chirp':
        this.tone(470 * variation, 350, 0.12, 0.08);
        this.noise(950, 0.09, 0.035);
        break;
      case 'baby':
        this.tone(900 * variation, 650, 0.1, 0.09);
        this.tone(750 * variation, 570, 0.09, 0.07, 0.14);
        break;
      case 'danger':
        this.noise(220, 0.35, 0.27);
        this.tone(125, 60, 0.3, 0.2);
        break;
      case 'save':
        this.tone(470, 640, 0.14, 0.08);
        break;
      case 'rain':
        this.noise(3400, 0.2, 0.06);
        break;
    }
  }

  vocal(start: number, end: number, duration: number, volume: number, delay = 0, pan = 0): void {
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    oscillator.type = 'triangle';
    filter.type = 'lowpass';
    filter.frequency.value = Math.max(start, end) * 3.5;
    oscillator.connect(filter);
    const voice = this.route(filter, volume, duration, delay, pan);
    const contour = new Float32Array(24);
    // Неровная частотная огибающая и обертоны заменяют ровный синусоидальный «писк».
    for (let i = 0; i < contour.length; i++) {
      const fraction = i / (contour.length - 1);
      const base = start * (end / start) ** fraction;
      contour[i] = base * (1 + Math.sin(fraction * 17) * 0.028 * Math.sin(fraction * Math.PI));
    }
    oscillator.frequency.setValueCurveAtTime(contour, voice.time, duration);
    oscillator.onended = () => {
      oscillator.disconnect();
      voice.disconnect();
    };
    oscillator.start(voice.time);
    oscillator.stop(voice.time + duration + 0.02);
  }

  attack(kind: string, phase: AttackCue['phase'], volume: number, pan: number): void {
    const variation = 0.9 + Math.random() * 0.2;
    if (phase === 'leap') this.noise(750 * variation, 0.2, 0.18 * volume, 0, pan);
    if (kind === 'spider' || kind === 'jumping-spider') {
      this.noise(2100 * variation, 0.15, 0.23 * volume, 0, pan);
      this.noise(3300, 0.065, 0.14 * volume, 0.045, pan);
    } else if (kind === 'snake') {
      this.noise(2700 * variation, 0.3, 0.35 * volume, 0, pan);
    } else if (kind === 'hawk') {
      this.tone(1700 * variation, 950, 0.18, 0.28 * volume, 0, pan);
      this.tone(1300 * variation, 700, 0.13, 0.18 * volume, 0.09, pan);
    } else {
      const bass =
        kind === 'bear' ? 65 : kind === 'lynx' ? 220 : kind === 'fanged-rabbit' ? 340 : 125;
      const duration = kind === 'bear' ? 0.45 : 0.27;
      this.noise(bass * 2.5 * variation, duration, 0.45 * volume, 0, pan);
      this.tone(bass * variation, bass * 0.6, duration, 0.23 * volume, 0, pan);
      if (kind === 'lynx') this.noise(1250, 0.2, 0.2 * volume, 0.05, pan);
    }
  }

  ambient(night: boolean, swamp: boolean): void {
    const pan = Math.random() * 1.6 - 0.8;
    if (night) {
      if (swamp) {
        for (let i = 0; i < 3; i++) this.tone(190, 110, 0.15, 0.075, i * 0.18, pan);
      } else if (Math.random() < 0.35) {
        this.tone(310, 260, 0.32, 0.055, 0, pan);
        this.tone(300, 240, 0.4, 0.04, 0.45, pan);
      } else for (let i = 0; i < 4; i++) this.noise(5500, 0.08, 0.035, i * 0.13, pan);
      return;
    }
    const base = 1600 + Math.random() * 1800;
    const count = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++)
      this.tone(
        base * (0.8 + Math.random() * 0.4),
        base * (0.7 + Math.random() * 0.7),
        0.07 + Math.random() * 0.09,
        0.04 + Math.random() * 0.04,
        i * 0.17,
        pan,
      );
    if (swamp && Math.random() < 0.5) this.noise(2400, 0.18, 0.035, 0.6, pan);
  }
}
