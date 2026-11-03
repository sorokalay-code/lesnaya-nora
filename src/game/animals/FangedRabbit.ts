import { RabbitActor } from './RabbitActor';

/** Клыкастая мутация остаётся кроликом для генов и общения, но живёт одна и охотится через RabbitPredation. */
export class FangedRabbit extends RabbitActor {
  override get solitary(): boolean {
    return true;
  }
}
