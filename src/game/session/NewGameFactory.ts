import { RabbitFactory } from '../animals';
import { type SaveData } from '../types';
import { Genealogy } from '../genetics/Genealogy';
import { Random, hash2 } from '../Random';
import { defaultWorldConfig, validWorldConfig, type WorldConfig } from '../WorldConfig';
import { SeasonSystem } from '../systems/SeasonSystem';

/** Создаёт начальное сохранение; не обращается к сцене, DOM и хранилищу браузера. */
export class NewGameFactory {
  static create(
    seed: number,
    seasonIndex: number,
    factory: RabbitFactory,
    config: WorldConfig = defaultWorldConfig(),
  ): SaveData {
    if (!validWorldConfig(config)) throw new Error('Проверь настройки нового мира.');

    const worldConfig = structuredClone(config);
    const scale = worldConfig.size / 110;
    const startDay = new SeasonSystem(seed, worldConfig.seasonLengths).startDay(seasonIndex);
    // Перемешанный отдельный seed даёт разные фенотипы и не сдвигает генерацию соседей.
    const founderSeed = Math.floor(hash2(seed, seed, 11939) * 0xffffffff);
    return {
      version: 5,
      seed,
      worldConfig,
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
      partners: factory
        .partners(worldConfig.creatures.rabbit, worldConfig.neighborFamilySize)
        .map((partner) => ({
          ...partner,
          x: partner.x * scale,
          z: partner.z * scale,
        })),
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
