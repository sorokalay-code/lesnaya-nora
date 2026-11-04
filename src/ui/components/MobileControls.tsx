import { Button } from '../kit';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useStore } from 'zustand';
import type { TouchBindings } from '../../game/input/MobileInput';
import type { UIStore } from '../store';

/** Сенсорные кнопки не эмулируют DOM-клавиатуру, а обращаются к адаптеру ввода. */
export function MobileControls({ store }: { store: UIStore }) {
  const touch = useStore(store, (s) => s.touch);
  const portrait = useStore(store, (s) => s.portrait);
  const hidden = useStore(
    store,
    (s) =>
      !s.hud ||
      !!(s.overlay || s.dialog || s.journal || s.gameMenu || s.eventsOpen || s.familyOpen),
  );
  const open = useStore(store, (s) => s.actionMenuOpen);
  const bindings = useStore(store, (s) => s.touchBindings);
  const first = useStore(store, (s) => s.firstPerson);
  const web = useStore(store, (s) => s.hud?.web);
  const airlift = useStore(store, (s) => s.hud?.airlift);
  const dispatch = useStore(store, (s) => s.dispatch);
  const showControls = useStore(store, (s) => s.showControls);

  if (!touch) return null;
  if (portrait)
    return (
      <div className="orientation-guard" role="alert">
        <span>↻</span>
        <h1>Поверни устройство</h1>
        <p>Лесная нора играется в горизонтальном положении.</p>
        <small>Игра на паузе — крольчиха в безопасности.</small>
      </div>
    );
  if (hidden || !bindings || airlift) return null;

  if (open) return null;

  return (
    <div className="touch-controls">
      <Joystick bindings={bindings} />
      <div className="touch-actions">
        <HoldButton label="Бег" onHold={bindings.sprint} />
        <Button disabled={!!web} onClick={() => dispatch('hop')}>
          Прыжок
        </Button>
        <Button className="touch-primary" onClick={() => dispatch(web ? 'struggle' : 'interact')}>
          {web ? 'Вырваться' : 'Общаться / взять'}
        </Button>
        {first && !web && (
          <>
            <HoldButton label="Копать" onHold={bindings.dig} />
            <Button onClick={() => dispatch('dig-down')}>Копать вниз</Button>
          </>
        )}
        <Button onClick={() => dispatch('camera')}>{first ? '3-е лицо' : '1-е лицо'}</Button>
        <Button onClick={() => dispatch('world-actions')}>Действия ✦</Button>
      </div>
      {showControls && <span className="touch-look-hint">Свайп по миру — осмотреться</span>}
    </div>
  );
}

function HoldButton({ label, onHold }: { label: string; onHold: (held: boolean) => void }) {
  useEffect(() => () => onHold(false), [onHold]);
  return (
    <Button
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onHold(true);
      }}
      onPointerUp={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
      onLostPointerCapture={() => onHold(false)}
    >
      {label}
    </Button>
  );
}

const JOYSTICK_TRAVEL_PX = 42;

function Joystick({ bindings }: { bindings: TouchBindings }) {
  const pointer = useRef<number | undefined>(undefined);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const release = () => {
    pointer.current = undefined;
    bindings.move(0, 0);
    setOffset({ x: 0, y: 0 });
  };
  useEffect(() => () => bindings.move(0, 0), [bindings]);
  function move(event: PointerEvent<HTMLDivElement>) {
    if (pointer.current !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left - rect.width / 2) / JOYSTICK_TRAVEL_PX;
    const y = (event.clientY - rect.top - rect.height / 2) / JOYSTICK_TRAVEL_PX;
    const length = Math.max(1, Math.hypot(x, y));
    const next = { x: x / length, y: y / length };
    setOffset(next);
    bindings.move(next.x, next.y);
  }
  const knobStyle: CSSProperties & { '--joystick-x': string; '--joystick-y': string } = {
    '--joystick-x': `${offset.x * JOYSTICK_TRAVEL_PX}px`,
    '--joystick-y': `${offset.y * JOYSTICK_TRAVEL_PX}px`,
  };

  return (
    <div
      className="touch-joystick"
      role="group"
      aria-label="Джойстик движения"
      onPointerDown={(e) => {
        if (pointer.current !== undefined) return;
        e.preventDefault();
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <span style={knobStyle}>✦</span>
    </div>
  );
}
