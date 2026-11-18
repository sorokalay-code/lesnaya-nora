import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createForestAnimal,
  createPredatorActor,
  FamilyMember,
  PlayerRabbit,
  RabbitActor,
  RabbitFactory,
} from '../src/game/animals';
import { Random } from '../src/game/Random';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { PlayerCombat, rabbitCombatPower, RABBIT_ATTACKS } from '../src/game/session/PlayerCombat';
import { loadModels } from './model-fixture';
import { CombatReach } from '../src/game/session/CombatReach';
import { PlayerConsequences } from '../src/game/session/PlayerConsequences';
import type { SaveData } from '../src/game/types';
import { RABBIT_BODY } from '../src/game/RabbitBody';
import { RabbitConformation } from '../src/game/genetics/RabbitConformation';

await loadModels('rabbit', 'fox', 'wolf', 'deer', 'mouse');

function encounter() {
  const rng = new Random(51);
  const save = NewGameFactory.create(51, 0, new RabbitFactory(rng));
  save.player.x = 0;
  save.player.y = 0;
  save.player.z = 0;
  save.player.energy = 100;
  const player = new PlayerRabbit(save.player);
  const fox = createPredatorActor('fox', 0, -1, rng);
  fox.root.position.y = 0;
  const rabbits: RabbitActor[] = [];
  const families: FamilyMember[] = [];
  let time = 0;
  let clear = true;
  let allowed = true;
  const combat = new PlayerCombat({
    save,
    player: player.rig,
    rabbits,
    families,
    predators: [fox],
    wildlife: [],
    hawks: [],
    elapsed: () => time,
    allowed: () => allowed,
    facing: () => ({ x: 0, z: -1 }),
    clearPath: () => clear,
    toast: () => {},
    hurt: () => {},
  });
  return {
    save,
    player,
    rabbits,
    families,
    fox,
    combat,
    advance: (seconds: number) => {
      time += seconds;
      combat.update(time);
    },
    block: () => {
      clear = false;
    },
    pause: () => {
      allowed = false;
    },
  };
}

test('лапа и укус наносят отложенный урон и имеют общий перерыв и цену энергии', () => {
  const e = encounter();
  const health = e.fox.health;
  assert.equal(e.combat.attack('swipe'), true);
  assert.equal(e.fox.health, health);
  assert.equal(e.combat.attack('bite'), false);
  e.advance(0.17);
  assert.equal(e.fox.health, health - RABBIT_ATTACKS.swipe.damage);
  e.advance(0.5);
  assert.equal(e.combat.attack('bite'), true);
  e.advance(0.3);
  assert.equal(e.fox.health, health - RABBIT_ATTACKS.swipe.damage - RABBIT_ATTACKS.bite.damage);
  assert.equal(
    e.save.player.energy,
    100 - RABBIT_ATTACKS.swipe.energy - RABBIT_ATTACKS.bite.energy,
  );
});

test('удары не проходят назад, сквозь стену и за пределами досягаемости', () => {
  for (const mode of ['behind', 'far', 'wall'] as const) {
    const e = encounter();
    if (mode === 'behind') e.fox.moveTo(0, 1, 0);
    if (mode === 'far') e.fox.moveTo(0, -10, 0);
    if (mode === 'wall') e.block();
    e.combat.attack('bite');
    e.advance(0.3);
    assert.equal(e.fox.health, e.fox.maxHealth, mode);
  }
});

test('укус достаёт до противника на границе коллизии большой крольчихи', () => {
  const e = encounter();
  e.save.player.genes.size = 1.15;
  const boundary = (RABBIT_BODY.radius + RABBIT_BODY.halfLength) * 1.15 + e.fox.profile.radius;
  e.fox.moveTo(0, -boundary, 0);
  e.combat.attack('bite');
  e.advance(0.3);
  assert.ok(e.fox.health < e.fox.maxHealth);
});

test('наследуемые ширина и длина тела не отодвигают цель за пределы удара', () => {
  const e = encounter();
  const p = e.save.player;
  p.genes.shape = { ...RabbitConformation.shape(p.genes), bodyWidth: 1.4, bodyLength: 1.3 };
  const boundary =
    (RABBIT_BODY.radius * 1.4 + RABBIT_BODY.halfLength * 1.3) * p.genes.size + e.fox.profile.radius;
  e.fox.moveTo(0, -boundary, 0);
  assert.equal(e.combat.attack('bite'), true);
  e.advance(0.3);
  assert.ok(e.fox.health < e.fox.maxHealth);
});

test('укус задевает край тела, даже если центр животного сбоку от сектора взгляда', () => {
  const e = encounter();
  e.fox.moveTo(1.6, -0.3, 0);
  e.combat.attack('bite');
  e.advance(0.3);
  assert.ok(e.fox.health < e.fox.maxHealth);
});

test('кролик может ударить другого кролика и сохраняет его здоровье', () => {
  const e = encounter();
  e.fox.moveTo(10, 10, 0);
  const targetData = e.save.partners[0];
  const target = new RabbitActor(targetData, new Random(11));
  target.moveTo(0, -1, 0);
  target.root.position.y = 0;
  e.rabbits.push(target);

  assert.equal(e.combat.attack('bite'), true);
  e.advance(0.3);

  assert.ok(target.health < target.maxHealth);
  assert.equal(targetData.health, target.health);
});

test('кролик может ударить члена соседней семьи и сохраняет его здоровье', () => {
  const e = encounter();
  e.fox.moveTo(10, 10, 0);
  const target = new FamilyMember(e.save.partners[0], e.save.player.genes, 0, false);
  target.moveTo(0, -1, 0);
  target.root.position.y = 0;
  e.families.push(target);

  assert.equal(e.combat.attack('bite'), true);
  e.advance(0.3);

  assert.ok(target.health < target.maxHealth);
  assert.equal(e.save.familyHealth?.[target.data.id], target.health);
});

test('короткое окно ловит движущуюся цель, но каждый взмах повреждает только один раз', () => {
  const e = encounter();
  e.fox.moveTo(0, -2.8, 0);
  e.combat.attack('bite');
  e.advance(0.29);
  assert.equal(e.fox.health, e.fox.maxHealth);
  e.fox.moveTo(0, -1.8, 0);
  e.advance(0.07);
  assert.equal(e.fox.health, e.fox.maxHealth - RABBIT_ATTACKS.bite.damage);
  e.advance(0.07);
  assert.equal(e.fox.health, e.fox.maxHealth - RABBIT_ATTACKS.bite.damage);
});

test('после окончания взмаха приблизившаяся цель уже не получает урон', () => {
  const e = encounter();
  e.fox.moveTo(0, -2.8, 0);
  e.combat.attack('bite');
  e.advance(0.3);
  e.fox.moveTo(0, -1, 0);
  e.advance(0.3);
  assert.equal(e.fox.health, e.fox.maxHealth);
});

test('пауза и прыжок отменяют подготовленный удар; без сил атаковать нельзя', () => {
  for (const mode of ['pause', 'jump'] as const) {
    const e = encounter();
    e.combat.attack('bite');
    if (mode === 'pause') e.pause();
    else e.player.root.userData.jumping = true;
    e.advance(0.3);
    assert.equal(e.fox.health, e.fox.maxHealth);
  }
  const e = encounter();
  e.save.player.energy = 0;
  assert.equal(e.combat.attack('swipe'), false);
});

test('мирное животное отступает сначала, затем отвечает и помнит вражду', () => {
  const deer = createForestAnimal('deer', 0, -1, new Random(2));
  const player = { x: 0, y: 0, z: 0, hidden: false };
  deer.root.position.y = 0;
  deer.trust = 50;
  deer.receivePlayerAttack(1, 1, player);
  assert.equal(deer.trust, 25);
  assert.equal(deer.fightPlayer(player, 1.1), 0);
  deer.receivePlayerAttack(1, 2, player);
  assert.ok(deer.fightPlayer(player, 2.1) > 0);
  assert.equal(deer.fightPlayer(player, 2.2), 0);
  deer.receivePlayerAttack(1, 40, player);
  assert.equal(deer.hostile, true);
  const restored = createForestAnimal('deer', 0, -1, new Random(3));
  restored.social = JSON.parse(JSON.stringify(deer.social));
  restored.root.position.y = 0;
  assert.equal(restored.hostile, true);
  assert.ok(restored.fightPlayer(player, 100) > 0);
  assert.equal(restored.fightPlayer({ ...player, hidden: true }, 110), 0);
});

test('после окна повторного нападения животное снова предупреждает; мышь тоже защищается', () => {
  const mouse = createForestAnimal('mouse', 0, -0.5, new Random(3));
  mouse.root.position.y = 0;
  const player = { x: 0, y: 0, z: 0, hidden: false };
  mouse.receivePlayerAttack(0.1, 1, player);
  mouse.receivePlayerAttack(0.1, 20, player);
  assert.equal(mouse.fightPlayer(player, 20.1), 0);
  mouse.receivePlayerAttack(0.1, 21, player);
  assert.ok(mouse.fightPlayer(player, 21.1) > 0);
});

test('хищник предупреждает, промахивается при отходе и не бежит от каждого удара кролика', () => {
  const fox = createPredatorActor('fox', 0, -1, new Random(3));
  const update = (dt: number, time: number, z: number) =>
    fox.update(dt, time, 0, z, false, false, () => 0);
  assert.equal(update(0.01, 1, 0), false);
  assert.equal(update(0.01, 1.1, 0), false);
  assert.equal(update(0.01, 1.4, 5), false);
  assert.ok(fox.attackCooldown > 0);
  fox.receiveAttack(2, 2, { x: 0, z: 0 });
  update(0.01, 2, 0);
  assert.equal(fox.huntingPlayer, true);
});

test('поколения усиливают бой с ограничением, основатель не убивает лису за запас сил', () => {
  assert.ok(rabbitCombatPower(5) > rabbitCombatPower(1));
  assert.equal(rabbitCombatPower(100), rabbitCombatPower(200));
  const e = encounter();
  for (let hit = 0; hit < 20; hit++) {
    e.combat.attack('bite');
    e.advance(0.3);
    e.advance(0.9);
  }
  assert.ok(e.fox.alive);
  assert.ok(e.save.player.energy < RABBIT_ATTACKS.bite.energy);
});

test('проверка досягаемости блокирует склон, стену между норами и выход из укрытия', () => {
  const from = { x: 0, y: 0, z: 0 };
  const target = { x: 1, z: 0, root: { position: { y: 0 } } };
  assert.equal(new CombatReach({ isSheltered: () => false }, () => 0).clear(from, target), true);
  assert.equal(new CombatReach({ isSheltered: () => false }, () => 1).clear(from, target), false);
  assert.equal(
    new CombatReach({ isSheltered: (x) => x < 0.3 || x > 0.7 }, () => 0).clear(from, target),
    false,
  );
  assert.equal(
    new CombatReach({ isSheltered: (x) => x < 0.3 }, () => 0).clear(from, target),
    false,
  );
});

test('окно уворота блокирует урон и яд; после окна атаки снова ранят', () => {
  const e = encounter();
  let dodging = true;
  const consequences = new PlayerConsequences({
    save: e.save,
    dodging: () => dodging,
    sound: { play() {} },
    toast() {},
  } as unknown as ConstructorParameters<typeof PlayerConsequences>[0]);
  const before: SaveData['player'] = structuredClone(e.save.player);
  consequences.predatorAttack('snake');
  consequences.meleeDamage(20);
  assert.equal(e.save.player.health, before.health);
  assert.equal(e.save.player.poison, before.poison);
  dodging = false;
  consequences.predatorAttack('snake');
  assert.ok(e.save.player.health < before.health);
  assert.ok(e.save.player.poison > before.poison);
});
