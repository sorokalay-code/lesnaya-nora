import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useStore } from 'zustand';
import type { TouchBindings } from '../../game/input/MobileInput';
import type { UIStore } from '../store';

/** Сенсорные кнопки не эмулируют DOM-клавиатуру, а обращаются к адаптеру ввода. */
export function MobileControls({ store }: { store: UIStore }) {
  const touch = useStore(store, (s) => s.touch);
  const portrait = useStore(store, (s) => s.portrait);
  const hidden = useStore(
    store,
    (s) => !s.hud || !!(s.overlay || s.dialog || s.journal || s.settings || s.familyOpen),
  );
  const open = useStore(store, (s) => s.actionMenuOpen);
  const bindings = useStore(store, (s) => s.touchBindings);
  const first = useStore(store, (s) => s.firstPerson);
  const web = useStore(store, (s) => s.hud?.web);
  const dispatch = useStore(store, (s) => s.dispatch);

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
  if (hidden || !bindings) return null;

  if (open) return null;

  return (
    <div className="touch-controls">
      <Joystick bindings={bindings} />
      <div className="touch-actions">
        <HoldButton label="Бег" onHold={bindings.sprint} />
        <button disabled={!!web} onClick={() => dispatch('hop')}>
          Прыжок
        </button>
        <button className="touch-primary" onClick={() => dispatch(web ? 'struggle' : 'interact')}>
          {web ? 'Вырваться' : 'Общаться / взять'}
        </button>
        {first && !web && (
          <>
            <HoldButton label="Копать" onHold={bindings.dig} />
            <button onClick={() => dispatch('dig-down')}>Копать вниз</button>
          </>
        )}
        <button onClick={() => dispatch('camera')}>{first ? '3-е лицо' : '1-е лицо'}</button>
        <button onClick={() => dispatch('menu')}>Действия ☰</button>
      </div>
      <span className="touch-look-hint">Свайп по миру — осмотреться</span>
    </div>
  );
}

function HoldButton({ label, onHold }: { label: string; onHold: (held: boolean) => void }) {
  useEffect(() => () => onHold(false), [onHold]);
  return (
    <button
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
    </button>
  );
}

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
    const x = (event.clientX - rect.left - rect.width / 2) / 42;
    const y = (event.clientY - rect.top - rect.height / 2) / 42;
    const length = Math.max(1, Math.hypot(x, y));
    const next = { x: x / length, y: y / length };
    setOffset(next);
    bindings.move(next.x, next.y);
  }
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
      <span style={{ transform: `translate(${offset.x * 42}px,${offset.y * 42}px)` }}>✦</span>
    </div>
  );
}
