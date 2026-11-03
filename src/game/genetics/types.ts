export interface Anatomy {
  legs: number;
  ears: number;
  eyes: number;
  fangs: boolean;
}

export interface RabbitShape {
  earWidth: number;
  earBend: number;
  legLength: number;
  bodyWidth: number;
  bodyLength: number;
  headSize: number;
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
