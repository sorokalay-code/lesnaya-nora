import { useStore } from 'zustand';
import { Button, Meter, ScrollContainer } from '../../shared/ui';
import type { UIStore } from '../../store';
import { AirliftNotice } from './AirliftNotice';
import { MenuTrigger } from '../../features/menu-trigger';
import { RabbitChaseNotice } from './RabbitChaseNotice';
import { WebNotice } from './WebNotice';

/** Собирает панели состояния, семьи и мировых подсказок в единый HUD. */
export function GameHud({ store }: { store: UIStore }) {
  return (
    <>
      <Toolbar store={store} />
      <StatusPanel store={store} />
    </>
  );
}

function Toolbar({ store }: { store: UIStore }) {
  const dispatch = useStore(store, (state) => state.dispatch);
  const hud = useStore(store, (state) => state.hud);
  const firstPerson = useStore(store, (state) => state.firstPerson);

  return (
    <>
      <div className="topbar">
        <div className="brand">
          <span className="brand-icon">✦</span>
          <span>ЛЕСНАЯ НОРА</span>
        </div>
        <div id="world-info" className="world-info">
          {hud?.worldInfo.map((text) => (
            <span key={text}>{text}</span>
          ))}
        </div>
        <div className="top-actions">
          <Button onClick={() => dispatch('camera')}>◉ {firstPerson ? '1' : '3'}-е лицо</Button>
          <Button onClick={() => dispatch('world-actions')}>✦ Действия · Ё</Button>
          <MenuTrigger store={store} />
        </div>
      </div>
      <div className="family-avatars">
        <Button className="avatar-chip" onClick={() => dispatch('self-profile')}>
          <span className="avatar-face">🐰</span>
          <span>
            {hud?.playerName ?? 'Ты'}{' '}
            <small>{hud?.playerSex === 'male' ? 'крол' : 'крольчиха'}</small>
          </span>
        </Button>
        <Button
          className={`avatar-chip ${hud?.mate ? 'paired' : ''}`}
          title="Tab — партнёр: команды и сообщения"
          onClick={() => dispatch('mate-panel')}
        >
          <span className="avatar-face">{hud?.mate ? '🐰' : '♡'}</span>
          <span>
            {hud?.mate?.name ?? 'Семейная пара'}
            <small>Tab · {hud?.mate ? 'команды и чат' : 'пока нет пары'}</small>
          </span>
        </Button>
      </div>
      <div className={`dig-reticle ${firstPerson ? '' : 'hidden'}`} aria-hidden="true">
        ✦
      </div>
    </>
  );
}

function StatusPanel({ store }: { store: UIStore }) {
  const dispatch = useStore(store, (state) => state.dispatch);
  const touch = useStore(store, (state) => state.touch);
  const expanded = useStore(store, (state) => state.statusOpen);
  const familyOpen = useStore(store, (state) => state.familyOpen);
  const hud = useStore(store, (state) => state.hud);

  if (!hud) return null;

  const male = hud.playerSex === 'male';
  const pregnancyLabel = male ? 'Беременность партнёрши' : 'Беременность';
  const pregnancy =
    hud.pregnancyProgress === undefined ? null : (
      <div className="pregnancy-progress">
        <span>
          {pregnancyLabel} · {hud.pregnancyProgress}%
        </span>
        <Meter className="kit-growth-meter" label={pregnancyLabel} value={hud.pregnancyProgress} />
      </div>
    );

  return (
    <>
      <WebNotice web={hud.web} touch={touch} />
      <AirliftNotice view={hud.airlift} />
      {!hud.web && !hud.airlift && <RabbitChaseNotice view={hud.rabbitChase} />}
      <div className={`kit-progress ${familyOpen ? '' : 'hidden'}`}>
        {pregnancy}
        <b>РОСТ КРОЛЬЧАТ</b>
        {!hud.young.length && <p>Крольчат пока нет. Подробности семьи — в дневнике.</p>}
        {hud.young.map((kit) => (
          <div className="kit-progress-row" key={kit.id}>
            <span>
              <strong>{kit.name}</strong>
              <small>
                {kit.progress}% · до взросления {kit.daysLeft} дн.
              </small>
            </span>
            <Meter className="kit-growth-meter" label={`Рост: ${kit.name}`} value={kit.progress} />
            <small>
              Сытость {Math.round(kit.hunger)}% · {kit.care}
            </small>
          </div>
        ))}
        {!!hud.lineageMembers?.length && (
          <>
            <h3>Продолжить линию</h3>
            <p>Выбери взрослого члена семьи, чтобы посмотреть гены или продолжить игру за него.</p>
            {hud.lineageMembers.map((member) => (
              <Button
                className="lineage-member"
                key={member.id}
                onClick={() => dispatch('family-member:' + member.id)}
              >
                <b>
                  {member.sex === 'male' ? '♂' : '♀'} {member.name}
                </b>
                <small>
                  {member.relationship} · поколение {member.generation} ›
                </small>
              </Button>
            ))}
          </>
        )}
      </div>
      <Button
        className="status-toggle"
        title="I — свернуть или развернуть состояние без паузы"
        aria-expanded={expanded}
        onClick={() => dispatch('status-panel')}
      >
        <span className="compact-vitals">
          {['Здоровье', 'Силы', 'Сытость', 'Жажда'].map((label) => {
            const bar = hud.bars.find((item) => item.label === label);
            return (
              bar && (
                <span
                  key={label}
                  title={label}
                  aria-label={`${label}: ${Math.round(bar.value)}%`}
                  className={bar.value < 15 ? 'low-vital' : ''}
                >
                  {bar.icon}
                  {Math.round(bar.value)}
                </span>
              )
            );
          })}
        </span>
        <small>
          Состояние {!touch && <kbd>I</kbd>} {hud.birthWarning ? ' ⚠ Роды!' : ''}{' '}
          {expanded ? '▴' : '▾'}
        </small>
      </Button>
      <Button
        className="family-toggle"
        aria-expanded={familyOpen}
        onClick={() => dispatch('family-panel')}
      >
        🐇 Семья · {hud.familyCount ?? hud.young.length} {familyOpen ? '×' : '▾'}
      </Button>
      <ScrollContainer className="hud" label="Состояние и семья">
        <div className="status-card">
          <div className="card-heading">
            СОСТОЯНИЕ <span>{hud.status}</span>
          </div>
          {hud.bars.map((bar) => (
            <div className="stat" key={bar.label}>
              <span>
                {bar.icon} {bar.label}
              </span>
              <Meter
                className="meter"
                label={bar.label}
                value={Math.round(bar.value)}
                color={bar.color}
              />
              <b>{Math.round(bar.value)}</b>
            </div>
          ))}
          <div className="temperature">
            Температура тела: <b>{hud.temperature.toFixed(1)}°</b>{' '}
            {hud.temperature < 34 ? '⚠ Переохлаждение' : ''}
          </div>
          <div className="inventory">
            <b>
              ЕДА {hud.carried}/{hud.capacity}
              {!male && ` · МОЛОКО ${Math.round(hud.milk)}%`}
            </b>
            <div>
              {hud.inventory.length ? (
                hud.inventory.map((food) => (
                  <span key={food.kind} title={food.label}>
                    {food.emoji} {food.count}
                  </span>
                ))
              ) : (
                <span>Пусто</span>
              )}
            </div>
            <small>
              Трава {hud.materials.grass} · ветки {hud.materials.twigs} · пух {hud.materials.fur}
            </small>
          </div>
        </div>
        <div className="family-card">
          <div className="card-heading">МОЯ СЕМЬЯ</div>
          <strong>
            {hud.young.length} <small>крольчат</small>
          </strong>
          <span>{hud.familyText}</span>
          {pregnancy}
          <div className="family-line">
            <span>Выросли: {hud.grown}</span>
            <span>Гнёзда: {hud.nests}</span>
          </div>
          {hud.birthWarning && (
            <div className="birth-warning">
              ⚠ Скоро роды: {male ? 'подготовь гнездо для партнёрши' : 'вернись в подземное гнездо'}
            </div>
          )}
        </div>
      </ScrollContainer>
      <div className="prompt">
        {hud.prompt.map((part, index) => (
          <span key={index}>
            {index > 0 ? ' · ' : ''}
            {part.key && <kbd>{part.key}</kbd>}{' '}
            {touch ? part.text.replaceAll('Shift+ЛКМ', '«Копать»') : part.text}
          </span>
        ))}
      </div>
    </>
  );
}
