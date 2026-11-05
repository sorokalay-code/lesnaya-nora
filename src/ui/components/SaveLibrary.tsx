import { useState } from 'react';
import { useStore } from 'zustand';
import type { UIStore } from '../store';
import type { SaveSlotSummary } from '../types';
import { Button, ScrollContainer } from '../kit';

const biomeColors: Record<string, [string, string]> = {
  forest: ['#294936', '#56764b'],
  meadow: ['#718d4a', '#b5b974'],
  swamp: ['#495b3f', '#7b8560'],
  garden: ['#765d43', '#a88a57'],
};

/** Показывает доступные миры, снимки, их состояние и действия загрузки или удаления. */
export function SaveLibrary({ store }: { store: UIStore }) {
  const slots = useStore(store, (state) => state.saveSlots);
  const legacyFound = useStore(store, (state) => state.legacySaveFound);
  const error = useStore(store, (state) => state.saveLibraryError);
  const dispatch = useStore(store, (state) => state.dispatch);
  const [deleteId, setDeleteId] = useState<string>();

  return (
    <section className="save-library" aria-label="Список приключений и сохранений">
      {error && (
        <p className="save-library-error" role="alert">
          {error}
        </p>
      )}
      {legacyFound && (
        <p className="save-library-legacy" role="status">
          Найдены сохранения старого формата. Версия 5 их не поддерживает — начни новое приключение.
        </p>
      )}
      {!slots.length && !legacyFound ? (
        <p className="save-library-empty">Сохранений пока нет. Создай новое приключение.</p>
      ) : (
        <ScrollContainer className="save-slot-list" label="Сохранения">
          {slots.map((slot) => (
            <SaveCard
              key={slot.id}
              slot={slot}
              deleting={deleteId === slot.id}
              onLoad={() => dispatch('load-save', slot.id)}
              onDelete={() => {
                if (deleteId === slot.id) {
                  dispatch('delete-save', slot.id);
                  setDeleteId(undefined);
                } else setDeleteId(slot.id);
              }}
              onCancelDelete={() => setDeleteId(undefined)}
            />
          ))}
        </ScrollContainer>
      )}
    </section>
  );
}

function SaveCard({
  slot,
  deleting,
  onLoad,
  onDelete,
  onCancelDelete,
}: {
  slot: SaveSlotSummary;
  deleting: boolean;
  onLoad: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
}) {
  return (
    <article className={`save-card ${slot.supported ? '' : 'save-card-unsupported'}`}>
      <WorldPreview slot={slot} />
      <div className="save-card-details">
        <div className="save-card-heading">
          <div>
            <h3>{slot.name}</h3>
            <strong>{slot.adventureName}</strong>
          </div>
          <span className="save-slot-kind">
            {slot.kind === 'autosave' ? 'Авто' : 'Снимок'} · v{slot.version}
          </span>
        </div>
        <p>
          {formatDate(slot.updatedAt)} · День {slot.day}, {formatGameTime(slot.clock)}
        </p>
        {!slot.supported && (
          <p className="save-card-warning" role="status">
            Эта версия формата не поддерживается
          </p>
        )}
        {deleting ? (
          <div className="save-card-actions">
            <span>Удалить это сохранение?</span>
            <Button variant="danger" onClick={onDelete}>
              Удалить
            </Button>
            <Button onClick={onCancelDelete}>Отмена</Button>
          </div>
        ) : (
          <div className="save-card-actions">
            <Button disabled={!slot.supported} variant="primary" onClick={onLoad}>
              Продолжить
            </Button>
            <Button onClick={onDelete}>Удалить</Button>
          </div>
        )}
      </div>
    </article>
  );
}

function WorldPreview({ slot }: { slot: SaveSlotSummary }) {
  const [background, foreground] = biomeColors[slot.biome] ?? biomeColors.forest;
  const trees = Array.from({ length: 28 }, (_, index) => {
    const x = ((slot.seed * (index + 7) * 13) % 170) + 5;
    const y = ((slot.seed * (index + 11) * 7) % 76) + 5;
    const radius = 2 + ((slot.seed + index * 3) % 3);
    return { x, y, radius };
  });
  const playerX = Math.max(
    12,
    Math.min(168, 12 + (slot.playerX / Math.max(1, slot.worldSize) + 0.5) * 156),
  );
  const playerY = Math.max(
    9,
    Math.min(81, 9 + (slot.playerZ / Math.max(1, slot.worldSize) + 0.5) * 72),
  );

  return (
    <svg
      className="save-world-preview"
      viewBox="0 0 180 90"
      role="img"
      aria-label={`Карта мира «${slot.adventureName}»`}
    >
      <rect width="180" height="90" fill={background} />
      <path d="M0 64 Q42 42 74 61 T140 53 T180 61 V90 H0Z" fill={foreground} opacity=".7" />
      {slot.seed % 2 === 0 && (
        <path
          d="M12 82 Q54 55 78 70 T139 46 T180 31"
          fill="none"
          stroke="#8ac4c3"
          strokeWidth="5"
          opacity=".8"
        />
      )}
      {trees.map((tree, index) => (
        <circle
          key={index}
          cx={tree.x}
          cy={tree.y}
          r={tree.radius}
          fill={index % 2 ? '#193b2b' : '#355c38'}
          opacity=".9"
        />
      ))}
      <circle cx={playerX} cy={playerY} r="5" fill="#f1d479" stroke="#183727" strokeWidth="2" />
    </svg>
  );
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatGameTime(clock: number): string {
  const minutes = ((Math.floor(clock) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
