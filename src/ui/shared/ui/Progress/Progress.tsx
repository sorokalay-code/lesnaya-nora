import './Progress.css';
import clsx from 'clsx';
import type { ComponentProps } from 'react';

export function Progress({ className, ...props }: ComponentProps<'progress'>) {
  return <progress {...props} className={clsx('ui-progress', className)} />;
}
