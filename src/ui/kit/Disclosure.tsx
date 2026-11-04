import type { ComponentProps, ReactNode } from 'react';

type DisclosureProps = ComponentProps<'details'> & { summary: ReactNode };

export function Disclosure({ summary, children, ...props }: DisclosureProps) {
  return (
    <details {...props}>
      <summary className="ui-disclosure-summary">{summary}</summary>
      {children}
    </details>
  );
}
