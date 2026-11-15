import './ScrollContainer.css';
import clsx from 'clsx';
import type { ComponentProps } from 'react';

type ScrollContainerProps = Omit<ComponentProps<'div'>, 'aria-label' | 'role'> & {
  label: string;
};

/** Прокручиваемая область с нативным сенсорным скроллом и доступом с клавиатуры. */
export function ScrollContainer({
  className,
  label,
  tabIndex = 0,
  ...props
}: ScrollContainerProps) {
  return (
    <div
      {...props}
      className={clsx('ui-scroll-container', className)}
      role="region"
      aria-label={label}
      tabIndex={tabIndex}
    />
  );
}
