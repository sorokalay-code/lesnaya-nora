import './LowHealthVignette.css';

export const LOW_HEALTH_THRESHOLD = 20;

/** Ненавязчиво предупреждает об опасно низком здоровье героини. */
export function LowHealthVignette({ health }: { health?: number }) {
  if (health === undefined || health >= LOW_HEALTH_THRESHOLD) return null;

  return <div className="low-health-vignette" aria-hidden="true" />;
}
