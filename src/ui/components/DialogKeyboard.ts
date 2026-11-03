import type { KeyboardEvent } from 'react';

/** Удерживает Tab внутри открытого модального окна, сохраняя обычный порядок фокуса. */
export function trapDialogFocus(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Tab') return;
  const controls = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),select,textarea,summary,[tabindex="0"]',
    ),
  ];
  const first = controls[0],
    last = controls.at(-1);
  if (!first) {
    event.preventDefault();
    return;
  }
  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === event.currentTarget)
  ) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
