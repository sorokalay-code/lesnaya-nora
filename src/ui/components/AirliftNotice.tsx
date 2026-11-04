import type { AirliftView } from '../../game/session/HawkHunting';
import { Notice } from '../kit';

/** Захват и падение остаются видимы при скрытых событиях; меню паузы доступно, действия заблокированы. */
export function AirliftNotice({ view }: { view?: AirliftView }) {
  if (!view) return null;
  return (
    <Notice
      className="web-notice airlift-notice"
      role="status"
      heading={view.phase === 'fall' ? 'Падение!' : 'Сокол держит тебя'}
    >
      <p>Высота {view.height.toFixed(1)} м · действия недоступны</p>
    </Notice>
  );
}
