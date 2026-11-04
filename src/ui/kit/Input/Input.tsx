import './Input.css';
import { withClassName } from '../classNames';
import '../field-control.css';
import type { ComponentProps } from 'react';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input {...props} className={withClassName('ui-input', className)} />;
}
