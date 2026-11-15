import './Input.css';
import clsx from 'clsx';
import '../field-control.css';
import type { ComponentProps } from 'react';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input {...props} className={clsx('ui-input', className)} />;
}
