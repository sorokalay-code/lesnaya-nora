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
  inputClock?: () => number;
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
  private previous?: { x: number; y: number; z: number };

  constructor(private readonly context: Context) {
    this.entries = context.spiders.map((spider) => {
      const anchors = spider.habitat ?? {
        a: { x: spider.origin.x - 1.5, z: spider.origin.z },
        b: { x: spider.origin.x + 3.1, z: spider.origin.z },
      };
      const web = new SpiderWeb(anchors.a, anchors.b, (x, z) => context.world.heightAt(x, z));
      context.scene.add(web.mesh);
      return { spider, web, key: `${spider.origin.x.toFixed(3)},${spider.origin.z.toFixed(3)}` };
    });
  }

  get trapped(): boolean {
    return this.active !== undefined;
  }

  resetTraversal(): void {
    // Передача управления — смена тела, а не движение сквозь все паутины между двумя крольчихами.
    this.previous = undefined;
  }

  view(): WebView | undefined {
    return this.active
      ? {
          hits: this.escape.hits,
          required: WebEscape.required,
          seconds: Math.ceil(this.active.spider.descentSeconds),
          danger: this.active.spider.descentSeconds <= 0,
        }
      : undefined;
  }

  update(dt: number, time: number, combatAllowed: boolean): void {
    const p = this.context.save.player,
      cooldowns = (this.context.save.webCooldowns ??= {});
    const point = {
      x: p.x,
      y: p.y + Number(this.context.player.root.userData.jumpHeight ?? 0),
      z: p.z,
    };
    const previous = this.previous ?? point;
    this.previous = point;
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
    if (!this.active && !p.hidden) {
      this.active = this.entries.find(
        (entry) => entry.web.mesh.visible && entry.web.intersects(previous, point),
      );
      if (this.active) {
        this.escape.reset();
        this.active.spider.alert(time);
        this.context.toast(
          'Лапы запутались в паутине! Паук сразу спускается к тебе. Быстро нажимай E или «Вырваться».',
        );
      }
    }
    if (!this.active) return;
    this.active.spider.alert(time);
    this.escape.update(dt);
  }

  struggle(): void {
    // Ввод измеряется реальным временем: при редких кадрах отдельные нажатия не теряются.
    const inputSeconds = this.context.inputClock?.() ?? performance.now() / 1000;
    if (!this.active || !this.escape.press(inputSeconds)) return;
    (this.context.save.webCooldowns ??= {})[this.active.key] = this.context.save.clock + 240;
    this.active.web.mesh.visible = false;
    this.active = undefined;
    this.context.toast('Ты разорвала паутину и освободилась. Беги: паук скоро сплетёт новую!');
  }
}
