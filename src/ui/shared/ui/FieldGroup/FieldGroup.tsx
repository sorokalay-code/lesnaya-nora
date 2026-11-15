import './FieldGroup.css';
import clsx from 'clsx';
import type { ComponentProps, ReactNode } from 'react';

export function FieldGroup({
  legend,
  children,
  className,
  ...props
}: ComponentProps<'fieldset'> & { legend: ReactNode }) {
  return (
    <fieldset {...props} className={clsx('ui-field-group', className)}>
      <legend>{legend}</legend>
      {children}
    </fieldset>
  );
}
