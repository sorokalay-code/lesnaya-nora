import type { AnimalVoiceCue, AnimalVoiceKind } from './AnimalVoice';
import type { NaturalVoices } from './NaturalVoices';

/** Синтезирует тихие голоса и шорохи настоящих соседей: дыхание, фырканье, стрекот и дальние зовы. */
export class AnimalCalls {
  constructor(private readonly voices: NaturalVoices) {}

  play(cue: AnimalVoiceCue): void {
    const { kind, activity, pan } = cue;
    const volume = cue.volume * (activity === 'alert' ? 1 : 0.7);
    const pitch = 0.92 + Math.random() * 0.16;
    const breath = (frequency: number, length: number, gain: number, delay = 0) =>
      this.voices.noise(frequency * pitch, length, gain * volume, delay, pan);
    const call = (start: number, end: number, length: number, gain: number, delay = 0) =>
      this.voices.vocal(start * pitch, end * pitch, length, gain * volume, delay, pan);

    const voices: Record<AnimalVoiceKind, () => void> = {
      rabbit: () => {
        breath(1100, 0.08, 0.15);
        breath(1450, 0.07, 0.1, 0.12);
        if (activity === 'young') call(850, 650, 0.1, 0.12, 0.05);
        if (activity === 'eat') breath(2200, 0.13, 0.12, 0.2);
      },
      squirrel: () => {
        for (let i = 0; i < 3; i++) {
          call(1900 + i * 120, 1200, 0.055, 0.13, i * 0.1);
          breath(3300, 0.04, 0.07, i * 0.1);
        }
      },
      weasel: () => {
        call(1250, 780, 0.09, 0.12);
        breath(2400, 0.12, 0.15, 0.07);
      },
      hedgehog: () => {
        breath(800, 0.17, 0.23);
        breath(1600, 0.12, 0.12, 0.19);
      },
      beaver: () => {
        call(340, 260, 0.16, 0.1);
        breath(activity === 'move' ? 700 : 1800, 0.27, 0.22, 0.12);
      },
      deer: () => {
        breath(620, 0.29, 0.3);
        if (activity === 'alert') call(410, 230, 0.22, 0.17);
      },
      moose: () => {
        call(115, 82, 0.55, 0.25);
        breath(360, 0.42, 0.18, 0.05);
      },
      fox: () => {
        call(640, 350, 0.18, 0.25);
        breath(1100, 0.1, 0.17);
        call(520, 280, 0.12, 0.14, 0.28);
      },
      dog: () => {
        call(230, 130, 0.19, 0.27);
        breath(520, 0.12, 0.26);
      },
      wolf: () => {
        call(290, 460, 0.65, 0.19);
        call(460, 270, 1.1, 0.17, 0.55);
        breath(600, 0.5, 0.05, 0.7);
      },
      lynx: () => {
        call(250, 145, 0.32, 0.17);
        breath(710, 0.26, 0.16);
      },
      bear: () => {
        call(73, 48, 0.43, 0.18);
        breath(210, 0.36, 0.31);
      },
      hawk: () => {
        call(1650, 950, 0.32, 0.22);
        call(1250, 820, 0.16, 0.13, 0.35);
      },
      snake: () => breath(2900, 0.38, 0.19),
    };
    voices[kind]();
    if (activity === 'move' || activity === 'eat') breath(1900, 0.12, 0.06, 0.4);
  }
}
