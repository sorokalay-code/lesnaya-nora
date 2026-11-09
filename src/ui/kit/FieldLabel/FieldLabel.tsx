import './FieldLabel.css';
import { withClassName } from '../classNames';
import { Input } from '../Input/Input';
import { Select } from '../Select/Select';
import { Children, cloneElement, isValidElement, useId, type ComponentProps } from 'react';

type FieldLabelProps = ComponentProps<'label'> & { separateControl?: boolean };

/** Отдельная подпись оставляет промежуток строки свободным для сенсорной прокрутки. */
export function FieldLabel({
  className,
  separateControl = false,
  children,
  ...props
}: FieldLabelProps) {
  const generatedId = useId();
  if (separateControl) {
    const items = Children.toArray(children);
    const control = items.at(-1);
    if (
      isValidElement<ComponentProps<'input'>>(control) &&
      (control.type === Input || control.type === Select)
    ) {
      const id = control.props.id ?? generatedId;
      return (
        <div className={withClassName('ui-field-label ui-field-label-separated', className)}>
          <label {...props} htmlFor={id}>
            {items.slice(0, -1)}
          </label>
          {cloneElement(control, { id })}
        </div>
      );
    }
  }

  return (
    <label {...props} className={withClassName('ui-field-label', className)}>
      {children}
    </label>
  );
}
