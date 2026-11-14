import { Button, Disclosure, Notice } from '../kit';
import type { BurrowView } from '../presenters/BurrowPresenter';
import './BurrowPanel.css';

/** Показывает снимок обустройства норы; правила и обход ходов остаются в движке. */
export function BurrowPanel({
  data,
  relocate,
}: {
  data: BurrowView;
  relocate?: (nestId: number) => void;
}) {
  if (data.state !== 'burrow')
    return (
      <Notice heading={data.state === 'empty' ? 'Здесь начнётся твой дом' : 'Подойди к своей норе'}>
        <p>
          {data.state === 'empty'
            ? 'Переключись на вид от первого лица и выкопай вход. Затем спустись по склону и продли ход.'
            : 'План доступен внутри выкопанного хода или рядом с его входом. Отдельные норы оцениваются независимо.'}
        </p>
        <p>Открой «План норы» снова: здесь появятся выходы, гнёзда и кладовые.</p>
      </Notice>
    );

  const next = data.steps.find((step) => !step.complete);
  return (
    <div className="burrow-panel">
      <p className="burrow-intro">
        Игра на паузе. Осмотри дом и реши, что прокопать или обустроить дальше.
      </p>
      <dl className="burrow-stats">
        <div>
          <dt>Выходы</dt>
          <dd>{data.exitCount}</dd>
        </div>
        <div>
          <dt>Длина ходов</dt>
          <dd>{data.length} м</dd>
        </div>
        <div>
          <dt>Глубина до</dt>
          <dd>{data.depth} м</dd>
        </div>
        <div>
          <dt>Еда в тайниках</dt>
          <dd>{data.food} шт.</dd>
        </div>
      </dl>
      <div className="burrow-layout">
        <div>
          <BurrowMap data={data.map} />
          <p className="burrow-legend">В — выход · Г — гнездо · Т — тайник · светлая точка — ты</p>
          {data.map.moisture.includes('damp') && (
            <p className="burrow-legend burrow-moisture-key">Голубой пунктир — сырой грунт</p>
          )}
          <p className="burrow-caption">
            Схема сверху. Ходы на разной глубине могут пересекаться на плане.
          </p>
        </div>
        <div>
          <Notice heading={next ? `Следующий шаг: ${next.title.toLowerCase()}` : 'Дом обустроен'}>
            <p>
              {next?.detail ??
                'Есть укрытое гнездо, припасы и запасной выход. Продолжай расширять дом под свою семью.'}
            </p>
          </Notice>
          <ul className="burrow-steps" aria-label="План обустройства">
            {data.steps.map((step) => (
              <li key={step.title} data-complete={step.complete}>
                <span aria-hidden="true">{step.complete ? '✓' : '○'}</span>
                <span>
                  {step.title}
                  <small>{step.complete ? 'Готово' : 'Можно улучшить'}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <section aria-label="Оценка гнёзд">
        <h3>Гнёзда и кладовые</h3>
        {!data.nests.length && (
          <p>Гнёзд пока нет. В глубине норы собери гнездо из травы, веток и пуха.</p>
        )}
        <div className="burrow-nests">
          {data.nests.map((nest) => (
            <Notice
              key={nest.id}
              heading={`Гнездо ${nest.id}`}
              className="burrow-nest"
              data-warning={nest.warning}
            >
              <p>
                <strong>{nest.status}</strong>
              </p>
              <p>{nest.description}</p>
              <p>{nest.moisture === 'damp' ? 'Сыро · согревание медленнее' : 'Сухо'}</p>
              <p>{nest.supplies}</p>
              {nest.relocation && (
                <>
                  <p>{nest.relocation.detail}</p>
                  {nest.relocation.available && relocate && (
                    <Button onClick={() => relocate(nest.id)}>Переселить семью сюда</Button>
                  )}
                </>
              )}
            </Notice>
          ))}
        </div>
      </section>
      <Disclosure summary="Как сделать нору удобнее и защищённее">
        <ul className="burrow-advice">
          {data.steps.map((step) => (
            <li key={step.title}>{step.detail}</li>
          ))}
          <li>
            Запасной выход позволяет выйти в другом месте, когда у первого опасно. Новый вход может
            оказаться ближе к гнезду — проверь план после копания.
          </li>
          <li>
            Лиса ночью и ласка в любое время могут достать малышей у входа. Отходы рядом с устьем
            привлекают хищников.
          </li>
          <li>
            Расстояния считаются по соединённым ходам. Удалённое гнездо не защищает малыша, который
            сам подошёл ко входу.
          </li>
          <li>
            Подросшие малыши сами ищут еду в ближайших доступных тайниках. Припасы лучше хранить
            недалеко от гнезда.
          </li>
          <li>
            Сырость появляется под болотом, в глубоких ходах у воды и на глубине от 5 м. Во время
            дождя сыро и в неглубоких ходах. Подстилка помогает согреваться быстрее.
          </li>
        </ul>
      </Disclosure>
    </div>
  );
}

function BurrowMap({ data }: { data: Extract<BurrowView, { state: 'burrow' }>['map'] }) {
  const points = [...data.floors, data.player];
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minZ = Math.min(...points.map((point) => point.z));
  const maxZ = Math.max(...points.map((point) => point.z));
  const scale = Math.min(440 / Math.max(8, maxX - minX), 190 / Math.max(8, maxZ - minZ));
  const x = (value: number) => 260 + (value - (minX + maxX) / 2) * scale;
  const z = (value: number) => 130 + (value - (minZ + maxZ) / 2) * scale;
  const markers = [
    ...data.exits.map((point) => ({ ...point, kind: 'exit' })),
    ...data.nests.map((point) => ({ ...point, kind: 'nest' })),
    ...data.stashes.map((point) => ({ ...point, kind: 'stash' })),
  ];
  return (
    <svg
      className="burrow-map"
      viewBox="0 0 520 260"
      role="img"
      aria-label="План связанных ходов, выходов, гнёзд и тайников"
    >
      {data.passages.map(([a, b], index) => (
        <line
          key={index}
          data-damp={data.moisture[a] === 'damp' || data.moisture[b] === 'damp'}
          x1={x(data.floors[a].x)}
          y1={z(data.floors[a].z)}
          x2={x(data.floors[b].x)}
          y2={z(data.floors[b].z)}
        />
      ))}
      {data.floors.map((point, index) => (
        <circle
          key={index}
          className="burrow-floor"
          data-damp={data.moisture[index] === 'damp'}
          cx={x(point.x)}
          cy={z(point.z)}
          r="3"
        />
      ))}
      {markers.map((marker) => (
        <g
          key={marker.label}
          className={`burrow-marker burrow-marker-${marker.kind}`}
          transform={`translate(${x(marker.position.x)} ${z(marker.position.z)})`}
        >
          <title>{marker.label}</title>
          <rect
            x={marker.kind === 'exit' ? -9 : -5}
            y={marker.kind === 'exit' ? -9 : -5}
            width={marker.kind === 'exit' ? 18 : 10}
            height={marker.kind === 'exit' ? 18 : 10}
            rx="3"
          />
          <text x="10" y={marker.kind === 'nest' ? 23 : -11}>
            {marker.symbol}
          </text>
        </g>
      ))}
      <circle className="burrow-player" cx={x(data.player.x)} cy={z(data.player.z)} r="6">
        <title>Ты здесь</title>
      </circle>
    </svg>
  );
}
