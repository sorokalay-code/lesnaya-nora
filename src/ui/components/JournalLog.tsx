import { Disclosure, ScrollContainer } from '../kit';
/** История игровых событий отделена от кратковременных уведомлений на экране. */
export function JournalLog({ entries }: { entries: readonly string[] }) {
  return (
    <Disclosure
      className="journal-log"
      open
      summary={<> История событий · {Math.min(entries.length, 100)}/100 </>}
    >
      <ScrollContainer className="journal-log-list" label="Последние события">
        {entries.length ? (
          <ol>
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
      </ScrollContainer>
    </Disclosure>
  );
}
