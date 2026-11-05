import './ScrollContainer.css';
import { withClassName } from '../classNames';
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
      className={withClassName('ui-scroll-container', className)}
      role="region"
      aria-label={label}
      tabIndex={tabIndex}
    />
  );
}
