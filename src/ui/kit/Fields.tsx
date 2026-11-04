import type { ComponentProps, ReactNode } from 'react';

export function Input(props: ComponentProps<'input'>) {
  return <input {...props} data-ui-field="" />;
}

export function Select(props: ComponentProps<'select'>) {
  return <select {...props} data-ui-field="" />;
}

export function FieldLabel(props: ComponentProps<'label'>) {
  return <label {...props} />;
}

export function FieldGroup({
  legend,
  children,
  ...props
}: ComponentProps<'fieldset'> & { legend: ReactNode }) {
  return (
    <fieldset
      {...props}
      className={props.className ? 'ui-field-group ' + props.className : 'ui-field-group'}
    >
      <legend>{legend}</legend>
      {children}
    </fieldset>
  );
}
