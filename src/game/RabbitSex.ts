import type { PartnerTraits, RabbitSex, SaveData } from './types';

export function rabbitSex(rabbit: Pick<PartnerTraits, 'sex'>): RabbitSex {
  return rabbit.sex ?? 'male';
}

export function playerSex(player: Pick<SaveData['player'], 'sex'>): RabbitSex {
  return player.sex ?? 'female';
}

export function potentialMate(player: SaveData['player'], rabbit: PartnerTraits): boolean {
  return rabbitSex(rabbit) !== playerSex(player) && adultRabbit(rabbit);
}

export function adultRabbit(rabbit: Pick<PartnerTraits, 'age'>): boolean {
  return (rabbit.age ?? 3) >= 3;
}
