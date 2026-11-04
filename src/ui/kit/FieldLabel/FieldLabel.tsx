import './FieldLabel.css';
import { withClassName } from '../classNames';
import type { ComponentProps } from 'react';

export function FieldLabel({ className, ...props }: ComponentProps<'label'>) {
  return <label {...props} className={withClassName('ui-field-label', className)} />;
}
