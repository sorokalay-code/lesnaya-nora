import './Tabs.css';
import { withClassName } from '../classNames';
import { Button } from '../Button/Button';

export interface TabOption<T extends string> {
  value: T;
  label: string;
}

/** Управляемые вкладки с навигацией стрелками; содержимое и состояние принадлежат экрану. */
export function Tabs<T extends string>({
  id,
  label,
  options,
  value,
  onChange,
  className,
}: {
  id: string;
  label: string;
  options: readonly TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={withClassName('ui-tabs', className)} role="tablist" aria-label={label}>
      {options.map((option, index) => (
        <Button
          key={option.value}
          id={`${id}-tab-${option.value}`}
          role="tab"
          aria-selected={value === option.value}
          aria-controls={`${id}-panel-${option.value}`}
          tabIndex={value === option.value ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            let next: number;
            if (event.key === 'ArrowRight') next = (index + 1) % options.length;
            else if (event.key === 'ArrowLeft')
              next = (index + options.length - 1) % options.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = options.length - 1;
            else return;
            event.preventDefault();
            onChange(options[next].value);
            const buttons =
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                '[role="tab"]',
              );
            buttons?.[next]?.focus();
          }}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
