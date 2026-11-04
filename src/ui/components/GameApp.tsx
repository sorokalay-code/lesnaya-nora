import { Button, Dialog, Disclosure, Meter } from '../kit';
import { ControlGuide } from './ControlGuide';
import { JournalLog } from './JournalLog';
import { WebNotice } from './WebNotice';
import { AirliftNotice } from './AirliftNotice';
import { ActionMenu } from './ActionMenu';
import { GameMenu } from './GameMenu';
import { MobileUtilities } from './MobileUtilities';
import { EventPanel } from './EventPanel';
import { MobileControls } from './MobileControls';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { UIState, UIStore } from '../store';
import type { MapViewModel } from '../types';
import { DialogView } from './Dialogs';

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
  return (
    <UIContext.Provider value={store}>
      <div className={`ui-layer ${touch ? 'touch-ui' : ''}`}>
        <Toolbar />
        <Hud />
        <Panels />
        <Controls />
        <Toasts />
        <Overlay />
        <Performance />
        <MobileControls store={store} />
        <MobileUtilities store={store} />
        <ActionMenu store={store} />
        <GameMenu store={store} />
        <EventPanel store={store} />
      </div>
    </UIContext.Provider>
  );
}

function Toolbar() {
  const fullscreen = useUI((s) => s.fullscreen);
  const fullscreenAvailable = useUI((s) => s.fullscreenAvailable);
  const dispatch = useUI((state) => state.dispatch),
    hud = useUI((state) => state.hud),
    first = useUI((state) => state.firstPerson);
  return (
    <>
      <div className="topbar">
        <div className="brand">
          <span className="brand-icon">✦</span>
          <span>
            ЛЕСНАЯ НОРА<small>история дикой крольчихи</small>
          </span>
        </div>
        <div id="world-info" className="world-info">
          {hud?.worldInfo.map((text) => (
            <span key={text}>{text}</span>
          ))}
        </div>
        <div className="top-actions">
          <Button onClick={() => dispatch('camera')}>◉ {first ? '1' : '3'}-е лицо</Button>
          <Button
            disabled={!fullscreenAvailable}
            onClick={() => dispatch('fullscreen')}
            title="Полноэкранный режим"
          >
            {fullscreen ? '⤢ Свернуть' : '⛶ Полный экран'}
          </Button>
          <Button onClick={() => dispatch('menu')}>☰ Меню · Esc</Button>
          <Button onClick={() => dispatch('world-actions')}>✦ Действия · Ё</Button>
        </div>
      </div>
      <div className="family-avatars">
        <Button className="avatar-chip" onClick={() => dispatch('self-profile')}>
          <span className="avatar-face">🐰</span>
          <span>
            {hud?.playerName ?? 'Ты'} <small>крольчиха</small>
          </span>
        </Button>
        <Button
          className={`avatar-chip ${hud?.mate ? 'paired' : ''}`}
          title="Tab — партнёр: команды и сообщения"
          onClick={() => dispatch('mate-panel')}
        >
          <span className="avatar-face">{hud?.mate ? '🐰' : '♡'}</span>
          <span>
            {hud?.mate?.name ?? 'Партнёр'}
            <small>Tab · {hud?.mate ? 'команды и чат' : 'пока не найден'}</small>
          </span>
        </Button>
      </div>
      <div className={`dig-reticle ${first ? '' : 'hidden'}`} aria-hidden="true">
        ✦
      </div>
    </>
  );
}

function Hud() {
  const dispatch = useUI((s) => s.dispatch);
  const touch = useUI((s) => s.touch);
  const expanded = useUI((s) => s.statusOpen);
  const familyOpen = useUI((s) => s.familyOpen);
  const hud = useUI((state) => state.hud);
  if (!hud) return null;

  return (
    <>
      <WebNotice web={hud.web} touch={touch} />
      <AirliftNotice view={hud.airlift} />
      <div className={`kit-progress ${familyOpen ? '' : 'hidden'}`}>
        <b>РОСТ КРОЛЬЧАТ</b>
        {!hud.young.length && <p>Крольчат пока нет. Подробности семьи — в дневнике.</p>}
        {hud.young.map((kit) => (
          <div className="kit-progress-row" key={kit.id}>
            <span>
              <strong>{kit.name}</strong>
              <small>
                {kit.progress}% · до взросления {kit.daysLeft} дн.
              </small>
            </span>
            <Meter className="kit-growth-meter" label={`Рост: ${kit.name}`} value={kit.progress} />
            <small>
              Сытость {Math.round(kit.hunger)}% · {kit.care}
            </small>
          </div>
        ))}
        {!!hud.lineageMembers?.length && (
          <>
            <h3>Продолжить линию</h3>
            <p>Выбери взрослую крольчиху, чтобы посмотреть гены или играть за неё.</p>
            {hud.lineageMembers.map((member) => (
              <Button
                className="lineage-member"
                key={member.id}
                onClick={() => dispatch('family-member:' + member.id)}
              >
                <b>♀ {member.name}</b>
                <small>
                  {member.relationship} · поколение {member.generation} ›
                </small>
              </Button>
            ))}
          </>
        )}
      </div>
      <Button
        className="status-toggle"
        title="I — свернуть или развернуть состояние без паузы"
        aria-expanded={expanded}
        onClick={() => dispatch('status-panel')}
      >
        <span className="compact-vitals">
          {['Здоровье', 'Силы', 'Сытость', 'Жажда'].map((label) => {
            const bar = hud.bars.find((item) => item.label === label);
            return (
              bar && (
                <span
                  key={label}
                  title={label}
                  aria-label={`${label}: ${Math.round(bar.value)}%`}
                  className={bar.value < 15 ? 'low-vital' : ''}
                >
                  {bar.icon}
                  {Math.round(bar.value)}
                </span>
              )
            );
          })}
        </span>
        <small>
          Состояние {!touch && <kbd>I</kbd>} {hud.birthWarning ? ' ⚠ Роды!' : ''}{' '}
          {expanded ? '▴' : '▾'}
        </small>
      </Button>
      <Button
        className="family-toggle"
        aria-expanded={familyOpen}
        onClick={() => dispatch('family-panel')}
      >
        🐇 Семья · {hud.familyCount ?? hud.young.length} {familyOpen ? '×' : '▾'}
      </Button>
      <div className="hud">
        <div className="status-card">
          <div className="card-heading">
            СОСТОЯНИЕ <span>{hud.status}</span>
          </div>
          {hud.bars.map((bar) => (
            <div className="stat" key={bar.label}>
              <span>
                {bar.icon} {bar.label}
              </span>
              <Meter
                className="meter"
                label={bar.label}
                value={Math.round(bar.value)}
                color={bar.color}
              />
              <b>{Math.round(bar.value)}</b>
            </div>
          ))}
          <div className="temperature">
            Температура тела: <b>{hud.temperature.toFixed(1)}°</b>{' '}
            {hud.temperature < 34 ? '⚠ Переохлаждение' : ''}
          </div>
          <div className="inventory">
            <b>
              ЕДА {hud.carried}/{hud.capacity} · МОЛОКО {Math.round(hud.milk)}%
            </b>
            <div>
              {hud.inventory.length ? (
                hud.inventory.map((food) => (
                  <span key={food.kind} title={food.label}>
                    {food.emoji} {food.count}
                  </span>
                ))
              ) : (
                <span>Пусто</span>
              )}
            </div>
            <small>
              Трава {hud.materials.grass} · ветки {hud.materials.twigs} · пух {hud.materials.fur}
            </small>
          </div>
        </div>
        <div className="family-card">
          <div className="card-heading">МОЯ СЕМЬЯ</div>
          <strong>
            {hud.young.length} <small>крольчат</small>
          </strong>
          <span>{hud.familyText}</span>
          <div className="family-line">
            <span>Выросли: {hud.grown}</span>
            <span>Гнёзда: {hud.nests}</span>
          </div>
          {hud.birthWarning && (
            <div className="birth-warning">⚠ Скоро роды: вернись в подземное гнездо</div>
          )}
        </div>
      </div>
      <div className="prompt">
        {hud.prompt.map((part, index) => (
          <span key={index}>
            {index > 0 ? ' · ' : ''}
            {part.key && <kbd>{part.key}</kbd>}{' '}
            {touch ? part.text.replaceAll('ЛКМ', '«Копать»') : part.text}
          </span>
        ))}
      </div>
    </>
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
      <div className={`journal ${journal ? '' : 'hidden'}`}>
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
      </div>
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
    ctx.beginPath();
    ctx.arc(position(data.player.x), position(data.player.z), 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, [data]);
  return (
    <>
      <p>Белая точка — ты. Тёмные круги — выкопанные входы.</p>
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
    <div className={trapped ? 'toast-box web-toasts' : 'toast-box'}>
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

function Overlay() {
  const overlay = useUI((state) => state.overlay),
    dispatch = useUI((state) => state.dispatch);
  return (
    <div className={`overlay ${overlay ? '' : 'hidden'}`}>
      {overlay?.type === 'start' ? (
        <div className="start-card">
          <div className="eyebrow">✦ ТВОЯ ИСТОРИЯ НАЧИНАЕТСЯ ЗДЕСЬ</div>
          <h1>
            Лесная
            <br />
            <em>нора</em>
          </h1>
          <p>
            Один лес. Тысячи историй. Найди свой дом, вырасти семью и проживи жизнь дикой крольчихи.
          </p>
          <div className="start-actions">
            <Button variant="primary" onClick={() => dispatch('new-game-menu')}>
              Новая история <span>→</span>
            </Button>
            {overlay.hasSave && (
              <Button className="secondary" onClick={() => dispatch('load')}>
                Продолжить сохранение
              </Button>
            )}
          </div>
          <div className="start-foot">
            Случайная крольчиха и её гены · возможны врождённые дефекты
          </div>
        </div>
      ) : overlay?.type === 'loading' ? (
        <div className="start-card">
          <h1>{overlay.title}</h1>
          <p>Загружаем животных и их движения.</p>
        </div>
      ) : overlay?.type === 'gameover' ? (
        <div className="dialog-card">
          <div className="eyebrow">ЛЕС ПОМНИТ КАЖДУЮ ИСТОРИЮ</div>
          <h2>История завершилась</h2>
          <p>
            Ты прожила {overlay.day} дней, дала жизнь {overlay.births} крольчатам и вырастила{' '}
            {overlay.grown} из них.
          </p>
          <div className="dialog-actions">
            <Button variant="primary" onClick={() => dispatch('new-game-menu')}>
              Начать новую историю
            </Button>
            <Button onClick={() => dispatch('load')}>Вернуться к сохранению</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Performance() {
  const text = useUI((state) => state.performance);
  return text ? <pre className="performance-panel">{text}</pre> : null;
}
