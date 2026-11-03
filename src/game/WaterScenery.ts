import * as THREE from 'three';
import type { WaterBody, WaterMap } from './WaterMap';
import type { WorldChunks } from './WorldChunks';

interface Vertex {
  x: number;
  z: number;
  wet: number;
}

/** Рисует плоскую воду, обрезанную по треугольникам настоящего дна, и общие береговые детали. */
export class WaterScenery {
  constructor(
    map: WaterMap,
    heightAt: (x: number, z: number) => number,
    chunks: WorldChunks,
    vegetation = 1,
  ) {
    const material = new THREE.MeshStandardMaterial({
      color: 0x509e9a,
      roughness: 0.23,
      metalness: 0.12,
      transparent: true,
      opacity: 0.64,
      depthWrite: false,
    });
    const reeds = new THREE.MeshStandardMaterial({ color: 0x7d9754, roughness: 1 });
    const reedGeometry = new THREE.ConeGeometry(0.045, 0.85, 4);
    const padGeometry = new THREE.CircleGeometry(0.32, 8);
    padGeometry.rotateX(-Math.PI / 2);
    const padMaterial = new THREE.MeshStandardMaterial({ color: 0x669453, roughness: 0.9 });
    for (const body of map.bodies) {
      const geometry = WaterScenery.geometry(map, body, heightAt);
      const positions = geometry.getAttribute('position');
      const cells = new Map<string, number[]>();
      for (let i = 0; i < positions.count; i += 3) {
        const x = (positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2)) / 3;
        const z = (positions.getZ(i) + positions.getZ(i + 1) + positions.getZ(i + 2)) / 3;
        const key = Math.floor(x / 24) + ',' + Math.floor(z / 24);
        const values = cells.get(key) ?? [];
        for (let j = 0; j < 3; j++)
          values.push(positions.getX(i + j), positions.getY(i + j), positions.getZ(i + j));
        cells.set(key, values);
      }
      // Делим длинную реку по тем же чанкам, что и лес; невидимые участки не рисуются.
      for (const [key, values] of cells) {
        const [cx, cz] = key.split(',').map(Number);
        const part = new THREE.BufferGeometry();
        part.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
        part.computeVertexNormals();
        const water = new THREE.Mesh(part, material);
        water.name = 'water-surface';
        water.renderOrder = 1;
        chunks.add(water, cx * 24 + 12, cz * 24 + 12);
      }
      geometry.dispose();
      for (const point of body.points)
        for (let i = 0; i < Math.round(16 * vegetation); i++) {
          const angle = (i * Math.PI) / (8 * vegetation);
          const x = point.x + Math.cos(angle) * (body.radius + 0.45),
            z = point.z + Math.sin(angle) * (body.radius + 0.45);
          if (map.sample(x, z, heightAt(x, z))) continue;
          const reed = new THREE.Mesh(reedGeometry, reeds);
          reed.position.set(x, heightAt(x, z) + 0.38, z);
          reed.scale.y = 0.7 + (i % 4) * 0.2;
          chunks.add(reed, x, z);
        }
      for (let i = 0; i < Math.round(body.points.length * 4 * vegetation); i++) {
        const point = body.points[i % body.points.length],
          angle = i * 2.4;
        const x = point.x + Math.cos(angle) * body.radius * 0.65,
          z = point.z + Math.sin(angle) * body.radius * 0.65;
        if (!map.sample(x, z, heightAt(x, z))) continue;
        const pad = new THREE.Mesh(padGeometry, padMaterial);
        pad.position.set(x, body.level + 0.025, z);
        chunks.add(pad, x, z);
      }
    }
  }

  static geometry(
    map: WaterMap,
    body: WaterBody,
    heightAt: (x: number, z: number) => number,
  ): THREE.BufferGeometry {
    const vertices: number[] = [];
    const minX = Math.floor(Math.min(...body.points.map((p) => p.x)) - body.radius - 1);
    const maxX = Math.ceil(Math.max(...body.points.map((p) => p.x)) + body.radius + 1);
    const minZ = Math.floor(Math.min(...body.points.map((p) => p.z)) - body.radius - 1);
    const maxZ = Math.ceil(Math.max(...body.points.map((p) => p.z)) + body.radius + 1);
    const preceding = map.bodies.slice(0, map.bodies.indexOf(body));
    const vertex = (x: number, z: number): Vertex => {
      let wet = Math.min(body.level - heightAt(x, z), -map.distance(body, x, z));
      // Общая гладь в месте впадения: не накладываем два прозрачных меша друг на друга.
      for (const other of preceding) wet = Math.min(wet, map.distance(other, x, z));
      return { x, z, wet };
    };
    for (let x = minX; x < maxX; x++)
      for (let z = minZ; z < maxZ; z++) {
        const a = vertex(x, z),
          b = vertex(x + 1, z),
          c = vertex(x + 1, z + 1),
          d = vertex(x, z + 1);
        for (const triangle of [
          [a, c, b],
          [a, d, c],
        ]) {
          const polygon: Vertex[] = [];
          for (let i = 0; i < 3; i++) {
            const current = triangle[i],
              next = triangle[(i + 1) % 3];
            const currentWet = current.wet >= 0,
              nextWet = next.wet >= 0;
            if (currentWet) polygon.push(current);
            if (currentWet !== nextWet) {
              const t = current.wet / (current.wet - next.wet);
              polygon.push({
                x: current.x + (next.x - current.x) * t,
                z: current.z + (next.z - current.z) * t,
                wet: 0,
              });
            }
          }
          for (let i = 1; i < polygon.length - 1; i++)
            for (const p of [polygon[0], polygon[i], polygon[i + 1]])
              vertices.push(p.x, body.level + 0.012, p.z);
        }
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
}
