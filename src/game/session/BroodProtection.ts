import { BroodDefense, type BroodDefenseKind, type BroodGuard } from '../BroodDefense';
import type { Animal } from '../animals/Animal';
import { AnimalRestraint } from '../animals/AnimalRestraint';
import { FRIENDSHIP_TRUST } from '../Friendship';
import type { AttackListener } from '../audio/AttackCue';
import type { DigNode } from '../types';
import type { WildlifeEcology } from '../WildlifeEcology';
import type { RaptorPopulation } from './RaptorPopulation';

interface Context {
  ecology: WildlifeEcology;
  raptors?: RaptorPopulation;
  toast: (message: string) => void;
  attackSound?: AttackListener;
}

const WARNINGS = {
  bear: 'Медведица охраняет медвежат. Отойди от выводка!',
  fox: 'Лиса охраняет лисят. Отойди от норы!',
  hawk: 'Сокол тревожно кричит. Отойди от гнезда!',
  owl: 'Сова охраняет гнездо. Отойди!',
};

/** Выдаёт охраняющим родителям команды и сбрасывает их при прекращении угрозы. */
export class BroodProtection {
  private readonly defense = new BroodDefense();
  private ordered = new Set<Animal>();
  private previous = new Set<Animal>();

  constructor(private readonly context: Context) {}

  update(player: DigNode, exposed: boolean, time: number): void {
    const previous = this.ordered;
    this.ordered = this.previous;
    this.previous = previous;
    this.ordered.clear();
    const { ecology, raptors } = this.context;
    for (const guard of ecology.bearBroodGuards?.(player) ?? []) {
      if (guard.actor.trust >= FRIENDSHIP_TRUST && !guard.actor.hostile) continue;
      this.order('bear', guard, player, exposed, time);
      if (guard.actor.broodDefense?.phase === 'warning') guard.actor.greet(player, time);
    }
    for (const guard of ecology.foxBroodGuards?.(player) ?? [])
      this.order('fox', guard, player, exposed, time);
    for (const guard of raptors?.broodGuards?.() ?? [])
      this.order(guard.actor.kind, guard, player, exposed, time);

    for (const actor of previous) {
      if (this.ordered.has(actor)) continue;
      actor.broodDefense = undefined;
      this.defense.clear(actor);
    }
  }

  private order(
    kind: BroodDefenseKind,
    guard: BroodGuard<Animal>,
    player: DigNode,
    exposed: boolean,
    time: number,
  ): void {
    const { actor } = guard;
    const visible =
      exposed && !AnimalRestraint.active(actor.root) && actor.root.userData.conversing !== true;
    actor.broodDefense = this.defense.update(
      kind,
      guard,
      visible ? player : undefined,
      time,
      () => {
        this.context.toast(WARNINGS[kind]);
        const { x, y, z } = actor.root.position;
        this.context.attackSound?.({ kind, phase: 'warning', x, y, z, time });
      },
    );
    if (actor.broodDefense) this.ordered.add(actor);
  }
}
