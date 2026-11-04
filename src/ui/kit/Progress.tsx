import type { ComponentProps } from 'react';

export function Progress(props: ComponentProps<'progress'>) {
  return <progress {...props} />;
}

export function Meter({
  label,
  value,
  color,
  className,
}: {
  label: string;
  value: number;
  color?: string;
  className?: string;
}) {
  const percent = Math.max(0, Math.min(100, value));
  return (
    <div
      className={className ? 'ui-meter ' + className : 'ui-meter'}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <i style={{ width: `${percent}%`, backgroundColor: color }} />
    </div>
  );
}
