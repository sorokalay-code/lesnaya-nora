import { useStore } from 'zustand';
import { Button, FieldLabel, Notice, Select } from '../../shared/ui';
import type { ColdNightView } from '../../presenters/ColdNightPresenter';
import type { UIStore } from '../../store';

export function ColdNightCard({ data, store }: { data: ColdNightView; store: UIStore }) {
  const selectedId = useStore(store, (state) => state.coldNightPantryId);
  const dispatch = useStore(store, (state) => state.dispatch);
  const pantry = data.active
    ? data.pantry
    : (data.pantries.find(({ id }) => id === selectedId) ?? data.pantries[0]);

  return (
    <Notice heading="Подготовиться к холодной ночи" className="burrow-outing">
      {!pantry && <p>Устрой подземную кладовую и гнездо в связанных ходах.</p>}
      {pantry && (
        <>
          {!data.active && data.pantries.length > 1 && (
            <FieldLabel separateControl>
              Кладовая для вылазки
              <Select
                value={pantry.id}
                onChange={(event) =>
                  store.setState({ coldNightPantryId: Number(event.currentTarget.value) })
                }
              >
                {data.pantries.map(({ id }) => (
                  <option key={id} value={id}>
                    Тайник {id}
                  </option>
                ))}
              </Select>
            </FieldLabel>
          )}
          <p>
            <strong>Тайник {pantry.id}</strong> · Еда {pantry.food}/{pantry.foodTarget}
          </p>
          <p>
            {pantry.warm
              ? 'Тёплая подстилка готова.'
              : `Пух для подстилки ${pantry.carriedFur + pantry.storedFur}/${pantry.furTarget} (${pantry.storedFur} в тайнике).`}
          </p>
          {pantry.unavailable && <p>{pantry.unavailable}</p>}
          {data.active ? (
            <ActiveOuting data={data} dispatch={dispatch} />
          ) : pantry.ready ? (
            <p>Семья готова к холодной ночи.</p>
          ) : !pantry.unavailable ? (
            <>
              <p>Выбери свою задачу. Вторую можно поручить партнёру.</p>
              <div className="burrow-outing-actions">
                {pantry.goals.map(({ id, label }) => (
                  <Button
                    key={id}
                    variant="primary"
                    onClick={() => dispatch(`cold-night:start:${pantry.id}:${id}`)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </Notice>
  );
}

function ActiveOuting({
  data,
  dispatch,
}: {
  data: Extract<ColdNightView, { active: true }>;
  dispatch: (action: string) => void;
}) {
  return (
    <>
      {!data.pantry.ready && (
        <>
          <p>
            {data.goalMet ? 'Твоя задача выполнена.' : `Твоя задача — ${data.goal.toLowerCase()}.`}
          </p>
          {data.pantry.food < data.pantry.foodTarget && (
            <p>Сложи в выбранный тайник клевер, морковь, капусту или ягоды.</p>
          )}
          {!data.pantry.warm && (
            <p>Пух можно собрать со своей шерсти или взять в тайнике через меню «Еда и багаж».</p>
          )}
        </>
      )}
      {!data.local && <p>Вернись к норе с выбранным тайником, чтобы продолжить подготовку.</p>}
      {data.helperWorking && <p role="status">Партнёр собирает припасы для выбранного тайника.</p>}
      {data.local && data.helperNeeded && !data.helperAvailable && (
        <p>Подготовиться можно самостоятельно. Поручение доступно, когда есть партнёр.</p>
      )}
      <div className="burrow-outing-actions">
        {data.pantry.ready && data.local && (
          <Button variant="primary" onClick={() => dispatch('cold-night:finish')}>
            Завершить подготовку
          </Button>
        )}
        {data.local &&
          data.helperNeeded &&
          data.helperAvailable &&
          !data.helperWorking &&
          !data.pantry.unavailable && (
            <Button onClick={() => dispatch('cold-night:assign')}>{data.helperGoal}</Button>
          )}
        <Button onClick={() => dispatch('map')}>
          {data.marked ? 'Открыть карту вылазки' : 'Отметить место на карте'}
        </Button>
        <Button onClick={() => dispatch('cold-night:cancel')}>Отменить вылазку</Button>
      </div>
    </>
  );
}
