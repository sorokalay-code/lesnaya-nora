import type { RabbitChaseView } from '../../game/session/RabbitReproductiveThreat';
import { Notice } from '../kit';

/** Предупреждение о намерении крола и начале погони, даже если журнал событий скрыт. */
export function RabbitChaseNotice({ view }: { view?: RabbitChaseView }) {
  if (!view) return null;
  return (
    <Notice
      className="web-notice"
      role="status"
      heading={
        view.phase === 'warning' ? `${view.name} готовится напасть` : `${view.name} преследует тебя`
      }
    >
      <p>Угроза принудительного спаривания · беги в укрытие</p>
    </Notice>
  );
}
