import type * as THREE from 'three';
import type { Spider } from '../animals/Spider';
import { SpiderWeb } from '../SpiderWeb';
import type { RabbitRig } from '../Models';
import type { SaveData } from '../types';
import type { World } from '../World';
import { WebEscape } from './WebEscape';

export interface WebView {
  hits: number;
  required: number;
  seconds: number;
  danger: boolean;
}
interface Context {
  scene: THREE.Scene;
  save: SaveData;
  world: World;
  spiders: Spider[];
  player: RabbitRig;
  toast: (text: string) => void;
}
type Entry = { spider: Spider; web: SpiderWeb; key: string };

/** Связывает лесные паутины, захват крольчихи, освобождение и приближение хозяина ловушки. */
export class SpiderEncounter {
  private readonly entries: Entry[];
  private readonly escape = new WebEscape();
  private active?: Entry;
  private warned = false;

  constructor(private readonly context: Context) {
    this.entries = context.spiders.map((spider) => {
      const web = new SpiderWeb(spider.origin.x + 0.8, spider.origin.z, (x, z) =>
        context.world.heightAt(x, z),
      );
      context.scene.add(web.mesh);
      return { spider, web, key: `${spider.origin.x.toFixed(3)},${spider.origin.z.toFixed(3)}` };
    });
  }

  get trapped(): boolean {
    return this.active !== undefined;
  }

  view(): WebView | undefined {
    return this.active
      ? {
          hits: this.escape.hits,
          required: WebEscape.required,
          seconds: Math.max(0, Math.ceil(WebEscape.grace - this.escape.elapsed)),
          danger: this.escape.elapsed >= WebEscape.grace,
        }
      : undefined;
  }

  update(dt: number, time: number, combatAllowed: boolean): void {
    const p = this.context.save.player,
      cooldowns = (this.context.save.webCooldowns ??= {});
    for (const entry of this.entries) {
      const ready = p.hidden ? false : this.context.save.clock >= (cooldowns[entry.key] ?? 0);
      entry.web.mesh.visible =
        entry.spider.alive &&
        ready &&
        Math.hypot(entry.web.center.x - p.x, entry.web.center.z - p.z) < 60;
      entry.spider.weave(!ready && !p.hidden);
    }
    if (this.active && !this.active.spider.alive) {
      this.active = undefined;
      this.context.toast('Паук больше не охраняет эту паутину. Ты свободна.');
    }
    if (!combatAllowed) return;
    if (!this.active && !p.hidden && !this.context.player.root.userData.jumping) {
      this.active = this.entries.find(
        (entry) =>
          entry.web.mesh.visible &&
          Math.abs(entry.web.center.y - p.y) < 0.65 &&
          Math.hypot(entry.web.center.x - p.x, entry.web.center.z - p.z) < entry.web.radius,
      );
      if (this.active) {
        this.escape.reset();
        this.warned = false;
        this.context.toast('Лапы запутались в паутине! Быстро нажимай E или кнопку «Вырваться».');
      }
    }
    if (!this.active) return;
    this.escape.update(dt);
    if (this.escape.elapsed >= WebEscape.grace) {
      this.active.spider.alert(time);
      if (!this.warned) {
        this.warned = true;
        this.context.toast('Паук заметил движение паутины и бежит к тебе. Продолжай вырываться!');
      }
    }
  }

  struggle(): void {
    if (!this.active || !this.escape.press()) return;
    (this.context.save.webCooldowns ??= {})[this.active.key] = this.context.save.clock + 240;
    this.active.web.mesh.visible = false;
    this.active = undefined;
    this.context.toast('Ты разорвала паутину и освободилась. Беги: паук скоро сплетёт новую!');
  }
}
