import type { SaveData } from './types';

/** Сохраняет последние сто событий с игровым временем, не раздувая сохранение. */
export class EventJournal {
  static readonly capacity = 100;

  static append(save: SaveData, message: string): void {
    const clock = Math.floor(save.clock),
      day = Math.floor(clock / 1440) + 1;
    const hours = String(Math.floor((clock % 1440) / 60)).padStart(2, '0');
    const minutes = String(clock % 60).padStart(2, '0');
    save.messages.push(`День ${day}, ${hours}:${minutes} · ${message}`);
    if (save.messages.length > this.capacity)
      save.messages.splice(0, save.messages.length - this.capacity);
  }
}
