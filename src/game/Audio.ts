export class Soundscape {
  private ctx?: AudioContext;
  private master?: GainNode;
  private nextBird = 0;
  muted = false;

  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.13; this.master.connect(this.ctx.destination);
  }

  private tone(freq: number, end: number, duration: number, type: OscillatorType, volume: number): void {
    if (!this.ctx || !this.master || this.muted) return;
    const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    const t = this.ctx.currentTime;
    osc.type = type; osc.frequency.setValueAtTime(freq, t); osc.frequency.exponentialRampToValueAtTime(Math.max(1, end), t + duration);
    gain.gain.setValueAtTime(0.001, t); gain.gain.exponentialRampToValueAtTime(volume, t + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain); gain.connect(this.master); osc.start(t); osc.stop(t + duration + 0.01);
  }

  play(event: 'hop' | 'pickup' | 'eat' | 'dig' | 'chirp' | 'danger' | 'baby' | 'save' | 'rain'): void {
    switch (event) {
      case 'hop': this.tone(130, 72, 0.08, 'sine', 0.08); break;
      case 'pickup': this.tone(420, 780, 0.15, 'sine', 0.24); break;
      case 'eat': this.tone(230, 130, 0.1, 'triangle', 0.11); break;
      case 'dig': this.tone(100, 48, 0.22, 'sawtooth', 0.1); break;
      case 'chirp': this.tone(980, 1550, 0.14, 'sine', 0.13); break;
      case 'danger': this.tone(220, 110, 0.38, 'sawtooth', 0.3); break;
      case 'baby': this.tone(550, 900, 0.24, 'sine', 0.25); break;
      case 'save': this.tone(470, 680, 0.18, 'sine', 0.18); break;
      case 'rain': this.tone(180, 160, 0.3, 'triangle', 0.05); break;
    }
  }

  update(time: number, night: boolean): void {
    if (time < this.nextBird) return;
    this.nextBird = time + 3 + Math.random() * 6;
    if (night) { this.tone(650, 720, 0.24, 'sine', 0.07); return; }
    this.play('chirp');
    setTimeout(() => this.play('chirp'), 130);
  }
}
