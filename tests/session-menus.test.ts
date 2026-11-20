import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SessionMenus } from '../src/game/session/SessionMenus';
import { SessionActions } from '../src/game/session/SessionActions';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { RabbitFactory } from '../src/game/animals';
import { Random } from '../src/game/Random';
import { GenomeValidation } from '../src/game/genetics/GenomeValidation';
import { InteractionInput } from '../src/game/InteractionInput';
import { GameUI } from '../src/ui/GameUI';
import { createUIStore, simulationPaused, blockingPanelOpen } from '../src/ui/store';
import { GameMenu, SaveLibrary } from '../src/ui/widgets/game-menu';
import { ActionMenu } from '../src/ui/widgets/action-menu';
import { EventPanel } from '../src/ui/widgets/events';
import { MobileUtilities } from '../src/ui/widgets/mobile-utilities';
import { MenuTrigger } from '../src/ui/features/menu-trigger';
import { GameApp } from '../src/ui/app';
import type { HudView } from '../src/ui/types';

const game = (seed: number) =>
  NewGameFactory.create(seed, 0, new RabbitFactory(new Random(seed + 53)));
function fixture() {
  const store = createUIStore(() => {});
  const ui = {
    store,
    get state() {
      return store.getState();
    },
    get panelsOpen() {
      return blockingPanelOpen(store.getState());
    },
    closePanels(next?: Parameters<GameUI['closePanels']>[0]) {
      GameUI.prototype.closePanels.call(this as GameUI, next);
    },
  };
  let unlocked = 0,
    resumed = 0,
    cleared = 0,
    refreshed = 0;
  const menus = new SessionMenus({
    ui,
    view: {
      unlock() {
        unlocked++;
      },
    },
    interactions: {
      clearSelection() {
        cleared++;
      },
      close() {
        ui.closePanels();
        resumed++;
      },
    },
    resetInput() {
      cleared++;
    },
    refreshHud() {
      refreshed++;
    },
  });
  return { ui, store, menus, counts: () => ({ unlocked, resumed, cleared, refreshed }) };
}

test('founder is deterministic, varied and can have inherited-anatomy defects without invented parents', () => {
  const first = game(91),
    second = game(91);
  assert.deepEqual(first.player.genes, second.player.genes);
  assert.equal(first.player.lineage!.generation, 1);
  assert.deepEqual(first.player.lineage!.ancestors, []);
  const founders = Array.from({ length: 600 }, (_, seed) => game(seed).player.genes);
  assert.ok(founders.every(GenomeValidation.valid));
  assert.equal(new Set(founders.map((g) => g.coat)).size, 5);
  assert.equal(new Set(founders.map((g) => g.eyeShape)).size, 3);
  assert.equal(new Set(founders.map((g) => g.earType)).size, 3);
  assert.ok(founders.some((g) => g.anatomy.legs === 0));
  assert.ok(founders.some((g) => g.anatomy.ears !== 2));
  assert.ok(founders.some((g) => g.anatomy.eyes !== 2));
  assert.ok(founders.some((g) => g.anatomy.fangs));
  assert.ok(founders.some((g) => g.vitality === 1) && founders.some((g) => g.vitality === 5));
  first.player.genes.anatomy.ears = first.player.genes.anatomy.ears === 0 ? 2 : 0;
  assert.notDeepEqual(first.player.genes, second.player.genes);
});

test('founder randomization does not consume partner population random stream', () => {
  const expected = new RabbitFactory(new Random(144)).partners(16);
  const save = NewGameFactory.create(91, 0, new RabbitFactory(new Random(144)));
  assert.deepEqual(save.partners, expected);
});

test('game menu, action panel and events are mutually exclusive and resume through the interaction controller', () => {
  const { ui, store, menus, counts } = fixture();
  store.setState({ statusOpen: true, actionMenuOpen: true });
  menus.showGame();
  assert.equal(store.getState().gameMenu, 'main');
  assert.equal(store.getState().actionMenuOpen, false);
  assert.equal(store.getState().statusOpen, true);
  assert.equal(simulationPaused(store.getState()), true);
  menus.execute('settings');
  assert.equal(store.getState().gameMenu, 'settings');
  menus.execute('controls-help');
  assert.equal(store.getState().settingsTab, 'controls');
  menus.execute('continue-menu');
  assert.equal(store.getState().gameMenu, 'main');
  menus.execute('world-actions');
  assert.equal(store.getState().gameMenu, undefined);
  assert.equal(store.getState().actionMenuOpen, true);
  store.setState({ unreadEvents: 7 });
  menus.execute('events-panel');
  assert.equal(store.getState().actionMenuOpen, false);
  assert.equal(store.getState().eventsOpen, true);
  assert.equal(store.getState().unreadEvents, 0);
  menus.execute('events-panel');
  assert.equal(blockingPanelOpen(store.getState()), false);
  assert.equal(counts().resumed, 1);
  assert.equal(counts().unlocked, 3);
  store.setState({ familyOpen: true, actionMenuOpen: true, eventsOpen: true });
  GameUI.prototype.showJournal.call(ui as GameUI, {
    mode: 'map',
    map: { colors: [], water: [], landmarks: [], openings: [], player: { x: 0, z: 0, heading: 0 } },
  });
  assert.equal(store.getState().familyOpen, false);
  assert.equal(store.getState().actionMenuOpen, false);
  assert.equal(store.getState().eventsOpen, false);
  assert.equal(store.getState().journal?.mode, 'map');
});

test('Escape resumes from any pause tab while keeping submenu back navigation and text input', () => {
  const input = new InteractionInput();
  const context = {
    playing: true,
    dialogOpen: false,
    panelsOpen: true,
    mateMenuOpen: false,
    editable: false,
  };
  assert.equal(input.action('Escape', { ...context, gameMenu: 'settings' }), 'close-panels');
  assert.equal(
    input.action('Escape', { ...context, gameMenu: 'new-game', editable: true }),
    'close-panels',
  );
  assert.equal(input.action('Escape', { ...context, gameMenu: 'main' }), 'close-panels');
  assert.equal(input.action('Escape', { ...context, gameMenu: 'saves' }), 'close-panels');
  assert.equal(input.action('Escape', { ...context, gameMenu: 'burrow' }), 'menu-back');
  assert.equal(input.action('Backquote', { ...context, gameMenu: 'settings' }), undefined);
  assert.equal(input.action('KeyM', { ...context, gameMenu: 'main' }), undefined);
  assert.equal(input.action('Backquote', { ...context, panelsOpen: false }), 'world-actions');
  assert.equal(input.action('Backquote', { ...context, editable: true }), undefined);
});

test('saving keeps the pause menu open and world commands close only their action panel', () => {
  const { ui, store } = fixture();
  let saves = 0,
    resumed = 0;
  let saveRequest: [boolean, boolean | undefined] | undefined;
  let inspections = 0;
  const sound = { unlock() {}, play() {} };
  const actions = new SessionActions({
    ui,
    web: { trapped: false },
    sound,
    resetInput() {},
    refreshHud() {},
    inspectBurrow() {
      inspections++;
    },
    view: { unlock() {} },
    interactions: {
      clearSelection() {},
      close() {
        ui.closePanels();
        resumed++;
      },
    },
    grooming: { execute: () => false },
    shelters: { execute: () => false },
    persist: (notify, manual) => {
      saves++;
      saveRequest = [notify, manual];
    },
    toast() {},
    environment: { execute() {} },
    inventory: { execute: () => false },
  } as unknown as ConstructorParameters<typeof SessionActions>[0]);
  actions.showMenu();
  actions.execute('save');
  assert.equal(saves, 1);
  assert.deepEqual(saveRequest, [true, true]);
  assert.equal(store.getState().gameMenu, 'main');
  assert.equal(resumed, 0);
  actions.execute('settings');
  assert.equal(store.getState().gameMenu, 'settings');
  actions.execute('world-actions');
  actions.execute('drink');
  assert.equal(store.getState().actionMenuOpen, false);
  assert.equal(resumed, 1);
  actions.execute('burrow-plan');
  assert.equal(inspections, 1);
  assert.equal(store.getState().gameMenu, 'burrow');
  assert.equal(simulationPaused(store.getState()), true);
  actions.execute('menu-back');
  assert.equal(store.getState().gameMenu, 'main');
});

test('pause menu contains session controls and action panel contains only world actions', () => {
  const store = createUIStore(() => {});
  store.getInitialState = store.getState;
  store.setState({ gameMenu: 'main' });
  const main = renderToStaticMarkup(createElement(GameMenu, { store }));
  assert.match(main, /Создать сохранение/);
  assert.match(main, /Продолжить игру/);
  assert.match(main, /Загрузить игру/);
  assert.match(main, /Новая игра/);
  assert.match(main, /Настройки/);
  assert.match(main, /id="pause-tabs"/);
  assert.match(main, /aria-label="Меню игры" aria-orientation="vertical"/);
  assert.match(main, /role="tabpanel"/);
  assert.doesNotMatch(main, /Кормить молоком/);
  store.setState({ gameMenu: undefined, actionMenuOpen: true });
  const world = renderToStaticMarkup(createElement(ActionMenu, { store }));
  assert.match(world, /Действия в мире/);
  assert.match(world, /Кормить молоком/);
  assert.doesNotMatch(world, /Сохранить|Настройки|Полный экран/);
  store.setState({ actionMenuOpen: false, gameMenu: 'new-game' });
  const confirmation = renderToStaticMarkup(createElement(GameMenu, { store }));
  assert.match(confirmation, /Разделы настроек мира/);
  assert.match(confirmation, /data-settings-tab="calendar" hidden=""/);
  assert.match(confirmation, /отдельное сохранение/);
  assert.match(confirmation, /Название приключения/);
  assert.match(confirmation, /aria-label="Закрыть меню"/);
});

test('settings show the selected section with graphics, controls, audio and interface tabs', () => {
  const store = createUIStore(() => {});
  store.setState({ gameMenu: 'settings', touch: true });
  store.getInitialState = store.getState;
  const render = () => renderToStaticMarkup(createElement(GameMenu, { store }));
  const graphics = render();
  for (const label of ['Разделы настроек', 'Графика', 'Управление', 'Звук', 'Интерфейс', 'Тени'])
    assert.ok(graphics.includes(label));
  assert.doesNotMatch(graphics, /Показатели производительности/);

  store.setState({ settingsTab: 'audio', soundMuted: true });
  assert.match(render(), /aria-pressed="false"[^>]*>Звук мира/);
  store.setState({ settingsTab: 'controls' });
  assert.match(render(), /Джойстик/);
  store.setState({ settingsTab: 'interface', performanceEnabled: true });
  const mobile = render();
  assert.match(mobile, /Показатели производительности/);
  assert.doesNotMatch(mobile, /Подсказка управления/);
  store.setState({ touch: false });
  assert.match(render(), /Подсказка управления/);
});

test('mobile utilities expose game menu and event history without showing event text', () => {
  const store = createUIStore(() => {});
  store.getInitialState = store.getState;
  store.setState({
    touch: true,
    fullscreen: true,
    fullscreenAvailable: true,
    hud: {} as HudView,
    unreadEvents: 4,
    events: ['СЕКРЕТНОЕ СОБЫТИЕ'],
  });
  const compact = renderToStaticMarkup(createElement(MobileUtilities, { store }));
  assert.doesNotMatch(compact, /Свернуть полный экран/);
  assert.match(compact, /Меню игры/);
  assert.match(compact, /События/);
  assert.doesNotMatch(compact, /СЕКРЕТНОЕ/);
  store.setState({ eventsOpen: true });
  const panel = renderToStaticMarkup(createElement(EventPanel, { store }));
  assert.match(panel, /СЕКРЕТНОЕ СОБЫТИЕ/);
  store.setState({ touch: false });
  assert.equal(renderToStaticMarkup(createElement(MobileUtilities, { store })), '');
});

test('desktop exposes a corner menu button and fullscreen belongs to the pause header', () => {
  const store = createUIStore(() => {});
  store.getInitialState = store.getState;
  store.setState({ hud: {} as HudView, fullscreenAvailable: true });
  const main = renderToStaticMarkup(createElement(MenuTrigger, { store }));
  assert.match(main, /aria-label="Меню игры"/);
  assert.doesNotMatch(main, /Развернуть на весь экран/);
  store.setState({ gameMenu: 'main' });
  assert.match(
    renderToStaticMarkup(createElement(GameMenu, { store })),
    /pause-header[\s\S]*Развернуть на весь экран/,
  );
});

test('first launch opens the new game tab in the full menu, including in portrait', () => {
  const { ui, store } = fixture();
  store.getInitialState = store.getState;
  store.setState({ touch: true, portrait: true });
  GameUI.prototype.showOverlay.call(ui as GameUI, { type: 'start' });

  const markup = renderToStaticMarkup(createElement(GameApp, { store }));

  assert.match(markup, /pause-header[\s\S]*fullscreen-button/);
  assert.match(markup, /id="pause-tab-new-game" role="tab" aria-selected="true"/);
  assert.equal((markup.match(/role="tab" aria-selected/g) ?? []).length, 8);
  assert.match(markup, /Начать новую игру/);
  assert.doesNotMatch(markup, /Закрыть меню|Поверни устройство|Создать сохранение/);
});

test('with a save the opening menu offers to continue the latest adventure', () => {
  const { ui, store } = fixture();
  store.getInitialState = store.getState;
  store.setState({
    saveSlots: [{ ...sampleSaveSlot, supported: false }, sampleSaveSlot],
  });
  GameUI.prototype.showOverlay.call(ui as GameUI, { type: 'start' });
  const markup = renderToStaticMarkup(createElement(GameApp, { store }));
  assert.match(markup, /id="pause-tab-main" role="tab" aria-selected="true"/);
  assert.match(markup, /Продолжить с последнего сохранения/);
  assert.match(markup, /Тихий лес · день 2/);
  assert.doesNotMatch(markup, /Вернуться в игру|Создать сохранение/);
});

test('low-health warning appears below twenty percent only', () => {
  const store = createUIStore(() => {});
  const hud: HudView = {
    status: '● В ЛЕСУ',
    bars: [{ label: 'Здоровье', value: 20, color: '#dc9f9a', icon: '♥' }],
    temperature: 38,
    inventory: [],
    carried: 0,
    capacity: 0,
    milk: 0,
    materials: { grass: 0, twigs: 0, fur: 0 },
    young: [],
    familyText: '',
    grown: 0,
    nests: 0,
    birthWarning: false,
    worldInfo: [],
    prompt: [],
  };
  store.setState({ hud });
  store.getInitialState = store.getState;

  const normalHealth = renderToStaticMarkup(createElement(GameApp, { store }));
  assert.doesNotMatch(normalHealth, /low-health-vignette/);

  store.setState({
    hud: {
      ...hud,
      bars: [{ ...hud.bars[0], value: 19 }],
    },
  });
  const lowHealth = renderToStaticMarkup(createElement(GameApp, { store }));
  assert.match(lowHealth, /low-health-vignette/);
  assert.match(lowHealth, /aria-hidden="true"/);
});

const preview = 'data:image/jpeg;base64,c25hcHNob3Q=';
const sampleSaveSlot = {
  id: 'manual-1',
  adventureId: 'adventure-1',
  adventureName: 'Тихий лес',
  name: 'Сохранение 1',
  kind: 'manual',
  createdAt: 1,
  updatedAt: 1,
  version: 5,
  day: 2,
  clock: 540,
  seed: 1,
  biome: 'forest',
  worldSize: 100,
  playerX: 0,
  playerZ: 0,
  playerCoat: 'cream',
  supported: true,
  preview,
} as const;

test('save library displays the stored image snapshot instead of a generated map', () => {
  const store = createUIStore(() => {});
  store.getInitialState = store.getState;
  store.setState({ saveSlots: [sampleSaveSlot] });

  const markup = renderToStaticMarkup(createElement(SaveLibrary, { store }));

  assert.match(markup, /<img[^>]+src="data:image\/jpeg;base64,c25hcHNob3Q="/);
  assert.match(markup, /alt="Снимок игры «Тихий лес»"/);
  assert.doesNotMatch(markup, /<svg/);
});

test('event history retains one hundred records, counts unseen messages and resets at a new session', () => {
  const { ui, store } = fixture();
  const facade = ui as GameUI;
  GameUI.prototype.setEvents.call(
    facade,
    Array.from({ length: 120 }, (_, i) => 'Событие ' + i),
    true,
  );
  assert.equal(store.getState().events.length, 100);
  assert.equal(store.getState().events[0], 'Событие 20');
  assert.equal(store.getState().unreadEvents, 1);
  store.setState({ eventsOpen: true });
  GameUI.prototype.setEvents.call(facade, ['Новая запись'], true);
  assert.equal(store.getState().unreadEvents, 0);
  store.setState({ eventsOpen: false, unreadEvents: 5 });
  GameUI.prototype.setEvents.call(facade, []);
  assert.equal(store.getState().events.length, 0);
  assert.equal(store.getState().unreadEvents, 0);
});
