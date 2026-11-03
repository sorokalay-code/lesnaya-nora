export interface AttackCue {
  kind: string;
  phase: 'leap' | 'strike';
  x: number;
  y: number;
  z: number;
  time: number;
}
export type AttackListener = (event: AttackCue) => void;
export interface AttackSource {
  setAttackListener(listener?: AttackListener): void;
}
