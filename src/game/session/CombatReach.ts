import type { DigNode } from '../types';

interface Terrain {
  isSheltered: (x: number, y: number, z: number) => boolean;
}

/** Проверяет короткий отрезок удара, отделяя стены норы и склоны от правил урона. */
export class CombatReach {
  constructor(
    private readonly earth: Terrain,
    private readonly heightAt: (x: number, z: number) => number,
  ) {}

  clear(
    from: DigNode,
    target: { x: number; z: number; root: { position: { y: number } } },
  ): boolean {
    const targetY = target.root.position.y;
    const sheltered = this.earth.isSheltered(from.x, from.y, from.z);
    if (sheltered !== this.earth.isSheltered(target.x, targetY, target.z)) return false;

    // Шесть проб достаточно для короткого выпада; раздельные полости не соединяются ударом.
    for (let i = 1; i < 6; i++) {
      const fraction = i / 6;
      const x = from.x + (target.x - from.x) * fraction;
      const z = from.z + (target.z - from.z) * fraction;
      const y = from.y + (targetY - from.y) * fraction;
      if (sheltered ? !this.earth.isSheltered(x, y, z) : this.heightAt(x, z) > y + 0.5)
        return false;
    }
    return true;
  }
}
