import './Progress.css';
import { withClassName } from '../classNames';
import type { ComponentProps } from 'react';

export function Progress({ className, ...props }: ComponentProps<'progress'>) {
  return <progress {...props} className={withClassName('ui-progress', className)} />;
}
