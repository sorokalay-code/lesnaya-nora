import { NaturalVoices, type SoundEvent } from './audio/NaturalVoices';
import type { Biome } from './types';
import type { AttackCue } from './audio/AttackCue';

/** Управляет звуковым ландшафтом, погодой и общей громкостью без сетевых аудиозависимостей. */
export class Soundscape {
  private ctx?: AudioContext;
  private master?: GainNode;
  private windGain?: GainNode;
  private rainGain?: GainNode;
  private voices?: NaturalVoices;
  private nextBird = 0;
  private mutedValue = false;
  private sheltered = false;

  get muted(): boolean {
    return this.mutedValue;
  }

  set muted(value: boolean) {
    this.mutedValue = value;
    this.syncVolume();
  }

  private syncVolume(): void {
    if (this.ctx && this.master)
      this.master.gain.setTargetAtTime(
        this.mutedValue ? 0 : this.sheltered ? 0.055 : 0.13,
        this.ctx.currentTime,
        0.08,
      );
  }

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.mutedValue ? 0 : 0.13;
    this.master.connect(this.ctx.destination);
    this.voices = new NaturalVoices(this.ctx, this.master);
    const source = this.ctx.createBufferSource();
    source.buffer = this.voices.noiseBuffer;
    source.loop = true;
    const wind = this.ctx.createBiquadFilter();
    wind.type = 'lowpass';
    wind.frequency.value = 320;
    const rain = this.ctx.createBiquadFilter();
    rain.type = 'highpass';
    rain.frequency.value = 1600;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.1;
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0;
    source.connect(wind);
    wind.connect(this.windGain);
    this.windGain.connect(this.master);
    source.connect(rain);
    rain.connect(this.rainGain);
    this.rainGain.connect(this.master);
    source.start();
    this.syncVolume();
  }

  play(event: SoundEvent): void {
    if (!this.mutedValue && this.ctx?.state === 'running') this.voices?.effect(event);
  }

  attack(kind: string, phase: AttackCue['phase'], volume = 1, pan = 0): void {
    if (!this.mutedValue && this.ctx?.state === 'running')
      this.voices?.attack(kind, phase, volume, pan);
  }

  setWeather(weather: string, night: boolean): void {
    if (!this.ctx || !this.windGain || !this.rainGain) return;
    const time = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(weather === 'snow' ? 0.22 : night ? 0.13 : 0.1, time, 1);
    this.rainGain.gain.setTargetAtTime(weather === 'rain' ? 0.23 : 0, time, 0.8);
  }

  update(time: number, night: boolean, biome: Biome = 'forest', underground = false): void {
    if (this.sheltered !== underground) {
      this.sheltered = underground;
      this.syncVolume();
    }
    if (time < this.nextBird) return;
    this.nextBird = time + 3 + Math.random() * 9;
    if (!this.mutedValue && !underground && this.ctx?.state === 'running')
      this.voices?.ambient(night, biome === 'swamp');
  }
}
