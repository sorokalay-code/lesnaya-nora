import './FieldGroup.css';
import { withClassName } from '../classNames';
import type { ComponentProps, ReactNode } from 'react';

export function FieldGroup({
  legend,
  children,
  className,
  ...props
}: ComponentProps<'fieldset'> & { legend: ReactNode }) {
  return (
    <fieldset {...props} className={withClassName('ui-field-group', className)}>
      <legend>{legend}</legend>
      {children}
    </fieldset>
  );
}
