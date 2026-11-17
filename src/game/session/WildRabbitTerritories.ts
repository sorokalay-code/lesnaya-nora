import type { AnimalHabitats, Habitat } from '../AnimalHabitats';
import type { RabbitActor } from '../animals';
import { AnimalRestraint } from '../animals/AnimalRestraint';
import type { Excavation } from '../Excavation';
import { animateRabbit } from '../Models';
import { adultRabbit } from '../RabbitSex';
import type { SaveData } from '../types';
import { WildlifeRoutine } from '../WildlifeRoutine';
import type { WildlifeShelters } from '../WildlifeShelters';
import type { World } from '../World';

/** Ведёт кормовые выходы и норы соседских кроликов, включая дом потомства до взросления. */
export class WildRabbitTerritories {
  private readonly residents = new WeakMap<
    RabbitActor,
    { id: number; home: Habitat; routine: WildlifeRoutine }
  >();

  constructor(
    private readonly save: SaveData,
    private readonly habitats: AnimalHabitats,
    private readonly shelters: WildlifeShelters,
    private readonly world: Pick<World, 'heightAt'>,
  ) {}

  update(
    actor: RabbitActor,
    dt: number,
    time: number,
    earth: Excavation,
    hunting: boolean,
  ): boolean {
    if (!actor.alive || actor.data.lost || actor.data.id === this.save.mateId) return false;
    if (
      AnimalRestraint.active(actor.root) ||
      actor.root.userData.conversing === true ||
      earth.isSheltered(actor.x, actor.root.position.y, actor.z)
    )
      return false;

    const resident = this.resident(actor);
    if (!resident) return false;
    const { home, routine } = resident;
    const { destination, resting } = this.habitats.intent(home, this.save.clock);
    const nest = routine.shelter?.entrance ?? home;
    const newborn = (actor.data.age ?? 3) < 0.45;
    const nestTime = !hunting && (newborn || resting);
    const action = routine.update(
      actor.root.position,
      time,
      nestTime ? nest : undefined,
      undefined,
      false,
    );
    if (action?.kind === 'enter' || action?.kind === 'emerge') {
      actor.moveTo(action.at.x, action.at.z, action.at.y);
      actor.data.inWildBurrow = action.kind === 'enter' ? true : undefined;
      if (action.kind === 'emerge') actor.root.rotation.y = action.heading;
      return true;
    }
    if (action?.kind === 'hidden' || action?.kind === 'rest') {
      animateRabbit(actor.rig, time + actor.data.id, false, false, dt);
      return true;
    }
    if (hunting && !action) return false;

    const moveTo =
      action?.kind === 'move'
        ? action.target
        : adultRabbit(actor.data)
          ? destination
          : (routine.shelter?.approach ?? home);
    const { x, z } = moveTo;
    const groundAt = (px: number, pz: number) => this.world.heightAt(px, pz);
    actor.navigateMate(
      dt,
      time,
      { x, y: groundAt(x, z), z },
      earth,
      groundAt,
      newborn ? 0.45 : 1.6,
      0.16,
    );
    return true;
  }

  capture(): void {
    const used = new Set<number>();
    for (const partner of this.save.partners) {
      if ((partner.health ?? 100) <= 0 || partner.lost) continue;
      if (partner.wildBurrowId !== undefined) used.add(partner.wildBurrowId);
    }
    this.shelters.pruneRabbitSites(used);
  }

  private resident(actor: RabbitActor) {
    const { data } = actor;
    const id = adultRabbit(data) ? data.id : (data.wildBurrowId ?? data.wildParentId ?? data.id);
    const existing = this.residents.get(actor);
    if (existing?.id === id) return existing;
    const parent = this.save.partners.find((partner) => partner.id === id);
    const saved = this.shelters.get('rabbit', id);
    const home = this.habitats.rabbit(id, saved?.site ?? parent ?? actor);
    if (!home) return;

    const shelter = this.shelters.place('rabbit', id, home);
    const routine = new WildlifeRoutine(shelter, this.shelters.routeHeight);
    if (data.inWildBurrow && existing && existing.id !== id) {
      // Подросший кролик сначала выходит из родительского устья.
      data.inWildBurrow = undefined;
      const approach = existing.routine.shelter?.approach;
      if (approach) actor.moveTo(approach.x, approach.z, approach.y);
    }
    if (data.inWildBurrow) {
      const at = routine.restore();
      data.inWildBurrow = at ? true : undefined;
      if (at) actor.moveTo(at.x, at.z, at.y);
    }
    data.wildBurrowId = id;
    actor.wildShelter = shelter;
    const entry = { id, home, routine };
    this.residents.set(actor, entry);
    return entry;
  }
}
