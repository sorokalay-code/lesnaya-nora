import type { DigNode, SaveData } from './types';
import type { Season } from './types';

export const SMALL_FAUNA_KINDS = ['spider', 'jumping-spider', 'snake'] as const;
export type SmallFaunaKind = (typeof SMALL_FAUNA_KINDS)[number];

export interface SmallFaunaCohort {
  kind: SmallFaunaKind;
  slot: number;
  parent: string;
  home: DigNode;
  conceivedAt: number;
  dueAt: number;
  matureAt: number;
  remaining: number;
  nextRecruitAt: number;
  nextBreedAt: number;
}

const DAY = 1440;

export const SMALL_FAUNA = {
  spider: { incubation: DAY, growth: 2 * DAY, offspring: 12, breedInterval: 8 * DAY },
  'jumping-spider': { incubation: DAY, growth: 2 * DAY, offspring: 8, breedInterval: 8 * DAY },
  snake: { incubation: 2 * DAY, growth: 3 * DAY, offspring: 3, breedInterval: 12 * DAY },
} as const;

export function smallFaunaStage(cohort: SmallFaunaCohort, clock: number) {
  if (!cohort.remaining) return 'spent';
  if (clock < cohort.dueAt) return cohort.kind === 'snake' ? 'gestation' : 'cocoon';
  return clock < cohort.matureAt ? 'dispersing' : 'mature';
}

/** Ведёт сроки коконов и живорождения, резервирует молодняк для свободных участков. */
export class SmallFaunaCohorts {
  readonly records: SmallFaunaCohort[];

  constructor(private readonly save: SaveData) {
    this.records = save.smallFaunaCohorts ??= [];
  }

  breed(kind: SmallFaunaKind, slot: number, parent: string, home: DigNode, season: Season): void {
    const { clock } = this.save;
    if (kind === 'snake' ? season !== 'Лето' : season !== 'Весна' && season !== 'Лето') return;
    const previous = this.records.findIndex(
      (cohort) => cohort.kind === kind && cohort.slot === slot,
    );
    const existing = this.records[previous];
    if (existing && (existing.remaining || clock < existing.nextBreedAt)) return;
    const profile = SMALL_FAUNA[kind];
    const dueAt = clock + profile.incubation;
    const cohort: SmallFaunaCohort = {
      kind,
      slot,
      parent,
      home: { ...home },
      conceivedAt: clock,
      dueAt,
      matureAt: dueAt + profile.growth,
      remaining: profile.offspring,
      nextRecruitAt: dueAt + profile.growth,
      nextBreedAt: clock + profile.breedInterval,
    };
    if (existing) this.records[previous] = cohort;
    else this.records.push(cohort);
  }

  advance(
    season: Season,
    parentAlive: (parent: string) => boolean,
    recruit: (cohort: SmallFaunaCohort) => boolean,
  ): void {
    const { clock } = this.save;
    for (const cohort of this.records) {
      if (clock < cohort.dueAt && !parentAlive(cohort.parent)) cohort.remaining = 0;
      if (!cohort.remaining || clock < cohort.matureAt || season === 'Зима') continue;
      if (clock >= cohort.nextRecruitAt && recruit(cohort)) {
        cohort.remaining--;
        cohort.nextRecruitAt = clock + DAY;
      }
      // Расселяющаяся группа не занимает сцену бессрочно при заполненных взрослых участках.
      if (clock > cohort.matureAt + 2 * DAY) cohort.remaining = 0;
    }
  }

  reserves(kind: SmallFaunaKind): boolean {
    return this.records.some((cohort) => cohort.kind === kind && cohort.remaining > 0);
  }
}
