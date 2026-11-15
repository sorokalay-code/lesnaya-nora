import './StartupLoader.css';

interface StartupLoaderProps {
  loaded: number;
  total: number;
  error?: boolean;
  onRetry: () => void;
}

export function StartupLoader({ loaded, total, error = false, onRetry }: StartupLoaderProps) {
  const percentage = total ? Math.floor((loaded / total) * 100) : 0;

  return (
    <main className="startup-loader" role="status" aria-live="polite">
      <div className="startup-loader__card">
        <div className="startup-loader__icon" aria-hidden="true">
          ❧
        </div>
        <p className="startup-loader__eyebrow">ЛЕСНАЯ НОРА</p>
        <h1>Пробуждаем лес</h1>
        <p className="startup-loader__status">
          {error
            ? 'Не удалось загрузить ресурсы. Проверьте подключение к интернету.'
            : `Загружено ресурсов: ${loaded} из ${total}`}
        </p>
        {!error ? (
          <>
            <progress max={100} value={percentage} aria-label="Загрузка ресурсов" />
            <p className="startup-loader__progress">{percentage}%</p>
          </>
        ) : (
          <button type="button" onClick={onRetry}>
            Обновить страницу
          </button>
        )}
      </div>
    </main>
  );
}
