import type { AirliftView } from '../../game/session/HawkHunting';

/** Захват и падение остаются видимы при скрытых событиях; меню паузы доступно, действия заблокированы. */
export function AirliftNotice({ view }: { view?: AirliftView }) {
  if (!view) return null;
  return (
    <div className="web-notice airlift-notice" role="status">
      <strong>{view.phase === 'fall' ? 'Падение!' : 'Сокол держит тебя'}</strong>
      <p>Высота {view.height.toFixed(1)} м · действия недоступны</p>
    </div>
  );
}
