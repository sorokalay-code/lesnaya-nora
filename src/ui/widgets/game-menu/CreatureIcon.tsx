import type { CreatureKind } from '../../../game/WorldConfig';

const ICONS: Record<CreatureKind, string> = {
  rabbit: '🐇',
  deer: '🦌',
  'roe-deer': '🦌',
  moose: '🫎',
  squirrel: '🐿️',
  chipmunk: '🐿️',
  hedgehog: '🦔',
  duck: '🦆',
  mouse: '🐁',
  fish: '🐟',
  frog: '🐸',
  beaver: '🦫',
  boar: '🐗',
  badger: '🦡',
  mole: '🐾',
  marmot: '🦫',
  pheasant: '🐦',
  fox: '🦊',
  wolf: '🐺',
  dog: '🐕',
  lynx: '🐈',
  weasel: '🦦',
  bear: '🐻',
  snake: '🐍',
  spider: '🕷️',
  'jumping-spider': '🕷️',
  hawk: '🦅',
  owl: '🦉',
  pike: '🐠',
  butterfly: '🦋',
};

export function CreatureIcon({ kind }: { kind: CreatureKind }) {
  return (
    <span className="creature-icon" aria-hidden="true">
      {ICONS[kind]}
    </span>
  );
}
