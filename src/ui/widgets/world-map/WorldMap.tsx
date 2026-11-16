import { useEffect, useRef } from 'react';
import { Button, FieldLabel, Select } from '../../shared/ui';
import type { MapViewModel } from '../../types';
import './WorldMap.css';

export function WorldMap({
  data,
  dispatch,
}: {
  data: MapViewModel;
  dispatch: (action: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const mark = (x: number, z: number) => dispatch(`cold-night:mark:${x}:${z}`);

  useEffect(() => {
    const surface = canvas.current;
    if (!surface) return;
    const ctx = surface.getContext('2d');
    if (!ctx) return;
    const position = (n: number) => (n / (data.size * 2) + 0.5) * 420;
    data.colors.forEach((color, index) => {
      ctx.fillStyle = color;
      ctx.fillRect((index % 60) * 7, Math.floor(index / 60) * 7, 7, 7);
    });
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const body of data.water) {
      const color = body.kind === 'lake' ? '#438da2' : body.kind === 'bog' ? '#566b51' : '#68b1c4';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      const [start, ...rest] = body.outline ?? body.points;
      const radius = (body.radius / data.size) * 210;
      ctx.beginPath();
      if (rest.length === 0) {
        ctx.arc(position(start.x), position(start.z), radius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.moveTo(position(start.x), position(start.z));
        for (const point of rest) ctx.lineTo(position(point.x), position(point.z));
        if (body.outline) {
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.lineWidth = radius * 2;
          ctx.stroke();
        }
      }
    }
    for (const landmark of data.landmarks) {
      ctx.fillStyle = '#f8e9cc';
      ctx.beginPath();
      ctx.arc(position(landmark.x), position(landmark.z), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '11px sans-serif';
      ctx.fillText(landmark.label, position(landmark.x) + 8, position(landmark.z) + 4);
    }

    for (const opening of data.openings) {
      ctx.fillStyle = '#513d2b';
      ctx.beginPath();
      ctx.arc(position(opening.x), position(opening.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (data.outing) {
      const { home, waypoint } = data.outing;
      const colors = getComputedStyle(surface);
      const marker = (x: number, z: number, color: string, angle: number) => {
        ctx.save();
        ctx.translate(position(x), position(z));
        ctx.rotate(angle);
        ctx.fillStyle = colors.getPropertyValue(color);
        ctx.strokeStyle = colors.getPropertyValue('--ui-canvas');
        ctx.lineWidth = 2;
        ctx.fillRect(-6, -6, 12, 12);
        ctx.strokeRect(-6, -6, 12, 12);
        ctx.restore();
      };
      marker(home.x, home.z, '--ui-map-water', 0);
      if (waypoint) marker(waypoint.x, waypoint.z, '--ui-focus', Math.PI / 4);
    }

    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#24382b';
    ctx.lineWidth = 2;
    ctx.save();
    ctx.translate(position(data.player.x), position(data.player.z));
    ctx.rotate(data.player.heading);
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }, [data]);
  return (
    <>
      <p>
        Белая стрелка показывает твоё положение и направление взгляда. Тёмные круги — входы в норы.
        Голубое — вода, серое — горы.
      </p>
      {data.outing && (
        <p>
          Голубой квадрат — тайник {data.outing.home.id}. Нажми на карту, чтобы поставить золотую
          метку.
        </p>
      )}
      <canvas
        ref={canvas}
        className="world-map"
        role="img"
        aria-label="Карта леса сверху"
        data-markable={!!data.outing}
        width={420}
        height={420}
        onClick={
          data.outing
            ? (event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                const world = (offset: number, length: number) =>
                  Math.max(
                    -data.size,
                    Math.min(data.size, (offset / length - 0.5) * data.size * 2),
                  );
                mark(
                  world(event.clientX - bounds.left, bounds.width),
                  world(event.clientY - bounds.top, bounds.height),
                );
              }
            : undefined
        }
      />
      {data.outing && (
        <div className="outing-map-tools">
          <FieldLabel separateControl>
            Отметить ориентир
            <Select
              value=""
              onChange={(event) => {
                const value = event.currentTarget.value;
                if (!value) return;
                const point = value === 'player' ? data.player : data.landmarks[Number(value)];
                if (point) mark(point.x, point.z);
              }}
            >
              <option value="">Выбрать место</option>
              <option value="player">Моё положение</option>
              {data.landmarks.map(({ label }, index) => (
                <option key={index} value={index}>
                  {label}
                </option>
              ))}
            </Select>
          </FieldLabel>
          <p role="status">
            {data.outing.waypoint
              ? `Метка вылазки · X ${Math.round(data.outing.waypoint.x)} м, Z ${Math.round(data.outing.waypoint.z)} м`
              : 'Метка не установлена.'}
          </p>
          <div className="outing-map-actions">
            <Button onClick={() => dispatch('burrow-plan')}>К плану норы</Button>
            {data.outing.waypoint && (
              <Button onClick={() => dispatch('cold-night:clear-marker')}>Снять метку</Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
