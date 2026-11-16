export type AnimalVoiceKind =
  | 'rabbit'
  | 'deer'
  | 'roe-deer'
  | 'moose'
  | 'boar'
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
  | 'owl'
  | 'badger'
  | 'mole'
  | 'marmot'
  | 'pheasant'
  | 'chipmunk'
  | 'snake';
export type AnimalActivity = 'rest' | 'move' | 'eat' | 'alert' | 'young';
export interface AnimalVoiceCue {
  kind: AnimalVoiceKind;
  activity: AnimalActivity;
  volume: number;
  pan: number;
}
export type AnimalVoiceListener = (cue: AnimalVoiceCue) => void;
