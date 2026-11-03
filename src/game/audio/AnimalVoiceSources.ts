import type { Object3D } from 'three';
import type { RabbitActor, FamilyMember, ForestAnimal, Predator, Hawk } from '../animals';
import type { ModelInstance } from '../ModelAssets';
import type { SaveData } from '../types';
import type { FamilyLifecycle } from '../session/FamilyLifecycle';
import type { AnimalActivity, AnimalVoiceKind } from './AnimalVoice';

export interface VoicePopulation {
  save: SaveData;
  rabbits: readonly RabbitActor[];
  families: readonly FamilyMember[];
  wildlife: readonly ForestAnimal[];
  predators: readonly Predator[];
  hawks: readonly Hawk[];
  family?: Pick<FamilyLifecycle, 'rigs'>;
}
export interface VoiceActor {
  root: Object3D;
  kind: AnimalVoiceKind;
  activity: AnimalActivity;
}

/** Адаптирует живые сущности и текущие GLB-клипы к звуковым источникам без поиска деталей в кадровом цикле. */
export class AnimalVoiceSources {
  constructor(private readonly population: VoicePopulation) {}

  *all(): Iterable<VoiceActor> {
    for (const rabbit of this.population.rabbits)
      if (rabbit.alive) yield this.actor(rabbit.rig.root, 'rabbit', rabbit.rig);
    for (const member of this.population.families)
      if (member.alive) yield this.actor(member.rig.root, 'rabbit', member.rig, member.young);
    for (const kit of this.population.save.kits) {
      const rig = this.population.family?.rigs.get(kit.id);
      if (kit.alive && rig) yield this.actor(rig.root, 'rabbit', rig, kit.age < 1);
    }
    for (const animal of this.population.wildlife)
      if (animal.alive) yield this.actor(animal.root, animal.kind, animal.model);
    for (const predator of this.population.predators) {
      if (!predator.alive || predator.kind === 'spider' || predator.kind === 'jumping-spider')
        continue;
      yield this.actor(predator.root, predator.kind, predator.root.userData.model as ModelInstance);
    }
    for (const hawk of this.population.hawks)
      if (hawk.alive)
        yield this.actor(hawk.root, 'hawk', hawk.root.userData.model as ModelInstance);
  }

  private actor(
    root: Object3D,
    kind: AnimalVoiceKind,
    model: ModelInstance,
    young = false,
  ): VoiceActor {
    const clip = model.activeName ?? 'idle';
    let activity: AnimalActivity = young ? 'young' : 'rest';
    if (clip === 'eat' || clip === 'graze') activity = 'eat';
    else if (clip === 'run' || clip === 'attack' || clip === 'strike') activity = 'alert';
    else if (!young && ['hop', 'walk', 'flap', 'glide'].includes(clip)) activity = 'move';
    return { root, kind, activity };
  }
}
