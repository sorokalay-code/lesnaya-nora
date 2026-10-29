export type Biome = 'forest' | 'meadow' | 'swamp' | 'garden';
export type FoodKind = 'clover' | 'carrot' | 'cabbage' | 'mushroom' | 'berries';
export type PredatorKind = 'fox' | 'wolf' | 'dog';
export type Weather = 'clear' | 'rain' | 'mist';
export type Season = 'Весна' | 'Лето' | 'Осень' | 'Зима';

export interface Genes {
  coat: 'cream' | 'brown' | 'gray' | 'black' | 'white';
  ear: number;
  speed: number;
  vitality: number;
  size: number;
}

export interface PartnerTraits {
  name: string;
  id: number;
  x: number;
  z: number;
  genes: Genes;
  preference: 'speed' | 'vitality' | 'rare-coat' | 'bond';
  temperament: 'смелый' | 'заботливый' | 'осторожный' | 'любопытный';
  trust: number;
  familySize: number;
}

export interface KitData {
  id: number;
  name: string;
  genes: Genes;
  age: number;
  hunger: number;
  health: number;
  father: string;
  burrowId: number;
  alive: boolean;
}

export interface BurrowData {
  id: number;
  x: number;
  z: number;
  depth: number;
  stores: number;
  bedding: number;
  isHome: boolean;
}

export interface SaveData {
  version: 1;
  seed: number;
  clock: number;
  day: number;
  player: { x: number; z: number; genes: Genes; hunger: number; energy: number; bladder: number; health: number; age: number; hidden: boolean };
  inventory: Record<FoodKind, number>;
  burrows: BurrowData[];
  kits: KitData[];
  partners: PartnerTraits[];
  harvested: number[];
  pregnancy: { fatherId: number; progress: number } | null;
  stats: { births: number; grown: number; survived: number; generations: number };
  weather: Weather;
  messages: string[];
}

export const FOOD: Record<FoodKind, { label: string; nutrition: number; emoji: string }> = {
  clover: { label: 'Клевер', nutrition: 16, emoji: '☘' },
  carrot: { label: 'Морковь', nutrition: 28, emoji: '🥕' },
  cabbage: { label: 'Капуста', nutrition: 26, emoji: '🥬' },
  mushroom: { label: 'Грибы', nutrition: 10, emoji: '🍄' },
  berries: { label: 'Ягоды', nutrition: 14, emoji: '🫐' },
};

export const COAT_COLORS: Record<Genes['coat'], number> = {
  cream: 0xe7cfad,
  brown: 0x986a48,
  gray: 0x9eaaa7,
  black: 0x343b38,
  white: 0xf3ede2,
};
