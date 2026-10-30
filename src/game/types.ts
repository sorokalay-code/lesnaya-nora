export type Biome = 'forest' | 'meadow' | 'swamp' | 'garden';
export type FoodKind = 'clover' | 'carrot' | 'cabbage' | 'mushroom' | 'berries' | 'toadstool' | 'bitterleaf' | 'acorn';
export type PredatorKind = 'fox' | 'wolf' | 'dog';
export type Weather = 'clear' | 'rain' | 'mist' | 'snow';
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
  homeX: number;
  homeY: number;
  homeZ: number;
  alive: boolean;
  nestId?: number;
  command?: 'follow' | 'stay' | 'rest';
  stayX?: number;
  stayZ?: number;
  stayY?: number;
}

export interface NestData {
  id: number;
  x: number;
  y: number;
  z: number;
  quality: number;
}

export interface DigNode {x:number;y:number;z:number}
export interface StashData {id:number;x:number;y:number;z:number;food:Partial<Record<FoodKind,number>>}

export interface SaveData {
  version: 2;
  seed: number;
  clock: number;
  day: number;
  player: { x: number; y:number; z: number; genes: Genes; hunger: number; thirst: number; bodyTemp: number; energy: number; bladder: number; health: number; age: number; hidden: boolean; dirtiness: number; poison: number; milk: number };
  inventory: Record<FoodKind, number>;
  nests: NestData[];
  stashes: StashData[];
  materials: { grass: number; twigs: number; fur: number };
  excavation: DigNode[];
  gnawedRoots?: Record<string,number>;
  kits: KitData[];
  partners: PartnerTraits[];
  harvested: number[];
  pregnancy: { fatherId: number; progress: number } | null;
  stats: { births: number; grown: number; survived: number; generations: number };
  weather: Weather;
  messages: string[];
  waste: WasteData[];
}

export interface WasteData { id:number; kind:'pellets'|'urine'|'diarrhea'; x:number; y:number; z:number; age:number }

export const FOOD: Record<FoodKind, { label: string; nutrition: number; moisture:number; poisonRisk:number; emoji: string }> = {
  clover: { label: 'Клевер', nutrition: 16, moisture:7,poisonRisk:0,emoji: '☘' },
  carrot: { label: 'Морковь', nutrition: 28, moisture:12,poisonRisk:0,emoji: '🥕' },
  cabbage: { label: 'Капуста', nutrition: 26, moisture:17,poisonRisk:0.04,emoji: '🥬' },
  mushroom: { label: 'Грибы', nutrition: 10, moisture:3,poisonRisk:0.2,emoji: '🍄' },
  berries: { label: 'Ягоды', nutrition: 14, moisture:9,poisonRisk:0.08,emoji: '🫐' },
  toadstool:{label:'Мухомор',nutrition:4,moisture:2,poisonRisk:0.94,emoji:'🍄'},
  bitterleaf:{label:'Горькая трава',nutrition:5,moisture:4,poisonRisk:0.45,emoji:'🌿'},
  acorn:{label:'Жёлудь',nutrition:8,moisture:1,poisonRisk:0.3,emoji:'🌰'},
};

export const COAT_COLORS: Record<Genes['coat'], number> = {
  cream: 0xe7cfad,
  brown: 0x986a48,
  gray: 0x9eaaa7,
  black: 0x343b38,
  white: 0xf3ede2,
};
