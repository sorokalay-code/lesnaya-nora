import assert from 'node:assert/strict';
import test from 'node:test';
import { GameInputController } from '../src/game/input/GameInputController';
import { MobileInput, needsLandscape } from '../src/game/input/MobileInput';
import { createUIStore, simulationPaused } from '../src/ui/store';
import { ViewCamera } from '../src/game/ViewCamera';
import * as THREE from 'three';

test('orientation restriction applies to touch devices only', () => {
  assert.equal(needsLandscape(true, 390, 844), true);
  assert.equal(needsLandscape(true, 844, 390), false);
  assert.equal(needsLandscape(false, 390, 844), false);
});

test('input composite resets and disposes every device controller', () => {
  const calls: string[] = [];
  const device = (name: string) => ({
    reset: () => calls.push(`${name}:reset`),
    dispose: () => calls.push(`${name}:dispose`),
  });
  const input = new GameInputController([device('desktop'), device('touch')]);
  input.clear();
  input.dispose();
  assert.deepEqual(calls, ['desktop:reset', 'touch:reset', 'desktop:dispose', 'touch:dispose']);
});

test('game settings pause both control modes and rotation pauses the touch session', () => {
  const store = createUIStore(() => {});
  store.setState({ gameMenu: 'settings' });
  assert.equal(simulationPaused(store.getState()), true);
  store.setState({ touch: true });
  assert.equal(simulationPaused(store.getState()), true);
  store.setState({ gameMenu: undefined, actionMenuOpen: true });
  assert.equal(simulationPaused(store.getState()), true);
  store.setState({ actionMenuOpen: false, portrait: true });
  assert.equal(simulationPaused(store.getState()), true);
  store.setState({ portrait: false });
  assert.equal(simulationPaused(store.getState()), false);
  store.setState({ background: true });
  assert.equal(simulationPaused(store.getState()), true);
});

test('touch camera rotates without pointer lock and switches back to desktop', () => {
  let lockRequests = 0;
  const canvas = {
    addEventListener() {},
    classList: { remove() {} },
    requestPointerLock: () => {
      lockRequests++;
      return Promise.resolve();
    },
  } as unknown as HTMLCanvasElement;
  const view = new ViewCamera(new THREE.PerspectiveCamera(), canvas);
  view.setTouchMode(true);
  const before = view.forwardAt();
  view.lookBy(50, 10);
  view.lock();
  assert.notEqual(view.forwardAt().x, before.x);
  assert.equal(lockRequests, 0);
  view.setTouchMode(false);
  view.lock();
  assert.equal(lockRequests, 1);
});

test('touch movement and digging reset when menus open, with independent camera pointer', () => {
  const names = ['window', 'document', 'matchMedia', 'innerWidth', 'innerHeight', 'location'];
  const originals = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const media = Object.assign(new EventTarget(), { matches: true });
  const environment = [
    new EventTarget(),
    Object.assign(new EventTarget(), { hidden: false }),
    () => media,
    844,
    390,
    { search: '' },
  ];
  names.forEach((name, index) =>
    Object.defineProperty(globalThis, name, { configurable: true, value: environment[index] }),
  );
  let mobile: MobileInput | undefined;
  try {
    const canvas = Object.assign(new EventTarget(), {
      setPointerCapture() {},
    }) as unknown as HTMLCanvasElement;
    const view = new ViewCamera(new THREE.PerspectiveCamera(), canvas);
    const store = createUIStore(() => {});
    store.setState({
      hud: {
        status: '',
        bars: [],
        temperature: 38,
        inventory: [],
        carried: 0,
        capacity: 18,
        milk: 0,
        materials: { grass: 0, twigs: 0, fur: 0 },
        young: [],
        familyText: '',
        grown: 0,
        nests: 0,
        birthWarning: false,
        worldInfo: [],
        prompt: [],
      },
    });
    const ui = {
      store,
      get state() {
        return store.getState();
      },
      get simulationPaused() {
        return simulationPaused(store.getState());
      },
    };
    const keys = new Set(['ShiftRight']);
    let digging = false;
    mobile = new MobileInput(canvas, view, ui, keys, (held) => {
      digging = held;
    });
    mobile.move(0, -1);
    mobile.sprint(true);
    assert.ok(keys.has('KeyW'));
    assert.ok(keys.has('ShiftLeft'));
    mobile.dig(true);
    assert.equal(digging, false);
    view.setMode('first');
    mobile.dig(true);
    assert.equal(digging, true);
    const direction = view.forwardAt().x;
    function pointer(type: string, x: number) {
      canvas.dispatchEvent(
        Object.assign(new Event(type), {
          pointerType: 'touch',
          pointerId: 1,
          clientX: x,
          clientY: 0,
        }),
      );
    }
    pointer('pointerdown', 0);
    pointer('pointermove', 40);
    assert.notEqual(view.forwardAt().x, direction);
    store.setState({ statusOpen: true });
    mobile.move(1, 0);
    assert.equal(keys.has('KeyD'), true);
    mobile.dig(true);
    assert.equal(digging, true);
    store.setState({ actionMenuOpen: true });
    assert.equal(keys.has('KeyW'), false);
    assert.equal(keys.has('ShiftLeft'), false);
    assert.equal(keys.has('ShiftRight'), true);
    assert.equal(digging, false);
    mobile.move(1, 0);
    assert.equal(keys.has('KeyD'), false);
    store.setState({ actionMenuOpen: false });
    mobile.move(1, 0);
    assert.ok(keys.has('KeyD'));
    mobile.dispose();
    mobile = undefined;
    assert.equal(keys.has('KeyD'), false);
  } finally {
    mobile?.dispose();
    names.forEach((name, index) => {
      const original = originals[index];
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
});
