import type { WebView } from '../../game/session/SpiderEncounter';

/** Компактный индикатор ловушки не закрывает джойстик и показывает число отдельных нажатий. */
export function WebNotice({ web, touch }: { web?: WebView; touch: boolean }) {
  if (!web) return null;
  return (
    <aside className="web-notice" aria-label="Освобождение из паутины">
      <strong>Лапы в паутине</strong>
      <p>
        {touch ? 'Многократно нажимай «Вырваться»' : 'Многократно нажимай E'} · {web.hits}/
        {web.required}
      </p>
      <progress max={web.required} value={web.hits} />
      <small>
        {web.danger
          ? 'Паук нападает — продолжай вырываться!'
          : `До приближения паука: ${web.seconds} с`}
      </small>
    </aside>
  );
}
