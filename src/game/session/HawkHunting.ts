import type { Hawk } from '../animals';
import { animateHawk } from '../Models';
import type { World } from '../World';
import type { Excavation } from '../Excavation';
import { HawkCarry, type CarryPhase } from '../animals/HawkCarry';
import { AnimalRestraint } from '../animals/AnimalRestraint';
import { HawkVictims, type HawkPopulation, type HawkVictim } from './HawkVictims';

export interface AirliftView {
  phase: CarryPhase;
  height: number;
}
interface Context extends HawkPopulation {
  world: Pick<World, 'heightAt' | 'hasCover'>;
  earth: Pick<Excavation, 'isSheltered' | 'floorAt'>;
  resetInput?: () => void;
  canGrabPlayer?: () => boolean;
  toast: (text: string) => void;
  impactSound?: () => void;
}
interface Hunt {
  victim: HawkVictim;
  carry?: HawkCarry;
  phase?: CarryPhase;
}

/** Координирует соколов и реальные жертвы: во время захвата автономный ИИ и управление не двигают добычу. */
export class HawkHunting {
  private readonly sources: HawkVictims;
  private readonly hunts = new Map<Hawk, Hunt>();
  private readonly searches = new WeakMap<Hawk, number>();

  constructor(private readonly context: Context) {
    this.sources = new HawkVictims(context);
  }

  get busy(): boolean {
    return [...this.hunts.values()].some((hunt) => !!hunt.carry);
  }

  get playerView(): AirliftView | undefined {
    for (const hunt of this.hunts.values())
      if (hunt.carry && hunt.victim.player)
        return {
          phase: hunt.phase ?? 'lift',
          height: Math.max(
            0,
            this.context.save.player.y -
              this.context.world.heightAt(this.context.save.player.x, this.context.save.player.z),
          ),
        };
  }

  update(dt: number, time: number, combat: boolean): void {
    for (const hawk of this.context.hawks) {
      let hunt = this.hunts.get(hawk);
      if (hunt?.carry) {
        if (!hunt.victim.alive()) {
          this.release(hawk, hunt);
          continue;
        }
        if (!hawk.alive && hunt.phase !== 'fall')
          hunt.carry.dropFrom({
            x: hunt.victim.root.position.x,
            y: Number(hunt.victim.root.userData.baseY ?? hunt.victim.root.position.y),
            z: hunt.victim.root.position.z,
          });
        if (!combat) continue;
        const step = hunt.carry.update(dt, (x, z) =>
          this.context.earth.floorAt(x, z, this.context.world.heightAt(x, z)),
        );
        hunt.phase = step.phase;
        hunt.victim.move(step.x, step.y, step.z);
        if (hawk.alive) hawk.moveTo(step.bird.x, step.bird.z, step.bird.y);
        else {
          hawk.root.visible = false;
          hawk.shadow.visible = false;
        }
        hunt.victim.root.rotation.y = hawk.root.rotation.y;
        hawk.shadow.position.set(
          hawk.x,
          this.context.world.heightAt(hawk.x, hawk.z) + 0.04,
          hawk.z,
        );
        animateHawk(hawk.root, true, dt, step.phase === 'carry');
        if (step.landed) {
          hunt.victim.hurt(Math.min(65, Math.max(0, step.fallHeight - 1.2) * 5.5) * 0.8);
          if (hunt.victim.player) this.context.impactSound?.();
          this.context.toast(
            hunt.victim.player
              ? 'Сокол бросил тебя! Падение отняло здоровье. Ищи укрытие.'
              : hunt.victim.alive()
                ? 'Сокол бросил добычу с высоты.'
                : hunt.victim.name + ' не пережил падение.',
          );
          this.release(hawk, hunt);
        }
        continue;
      }
      if (!hawk.alive) continue;
      if (!combat) {
        hawk.update(dt, time, 0, 0, false, (x, z) => this.context.world.heightAt(x, z));
        continue;
      }
      if (
        hunt &&
        (!this.available(hunt.victim) ||
          (!hawk.isDiving(time) &&
            Math.hypot(hunt.victim.root.position.x - hawk.x, hunt.victim.root.position.z - hawk.z) >
              22))
      ) {
        this.hunts.delete(hawk);
        hunt = undefined;
      }
      if (!hunt && time >= (this.searches.get(hawk) ?? 0)) {
        this.searches.set(hawk, time + 0.6);
        let victim: HawkVictim | undefined,
          best = Infinity;
        for (const candidate of this.sources.all()) {
          const distance = Math.hypot(
            candidate.root.position.x - hawk.x,
            candidate.root.position.z - hawk.z,
          );
          if (distance < 18 && distance < best && this.available(candidate)) {
            victim = candidate;
            best = distance;
          }
        }
        if (victim) {
          hunt = { victim };
          this.hunts.set(hawk, hunt);
        }
      }
      const target = hunt?.victim.root.position;
      const grabbed = hawk.update(dt, time, target?.x ?? 0, target?.z ?? 0, !!target, (x, z) =>
        this.context.world.heightAt(x, z),
      );
      if (grabbed && hunt && this.available(hunt.victim)) {
        const start = {
          x: hunt.victim.root.position.x,
          y:
            Number(hunt.victim.root.userData.baseY ?? hunt.victim.root.position.y) +
            Number(hunt.victim.root.userData.jumpHeight ?? 0),
          z: hunt.victim.root.position.z,
        };
        AnimalRestraint.hold(hunt.victim.root);
        hunt.carry = new HawkCarry(start, hawk.root.rotation.y, hunt.victim.bodyHeight);
        if (hunt.victim.player) this.context.resetInput?.();
        this.context.toast(
          hunt.victim.player
            ? 'Сокол схватил тебя и поднимает в воздух! Действовать нельзя.'
            : 'Сокол схватил маленькое животное.',
        );
      }
    }
  }

  private available(victim: HawkVictim): boolean {
    const p = victim.root.position;
    return (
      victim.alive() &&
      !AnimalRestraint.active(victim.root) &&
      !victim.root.userData.conversing &&
      (!victim.player || (this.context.canGrabPlayer?.() ?? true)) &&
      !this.context.earth.isSheltered(p.x, p.y, p.z) &&
      !this.context.world.hasCover(p.x, p.z) &&
      Math.abs(p.y - this.context.world.heightAt(p.x, p.z)) < 1.2
    );
  }

  private release(hawk: Hawk, hunt: Hunt): void {
    const p = hunt.victim.root.position;
    hunt.victim.move(
      p.x,
      this.context.earth.floorAt(p.x, p.z, this.context.world.heightAt(p.x, p.z)),
      p.z,
    );
    AnimalRestraint.release(hunt.victim.root);
    if (!hunt.victim.alive()) hunt.victim.root.visible = false;
    if (hunt.victim.player) this.context.resetInput?.();
    this.hunts.delete(hawk);
  }
}
