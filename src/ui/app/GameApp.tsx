import { Button, Dialog, Disclosure, ScrollContainer } from '../shared/ui';
import { ControlGuide } from '../features/control-guide';
import { JournalLog, EventPanel } from '../widgets/events';
import { ActionMenu } from '../widgets/action-menu';
import { GameMenu } from '../widgets/game-menu';
import { MobileUtilities } from '../widgets/mobile-utilities';
import { MobileControls } from '../widgets/mobile-controls';
import { GameHud, LowHealthVignette } from '../widgets/hud';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { UIState, UIStore } from '../store';
import type { MapViewModel } from '../types';
import { DialogView } from '../widgets/conversation';

const UIContext = createContext<UIStore | null>(null);
function useUI<T>(selector: (state: UIState) => T): T {
  const store = useContext(UIContext);
  if (!store) throw new Error('Интерфейс не подключён к хранилищу');
  return useStore(store, selector);
}
function useUIStore() {
  const store = useContext(UIContext);
  if (!store) throw new Error('Нет хранилища интерфейса');
  return store;
}

/** Корневой React-интерфейс подписывает каждый блок только на необходимые ему данные. */
export function GameApp({ store }: { store: UIStore }) {
  const touch = useStore(store, (state) => state.touch);
  const inWorld = useStore(store, (state) => !!state.hud && !state.overlay);
  const health = useStore(
    store,
    (state) => state.hud?.bars.find((bar) => bar.label === 'Здоровье')?.value,
  );
  return (
    <UIContext.Provider value={store}>
      <div className={`ui-layer ${touch ? 'touch-ui' : ''}`}>
        {inWorld && (
          <>
            <LowHealthVignette health={health} />
            <GameHud store={store} />
            <Panels />
            <Controls />
            <Performance />
            <MobileUtilities store={store} />
            <ActionMenu store={store} />
            <EventPanel store={store} />
          </>
        )}
        <Toasts />
        <LoadingOverlay />
        <MobileControls store={store} />
        <GameMenu store={store} />
      </div>
    </UIContext.Provider>
  );
}

function Panels() {
  const store = useUIStore(),
    dispatch = useUI((state) => state.dispatch),
    dialog = useUI((state) => state.dialog),
    journal = useUI((state) => state.journal),
    message = useUI((state) => state.message),
    page = useUI((state) => state.conversationPage),
    focus = useUI((state) => state.focus);
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!dialog) return;

    if (dialog.type === 'remove')
      panel.current?.querySelector<HTMLElement>('[data-action=cancel-remove]')?.focus();
    else if (focus.target === 'message')
      panel.current?.querySelector<HTMLInputElement>('#mate-message')?.focus();
    else panel.current?.focus({ preventScroll: true });

    const chat = panel.current?.querySelector('.mate-chat');
    if (chat) chat.scrollTop = chat.scrollHeight;
  }, [dialog, focus, page]);
  useLayoutEffect(() => {
    if (panel.current) panel.current.scrollTop = 0;
  }, [page]);
  return (
    <>
      {dialog?.type === 'remove' && <div className="confirmation-backdrop" />}
      <Dialog
        ref={panel}
        tabIndex={-1}
        id="dialog"

        aria-label="Общение"
        className={`dialog-panel ${dialog && ['animal', 'partner', 'mate', 'kit'].includes(dialog.type) ? 'conversation-panel' : ''} ${dialog?.type === 'remove' ? 'confirmation-panel' : ''} ${dialog ? '' : 'hidden'}`}
      >
        {dialog && (
          <DialogView
            data={dialog}
            page={page}
            onAction={dispatch}
            message={message}
            onMessage={(value) => store.setState({ message: value })}
          />
        )}
      </Dialog>
      <ScrollContainer
        className={`journal ${journal ? '' : 'hidden'}`}
        label={journal?.mode === 'map' ? 'Карта леса' : 'Лесной дневник'}
      >
        {journal && (
          <>
            <div className="journal-head">
              <h2>{journal.mode === 'map' ? 'Карта леса' : 'Лесной дневник'}</h2>
              <Button
                aria-label="Закрыть"
                onClick={() => dispatch(journal.mode === 'map' ? 'map' : 'journal')}
              >
                ×
              </Button>
            </div>
            {journal.mode === 'map' ? (
              <WorldMap data={journal.map} />
            ) : (
              <>
                <div className="journal-stat">
                  <span>День {journal.save.day}</span>
                  <span>{journal.season}</span>
                  <span>Родились: {journal.save.stats.births}</span>
                  <span>Выросли: {journal.save.stats.grown}</span>
                  <span>Не выжили при родах: {journal.save.stats.stillborn ?? 0}</span>
                </div>
                <JournalLog entries={journal.save.messages} />
                <h3>Семья</h3>
                <p>
                  Партнёр:{' '}
                  {journal.save.partners.find((p) => p.id === journal.save.mateId)?.name ??
                    'пока не найден'}
                </p>
                {journal.save.kits
                  .filter((kit) => kit.alive)
                  .map((kit) => (
                    <div className="kit-row" key={kit.id}>
                      <b>{kit.name}</b>
                      <span>
                        {kit.independent
                          ? 'взрослый · живёт самостоятельно'
                          : `малыш · сытость ${Math.round(kit.hunger)}% · здоровье ${Math.round(kit.health)}%`}{' '}
                        · отец {kit.father}
                      </span>
                    </div>
                  ))}
                <h3>Раскопки и запасы</h3>
                {journal.save.stashes.map((stash) => (
                  <div className="kit-row" key={stash.id}>
                    <b>Тайник {stash.id}</b>
                    <span>
                      Еда: {Object.values(stash.food).reduce((sum, count) => sum + (count ?? 0), 0)}{' '}
                      · ветки: {stash.materials?.twigs ?? 0} · трава: {stash.materials?.grass ?? 0}{' '}
                      · пух: {stash.materials?.fur ?? 0}
                    </span>
                  </div>
                ))}
                <p>
                  Выкопано участков: {journal.save.excavation.length}. Максимальная глубина — 50 м.
                  Роды безопасны в гнезде под землёй.
                </p>
                <h3>Как выжить</h3>
                <p>
                  Зимой запасай пищу в тайнике (K). У воды можно пить (V). Tab открывает команды
                  партнёра. Вылизывай шерсть (C), корми детей (F/Y) и возвращайся в укрытие перед
                  холодной ночью.
                </p>
              </>
            )}
          </>
        )}
      </ScrollContainer>
    </>
  );
}

function WorldMap({ data }: { data: MapViewModel }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const position = (n: number) => (n / (data.size * 2) + 0.5) * 420;
    data.colors.forEach((color, index) => {
      ctx.fillStyle = color;
      ctx.fillRect((index % 60) * 7, Math.floor(index / 60) * 7, 7, 7);
    });
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const body of data.water) {
      const color = body.kind === 'lake' ? '#438da2' : body.kind === 'bog' ? '#566b51' : '#68b1c4';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      const [start, ...rest] = body.points;
      const radius = (body.radius / data.size) * 210;
      ctx.beginPath();
      if (rest.length === 0) {
        ctx.arc(position(start.x), position(start.z), radius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.moveTo(position(start.x), position(start.z));
        for (const point of rest) ctx.lineTo(position(point.x), position(point.z));
        ctx.lineWidth = radius * 2;
        ctx.stroke();
      }
    }
    for (const landmark of data.landmarks) {
      ctx.fillStyle = '#f8e9cc';
      ctx.beginPath();
      ctx.arc(position(landmark.x), position(landmark.z), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '11px sans-serif';
      ctx.fillText(landmark.label, position(landmark.x) + 8, position(landmark.z) + 4);
    }

    for (const opening of data.openings) {
      ctx.fillStyle = '#513d2b';
      ctx.beginPath();
      ctx.arc(position(opening.x), position(opening.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#24382b';
    ctx.lineWidth = 2;
    ctx.save();
    ctx.translate(position(data.player.x), position(data.player.z));
    ctx.rotate(data.player.heading);
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }, [data]);
  return (
    <>
      <p>
        Белая стрелка показывает твоё положение и направление взгляда. Тёмные круги — входы в норы.
        Голубое — вода, серое — горы.
      </p>
      <canvas ref={canvas} width={420} height={420} />
    </>
  );
}

function Controls() {
  const visible = useUI((state) => state.showControls);
  return (
    <Disclosure
      className={`controls controls-hint ${visible ? '' : 'hidden'}`}
      summary="Управление ⌨"
    >
      <ControlGuide />
    </Disclosure>
  );
}

function Toasts() {
  const store = useUIStore(),
    toasts = useUI((state) => state.toasts);
  const trapped = useUI((state) => !!state.hud?.web);
  const touch = useUI((state) => state.touch);
  const overlay = useUI((state) => state.overlay);
  if (touch && !overlay) return null;
  return (
    <div className={`toast-box ${overlay ? 'toast-box-overlay' : trapped ? 'web-toasts' : ''}`}>
      {(touch ? toasts.slice(-1) : toasts).map((toast) => (
        <Toast
          key={toast.id}
          text={toast.text}
          remove={() =>
            store.setState((state) => ({ toasts: state.toasts.filter((t) => t.id !== toast.id) }))
          }
        />
      ))}
    </div>
  );
}
function Toast({ text, remove }: { text: string; remove: () => void }) {
  const [fade, setFade] = useState(false),
    removeRef = useRef(remove);
  removeRef.current = remove;
  useEffect(() => {
    const fadeTimer = setTimeout(() => setFade(true), 4100),
      removeTimer = setTimeout(() => removeRef.current(), 4450);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);
  return <div className={`toast ${fade ? 'fade' : ''}`}>{text}</div>;
}

function LoadingOverlay() {
  const overlay = useUI((state) => state.overlay);
  if (overlay?.type !== 'loading') return null;
  return (
    <div className="overlay" role="status">
      <h1>{overlay.title}</h1>
    </div>
  );
}

function Performance() {
  const text = useUI((state) => state.performance);
  return text ? <pre className="performance-panel">{text}</pre> : null;
}
