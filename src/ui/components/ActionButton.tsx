import type { ReactNode } from 'react';
import type { UIAction } from '../types';
import { Button } from '../kit';

export function ActionButton({
  action,
  children,
  onAction,
  primary = false,
  pressed,
  disabled,
}: {
  action: string;
  children: ReactNode;
  onAction: UIAction;
  primary?: boolean;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      variant={primary ? 'primary' : undefined}
      data-action={action}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={() => onAction(action)}
    >
      {children}
    </Button>
  );
}
