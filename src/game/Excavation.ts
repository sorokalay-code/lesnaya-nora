import { playableWorldLimit } from './WorldConfig';
import * as THREE from 'three';
import { CaveMesher } from './CaveMesher';
import type { DigNode, SaveData } from './types';
import type { World } from './World';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const distance2 = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);
export type DigPreview = { node: DigNode; point: THREE.Vector3; valid: boolean; reason: string };

/** Хранит выкопанные участки единого мира, проверяет копание и навигацию по ходам. */

export class Excavation {
  readonly maxDepth = 50;
  readonly group = new THREE.Group();
  readonly openings: DigNode[] = [];

  private readonly mesher: CaveMesher;
  private edges: Array<[DigNode, DigNode]> = [];
  private neighbors = new Map<DigNode, DigNode[]>();
  private roamingRevision = -1;
  private readonly roamingAreas = new Map<DigNode, readonly DigNode[]>();
  private roots: Array<{ node: DigNode; mesh: THREE.Mesh }> = [];
  private lastRootRefresh = 0;
  private light = new THREE.PointLight(0xffe3b6, 4.5, 12);
  private marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 10, 8),
    new THREE.MeshBasicMaterial({
      color: 0xffd78c,
      transparent: true,
      opacity: 0.72,
      depthTest: false,
    }),
  );

  constructor(
    scene: THREE.Scene,
    private readonly world: World,
    private readonly save: SaveData,
  ) {
    this.mesher = new CaveMesher(scene, (x, z) => world.heightAt(x, z));
    scene.add(this.group);
    this.group.add(this.light, this.marker);
    this.marker.visible = false;
    for (const node of save.excavation) this.addGeometry(node);
  }

  private snap(v: number): number {
    return Math.round(v / 2) * 2;
  }

  get revision(): number {
    return this.save.excavation.length;
  }

  /** Пол всей связной подземной области; наружные участки и другие несвязанные раскопы исключены. */
  roamingFloors(from: DigNode): readonly DigNode[] {
    if (!this.isSheltered(from.x, from.y, from.z)) return [];
    const anchor = this.nearestNode(from.x, from.y, from.z);
    if (!anchor) return [];
    if (this.roamingRevision !== this.revision) {
      this.roamingRevision = this.revision;
      this.roamingAreas.clear();
    }
    const cached = this.roamingAreas.get(anchor);
    if (cached) return cached;

    const queue = [anchor],
      visited = new Set([anchor]),
      floors: DigNode[] = [];
    for (let i = 0; i < queue.length; i++) {
      const node = queue[i],
        floor = { x: node.x, y: node.y - 0.95, z: node.z };
      if (!this.isSheltered(floor.x, floor.y, floor.z)) continue;
      floors.push(floor);
      for (const next of this.neighbors.get(node) ?? []) {
        if (visited.has(next)) continue;
        const y = next.y - 0.95;
        if (!this.isSheltered(next.x, y, next.z)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    for (const node of visited) this.roamingAreas.set(node, floors);
    return floors;
  }

  private depth(node: DigNode): number {
    return this.world.heightAt(node.x, node.z) - (node.y - 0.95);
  }

  depthAt(x: number, y: number, z: number): number {
    return Math.max(0, this.world.heightAt(x, z) - y);
  }

  isSheltered(x: number, y: number, z: number): boolean {
    return this.depthAt(x, y, z) > 0.18 && this.distanceToTunnel(x, y, z) < 1.7;
  }

  contains(point: THREE.Vector3): boolean {
    const floor = this.floorAt(point.x, point.z, point.y);
    return (
      this.distanceToTunnel(point.x, point.y, point.z) < 1.5 &&
      point.y >= floor + 0.15 &&
      point.y <= floor + 2.2
    );
  }

  canMoveTo(x: number, z: number, y: number, inside: boolean): boolean {
    if (!inside || this.distanceToTunnel(x, y, z) < 1.7) return true;

    return this.openings.some((o) => distance2(o, { x, z }) < 1.7);
  }

  nearOpening(x: number, z: number, radius = 1.5): boolean {
    return this.openings.some((o) => distance2(o, { x, z }) < radius);
  }

  /** Строит целый маршрут: выбранный выход и порядок камер не меняются посередине прохода. */
  route(from: DigNode, to: DigNode): DigNode[] {
    const fromInside = this.isSheltered(from.x, from.y, from.z);
    const toInside = this.isSheltered(to.x, to.y, to.z);
    if (!fromInside && !toInside) return [{ ...to }];

    const anchor = this.nearestNode(
      fromInside ? from.x : to.x,
      fromInside ? from.y : to.y,
      fromInside ? from.z : to.z,
    );
    if (!anchor) return [];
    const queue = [anchor];
    const came = new Map<DigNode, DigNode | null>([[anchor, null]]);
    for (let head = 0; head < queue.length; head++) {
      for (const neighbor of this.neighbors.get(queue[head]) ?? []) {
        if (came.has(neighbor)) continue;
        came.set(neighbor, queue[head]);
        queue.push(neighbor);
      }
    }
    const outside = fromInside ? to : from;
    const exitCost = (node: DigNode) =>
      distance2(node, outside) +
      Math.max(0, this.world.heightAt(node.x, node.z) - (node.y - 0.95)) * 8;
    const opening = this.openings
      .filter((node) => came.has(node))
      .sort((a, b) => exitCost(a) - exitCost(b))[0];
    const endpoint = fromInside && toInside ? this.nearestNode(to.x, to.y, to.z) : opening;
    if (!endpoint || !came.has(endpoint)) return [];
    const nodes: DigNode[] = [];
    for (let node: DigNode | null = endpoint; node; node = came.get(node) ?? null) nodes.push(node);
    if (fromInside) nodes.reverse();
    const points = nodes.map((node) => ({ x: node.x, y: node.y - 0.95, z: node.z }));
    if (!fromInside && opening) {
      const inward = nodes[1] ?? to;
      let dx = opening.x - inward.x,
        dz = opening.z - inward.z;
      if (Math.hypot(dx, dz) < 0.1) {
        dx = from.x - opening.x;
        dz = from.z - opening.z;
      }
      const length = Math.hypot(dx, dz) || 1;
      const x = opening.x + (dx / length) * 2.4,
        z = opening.z + (dz / length) * 2.4;
      const approach: DigNode[] = [];
      if (dx * (from.x - opening.x) + dz * (from.z - opening.z) < 0) {
        const side = dx * (from.z - opening.z) - dz * (from.x - opening.x) >= 0 ? 1 : -1;
        const ax = x - (dz / length) * 3 * side,
          az = z + (dx / length) * 3 * side;
        approach.push({ x: ax, y: this.world.heightAt(ax, az), z: az });
      }
      approach.push({ x, y: this.world.heightAt(x, z), z });
      points.unshift(...approach);
    }
    if (fromInside && !toInside && opening) {
      // Выходим по продолжению последнего участка тоннеля, даже если еда находится за входом.
      const previous = nodes.at(-2);
      let dx = previous ? opening.x - previous.x : to.x - opening.x,
        dz = previous ? opening.z - previous.z : to.z - opening.z;
      if (Math.hypot(dx, dz) < 0.1) {
        dx = to.x - opening.x;
        dz = to.z - opening.z;
      }
      const length = Math.hypot(dx, dz) || 1;
      const x = opening.x + (dx / length) * 2.4;
      const z = opening.z + (dz / length) * 2.4;
      points.push({ x, y: this.world.heightAt(x, z), z });
      if (dx * (to.x - opening.x) + dz * (to.z - opening.z) < 0) {
        const side = dx * (to.z - opening.z) - dz * (to.x - opening.x) >= 0 ? 1 : -1;
        const detourX = x - (dz / length) * 3 * side,
          detourZ = z + (dx / length) * 3 * side;
        points.push({ x: detourX, y: this.world.heightAt(detourX, detourZ), z: detourZ });
      }
    }
    points.push({ ...to });
    return points;
  }

  /** Совместимый запрос отдельной точки; движущиеся существа хранят маршрут в GroundNavigator. */
  nextStep(
    from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number },
  ): DigNode | undefined {
    return this.route(from, to).find(
      (point) => Math.hypot(point.x - from.x, point.z - from.z) > 0.3,
    );
  }

  /** Ближайшая ось хода определяет непрерывный проходимый склон. */
  private centerline(
    x: number,
    z: number,
    feetY: number,
  ): { distance: number; y: number; edge: boolean } | undefined {
    let best: { distance: number; y: number; score: number; edge: boolean } | undefined;
    const consider = (cx: number, cy: number, cz: number, edge: boolean) => {
      const distance = Math.hypot(x - cx, z - cz),
        score = distance + Math.abs(cy - (feetY + 0.95)) * 0.4;
      if (!best || score < best.score) best = { distance, y: cy, score, edge };
    };
    for (const node of this.save.excavation)
      if (distance2(node, { x, z }) < 3.2) consider(node.x, node.y, node.z, false);

    for (const [a, b] of this.edges) {
      if (
        Math.min(a.x, b.x) - 1.3 > x ||
        Math.max(a.x, b.x) + 1.3 < x ||
        Math.min(a.z, b.z) - 1.3 > z ||
        Math.max(a.z, b.z) + 1.3 < z
      )
        continue;

      const dx = b.x - a.x,
        dz = b.z - a.z,
        t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      if (t > 0.01 && t < 0.99) consider(a.x + dx * t, a.y + (b.y - a.y) * t, a.z + dz * t, true);
    }

    return best;
  }

  distanceToTunnel(x: number, y: number, z: number): number {
    const center = this.centerline(x, z, y);
    return center?.distance ?? Infinity;
  }

  floorAt(x: number, z: number, previousY: number): number {
    const surface = this.world.heightAt(x, z),
      center = this.centerline(x, z, previousY);
    if (!center || center.distance > 1.7) return surface;

    const tunnelFloor = center.y - 0.95;
    const opening = this.openings.reduce(
      (best, node) => Math.min(best, distance2(node, { x, z })),
      Infinity,
    );
    // Склон применяется только у открытого входа. В соединённом проходе прежняя
    // радиальная формула поднимала пол между камерами и выталкивала крольчиху наверх.
    if (opening < 1.7 && !center.edge) {
      const blend = clamp((1.7 - opening) / 1.3, 0, 1);
      return surface + (tunnelFloor - surface) * blend;
    }

    return previousY < surface - 0.13 || opening < 1.7 ? tunnelFloor : surface;
  }

  /** Луч начинается у крольчихи; камера задаёт направление копания без переноса точки действия. */
  target(
    camera: THREE.Camera,
    x: number,
    y: number,
    z: number,
    forceDown = false,
  ): { node: DigNode; point: THREE.Vector3 } | undefined {
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    const sheltered = this.isSheltered(x, y, z);
    if (!forceDown && !sheltered && !this.nearOpening(x, z, 1.5)) {
      const horizontal = new THREE.Vector2(direction.x, direction.z).normalize();
      const fallbackX = x + horizontal.x * 2.2,
        fallbackZ = z + horizontal.y * 2.2;
      const fallbackY = this.world.heightAt(fallbackX, fallbackZ);
      const surfaceHit = this.world.surfaceHit(new THREE.Vector3(x, y + 0.8, z), direction, 6.5);
      const hit =
        (surfaceHit && distance2(surfaceHit, { x, z }) >= 1.35 ? surfaceHit : undefined) ??
        (direction.y < -0.08 && Math.abs(y + 0.8 + direction.y * 2.2 - fallbackY) < 2
          ? new THREE.Vector3(fallbackX, fallbackY, fallbackZ)
          : undefined);
      if (!hit) return undefined;

      const nx = this.snap(hit.x),
        nz = this.snap(hit.z);
      return { node: { x: nx, y: this.world.heightAt(nx, nz) + 0.45, z: nz }, point: hit };
    }

    const horizontal = new THREE.Vector2(direction.x, direction.z).normalize();
    if (horizontal.lengthSq() < 0.1) horizontal.set(0, -1);

    const nearest = this.nearestNode(x, y, z);
    if (!nearest) return undefined;

    const nx = this.snap(x + horizontal.x * 2.1),
      nz = this.snap(z + horizontal.y * 2.1);
    const slope = forceDown || direction.y < -0.42 ? -0.75 : clamp(direction.y * 1.65, -0.7, 0.7);
    const node = { x: nx, y: Math.round((nearest.y + slope) * 4) / 4, z: nz };
    return { node, point: new THREE.Vector3(nx, node.y, nz) };
  }

  dig(
    camera: THREE.Camera,
    x: number,
    y: number,
    z: number,
    forceDown = false,
  ): { success: boolean; reason: string; node?: DigNode } {
    const preview = this.preview(camera, x, y, z, forceDown);
    if (!preview) return { success: false, reason: 'Направь прицел на землю рядом с крольчихой.' };

    if (!preview.valid) return { success: false, reason: preview.reason };

    const node = preview.node;
    this.save.excavation.push(node);
    this.addGeometry(node);
    return { success: true, reason: 'Земля выкопана. Иди по образовавшемуся ходу.', node };
  }

  preview(
    camera: THREE.Camera,
    x: number,
    y: number,
    z: number,
    forceDown = false,
  ): DigPreview | undefined {
    const aimed = this.target(camera, x, y, z, forceDown);
    if (!aimed) return undefined;

    const node = aimed.node;
    let reason = '';
    const limit = playableWorldLimit(this.world.size);
    if (Math.abs(node.x) > limit || Math.abs(node.z) > limit)
      reason = 'Здесь край исследуемого леса.';
    else if (this.depth(node) > this.maxDepth) reason = 'Глубже 50 м копать нельзя.';
    else if (
      this.save.excavation.some(
        (existing) =>
          Math.hypot(existing.x - node.x, existing.y - node.y, existing.z - node.z) < 1.1,
      )
    )
      reason = 'Эта земля уже выкопана. Направь прицел дальше.';

    const prior = this.nearestNode(x, y, z);
    if (!reason && prior && this.isSheltered(x, y, z) && !this.connected(prior, node))
      reason = 'Копай соседний участок, чтобы сохранить проходимый уклон.';

    return { ...aimed, valid: !reason, reason };
  }

  private nearestNode(x: number, y: number, z: number): DigNode | undefined {
    let nearest: DigNode | undefined,
      best = Infinity;
    for (const node of this.save.excavation) {
      const distance = Math.hypot(node.x - x, node.y - (y + 0.95), node.z - z);
      if (distance < best) {
        best = distance;
        nearest = node;
      }
    }

    return nearest;
  }

  private connected(a: DigNode, b: DigNode): boolean {
    const horizontal = distance2(a, b);
    return horizontal > 0.1 && horizontal < 2.9 && Math.abs(a.y - b.y) <= 0.85;
  }

  private addGeometry(node: DigNode): void {
    const previous = this.save.excavation.slice(0, this.save.excavation.indexOf(node));
    const connections = previous.filter((other) => this.connected(other, node));
    for (const other of connections) {
      this.edges.push([other, node]);
      this.neighbors.set(other, [...(this.neighbors.get(other) ?? []), node]);
      this.neighbors.set(node, [...(this.neighbors.get(node) ?? []), other]);
    }

    this.mesher.addNode(node, connections);
    if (node.y + 1 > this.world.heightAt(node.x, node.z)) {
      this.openings.push(node);
      this.world.addGroundHole(node.x, node.z, 1.7);
    }

    const root = this.world.rootAt(node.x, node.z, this.depth(node));
    if (root) {
      const rootMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.1, 0.65, 7),
        new THREE.MeshStandardMaterial({ color: root.kind === 'carrot' ? 0xd88648 : 0x98734c }),
      );
      rootMesh.position.set(node.x + 0.2, node.y + 0.7, node.z - 0.2);
      this.group.add(rootMesh);
      this.roots.push({ node, mesh: rootMesh });
    }

    this.refreshRoots();
  }

  cameraPoint(target: THREE.Vector3, desired: THREE.Vector3): THREE.Vector3 {
    if (
      this.depthAt(target.x, target.y - 0.7, target.z) < 1.15 &&
      this.nearOpening(target.x, target.z, 2)
    )
      return desired;

    const direction = desired.clone().sub(target),
      length = direction.length();
    if (length < 0.01) return target.clone();
    direction.normalize();
    const candidates = this.mesher.nearby(target, 8);
    const ray = new THREE.Raycaster(target, direction, 0, length),
      hit = ray.intersectObjects(candidates, false)[0];
    const point = target
      .clone()
      .addScaledVector(
        direction,
        Math.min(length, hit ? Math.max(0.95, hit.distance - 0.16) : length),
      );
    if (!this.contains(point)) return target.clone().addScaledVector(direction, 1.15);

    return point;
  }

  refreshRoots(): void {
    for (const item of this.roots) {
      const root = this.world.rootAt(item.node.x, item.node.z, this.depth(item.node));
      item.mesh.visible = !!root?.available && (!('mesh' in root) || root.mesh.visible);
    }
  }

  update(x: number, y: number, z: number, preview?: DigPreview): void {
    const sheltered = this.isSheltered(x, y, z);
    this.light.visible = sheltered;
    this.light.position.set(x, y + 1.1, z);
    this.marker.visible = !!preview;
    if (preview) {
      this.marker.position.copy(preview.point);
      (this.marker.material as THREE.MeshBasicMaterial).color.setHex(
        preview.valid ? 0xc7e59b : 0xe49b88,
      );
    }

    this.mesher.updateVisibility(x, y, z);
    if (performance.now() - this.lastRootRefresh > 900) {
      this.lastRootRefresh = performance.now();
      this.refreshRoots();
    }
  }
}
