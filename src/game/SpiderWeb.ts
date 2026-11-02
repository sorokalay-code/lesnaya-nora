import * as THREE from 'three';

/** Лёгкая паутина из одного пакета линий повторяет рельеф у дерева. */
export class SpiderWeb {
  readonly mesh: THREE.LineSegments;
  readonly center: { x: number; y: number; z: number };
  readonly radius = 1.15;

  constructor(x: number, z: number, heightAt: (x: number, z: number) => number) {
    this.center = { x, y: heightAt(x, z), z };
    const vertices: number[] = [];
    const point = (angle: number, radius: number) => {
      const px = x + Math.cos(angle) * radius,
        pz = z + Math.sin(angle) * radius;
      return [px, heightAt(px, pz) + 0.065, pz];
    };
    for (let ring = 1; ring <= 4; ring++)
      for (let segment = 0; segment < 20; segment++)
        vertices.push(
          ...point((segment / 20) * Math.PI * 2, (ring / 4) * this.radius),
          ...point(((segment + 1) / 20) * Math.PI * 2, (ring / 4) * this.radius),
        );
    for (let ray = 0; ray < 10; ray++)
      vertices.push(
        ...point((ray / 10) * Math.PI * 2, 0.04),
        ...point((ray / 10) * Math.PI * 2, this.radius),
      );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeBoundingSphere();
    this.mesh = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: 0xe8e7d1,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    );
    this.mesh.name = 'spider-web';
  }
}
