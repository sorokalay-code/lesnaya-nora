import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InteractionInput, type InteractionContext } from '../src/game/InteractionInput';

const input = new InteractionInput();
const game: InteractionContext = {
  playing: true,
  dialogOpen: false,
  panelsOpen: false,
  mateMenuOpen: false,
  editable: false,
};
const menu: InteractionContext = {
  ...game,
  dialogOpen: true,
  panelsOpen: true,
  mateMenuOpen: true,
};
test('Tab opens the partner menu from the world and preserves native focus navigation inside panels', () => {
  assert.equal(input.action('Tab', game), 'mate-panel');
  assert.equal(input.action('Tab', menu), undefined);
  assert.equal(input.action('Tab', { ...game, playing: false }), undefined);
});
test('number shortcuts issue commands only while the partner menu is open', () => {
  for (const [key, command] of [
    ['Digit1', 'follow'],
    ['Digit2', 'stay'],
    ['Digit3', 'forage'],
    ['Digit4', 'home'],
    ['Numpad1', 'follow'],
  ]) {
    assert.equal(input.action(key, menu), `mate-command:${command}`);
    assert.equal(input.action(key, game), undefined);
    assert.equal(input.action(key, { ...menu, editable: true }), undefined);
  }
});
test('Enter focuses chat, sends from the text field and respects IME composition and focused buttons', () => {
  assert.equal(input.action('Enter', menu), 'mate-focus');
  assert.equal(input.action('Enter', { ...menu, editable: true }), 'mate-send');
  assert.equal(input.action('Enter', { ...menu, editable: true }, true), undefined);
  assert.equal(input.action('Enter', { ...menu, buttonFocused: true }), undefined);
  for (const key of ['KeyW', 'KeyE', 'Space', 'Tab', 'Digit1'])
    assert.equal(input.action(key, { ...menu, editable: true }), undefined);
});
test('Escape closes panels and opens the main menu directly from the world', () => {
  assert.equal(input.action('Escape', menu), 'close-panels');
  assert.equal(input.action('Escape', { ...menu, editable: true }), 'close-panels');
  assert.equal(input.action('Escape', game), 'menu');
});

test('menu shortcuts preserve chat text and confirmation Escape only cancels removal', () => {
  assert.equal(input.action('KeyI', game), 'status-panel');
  assert.equal(input.action('KeyI', menu), 'status-panel');
  assert.equal(input.action('KeyI', { ...menu, editable: true }), undefined);
  for (const key of ['Backquote', 'F1']) {
    assert.equal(input.action(key, game), 'menu');
    assert.equal(input.action(key, menu), 'menu');
    assert.equal(input.action(key, { ...menu, editable: true }), undefined);
  }
  const confirmation = { ...menu, mateMenuOpen: false, confirmationOpen: true };
  assert.equal(input.action('Escape', confirmation), 'cancel-remove');
  for (const key of ['KeyM', 'KeyJ', 'KeyE', 'Backquote', 'Enter'])
    assert.equal(input.action(key, confirmation), undefined);
});
