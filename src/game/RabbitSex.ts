import type { PartnerTraits, RabbitSex } from './types';

export function rabbitSex(rabbit: Pick<PartnerTraits, 'sex'>): RabbitSex {
  return rabbit.sex ?? 'male';
}

export function adultRabbit(rabbit: Pick<PartnerTraits, 'age'>): boolean {
  return (rabbit.age ?? 3) >= 3;
}
