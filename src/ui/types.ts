import type { WildlifeKind } from '../game/animals';
import type { ConversationTurn } from '../game/session/ForestConversation';
import type { DialogQuestion } from '../game/session/RabbitConversation';
import type { WebView } from '../game/session/SpiderEncounter';
import type { GeneticsView } from './presenters/GeneticsPresenter';
import type {
  FoodKind,
  KitData,
  MateCommand,
  MateMessage,
  PartnerTraits,
  SaveData,
  Season,
} from '../game/types';
import type { SaveSlotSummary } from '../game/SaveRepository';

export type UIAction = (action: string, value?: string | number) => void;
export type GameMenuPage = 'main' | 'settings' | 'new-game' | 'controls' | 'saves';
export interface PromptPart {
  key?: string;
  text: string;
}
export interface HudView {
  playerName?: string;
  familyCount?: number;
  lineageMembers?: { id: number; name: string; relationship: string; generation: number }[];
  airlift?: import('../game/session/HawkHunting').AirliftView;
  rabbitChase?: import('../game/session/RabbitReproductiveThreat').RabbitChaseView;
  web?: WebView;
  nearbyShelter?: { stash?: { items: number }; nest?: { occupied: boolean } };
  status: string;
  bars: { label: string; value: number; color: string; icon: string }[];
  temperature: number;
  inventory: { kind: FoodKind; label: string; emoji: string; count: number }[];
  carried: number;
  capacity: number;
  milk: number;
  materials: SaveData['materials'];
  mate?: { name: string };
  young: {
    id: number;
    name: string;
    progress: number;
    daysLeft: number;
    care: string;
    hunger: number;
  }[];
  familyText: string;
  grown: number;
  nests: number;
  birthWarning: boolean;
  pregnancyProgress?: number;
  worldInfo: string[];
  prompt: PromptPart[];
}

export type DialogViewModel = (
  | { type: 'help' }
  | { type: 'remove'; kind: 'stash' | 'nest'; items: number }
  | { type: 'self'; player: SaveData['player']; pregnant: boolean }
  | { type: 'mate'; partner: PartnerTraits; command: MateCommand; messages: MateMessage[] }
  | {
      type: 'partner';
      partner: PartnerTraits;
      score: number;
      line?: string;
      paired: boolean;
      question?: DialogQuestion;
    }
  | {
      type: 'kit';
      kit: KitData;
      line?: string;
      relationship?: string;
      succession?: import('../game/session/LineageSuccession').SuccessionOffer;
    }
  | {
      type: 'animal';
      id?: number;
      conversation?: ConversationTurn;
      kind: WildlifeKind;
      mood: string;
      health: number;
      maxHealth: number;
      trust: number;
      line?: string;
    }
  | {
      type: 'bag';
      inventory: SaveData['inventory'];
      materials: SaveData['materials'];
      stored: Partial<Record<FoodKind, number>>;
    }
) & { genetics?: GeneticsView };

export interface MapViewModel {
  size: number;
  colors: string[];
  landmarks: { x: number; z: number; label: string }[];
  openings: { x: number; z: number }[];
  player: { x: number; z: number };
}
export type { SaveSlotSummary };
export type JournalViewModel =
  { mode: 'journal'; save: SaveData; season: Season } | { mode: 'map'; map: MapViewModel };
export type OverlayViewModel =
  | { type: 'start'; hasSave: boolean }
  | { type: 'loading'; title: string }
  | { type: 'gameover'; day: number; births: number; grown: number };
