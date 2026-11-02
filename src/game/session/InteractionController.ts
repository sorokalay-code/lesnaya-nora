import type { GameUI } from '../../ui/GameUI';
import type { StashData } from '../types';
import type { Soundscape } from '../Audio';
import type { RabbitAction } from '../Models';
import { setRabbitAction } from '../Models';
import type { ViewCamera } from '../ViewCamera';
import type { World } from '../World';
import { partnerScore, type ForestAnimal, type RabbitActor } from '../animals';
import type { FoodKind, KitData, MateCommand, PartnerTraits, SaveData } from '../types';
import { FOOD } from '../types';
import type { FamilyLifecycle } from './FamilyLifecycle';
import { ConversationFocus } from './ConversationFocus';
import { ForestConversation } from './ForestConversation';
import { RabbitConversation } from './RabbitConversation';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
interface InteractionContext {
  save: SaveData;
  ui: GameUI;
  view: ViewCamera;
  sound: Soundscape;
  world: World;
  rabbits: RabbitActor[];
  family: FamilyLifecycle;
  elapsed: () => number;
  resetInput: () => void;
  resumeGame: () => void;
  toast: (text: string) => void;
  persist: () => void;
  markPartner: (actor: RabbitActor, active: boolean) => void;
  playAction: (action: RabbitAction, duration: number) => void;
  familyStash: () => StashData | undefined;
  startMating: (fatherId: number, until: number) => void;
}
/** Управляет разговорами, отношениями и семейными командами через порт интерфейса. */
export class InteractionController {
  private dialogPartner?: PartnerTraits;
  private dialogKit?: KitData;
  private dialogAnimal?: ForestAnimal;
  private readonly focus = new ConversationFocus();
  private readonly forest: ForestConversation;
  private readonly rabbitDialogue: RabbitConversation;

  constructor(private readonly context: InteractionContext) {
    this.forest = new ForestConversation(context.save, context.world);
    this.rabbitDialogue = new RabbitConversation(context.save);
  }

  update(dt: number): void {
    const dialog = this.context.ui.state.dialog;
    if (!dialog || !['partner', 'mate', 'animal', 'kit'].includes(dialog.type)) {
      this.focus.select();
      return;
    }
    if (this.dialogAnimal && !this.dialogAnimal.alive) {
      this.close();
      return;
    }
    const partnerId = dialog.type === 'mate' ? this.context.save.mateId : this.dialogPartner?.id;
    const actor = this.context.rabbits.find((rabbit) => rabbit.data.id === partnerId);
    const root =
      this.dialogAnimal?.root ??
      (this.dialogKit ? this.context.family.rigs.get(this.dialogKit.id)?.root : actor?.rig.root);
    this.focus.select(
      root &&
        Math.hypot(
          root.position.x - this.context.save.player.x,
          root.position.z - this.context.save.player.z,
        ) < 7
        ? root
        : undefined,
    );
    this.focus.update(dt, this.context.save.player);
  }

  clearSelection(): void {
    this.focus.select();
    this.dialogPartner = undefined;
    this.dialogKit = undefined;
    this.dialogAnimal = undefined;
  }

  openPartner(p: PartnerTraits, line?: string): void {
    this.context.resetInput();
    this.dialogPartner = p;
    this.dialogKit = undefined;
    this.dialogAnimal = undefined;
    this.context.view.unlock();
    this.context.ui.showDialog({
      type: 'partner',
      partner: p,
      score: this.compatibility(p),
      line,
      paired: this.context.save.mateId === p.id,
      question: this.rabbitDialogue.question(p),
    });
  }

  openMatePanel(): void {
    const mate = this.context.save.partners.find((p) => p.id === this.context.save.mateId);
    if (!mate) {
      this.context.toast('Партнёра пока нет. Подойди к кролу и нажми E, чтобы познакомиться.');
      return;
    }

    this.context.resetInput();
    this.dialogPartner = undefined;
    this.dialogKit = undefined;
    this.dialogAnimal = undefined;
    this.context.view.unlock();
    this.context.ui.showDialog({
      type: 'mate',
      partner: mate,
      command: this.context.save.mateCommand ?? 'forage',
      messages: this.context.save.mateMessages ?? [],
    });
  }

  close(): void {
    this.context.ui.closePanels();
    this.clearSelection();
    this.context.resetInput();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    this.context.resumeGame();
  }

  commandMate(command: MateCommand): void {
    if (
      !['forage', 'follow', 'stay', 'home'].includes(command) ||
      this.context.save.mateId === undefined
    )
      return;

    if ((command === 'home' || command === 'forage') && !this.context.familyStash()) {
      this.context.save.mateCommand = 'follow';
      this.context.toast(
        'Сначала устрой склад под землёй. Пока партнёр будет идти за тобой и ждать указаний.',
      );
      this.openMatePanel();
      return;
    }

    this.context.save.mateCommand = command;
    if (command === 'stay') {
      const actor = this.context.rabbits.find((r) => r.data.id === this.context.save.mateId);
      this.context.save.mateStay = actor
        ? {
            x: actor.data.x,
            y:
              (actor.rig.root.userData.baseY as number) ??
              this.context.world.heightAt(actor.data.x, actor.data.z),
            z: actor.data.z,
          }
        : {
            x: this.context.save.player.x,
            y: this.context.save.player.y,
            z: this.context.save.player.z,
          };
    }

    const line = {
      follow: 'Партнёр идёт за тобой.',
      stay: 'Партнёр подождёт здесь.',
      forage: 'Партнёр отправился собирать припасы.',
      home: 'Партнёр возвращается домой.',
    }[command];
    this.context.sound.play('chirp');
    this.context.toast(line);
    this.openMatePanel();
  }

  sendMateMessage(): void {
    const mate = this.context.save.partners.find((p) => p.id === this.context.save.mateId);
    if (!mate) return;

    const text = this.context.ui.state.message.trim().slice(0, 120);
    if (!text) return;

    const chat = (this.context.save.mateMessages ??= []);
    chat.push({ from: 'player', text, clock: this.context.save.clock });
    const reply =
      mate.temperament === 'заботливый'
        ? 'Я рядом и помогу нашей семье.'
        : mate.temperament === 'осторожный'
          ? 'Я услышал тебя. Буду внимателен.'
          : 'Я тебя услышал. Скоро увидимся!';
    chat.push({ from: 'partner', text: reply, clock: this.context.save.clock });
    if (chat.length > 20) chat.splice(0, chat.length - 20);

    mate.trust = clamp(mate.trust + 2, 0, 100);
    this.context.sound.play('chirp');
    this.context.ui.clearMessage();
    this.openMatePanel();
    this.context.ui.focusMessage();
  }

  partnerAction(action: string): void {
    const p = this.dialogPartner;
    if (!p) return;

    if (action === 'rabbit-question') {
      this.rabbitDialogue.ask(p);
      this.openPartner(p, 'А теперь я хочу кое-что спросить у тебя.');
      return;
    }
    if (action.startsWith('rabbit-answer-')) {
      this.openPartner(p, this.rabbitDialogue.answer(p, action));
      this.context.persist();
      return;
    }

    let line = '';
    if (action === 'divorce' && this.context.save.mateId === p.id) {
      this.context.save.mateId = undefined;
      p.trust = clamp(p.trust - 15, 0, 100);
      this.context.save.mateCommand = 'forage';
      this.context.save.mateStay = undefined;
      const actor = this.context.rabbits.find((r) => r.data.id === p.id);
      if (actor) this.context.markPartner(actor, false);

      this.openPartner(p, 'Я уйду жить отдельно. Береги нашу семью.');
      this.context.persist();
      return;
    }

    if (action === 'ask-home') {
      p.trust = clamp(p.trust + 5, 0, 100);
      line =
        p.familySize > 2
          ? 'У нас большая семья. Самое важное — возвращаться в гнездо до холодной ночи.'
          : 'Моя семья невелика, зато мы всегда держимся рядом с домом.';
    }

    if (action === 'ask-food') {
      p.trust = clamp(p.trust + 4, 0, 100);
      line =
        'На лугу много клевера, а в огороде морковь. У пруда можно попить — только прислушивайся к шорохам.';
    }

    if (action === 'ask-danger') {
      p.trust = clamp(p.trust + 6, 0, 100);
      line = 'Лисы особенно смелеют в сумерках. Копай глубокие ходы и держи гнездо сухим.';
    }

    if (action === 'compliment') {
      p.trust = clamp(p.trust + (p.preference === 'bond' ? 13 : 8), 0, 100);
      line =
        p.temperament === 'осторожный'
          ? 'Спасибо... Мне приятно, что ты это сказала.'
          : 'Ты тоже мне нравишься. Я рад нашей встрече!';
    }

    if (action === 'gift') {
      const kind = (Object.keys(FOOD) as FoodKind[]).find(
        (k) => this.context.save.inventory[k] > 0,
      );
      if (!kind) {
        this.openPartner(p, 'В твоих запасах пока нет подарка.');
        return;
      }

      this.context.save.inventory[kind]--;
      p.trust = clamp(p.trust + (kind === 'carrot' || kind === 'cabbage' ? 21 : 13), 0, 100);
      this.context.sound.play('pickup');
      line = `Спасибо за ${FOOD[kind].label.toLowerCase()}! Ты умеешь заботиться о близких.`;
    }

    if (action === 'court') {
      if (this.context.save.mateId !== undefined && this.context.save.mateId !== p.id) {
        this.openPartner(p, 'Сначала реши, что делать с нынешним партнёром.');
        return;
      }

      if (this.context.save.pregnancy) {
        this.openPartner(p, 'Ты уже ждёшь крольчат. Сейчас надо позаботиться о них.');
        return;
      }

      const score = this.compatibility(p);
      if (score < 55) {
        p.trust = clamp(p.trust + 3, 0, 100);
        this.openPartner(p, 'Я пока не готов. Давай ещё поговорим и лучше узнаем друг друга.');
        return;
      }

      this.context.save.pregnancy = { fatherId: p.id, progress: 0 };
      this.context.save.mateId = p.id;
      this.context.save.mateCommand = this.context.familyStash() ? 'forage' : 'follow';
      this.context.save.mateMessages = [];
      this.context.playAction('mate', 3.1);
      this.context.startMating(p.id, this.context.elapsed() + 3.1);
      const actor = this.context.rabbits.find((r) => r.data.id === p.id);
      if (actor) {
        setRabbitAction(actor.rig, 'mate', this.context.elapsed() + p.id, 3.1);
        this.context.markPartner(actor, true);
      }

      this.context.sound.play('baby');
      this.context.ui.closeDialog();
      this.dialogPartner = undefined;
      this.context.toast(`Ты и ${p.name} стали парой. Скоро в семье появятся крольчата!`);
      return;
    }

    this.context.sound.play('chirp');
    this.openPartner(p, line);
  }

  openKit(kit: KitData, line?: string): void {
    this.context.resetInput();
    this.dialogKit = kit;
    this.dialogPartner = undefined;
    this.dialogAnimal = undefined;
    this.context.view.unlock();
    this.context.ui.showDialog({ type: 'kit', kit, line });
  }

  childAction(action: string): void {
    const kit = this.dialogKit;
    if (!kit) return;

    if (kit.independent) {
      this.context.ui.closeDialog();
      return;
    }

    kit.command = action === 'child-follow' ? 'follow' : action === 'child-stay' ? 'stay' : 'rest';
    this.context.family.wander.forget(kit.id);
    const rig = this.context.family.rigs.get(kit.id);
    if (rig) rig.root.userData.actionUntil = 0;

    if (kit.command === 'stay' || kit.command === 'rest') {
      const pos = this.context.family.rigs.get(kit.id)?.root.position;
      kit.stayX = kit.x ?? pos?.x;
      kit.stayZ = kit.z ?? pos?.z;
      kit.stayY = kit.y ?? pos?.y;
    }

    this.context.sound.play('baby');
    this.openKit(
      kit,
      action === 'child-follow'
        ? 'Хорошо, пойду за тобой!'
        : action === 'child-stay'
          ? 'Я подожду здесь.'
          : 'Свернусь клубочком и отдохну.',
    );
  }

  openAnimal(animal: ForestAnimal, line?: string): void {
    this.context.resetInput();
    this.dialogAnimal = animal;
    this.dialogPartner = undefined;
    this.dialogKit = undefined;
    this.context.view.unlock();
    this.context.ui.showDialog({
      type: 'animal',
      kind: animal.kind,
      mood: animal.mood,
      health: animal.health,
      maxHealth: animal.maxHealth,
      trust: animal.trust,
      conversation: this.forest.view(animal),
      line,
    });
  }

  animalAction(action: string): void {
    const animal = this.dialogAnimal;
    if (!animal || !animal.alive) {
      this.context.ui.closeDialog();
      return;
    }

    this.openAnimal(animal, this.forest.respond(animal, action));
    this.context.sound.play('chirp');
    this.context.persist();
  }

  private compatibility(p: PartnerTraits): number {
    return clamp(
      partnerScore(p, this.context.save.player.genes) -
        this.context.save.player.dirtiness * 0.22 -
        this.context.save.player.poison * 0.08,
      0,
      100,
    );
  }
}
