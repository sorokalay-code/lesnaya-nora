import { useState } from 'react';
import { useStore } from 'zustand';
import type { UIStore } from '../store';
import type { SaveSlotSummary } from '../types';
import { Button, ScrollContainer } from '../kit';

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
  return slot.preview ? (
    <img
      className="save-world-preview"
      src={slot.preview}
      alt={`Снимок игры «${slot.adventureName}»`}
    />
  ) : (
    <div className="save-world-preview save-world-preview-empty" aria-label="Снимок недоступен">
      Снимок недоступен
    </div>
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
