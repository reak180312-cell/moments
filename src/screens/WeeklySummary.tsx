import { useMemo } from 'react';
import { useStore } from '../data/store';
import { navigate, useBack } from '../lib/router';
import { addDays, formatDuration } from '../lib/time';
import { weeklySummary } from '../lib/stats';
import { Button, Card, EmptyState, IconButton } from '../components/ui';
import { RankedBars, TrendMark } from '../components/charts';

export function WeeklySummaryScreen() {
  const store = useStore();
  const back = useBack();

  const scoped = useMemo(
    () => (store.activeProfileId
      ? store.allEvents.filter((e) => e.profile_id === store.activeProfileId)
      : store.allEvents),
    [store.allEvents, store.activeProfileId]
  );

  const week = useMemo(() => weeklySummary(scoped, store.triggers), [scoped, store.triggers]);
  const { summary, previous, topTriggers } = week;

  const range = `${week.weekStart.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${
    addDays(week.weekStart, 6).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;

  const countDelta = summary.count - previous.count;

  return (
    <div className="screen">
      <header className="row-between" style={{ marginBottom: '1rem' }}>
        <IconButton label="Back" name="back" onClick={back} />
        <h1 style={{ fontSize: '1.125rem' }}>This week</h1>
        <span style={{ width: '44px' }} />
      </header>

      <div className="stack-lg">
        <Card className="card--pad-lg">
          <p className="eyebrow">{range}</p>
          <p className="hero-figure" style={{ marginTop: '0.5rem' }}>{summary.count}</p>
          <p style={{ color: 'var(--ink-2)' }}>
            moment{summary.count === 1 ? '' : 's'} recorded this week
          </p>
        </Card>

        {summary.count === 0 ? (
          <Card className="card--quiet">
            <EmptyState
              emoji="🌤️"
              title="Nothing recorded this week"
              body="A quiet week in the record is worth noticing too."
            />
          </Card>
        ) : (
          <>
            <div className="tile-grid">
              <Tile
                label="Average difficulty"
                value={summary.avgDifficulty === null ? '—' : String(summary.avgDifficulty)}
                unit={summary.avgDifficulty === null ? undefined : '/10'}
              />
              <Tile label="Average length" value={summary.avgSeconds ? formatDuration(summary.avgSeconds) : '—'} />
              <Tile label="Total time" value={summary.totalSeconds ? formatDuration(summary.totalSeconds) : '—'} />
              <Tile label="Most common time" value={week.peakWindow ?? '—'} small />
            </div>

            {topTriggers.length > 0 && (
              <Card>
                <h2 className="section-title" style={{ marginTop: 0 }}>Most recorded triggers</h2>
                <RankedBars
                  items={topTriggers.map((t) => ({ id: t.id, label: t.name, value: t.count }))}
                  onSelect={(id) => navigate(`/trigger/${id}`)}
                  format={(v) => `${v}`}
                />
              </Card>
            )}

            <Card>
              <h2 className="section-title" style={{ marginTop: 0 }}>Compared with last week</h2>
              <div className="stack" style={{ gap: '0.75rem' }}>
                <p style={{ color: 'var(--ink-2)' }}>
                  {countDelta === 0
                    ? 'The same number of moments were recorded.'
                    : `${Math.abs(countDelta)} ${countDelta < 0 ? 'fewer' : 'more'} moment${Math.abs(countDelta) === 1 ? '' : 's'} recorded than last week.`}
                </p>
                {summary.avgDifficulty !== null && previous.avgDifficulty !== null && (
                  <p style={{ color: 'var(--ink-2)' }}>
                    Average recorded difficulty changed from {previous.avgDifficulty} to {summary.avgDifficulty}.
                  </p>
                )}

                <table className="chart-table">
                  <thead>
                    <tr>
                      <th scope="col">Measure</th>
                      <th scope="col">This week</th>
                      <th scope="col">Last week</th>
                      <th scope="col">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {week.comparisons.map((row) => (
                      <tr key={row.label}>
                        <th scope="row">{row.label}</th>
                        <td>{row.format(row.current)}</td>
                        <td>{row.format(row.previous)}</td>
                        <td>
                          <TrendMark direction={row.direction}>
                            <span aria-hidden="true">
                              {row.direction === 'flat' ? 'similar' : row.direction === 'none' ? '—' : row.direction === 'up' ? 'higher' : 'lower'}
                            </span>
                          </TrendMark>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        <Button icon="download" block onClick={() => navigate('/reports')}>
          Make a report from this
        </Button>

        <p className="help" style={{ textAlign: 'center' }}>
          This summary is only visible to your family. Nothing is shared unless you
          choose to share it yourself.
        </p>
      </div>
    </div>
  );
}

function Tile({ label, value, unit, small }: { label: string; value: string; unit?: string; small?: boolean }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className="tile-value" style={small ? { fontSize: '1rem', lineHeight: 1.4 } : undefined}>
        {value}{unit && <span className="unit">{unit}</span>}
      </span>
    </div>
  );
}
