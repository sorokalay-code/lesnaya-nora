import type { ComponentProps } from 'react';

type ButtonProps = ComponentProps<'button'> & {
  variant?: 'neutral' | 'primary' | 'danger';
};

/** Общая кнопка. Отправка формы требует явного type="submit". */
export function Button({ type = 'button', variant = 'neutral', className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={className ? 'ui-button ' + className : 'ui-button'}
      data-variant={variant}
    />
  );
}
