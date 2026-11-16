import { lazy, Suspense, useState } from 'react';
import { Button, Disclosure } from '../../shared/ui';
import type { GeneticsView } from '../../presenters/GeneticsPresenter';
import type { UIAction } from '../../types';

const LineageGraph = lazy(() =>
  import('./LineageGraph').then((module) => ({ default: module.LineageGraph })),
);

export function LineageView({ graph }: { graph: NonNullable<GeneticsView['lineageGraph']> }) {
  return (
    <Suspense fallback={<p role="status">Загружаю граф родословной…</p>}>
      <LineageGraph graph={graph} />
    </Suspense>
  );
}

/** Раскрываемая карточка генов и известных предков не загромождает обычный разговор. */
export function GeneticsPanel({
  data,
  expanded = false,
  onAction,
}: {
  data?: GeneticsView;
  expanded?: boolean;
  onAction?: UIAction;
}) {
  const [graphOpen, setGraphOpen] = useState(false);
  if (!data) return null;
  const title = `Гены и родословная · поколение ${data.generation}`;
  const content = (
    <>
      <p>{data.appearance}</p>
      <div className="gene-list">
        {data.ratings.map((value) => (
          <span key={value}>{value}</span>
        ))}
      </div>
      <p>{data.anatomy}</p>
      <ul>
        {data.effects.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
      {data.solitary && (
        <p className="genetic-risk">
          Клыкастая мутация: взрослый кролик живёт один и охотится. Красные глаза предупреждают об
          опасности.
        </p>
      )}
      {data.risk !== undefined && (
        <p className="genetic-risk">
          Риск мутации потомства в этой паре: {data.risk}%.
          {data.related && ' Есть близкое родство — риск повышен.'} Мутации могут изменить число
          лап, ушей и глаз или дать хищные клыки.
        </p>
      )}
      <h3>Известные предки</h3>
      {data.ancestors.length ? (
        <ol>
          {data.ancestors.map((ancestor) => (
            <li key={ancestor.id}>
              <b>{ancestor.name}</b> · {ancestor.label}
            </li>
          ))}
        </ol>
      ) : (
        <p>Основатель линии: известных предков пока нет.</p>
      )}
      {data.lineageGraph && (
        <Disclosure
          className="lineage-graph-disclosure"
          summary="Показать древо династии"
          onToggle={(event) => setGraphOpen(event.currentTarget.open)}
        >
          {graphOpen && (
            <>
              {onAction && (
                <Button data-lineage-expand onClick={() => onAction('lineage-expand')}>
                  На весь экран
                </Button>
              )}
              <LineageView graph={data.lineageGraph} />
            </>
          )}
        </Disclosure>
      )}
      <small>
        Здесь действуют игровые правила наследования. Взросление само по себе не меняет поколение.
      </small>
    </>
  );
  return expanded ? (
    <section className="genetics-panel">
      <h3>{title}</h3>
      {content}
    </section>
  ) : (
    <Disclosure className="genetics-panel" summary={title}>
      {content}
    </Disclosure>
  );
}
