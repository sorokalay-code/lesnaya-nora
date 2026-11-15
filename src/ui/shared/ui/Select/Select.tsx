import './Select.css';
import clsx from 'clsx';
import '../field-control.css';
import type { ComponentProps } from 'react';

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select {...props} className={clsx('ui-select', className)} />;
}
