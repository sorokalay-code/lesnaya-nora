import { RabbitFactory } from '../animals';
import { type SaveData } from '../types';
import { Genealogy } from '../genetics/Genealogy';
import { Random, hash2 } from '../Random';

/** Создаёт начальное сохранение; не обращается к сцене, DOM и хранилищу браузера. */
export class NewGameFactory {
  static create(seed: number, seasonIndex: number, factory: RabbitFactory): SaveData {
    const startDay = 1 + Math.max(0, Math.min(3, seasonIndex)) * 30;
    // Перемешанный отдельный seed даёт разные фенотипы и не сдвигает генерацию соседей.
    const founderSeed = Math.floor(hash2(seed, seed, 11939) * 0xffffffff);
    return {
      version: 4,
      seed,
      clock: (startDay - 1) * 1440 + 7 * 60,
      day: startDay,
      player: {
        x: 0,
        y: 0,
        z: 0,
        genes: new RabbitFactory(new Random(founderSeed)).founderGenes(),
        lineage: Genealogy.founder('player:' + seed),
        hunger: 85,
        thirst: 85,
        bodyTemp: 38.5,
        energy: 90,
        bladder: 15,
        bowel: 15,
        health: 100,
        age: 0,
        hidden: false,
        dirtiness: 0,
        poison: 0,
        milk: 35,
      },
      inventory: {
        clover: 2,
        carrot: 0,
        cabbage: 0,
        mushroom: 0,
        berries: 0,
        toadstool: 0,
        bitterleaf: 0,
        acorn: 0,
      },
      nests: [],
      stashes: [],
      materials: { grass: 0, twigs: 0, fur: 0 },
      excavation: [],
      gnawedRoots: {},
      kits: [],
      partners: factory.partners(16),
      harvested: [],
      pregnancy: null,
      mateCommand: 'forage',
      mateMessages: [],
      partnerCargo: { grass: 0, twigs: 0, fur: 0 },
      branchPicked: {},
      drops: [],
      stats: { births: 0, grown: 0, survived: 0, generations: 1, stillborn: 0 },
      weather: 'clear',
      messages: [],
      waste: [],
    };
  }
}
