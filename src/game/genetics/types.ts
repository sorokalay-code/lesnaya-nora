export interface Anatomy {
  legs: number;
  ears: number;
  eyes: number;
  fangs: boolean;
}

export interface Ancestor {
  id: string;
  name: string;
  generation: number;
  distance: number;
}

export interface Lineage {
  id: string;
  generation: number;
  ancestors: Ancestor[];
}
