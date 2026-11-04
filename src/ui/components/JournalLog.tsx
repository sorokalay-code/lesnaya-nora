import { Disclosure } from '../kit';
/** История игровых событий отделена от кратковременных уведомлений на экране. */
export function JournalLog({ entries }: { entries: readonly string[] }) {
  return (
    <Disclosure
      className="journal-log"
      open
      summary={<> История событий · {Math.min(entries.length, 100)}/100 </>}
    >
      {entries.length ? (
        <ol aria-label="Последние события">
          {entries
            .slice(-100)
            .reverse()
            .map((entry, index) => (
              <li key={`${index}-${entry}`}>{entry}</li>
            ))}
        </ol>
      ) : (
        <p>События появятся здесь по ходу игры.</p>
      )}
    </Disclosure>
  );
}
