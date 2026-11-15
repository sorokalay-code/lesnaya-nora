import type { ComponentProps } from 'react';
import clsx from 'clsx';
import './Notice.css';

type NoticeProps = ComponentProps<'aside'> & { heading: string };

export function Notice({ heading, children, className, ...props }: NoticeProps) {
  return (
    <aside {...props} className={clsx('ui-notice', className)}>
      <strong>{heading}</strong>
      {children}
    </aside>
  );
}
