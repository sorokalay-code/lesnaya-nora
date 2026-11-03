export type AnimalVoiceKind =
  | 'rabbit'
  | 'deer'
  | 'moose'
  | 'squirrel'
  | 'hedgehog'
  | 'beaver'
  | 'weasel'
  | 'fox'
  | 'wolf'
  | 'dog'
  | 'lynx'
  | 'bear'
  | 'hawk'
  | 'snake';
export type AnimalActivity = 'rest' | 'move' | 'eat' | 'alert' | 'young';
export interface AnimalVoiceCue {
  kind: AnimalVoiceKind;
  activity: AnimalActivity;
  volume: number;
  pan: number;
}
export type AnimalVoiceListener = (cue: AnimalVoiceCue) => void;
