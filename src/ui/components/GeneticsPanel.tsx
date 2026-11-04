import { Disclosure } from '../kit';
import type { GeneticsView } from '../presenters/GeneticsPresenter';

/** Раскрываемая карточка генов и известных предков не загромождает обычный разговор. */
export function GeneticsPanel({
  data,
  expanded = false,
}: {
  data?: GeneticsView;
  expanded?: boolean;
}) {
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
