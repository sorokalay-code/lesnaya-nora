import * as THREE from 'three';

export type WebAnchor = { x: number; z: number };
type Point = WebAnchor & { y: number };

/** Почти прозрачная вертикальная сеть между стволами; захват проверяет пересечение плоскости телом. */
export class SpiderWeb {
  readonly mesh: THREE.LineSegments;
  readonly center: Point;
  readonly halfWidth: number;
  private readonly tangent: { x: number; z: number };

  constructor(a: WebAnchor, b: WebAnchor, heightAt: (x: number, z: number) => number) {
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    this.halfWidth = length / 2;
    this.tangent = { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
    this.center = {
      x: (a.x + b.x) / 2,
      z: (a.z + b.z) / 2,
      y: heightAt((a.x + b.x) / 2, (a.z + b.z) / 2) + 1.25,
    };
    const vertices: number[] = [];
    const point = (angle: number, scale: number) => [
      this.center.x + this.tangent.x * Math.cos(angle) * this.halfWidth * scale,
      this.center.y + Math.sin(angle) * 1.2 * scale,
      this.center.z + this.tangent.z * Math.cos(angle) * this.halfWidth * scale,
    ];
    for (let ring = 1; ring <= 4; ring++)
      for (let segment = 0; segment < 16; segment++)
        vertices.push(
          ...point((segment / 16) * Math.PI * 2, ring / 4),
          ...point(((segment + 1) / 16) * Math.PI * 2, ring / 4),
        );
    for (let ray = 0; ray < 8; ray++)
      vertices.push(...point((ray / 8) * Math.PI * 2, 0), ...point((ray / 8) * Math.PI * 2, 1));
    // Крепления к реальным стволам учитывают перепад высоты между деревьями.
    for (const anchor of [a, b])
      for (const height of [0.15, 2.8])
        vertices.push(
          anchor.x,
          heightAt(anchor.x, anchor.z) + height,
          anchor.z,
          ...point(anchor === a ? Math.PI : 0, 1),
        );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeBoundingSphere();
    this.mesh = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: 0xdce4d8,
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
      }),
    );
    this.mesh.name = 'spider-web';
  }

  intersects(from: Point, to: Point): boolean {
    const signed = (p: Point) =>
      (p.x - this.center.x) * -this.tangent.z + (p.z - this.center.z) * this.tangent.x;
    const first = signed(from),
      last = signed(to);
    if (first * last > 0 && Math.min(Math.abs(first), Math.abs(last)) > 0.45) return false;
    const fraction =
      first * last <= 0 && Math.abs(first - last) > 0.001 ? first / (first - last) : 1;
    const x = from.x + (to.x - from.x) * fraction - this.center.x;
    const z = from.z + (to.z - from.z) * fraction - this.center.z;
    const y = from.y + (to.y - from.y) * fraction + 0.5 - this.center.y;
    const horizontal = x * this.tangent.x + z * this.tangent.z;
    return Math.abs(horizontal) < this.halfWidth - 0.15 && Math.abs(y) < 1.45;
  }
}
