import './Select.css';
import { withClassName } from '../classNames';
import '../field-control.css';
import type { ComponentProps } from 'react';

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select {...props} className={withClassName('ui-select', className)} />;
}
