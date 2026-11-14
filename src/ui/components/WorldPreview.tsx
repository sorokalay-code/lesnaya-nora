import { useMemo } from 'react';
import type { WorldConfig } from '../../game/WorldConfig';
import { WorldPreviewPresenter } from '../presenters/WorldPreviewPresenter';

/** Показывает схему выбранной географии и поясняет случайное зерно до запуска. */
export function WorldPreview({ config }: { config: WorldConfig }) {
  const preview = useMemo(() => WorldPreviewPresenter.build(config), [config]);
  if (!preview) return null;
  return (
    <figure className="world-preview">
      <svg
        viewBox={`0 0 ${preview.resolution} ${preview.resolution}`}
        role="img"
        aria-label="Предпросмотр карты: рельеф, биомы и водоёмы"
      >
        {preview.cells.map((biome, index) => (
          <rect
            key={index}
            className={`preview-${biome}`}
            x={index % preview.resolution}
            y={Math.floor(index / preview.resolution)}
            width={1.05}
            height={1.05}
          />
        ))}
        {preview.water.map((body) => (
          <polyline
            key={body.id}
            className="preview-water-outline"
            points={body.points}
            strokeWidth={body.width}
          />
        ))}
        <circle
          cx={preview.resolution / 2}
          cy={preview.resolution / 2}
          r={0.8}
          className="preview-home"
        />
      </svg>
      <figcaption>
        <strong>Твой будущий лес</strong>
        <p>
          Серое — горы, тёмно-зелёное — низины, голубое — вода, оливковое — болота. Точка в центре —
          старт.
        </p>
        <p>
          {config.map?.seed == null
            ? 'Пример для зерна 31415. Укажи зерно или нажми «Другое зерно», чтобы создать именно эту карту.'
            : `Зерно ${config.map.seed} · ${config.size * 2} × ${config.size * 2} м`}
        </p>
      </figcaption>
    </figure>
  );
}
