import type { ComponentProps, KeyboardEvent, Ref } from 'react';

type DialogProps = Omit<ComponentProps<'section'>, 'ref'> & { ref?: Ref<HTMLElement> };

/** Модальная панель: семантика и цикл Tab общие, открытием и фокусом управляет экран. */
export function Dialog({ onKeyDown, ...props }: DialogProps) {
  return (
    <section
      {...props}
      role="dialog"
      aria-modal="true"
      onKeyDown={(event) => {
        trapDialogFocus(event);
        onKeyDown?.(event);
      }}
    />
  );
}

/** Удерживает Tab внутри открытого модального окна, сохраняя обычный порядок фокуса. */
function trapDialogFocus(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Tab') return;
  const controls = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]',
    ),
  ].filter((control) => control.getClientRects().length > 0);
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
