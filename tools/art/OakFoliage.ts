import { Random } from '../../src/game/Random';

export const OAK_FOLIAGE_SIZE = 128;

type RGB = readonly [number, number, number];

export function oakFoliagePixels(): Buffer {
  const side = OAK_FOLIAGE_SIZE;
  const pixels = Buffer.alloc(side * side * 4);
  const rng = new Random(372);

  function leaf(cx: number, cy: number, angle: number, length: number, shade: number): void {
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const half = length / 2;
    for (let y = Math.max(2, Math.floor(cy - half)); y <= Math.min(side - 3, cy + half); y++) {
      for (let x = Math.max(2, Math.floor(cx - half)); x <= Math.min(side - 3, cx + half); x++) {
        const dx = x - cx;
        const dy = y - cy;
        const along = (dx * cos + dy * sin) / half;
        const across = (dy * cos - dx * sin) / half;
        if (Math.abs(along) >= 1) continue;

        const lobes = 0.43 + 0.13 * Math.cos((along + 0.08) * Math.PI * 4.5);
        const width = lobes * Math.sqrt(1 - along ** 2);
        if (Math.abs(across) > width) continue;

        const vein = Math.abs(across) < 0.028 ? 28 : 0;
        const light = Math.round(shade + across * 20 + vein);
        const color: RGB = [light, Math.min(255, light + 12), light - 12];
        pixels.set([...color, 255], (y * side + x) * 4);
      }
    }
  }

  for (let branch = 0; branch < 8; branch++) {
    const angle = branch * 2.399;
    for (let pair = 0; pair < 4; pair++) {
      const distance = 11 + pair * 10;
      for (const side of [-1, 1]) {
        const direction = angle + side * rng.range(0.26, 0.85);
        leaf(
          64 + Math.cos(angle) * distance + Math.cos(direction) * 7,
          64 + Math.sin(angle) * distance + Math.sin(direction) * 7,
          direction,
          rng.range(16, 26),
          rng.int(153, 223),
        );
      }
    }
  }
  return pixels;
}
