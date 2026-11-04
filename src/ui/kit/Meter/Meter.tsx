import './Meter.css';
import { withClassName } from '../classNames';
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
      className={withClassName('ui-meter', className)}
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
