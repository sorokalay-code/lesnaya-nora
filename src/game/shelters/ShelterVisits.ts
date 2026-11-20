import * as THREE from 'three';
import type { GameUI } from '../../ui/GameUI';
import { ForestAnimal, Predator, RabbitActor } from '../animals';
import { Wolf } from '../animals/Wolf';
import { animateRabbit, animatePredator, setRabbitAction, type RabbitRig } from '../Models';
import { ModelAssets } from '../ModelAssets';
import type { SaveData, DigNode } from '../types';
import type { ViewCamera } from '../ViewCamera';
import { GeneticTraits } from '../genetics/GeneticTraits';
import { RABBIT_ATTACKS, type RabbitAttack } from '../combat/AttackProfiles';
import { rabbitAttackDamage, rabbitAttackReach } from '../combat/RabbitCombatRules';
import { meleeContact } from '../session/MeleeHitbox';
import {
  canVisitShelter,
  insideInterior,
  interiorProfile,
  shelterWelcome,
  type InteriorKind,
  type Welcome,
} from './ShelterInterior';
import type { ShelterInteriorScene } from './ShelterInteriorScene';

type Resident = RabbitActor | Predator | ForestAnimal;
const WARNING_SECONDS = 5;
const RESIDENT_WALK_METRES_PER_SECOND = 1.8;
const VISITOR_WALK_METRES_PER_SECOND = 2.6;
const RESIDENT_ATTACK_INTERVAL_SECONDS = 2;
interface VisitSite {
  kind: InteriorKind;
  entrance: DigNode;
  residents: Resident[];
}
interface Context {
  save: SaveData;
  scene: THREE.Scene;
  player: RabbitRig;
  view: Pick<
    ViewCamera,
    | 'mode'
    | 'isFirstPerson'
    | 'camera'
    | 'forwardAt'
    | 'setLookEnabled'
    | 'update'
    | 'setMode'
    | 'snap'
  >;
  ui: Pick<GameUI, 'panelsOpen' | 'setHud'> & { state: Pick<GameUI['state'], 'hud'> };
  keys: Set<string>;
  rabbits: RabbitActor[];
  predators: Predator[];
  wildlife: ForestAnimal[];
  safe: () => boolean;
  tick: (dt: number, moving: boolean) => void;
  prepareLighting: () => void;
  resetInput: () => void;
  refreshHud: () => void;
  hurt: (damage: number) => void;
  toast: (text: string) => void;
}
interface GuestResident {
  actor: Resident;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  visible: boolean;
  parent: THREE.Object3D | null;
  welcome: Welcome;
  nextStrike: number;
  attackUntil: number;
  baseY?: number;
}

/** Загружает чужое убежище по запросу; изолирует местные координаты и возвращает акторов в лес. */
export class ShelterVisits {
  private interior?: ShelterInteriorScene;
  private site?: VisitSite;
  private residents: GuestResident[] = [];
  private loading = false;
  private disposed = false;
  private time = 0;
  private hudTime = 0;
  private nextAttack = 0;
  private pending?: { kind: RabbitAttack; at: number; heading: { x: number; z: number } };
  private readonly point = { x: 0, z: 0 };
  private oldMode: ViewCamera['mode'] = 'third';
  private oldRotation = new THREE.Euler();
  private readonly cameraTarget = new THREE.Vector3();
  private readonly cameraWanted = new THREE.Vector3();
  private readonly cameraProbe = new THREE.Vector3();
  private cameraParent?: THREE.Object3D;

  constructor(private readonly context: Context) {}

  get active(): boolean {
    return this.interior !== undefined;
  }

  get scene(): THREE.Scene | undefined {
    return this.interior?.scene;
  }

  nearby(): VisitSite | undefined {
    const p = this.context.save.player;
    let nearest: VisitSite | undefined;
    let distance = 2.3;
    for (const site of this.sites()) {
      const d = Math.hypot(site.entrance.x - p.x, site.entrance.z - p.z, site.entrance.y - p.y);
      if (d >= distance) continue;
      nearest = site;
      distance = d;
    }
    return nearest;
  }

  execute(action: string): boolean {
    if (this.loading) return true;
    if (!this.active) {
      if (action !== 'interact' || this.context.ui.panelsOpen || !this.context.safe()) return false;
      const site = this.nearby();
      if (!site) return false;
      void this.enter(site);
      return true;
    }
    if (action === 'interact' && !this.context.ui.panelsOpen) {
      if (this.point.z > 3.2 * this.scale && Math.abs(this.point.x) < this.scale) this.leave();
      else this.context.toast('Выход — светлый проход в тамбуре.');
      return true;
    }
    if (action === 'attack-swipe' || action === 'attack-bite') {
      if (!this.context.ui.panelsOpen) this.attack(action === 'attack-swipe' ? 'swipe' : 'bite');
      return true;
    }
    const allowed = [
      'menu',
      'resume',
      'close',
      'menu-back',
      'continue-menu',
      'settings',
      'graphics-menu',
      'controls-help',
      'new-game-menu',
      'saved-games',
      'save',
      'camera',
      'events-panel',
      'world-actions',
    ];
    if (allowed.includes(action)) return false;
    this.context.toast('В гостях можно осмотреть убежище, защищаться и выйти через тамбур.');
    return true;
  }

  update(dt: number): void {
    this.hudTime += dt;
    if (!this.active) {
      if (this.hudTime > 0.22) {
        this.hudTime = 0;
        this.refreshHud();
      }
      return;
    }
    this.time += dt;
    const { keys, view, player } = this.context;
    const forward =
      Number(keys.has('KeyW') || keys.has('ArrowUp')) -
      Number(keys.has('KeyS') || keys.has('ArrowDown'));
    const right =
      Number(keys.has('KeyD') || keys.has('ArrowRight')) -
      Number(keys.has('KeyA') || keys.has('ArrowLeft'));
    const direction = view.forwardAt();
    const length = Math.hypot(forward, right);
    const speed =
      (VISITOR_WALK_METRES_PER_SECOND *
        GeneticTraits.mobility(this.context.save.player.genes) *
        dt) /
      (length || 1);
    const dx = (direction.x * forward - direction.z * right) * speed;
    const dz = (direction.z * forward + direction.x * right) * speed;
    if (insideInterior(this.point.x + dx, this.point.z, this.scale)) this.point.x += dx;
    if (insideInterior(this.point.x, this.point.z + dz, this.scale)) this.point.z += dz;
    player.root.position.set(this.point.x, 0, this.point.z);
    player.root.userData.baseY = 0;
    if (length) player.root.rotation.y = Math.atan2(-dx, -dz);
    animateRabbit(player, this.time, length > 0, false, dt);
    this.resolveAttack();
    this.updateResidents(dt);
    this.context.tick(dt, length > 0);
    if (this.hudTime > 0.22 && this.active) {
      this.hudTime = 0;
      this.context.refreshHud();
      this.refreshHud();
    }
  }

  render(): void {
    if (!this.active) return;
    this.context.view.setLookEnabled(!this.context.ui.panelsOpen);
    this.context.view.update(
      this.point.x,
      this.point.z,
      0,
      undefined,
      this.time,
      false,
      this.context.keys.size > 0,
    );
    // Луч камеры ограничивается тем же контуром, что перемещение; крышу заменяет срез.
    const camera = this.context.view.camera;
    const target = this.cameraTarget.set(this.point.x, 0.7, this.point.z);
    const wanted = this.cameraWanted.copy(camera.position);
    for (let i = 1; i <= 32; i++) {
      const point = this.cameraProbe.lerpVectors(target, wanted, i / 32);
      if (!insideInterior(point.x, point.z, this.scale, 0.1) || point.y > 2.5 || point.y < 0.2) {
        camera.position.copy(target.lerp(wanted, (i - 1) / 32));
        break;
      }
    }
    this.context.player.root.visible = !this.context.view.isFirstPerson;
    ModelAssets.shared.updateView(camera);
  }

  refreshHud(): void {
    const hud = this.context.ui.state.hud;
    if (!hud) return;
    if (this.active) {
      this.context.ui.setHud({
        ...hud,
        underground: true,
        nearbyShelter: undefined,
        worldInfo: [interiorProfile(this.site!.kind).title],
        prompt: [
          {
            key: 'E',
            text:
              this.point.z > 3.2 * this.scale
                ? 'Выйти в лес'
                : `${interiorProfile(this.site!.kind).title} · выход в светлом тамбуре`,
          },
        ],
      });
    } else if (this.context.safe()) {
      const site = this.nearby();
      if (site)
        this.context.ui.setHud({
          ...hud,
          prompt: [{ key: 'E', text: `Войти: ${interiorProfile(site.kind).title}` }],
        });
    }
  }

  leave(): void {
    if (!this.interior) return;
    for (const resident of this.residents) {
      const root = resident.actor.root;
      resident.parent?.add(root);
      root.position.copy(resident.position);
      root.rotation.copy(resident.rotation);
      root.userData.baseY = resident.baseY;
      root.userData.gaitPosition = undefined;
      root.visible = resident.visible && resident.actor.alive;
    }
    this.residents = [];
    const { player, scene, save, view } = this.context;
    this.cameraParent?.add(view.camera);
    this.cameraParent = undefined;
    scene.add(player.root);
    player.root.position.set(save.player.x, save.player.y, save.player.z);
    player.root.rotation.copy(this.oldRotation);
    player.root.userData.baseY = save.player.y;
    player.root.userData.actionUntil = 0;
    view.setMode(this.oldMode);
    view.snap(save.player.x, save.player.y, save.player.z, false);
    this.interior.dispose();
    this.interior = undefined;
    this.site = undefined;
    this.pending = undefined;
    this.context.resetInput();
    this.context.refreshHud();
  }

  dispose(): void {
    this.disposed = true;
    this.leave();
  }

  private get scale(): number {
    return interiorProfile(this.site!.kind).scale;
  }

  private sites(): VisitSite[] {
    const result: VisitSite[] = [];
    const groups = new Map<string, VisitSite>();
    for (const actor of [
      ...this.context.rabbits,
      ...this.context.predators,
      ...this.context.wildlife,
    ]) {
      if (!actor.alive) continue;
      const home = actor instanceof RabbitActor ? actor.wildShelter : actor.shelter;
      const den = actor instanceof Wolf ? actor.homeDen : undefined;
      if (!home && !den) continue;
      const kind = den ? 'wolf' : home!.site.kind;
      if (!canVisitShelter(kind)) continue;
      const key = den ? `wolf:${den.id}` : `${kind}:${home!.site.slot}`;
      let site = groups.get(key);
      if (!site) {
        site = { kind, entrance: den?.entrance ?? home!.entrance, residents: [] };
        groups.set(key, site);
        result.push(site);
      }
      if (actor.inShelter) site.residents.push(actor);
    }
    return result;
  }

  private async enter(site: VisitSite): Promise<void> {
    this.loading = true;
    this.context.resetInput();
    try {
      const { ShelterInteriorScene } = await import('./ShelterInteriorScene');
      if (
        this.disposed ||
        !this.context.safe() ||
        this.context.ui.panelsOpen ||
        this.nearby()?.entrance !== site.entrance
      )
        return;
      this.site = site;
      this.interior = new ShelterInteriorScene(interiorProfile(site.kind));
      this.context.prepareLighting();
      this.cameraParent = this.context.view.camera.parent ?? undefined;
      this.interior.scene.add(this.context.view.camera);
      this.oldMode = this.context.view.mode;
      this.oldRotation.copy(this.context.player.root.rotation);
      this.point.x = 0;
      this.point.z = 4 * this.scale;
      this.time = 0;
      this.nextAttack = 0;
      this.interior.scene.add(this.context.player.root);
      this.context.view.setMode('first');
      this.context.view.snap(this.point.x, 0, this.point.z, true);
      this.residents = site.residents.map((actor, i) => {
        const welcome = shelterWelcome(
          site.kind,
          actor instanceof RabbitActor
            ? actor.data.trust
            : actor instanceof ForestAnimal
              ? actor.trust
              : 0,
          actor instanceof ForestAnimal ? actor.social.grievance : 0,
        );
        const resident: GuestResident = {
          actor,
          position: actor.root.position.clone(),
          rotation: actor.root.rotation.clone(),
          visible: actor.root.visible,
          parent: actor.root.parent,
          welcome,
          nextStrike: 1.2,
          attackUntil: 0,
          baseY:
            typeof actor.root.userData.baseY === 'number' ? actor.root.userData.baseY : undefined,
        };
        this.interior!.scene.add(actor.root);
        actor.root.position.set(
          ((i % 3) - 1) * this.scale,
          0,
          (-1 - Math.floor(i / 3)) * this.scale,
        );
        actor.root.visible = true;
        actor.root.userData.baseY = 0;
        return resident;
      });
      const dangerous = this.residents.some((r) => r.welcome === 'hostile');
      const warning = this.residents.some((r) => r.welcome === 'warning');
      this.context.toast(
        `${interiorProfile(site.kind).title}. ${dangerous ? 'Хозяева атакуют незваную гостью!' : warning ? 'Хозяева сердятся: уйди, пока не напали. У тебя несколько секунд.' : this.residents.length ? 'Друзья рады тебе. Можно спокойно осмотреться.' : 'Хозяев сейчас нет дома.'}`,
      );
      this.refreshHud();
    } catch {
      this.leave();
      this.context.toast('Не удалось загрузить убежище. Попробуй ещё раз.');
    } finally {
      this.loading = false;
    }
  }

  private updateResidents(dt: number): void {
    for (const resident of this.residents) {
      if (!resident.actor.alive) {
        resident.actor.root.visible = false;
        continue;
      }
      if (
        resident.welcome === 'friendly' ||
        (resident.welcome === 'warning' && this.time < WARNING_SECONDS)
      ) {
        this.animateResident(resident, dt, false);
        continue;
      }
      const root = resident.actor.root;
      const dx = this.point.x - root.position.x;
      const dz = this.point.z - root.position.z;
      const distance = Math.hypot(dx, dz);
      root.rotation.y = Math.atan2(-dx, -dz);
      const step =
        Math.min(Math.max(0, distance - 1.1), dt * RESIDENT_WALK_METRES_PER_SECOND) /
        (distance || 1);
      const x = root.position.x + dx * step;
      const z = root.position.z + dz * step;
      if (insideInterior(x, z, this.scale)) root.position.set(x, 0, z);
      if (distance < 1.5 && this.time >= resident.nextStrike) {
        resident.nextStrike = this.time + RESIDENT_ATTACK_INTERVAL_SECONDS;
        resident.attackUntil = this.time + 0.5;
        const actor = resident.actor;
        if (actor instanceof RabbitActor) setRabbitAction(actor.rig, 'bite', this.time, 0.5);
        this.context.hurt(
          actor instanceof Predator
            ? actor.profile.damage
            : actor instanceof ForestAnimal
              ? Math.max(3, actor.defense)
              : 3,
        );
      }
      this.animateResident(resident, dt, step > 0);
    }
  }

  private animateResident(resident: GuestResident, dt: number, moving: boolean): void {
    const actor = resident.actor;
    const attacking = this.time < resident.attackUntil;
    if (actor instanceof RabbitActor) animateRabbit(actor.rig, this.time, moving, false, dt);
    else if (actor instanceof Predator)
      animatePredator(actor.root, this.time, false, dt, moving, attacking);
    else ModelAssets.shared.play(actor.model, attacking ? 'attack' : moving ? 'walk' : 'idle', dt);
  }

  private attack(kind: RabbitAttack): void {
    const profile = RABBIT_ATTACKS[kind];
    if (this.time < this.nextAttack || this.context.save.player.energy < profile.energy) return;
    this.context.save.player.energy -= profile.energy;
    this.nextAttack = this.time + profile.recovery;
    this.pending = { kind, at: this.time + profile.windup, heading: this.context.view.forwardAt() };
    setRabbitAction(this.context.player, kind, this.time, profile.recovery);
  }

  private resolveAttack(): void {
    const attack = this.pending;
    if (!attack || this.time < attack.at) return;
    this.pending = undefined;
    const profile = RABBIT_ATTACKS[attack.kind];
    let hit: GuestResident | undefined;
    let distance = Infinity;
    for (const resident of this.residents) {
      if (!resident.actor.alive) continue;
      const target = resident.actor.root.position;
      const contact = meleeContact(
        {
          ...this.point,
          direction: attack.heading,
          reach: rabbitAttackReach(this.context.save.player.genes, attack.kind),
          arcCosine: profile.arc,
        },
        {
          x: target.x,
          z: target.z,
          radius: resident.actor instanceof RabbitActor ? 0.45 : resident.actor.profile.radius,
        },
      );
      if (contact !== undefined && contact < distance) {
        hit = resident;
        distance = contact;
      }
    }
    if (!hit) return;
    hit.welcome = 'hostile';
    const actor = hit.actor;
    actor.health = Math.max(
      0,
      actor.health -
        rabbitAttackDamage(
          attack.kind,
          this.context.save.player.lineage?.generation ?? this.context.save.stats.generations,
        ),
    );
    if (actor instanceof RabbitActor) {
      actor.data.health = actor.health;
      actor.data.trust = Math.max(0, actor.data.trust - 20);
    }
    if (actor instanceof ForestAnimal) {
      actor.befriend(-20);
      actor.social.grievance = Math.max(20, actor.social.grievance ?? 0);
    }
  }
}
