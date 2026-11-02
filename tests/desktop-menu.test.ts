import assert from 'node:assert/strict';
import test from 'node:test';
import { DesktopInput, type InputContext } from '../src/game/input/DesktopInput';
import { createUIStore } from '../src/ui/store';

test('desktop closes a paused menu and opens it when the browser releases pointer lock', () => {
  const names = ['window', 'document', 'HTMLElement'];
  const originals = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const windowMock = new EventTarget(),
    documentMock = new EventTarget();
  class ElementMock extends EventTarget {}
  const values = [windowMock, documentMock, ElementMock];
  names.forEach((name, index) =>
    Object.defineProperty(globalThis, name, { configurable: true, value: values[index] }),
  );
  const store = createUIStore(() => {});
  let locked = false,
    closed = 0,
    opened = 0;
  const ui = {
    get state() {
      return store.getState();
    },
    get panelsOpen() {
      return store.getState().actionMenuOpen;
    },
    get simulationPaused() {
      return store.getState().actionMenuOpen;
    },
  };
  const view = {
    get isLocked() {
      return locked;
    },
    isFirstPerson: false,
    lock() {
      locked = true;
    },
    unlock() {
      locked = false;
    },
  };
  const context = {
    canvas: new EventTarget(),
    ui,
    view,
    keys: new Set(),
    running: () => true,
    resize() {},
    setDigHeld() {},
    closePanels() {
      closed++;
      store.setState({ actionMenuOpen: false });
    },
    action(action: string) {
      if (action === 'menu') {
        opened++;
        store.setState({ actionMenuOpen: !store.getState().actionMenuOpen });
      }
    },
  } as unknown as InputContext;
  let input: DesktopInput | undefined;
  try {
    input = new DesktopInput(context);
    const key = (code: string) => {
      const event = Object.assign(new Event('keydown', { cancelable: true }), {
        code,
        repeat: false,
        isComposing: false,
      });
      windowMock.dispatchEvent(event);
      return event;
    };
    key('Escape');
    assert.equal(ui.panelsOpen, true);
    assert.equal(ui.simulationPaused, true);
    key('Escape');
    assert.equal(ui.panelsOpen, false);
    assert.equal(closed, 1);
    context.keys.add('KeyW');
    key('KeyI');
    assert.equal(context.keys.has('KeyW'), true);
    context.keys.clear();
    locked = true;
    documentMock.dispatchEvent(new Event('pointerlockchange'));
    locked = false;
    documentMock.dispatchEvent(new Event('pointerlockchange'));
    assert.equal(ui.panelsOpen, true);
    assert.equal(opened, 2);
    key('Escape');
    assert.equal(ui.panelsOpen, true);
    key('F1');
    assert.equal(ui.panelsOpen, false);
    input.dispose();
    input = undefined;
    key('Escape');
    assert.equal(ui.panelsOpen, false);
  } finally {
    input?.dispose();
    names.forEach((name, index) => {
      const original = originals[index];
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
});
