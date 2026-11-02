import { Soundscape } from '../Audio';
import { Excavation } from '../Excavation';
import { World } from '../World';
import { Predator } from '../animals';
import { WasteSystem } from '../systems';
import { type SaveData } from '../types';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

interface Context {
  save: SaveData;
  world: World;
  earth: Excavation;
  waste: WasteSystem;
  sound: Soundscape;
  toast: (message: string) => void;
}

/** Применяет урон от хищников и последствия отходов для крольчихи и наземных гнёзд. */
export class PlayerConsequences {
  constructor(private readonly context: Context) {}

  predatorAttack(kind: string): void {
    const p = this.context.save.player;
    p.health = clamp(
      p.health -
        (kind === 'hawk'
          ? 32
          : kind === 'wolf'
            ? 23
            : kind === 'lynx'
              ? 21
              : kind === 'weasel'
                ? 11
                : kind === 'bear'
                  ? 34
                  : kind === 'snake'
                    ? 8
                    : 15) *
          0.8,
      0,
      100,
    );
    if (kind === 'snake') p.poison = clamp(p.poison + 18, 0, 100);

    p.energy = clamp(p.energy - 13, 0, 100);
    this.context.sound.play('danger');
    this.context.toast(
      `${kind === 'hawk' ? 'Сокол' : kind === 'wolf' ? 'Волк' : kind === 'dog' ? 'Сторожевой пёс' : kind === 'lynx' ? 'Рысь' : kind === 'weasel' ? 'Ласка' : kind === 'bear' ? 'Медведь' : kind === 'snake' ? 'Змея' : 'Лиса'} напал! Беги под деревья или в выкопанный ход.`,
    );
  }

  threatenKits(predator: Predator): void {
    if (predator.attackCooldown > 0) return;

    for (const nest of this.context.save.nests.filter(
      (n) => !this.context.earth.isSheltered(n.x, n.y, n.z),
    )) {
      if (Math.hypot(predator.x - nest.x, predator.z - nest.z) > 2) continue;

      const kit = this.context.save.kits.find(
        (k) => k.alive && k.age < 3 && k.command !== 'follow' && k.nestId === nest.id,
      );
      if (!kit) continue;

      kit.health = clamp(kit.health - 24 * 0.8, 0, 100);
      predator.attackCooldown = 9;
      this.context.sound.play('danger');
      this.context.toast(`Хищник нашёл наземное гнездо! ${kit.name} в опасности.`);
      return;
    }
  }

  makeWaste(kind: 'pellets' | 'urine' | 'diarrhea'): void {
    const x = this.context.save.player.x,
      z = this.context.save.player.z,
      y = this.sheltered ? this.context.save.player.y : this.context.world.heightAt(x, z);
    this.context.waste.spawn(kind, x, y, z);
    this.context.save.player.dirtiness = clamp(
      this.context.save.player.dirtiness + (kind === 'diarrhea' ? 18 : kind === 'urine' ? 8 : 3),
      0,
      100,
    );
  }

  private get sheltered(): boolean {
    return (
      !!this.context.earth &&
      this.context.earth.isSheltered(
        this.context.save.player.x,
        this.context.save.player.y,
        this.context.save.player.z,
      )
    );
  }
}
