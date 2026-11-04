import * as THREE from 'three';
import { Random } from './Random';
import type { Biome, Season } from './types';

export interface FlightAnchor {
  x: number;
  z: number;
}

type FlightProfile = {
  color: number;
  size: number;
  height: number;
  speed: number;
  flap: number;
  shape: readonly [span: number, bodyHeight: number, length: number];
  season: Record<Season, number>;
};

const INSECTS: readonly FlightProfile[] = [
  {
    color: 0xf3a955,
    size: 0.19,
    height: 0.85,
    speed: 1.2,
    flap: 21,
    shape: [1.18, 0.69, 0.82],
    season: { Весна: 0.7, Лето: 1, Осень: 0.34, Зима: 0 },
  }, // Бабочка
  {
    color: 0xe8bb43,
    size: 0.13,
    height: 0.65,
    speed: 2.7,
    flap: 47,
    shape: [0.64, 1.2, 0.94],
    season: { Весна: 0.82, Лето: 1, Осень: 0.29, Зима: 0 },
  }, // Пчела
  {
    color: 0xd0a34f,
    size: 0.17,
    height: 0.6,
    speed: 2,
    flap: 39,
    shape: [0.62, 1.65, 0.79],
    season: { Весна: 0.95, Лето: 1, Осень: 0.32, Зима: 0 },
  }, // Шмель
  {
    color: 0x47d9d0,
    size: 0.2,
    height: 1.25,
    speed: 3.6,
    flap: 34,
    shape: [1.31, 0.68, 1.7],
    season: { Весна: 0.3, Лето: 1, Осень: 0.39, Зима: 0 },
  }, // Стрекоза
  {
    color: 0xf65b39,
    size: 0.11,
    height: 0.48,
    speed: 1.65,
    flap: 30,
    shape: [0.71, 1.52, 0.76],
    season: { Весна: 0.65, Лето: 1, Осень: 0.48, Зима: 0 },
  }, // Божья коровка
];

const BIRDS: readonly FlightProfile[] = [
  {
    color: 0xd9a162,
    size: 0.31,
    height: 4.2,
    speed: 1.65,
    flap: 22,
    shape: [0.95, 0.88, 1.06],
    season: { Весна: 0.85, Лето: 1, Осень: 0.9, Зима: 0.37 },
  }, // Воробей
  {
    color: 0xe6cc48,
    size: 0.29,
    height: 5.6,
    speed: 2,
    flap: 25,
    shape: [1.02, 0.83, 1.14],
    season: { Весна: 0.82, Лето: 1, Осень: 0.75, Зима: 0.5 },
  }, // Синица
  {
    color: 0xe86b5e,
    size: 0.33,
    height: 3.9,
    speed: 1.55,
    flap: 19,
    shape: [0.86, 1.24, 0.91],
    season: { Весна: 0.55, Лето: 0.64, Осень: 0.7, Зима: 0.58 },
  }, // Снегирь
  {
    color: 0x6885bc,
    size: 0.34,
    height: 7.2,
    speed: 2.3,
    flap: 21,
    shape: [1.13, 0.93, 1.16],
    season: { Весна: 0.9, Лето: 1, Осень: 0.48, Зима: 0 },
  }, // Зяблик
  {
    color: 0xf0a068,
    size: 0.3,
    height: 3.5,
    speed: 1.8,
    flap: 24,
    shape: [0.98, 1.12, 0.92],
    season: { Весна: 0.85, Лето: 1, Осень: 0.53, Зима: 0 },
  }, // Зарянка
];

type Flyer = FlightAnchor & {
  profile: FlightProfile;
  rank: number;
  phase: number;
  radius: number;
};

type Batch = {
  mesh: THREE.InstancedMesh;
  flyers: Flyer[];
  radius: number;
  flapRates: THREE.InstancedBufferAttribute;
  shapes: THREE.InstancedBufferAttribute;
};

interface FlightOptions {
  seed: number;
  scale: number;
  vegetation: number;
  butterflies: readonly FlightAnchor[];
  heightAt(x: number, z: number): number;
  biomeAt(x: number, z: number): Biome;
  nearWater(x: number, z: number): boolean;
}

const UPDATE_INTERVAL = 1 / 24;
const INSECT_CAPACITY = 72;
const BIRD_CAPACITY = 36;

/** Рисует декоративных летунов двумя пакетами. Маршруты обновляются рядом с игроком, крылья движутся на GPU. */
export class AmbientFlight {
  private readonly batches: readonly Batch[];
  private readonly clock = { value: 0 };
  private readonly transform = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private lastUpdate = -Infinity;
  private lastSeason?: Season;

  constructor(
    scene: THREE.Scene,
    private readonly options: FlightOptions,
  ) {
    const rng = new Random(options.seed + 82291);
    const butterflies = options.butterflies.map((anchor) =>
      this.flyer(anchor, INSECTS[0], rng, false),
    );
    const population = options.scale ** 2 * options.vegetation;
    const insects = this.scatter(
      Math.min(192, Math.round(64 * population)),
      INSECTS.slice(1),
      rng,
      false,
    );
    const birds = this.scatter(Math.min(150, Math.round(64 * population)), BIRDS, rng, true);
    this.batches = [
      this.batch(
        scene,
        'ambient-insects',
        [...butterflies, ...insects],
        29,
        INSECT_CAPACITY,
        false,
      ),
      this.batch(scene, 'ambient-birds', birds, 56, BIRD_CAPACITY, true),
    ];
  }

  update(time: number, x: number, z: number, season: Season): void {
    this.clock.value = time;
    if (season === this.lastSeason && time - this.lastUpdate < UPDATE_INTERVAL) return;

    this.lastSeason = season;
    this.lastUpdate = time;
    for (const { mesh, flyers, radius, flapRates, shapes } of this.batches) {
      let count = 0;
      for (const flyer of flyers) {
        const { profile, phase } = flyer;
        if (flyer.rank >= profile.season[season]) continue;
        if ((flyer.x - x) ** 2 + (flyer.z - z) ** 2 > radius ** 2) continue;

        const angle = time * profile.speed + phase;
        const px = flyer.x + Math.cos(angle) * flyer.radius;
        const pz = flyer.z + Math.sin(angle) * flyer.radius * 0.73;
        const bob = Math.sin(angle * 1.9 + phase) * profile.height * 0.17;
        this.transform.position.set(px, this.options.heightAt(px, pz) + profile.height + bob, pz);
        this.transform.rotation.set(
          0,
          Math.atan2(-Math.sin(angle), Math.cos(angle) * 0.73),
          Math.sin(angle) * 0.18,
        );
        this.transform.scale.setScalar(profile.size);
        this.transform.updateMatrix();
        mesh.setMatrixAt(count, this.transform.matrix);
        mesh.setColorAt(count, this.color.setHex(profile.color));
        flapRates.setXY(count, profile.flap, phase);
        shapes.setXYZ(count, ...profile.shape);
        count++;
        if (count === mesh.instanceMatrix.count) break;
      }
      mesh.count = count;
      mesh.visible = count > 0;
      if (count > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        flapRates.needsUpdate = true;
        shapes.needsUpdate = true;
      }
    }
  }

  private scatter(
    count: number,
    profiles: readonly FlightProfile[],
    rng: Random,
    bird: boolean,
  ): Flyer[] {
    const flyers: Flyer[] = [];
    for (let i = 0; i < count; i++) {
      const profile = profiles[i % profiles.length];
      let anchor = this.anchor(rng);
      for (let attempt = 0; attempt < 5; attempt++) {
        if (
          profile === INSECTS[3]
            ? this.options.nearWater(anchor.x, anchor.z)
            : this.options.biomeAt(anchor.x, anchor.z) !== 'garden'
        )
          break;

        anchor = this.anchor(rng);
      }
      flyers.push(this.flyer(anchor, profile, rng, bird));
    }
    return flyers;
  }

  private anchor(rng: Random): FlightAnchor {
    const radius = 91 * this.options.scale;
    return { x: rng.range(-radius, radius), z: rng.range(-radius, radius) };
  }

  private flyer(anchor: FlightAnchor, profile: FlightProfile, rng: Random, bird: boolean): Flyer {
    return {
      ...anchor,
      profile,
      rank: rng.next(),
      phase: rng.range(0, Math.PI * 2),
      radius: bird ? rng.range(2.8, 6.4) : rng.range(0.65, 1.7),
    };
  }

  private batch(
    scene: THREE.Scene,
    name: string,
    flyers: Flyer[],
    radius: number,
    capacity: number,
    bird: boolean,
  ): Batch {
    const geometry = flightGeometry(bird);
    const flapRates = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
    flapRates.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('flightFlap', flapRates);
    const shapes = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    shapes.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('flightShape', shapes);
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uFlightTime = this.clock;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute vec2 flightFlap; attribute vec3 flightShape; uniform float uFlightTime;',
        )
        .replace(
          '#include <begin_vertex>',
          `
          #include <begin_vertex>
          transformed *= flightShape;
          float span = max(0.0, abs(position.x) - 0.19) * flightShape.x;
          float swing = sin(uFlightTime * flightFlap.x + flightFlap.y) * 0.93;
          transformed.y += span * sin(swing);
          transformed.x -= sign(position.x) * span * (1.0 - cos(swing));
        `,
        );
    };

    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = name;
    mesh.count = 0;
    mesh.visible = false;
    // Пакет уже отсечён вокруг игрока, его экземпляры меняются при каждом обновлении.
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    return { mesh, flyers, radius, flapRates, shapes };
  }
}

type Point = readonly [number, number, number];

function flightGeometry(bird: boolean): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  function face(a: Point, b: Point, c: Point, shade: number): void {
    positions.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) colors.push(shade, shade, shade);
  }

  const nose: Point = [0, 0.06, bird ? 0.7 : 0.49];
  const tail: Point = [0, 0, bird ? -0.84 : -0.59];
  const back: Point = [0, bird ? 0.34 : 0.17, 0.11];
  const belly: Point = [0, bird ? -0.22 : -0.1, 0.18];
  for (const side of [-1, 1]) {
    const shoulder: Point = [side * 0.19, 0, 0.24];
    const hip: Point = [side * 0.14, 0, -0.36];
    const tip: Point = [side * (bird ? 1.22 : 0.97), 0, bird ? -0.12 : 0.24];
    const trailing: Point = [side * (bird ? 0.68 : 0.72), 0, -0.45];
    if (bird) {
      const cheek: Point = [side * 0.13, 0.12, 0.61];
      face(nose, back, cheek, 0.49);
      face(back, shoulder, cheek, 0.6);
      face(cheek, shoulder, nose, 0.83);
      face(nose, cheek, [0, 0.026, 0.94], 0.36);
      const eyePoint = (towardNose: number, towardBack: number): Point => [
        cheek[0] * (1 - towardNose - towardBack) + side * 0.002,
        cheek[1] + (nose[1] - cheek[1]) * towardNose + (back[1] - cheek[1]) * towardBack,
        cheek[2] + (nose[2] - cheek[2]) * towardNose + (back[2] - cheek[2]) * towardBack,
      ];
      face(eyePoint(0.13, 0.12), eyePoint(0.3, 0.11), eyePoint(0.22, 0.19), 0.035);
    } else {
      face(nose, back, shoulder, 0.46);
    }
    face(nose, shoulder, belly, 0.94);
    face(back, hip, shoulder, 0.48);
    face(belly, shoulder, hip, 0.88);
    face(back, tail, hip, 0.44);
    face(belly, hip, tail, 0.75);
    face(shoulder, tip, trailing, bird ? 0.48 : 0.97);
    face(shoulder, trailing, hip, bird ? 0.64 : 0.79);
    if (bird) face(hip, tail, [side * 0.28, 0, -0.94], 0.51);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}
