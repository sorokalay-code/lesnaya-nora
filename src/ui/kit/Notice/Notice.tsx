import type { ComponentProps } from 'react';
import { withClassName } from '../classNames';
import './Notice.css';

type NoticeProps = ComponentProps<'aside'> & { heading: string };

export function Notice({ heading, children, className, ...props }: NoticeProps) {
  return (
    <aside {...props} className={withClassName('ui-notice', className)}>
      <strong>{heading}</strong>
      {children}
    </aside>
  );
}
