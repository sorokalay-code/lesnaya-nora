import type { WebGLRenderer } from 'three';

/** Собирает показатели кадра и публикует текст диагностики в React-интерфейс. */
export class PerformanceMonitor {
  private enabled = new URLSearchParams(location.search).get('profile') === '1';
  private samples: number[] = [];
  private updates: number[] = [];
  private renders: number[] = [];
  private nextRefresh = 0;

  constructor(private readonly publish: (text?: string) => void) {
    window.addEventListener('keydown', (event) => {
      if (event.code === 'F3') {
        event.preventDefault();
        this.enabled = !this.enabled;
        if (!this.enabled) this.publish(undefined);
      }
    });
  }

  record(renderer: WebGLRenderer, frameMs: number, updateMs: number, renderMs: number): void {
    if (!this.enabled) return;

    this.samples.push(frameMs);
    this.updates.push(updateMs);
    this.renders.push(renderMs);
    if (this.samples.length > 120) {
      this.samples.shift();
      this.updates.shift();
      this.renders.shift();
    }

    const now = performance.now();
    if (now < this.nextRefresh || !this.samples.length) return;
    this.nextRefresh = now + 500;
    const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    const sorted = this.samples.slice().sort((a, b) => a - b),
      p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    this.publish(
      `FPS ${(1000 / mean(this.samples)).toFixed(0)} | кадр p95 ${p95.toFixed(1)} мс\nCPU: логика ${mean(this.updates).toFixed(1)} / отправка рендера ${mean(this.renders).toFixed(1)} мс\nDraw calls ${renderer.info.render.calls} | треугольники ${renderer.info.render.triangles.toLocaleString('ru')}\nGPU-ресурсы: геометрия ${renderer.info.memory.geometries} / текстуры ${renderer.info.memory.textures}`,
    );
  }
}
