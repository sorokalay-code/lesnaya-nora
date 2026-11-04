import './Disclosure.css';
import { withClassName } from '../classNames';
import type { ComponentProps, ReactNode } from 'react';

type DisclosureProps = ComponentProps<'details'> & { summary: ReactNode };

export function Disclosure({ summary, children, className, ...props }: DisclosureProps) {
  return (
    <details {...props} className={withClassName('ui-disclosure', className)}>
      <summary className="ui-disclosure-summary">{summary}</summary>
      {children}
    </details>
  );
}
