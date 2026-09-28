import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { navigate } from '../lib/router';
import {
  addDays, formatDuration, hourLabel, resolveRange, startOfMonth, startOfWeek,
  addMonths, partOfDay, type PartOfDay, type RangeKey,
} from '../lib/time';
import {
  byDayOfWeek, byHour, byPeriod, compareSummaries, forRange, grainFor, helpfulSentence,
  helpfulStats, inRange, mean, patterns, previousRangeEvents, round1, summarise, triggerCounts,
} from '../lib/stats';
import { Button, Card, EmptyState } from '../components/ui';
import { ChartFrame, ColumnChart, ComparisonBars, DataTable, LineChart, TrendMark } from '../components/charts';
import { PageHead, PhotoCard, StatCell, StatSplit, iClass, showScore } from '../components/moment';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '3m', label: '3 months' },
  { key: '1y', label: '1 year' },
];

const SHORT_HOURS: Record<PartOfDay, string> = {
  Morning: '5–12',
  Afternoon: '12–5',
  Evening: '5–10',
  Night: '10–5',
};

type CompareKey = 'week' | 'month' | 'thirty';

export function InsightsScreen() {
  const store = useStore();
  const [rangeKey, setRangeKey] = useState<RangeKey>('30d');
  const [compareKey, setCompareKey] = useState<CompareKey>('week');

  const range = useMemo(() => resolveRange(rangeKey), [rangeKey]);
  const child = store.profiles.find((p) => p.id === store.activeProfileId);

  const scoped = useMemo(
    () => (store.activeProfileId
      ? store.allEvents.filter((e) => e.profile_id === store.activeProfileId)
      : store.allEvents),
    [store.allEvents, store.activeProfileId]
  );

  const events = useMemo(() => forRange(scoped, range), [scoped, range]);
  const previous = useMemo(() => previousRangeEvents(scoped, range), [scoped, range]);
  const stats = useMemo(() => summarise(events, store.triggers), [events, store.triggers]);
  const before = useMemo(() => summarise(previous, store.triggers), [previous, store.triggers]);
  const grain = grainFor(range.days);

  const buckets = useMemo(() => byPeriod(events, range.from, range.to, grain), [events, range, grain]);
  const triggerStats = useMemo(() => triggerCounts(events, store.triggers), [events, store.triggers]);
  const helpful = useMemo(() => helpfulStats(events, store.helpful), [events, store.helpful]);
  const hours = useMemo(() => byHour(events), [events]);
  const dows = useMemo(() => byDayOfWeek(events), [events]);
  const observations = useMemo(
    () => patterns(scoped, store.triggers, range, previous),
    [scoped, store.triggers, range, previous]
  );
  const comparison = useMemo(
    () => buildComparison(scoped, store.triggers, compareKey),
    [scoped, store.triggers, compareKey]
  );

  // Average intensity per part of the day, for the "hardest time" card.
  const parts = useMemo(() => {
    const order: PartOfDay[] = ['Morning', 'Afternoon', 'Evening', 'Night'];
    return order.map((key) => {
      const list = events.filter((e) => partOfDay(new Date(e.start_time).getHours()) === key);
      const scores = list.map((e) => e.difficulty).filter((n): n is number => typeof n === 'number');
      return { key, count: list.length, avg: round1(mean(scores)) };
    });
  }, [events]);

  const delta = stats.avgDifficulty !== null && before.avgDifficulty !== null
    ? round1(stats.avgDifficulty - before.avgDifficulty)
    : null;

  if (!store.perms.stats) {
    return (
      <div className="screen">
        <PageHead title="Insights" />
        <EmptyState
          emoji="🔒"
          title="Statistics are turned off for your account"
          body="Whoever owns this family space can turn them on in Settings."
        />
      </div>
    );
  }

  const bucketLabel = (key: string) => {
    const dt = new Date(key + 'T00:00:00');
    return grain === 'month'
      ? dt.toLocaleDateString(undefined, { month: 'short' })
      : dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };

  return (
    <div className="screen screen--wide">
      <PageHead
        title={range.label}
        subtitle={`Notice patterns in ${child ? `${child.name}'s` : 'the'} challenging moments.`}
        trailing={<Button size="sm" onClick={() => navigate('/reports')}>Report</Button>}
      />

      <div className="stack">
        <div className="tab-row" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r.key} type="button" aria-pressed={rangeKey === r.key} onClick={() => setRangeKey(r.key)}>
              {r.label}
            </button>
          ))}
        </div>

        {events.length === 0 ? (
          <EmptyState
            emoji="🌱"
            title="Not enough recorded yet"
            body="Once a few moments are recorded, this page fills in with what was noted."
          />
        ) : (
          <>
            <PhotoCard
              slot="insights"
              heading={'Small steps make a difference.'}
              body={`Here's what we've noticed about ${child ? `${child.name}'s` : 'the'} challenging moments in ${range.label.toLowerCase()}.`}
            />

            <StatSplit
              left={
                <StatCell
                  label="Average intensity"
                  value={showScore(stats.avgDifficulty)}
                  unit="/ 10"
                  note={`Based on ${stats.count} moment${stats.count === 1 ? '' : 's'} in ${range.label.toLowerCase()}`}
                />
              }
              right={
                <div className="stat-cell">
                  <div className="stat-body">
                    {delta === null ? (
                      <span className="stat-note">No earlier period to compare with</span>
                    ) : (
                      <>
                        <span className={`delta-pill ${delta < 0 ? 'delta-pill--down' : delta > 0 ? 'delta-pill--up' : ''}`}>
                          <span aria-hidden="true">{delta < 0 ? '↓' : delta > 0 ? '↑' : '→'}</span>
                          {Math.abs(delta)}
                        </span>
                        <div className="stat-note" style={{ marginTop: '0.4375rem' }}>
                          compared to previous {range.label.toLowerCase()} ({before.avgDifficulty})
                        </div>
                      </>
                    )}
                  </div>
                </div>
              }
            />

            <ChartFrame
              title="Intensity over time"
              table={
                <DataTable
                  columns={['Period', 'Average intensity']}
                  rows={buckets.filter((b) => b.avgDifficulty !== null).map((b) => [bucketLabel(b.key), `${b.avgDifficulty}/10`])}
                />
              }
            >
              <LineChart
                data={buckets.map((b) => ({ label: bucketLabel(b.key), value: b.avgDifficulty }))}
                domain={[0, 10]}
                format={(v) => `${Math.round(v * 10) / 10}/10`}
                colour="var(--cat-1)"
                ariaSummary={`Average recorded intensity over ${range.label.toLowerCase()}.`}
              />
            </ChartFrame>

            <div className="mini-grid">
              <section className="ui-card mini-card">
                <h3>Most common triggers</h3>
                {triggerStats.length === 0 ? (
                  <p className="help">None recorded yet.</p>
                ) : triggerStats.slice(0, 4).map((t) => (
                  <button
                    key={t.id} type="button" className="mini-row2"
                    style={{ width: '100%', background: 'none', border: 0, cursor: 'pointer', textAlign: 'left' }}
                    onClick={() => navigate(`/trigger/${t.id}`)}
                  >
                    <span className={`mini-score ${iClass(t.avgDifficulty)}`}>{showScore(t.avgDifficulty)}</span>
                    <span className="mini-name">{t.name}</span>
                    <span className="mini-meta">{t.count}×</span>
                  </button>
                ))}
              </section>

              <section className="ui-card mini-card">
                <h3>What helped most</h3>
                {helpful.length === 0 ? (
                  <p className="help">Nothing recorded three times or more yet.</p>
                ) : helpful.slice(0, 4).map((h) => (
                  <div key={h.id} className="mini-row2">
                    <span className="mini-score" style={{ background: 'var(--good-bg)', color: 'var(--good-ink)' }}>
                      {showScore(h.avgDifficulty)}
                    </span>
                    <span className="mini-name">{h.name}</span>
                    <span className="mini-meta">{h.count}×</span>
                  </div>
                ))}
              </section>

              <section className="ui-card mini-card">
                <h3>Hardest time of day</h3>
                <div className="hours">
                  {parts.map((p) => {
                    const hint = SHORT_HOURS[p.key];
                    const height = p.avg === null ? 6 : 18 + (p.avg / 10) * 54;
                    return (
                      <div key={p.key} className={`hour ${iClass(p.avg)}`}>
                        <b>{p.avg === null ? '–' : showScore(p.avg)}</b>
                        <span className="col" style={{ height: `${height}px` }} />
                        <small>{p.key}<br />{hint}</small>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="ui-card mini-card">
                <h3>Days with most moments</h3>
                {dows.map((d) => {
                  const max = Math.max(...dows.map((x) => x.count), 1);
                  return (
                    <div key={d.label} className="bar-mini">
                      <span>{d.label}</span>
                      <span className="track">
                        <span className="fill" style={{ width: `${Math.max(2, (d.count / max) * 100)}%` }} />
                      </span>
                      <span className="num">{d.count}</span>
                    </div>
                  );
                })}
              </section>
            </div>

            {observations.length > 0 && (
              <Card>
                <h3 className="chart-title" style={{ marginBottom: '0.5rem' }}>What the record shows</h3>
                <ul style={{ margin: 0, paddingLeft: '1.125rem', color: 'var(--ink-2)', display: 'grid', gap: '0.5rem' }}>
                  {observations.map((line) => <li key={line}>{line}</li>)}
                </ul>
              </Card>
            )}

            <ChartFrame
              title="How often"
              table={
                <DataTable
                  columns={[grain === 'month' ? 'Month' : grain === 'week' ? 'Week of' : 'Day', 'Moments']}
                  rows={buckets.map((b) => [bucketLabel(b.key), b.count])}
                />
              }
            >
              <ColumnChart
                data={buckets.map((b) => ({ label: bucketLabel(b.key), value: b.count }))}
                colour="var(--cat-1)"
                ariaSummary={`Moments recorded per ${grain}.`}
              />
            </ChartFrame>

            <ChartFrame
              title="How long"
              table={
                <DataTable
                  columns={['Period', 'Total time']}
                  rows={buckets.map((b) => [bucketLabel(b.key), formatDuration(b.totalSeconds)])}
                />
              }
            >
              <ColumnChart
                data={buckets.map((b) => ({ label: bucketLabel(b.key), value: Math.round(b.totalSeconds / 60) }))}
                format={(v) => `${v} min`}
                colour="var(--cat-3)"
                ariaSummary="Total recorded minutes per period."
              />
            </ChartFrame>

            <ChartFrame
              title="Hour by hour"
              table={
                <DataTable
                  columns={['Hour', 'Moments']}
                  rows={hours.filter((h) => h.count > 0).map((h) => [hourLabel(h.hour), h.count])}
                />
              }
            >
              <ColumnChart
                data={hours.map((h) => ({ label: h.hour % 3 === 0 ? hourLabel(h.hour) : '', value: h.count }))}
                height={130}
                labelEvery={3}
                colour="var(--cat-2)"
                ariaSummary="Moments recorded in each hour of the day."
              />
            </ChartFrame>

            {helpful.length > 0 && (
              <Card>
                <h3 className="chart-title" style={{ marginBottom: '0.5rem' }}>What helped</h3>
                <ul style={{ margin: 0, paddingLeft: '1.125rem', color: 'var(--ink-2)', display: 'grid', gap: '0.5rem' }}>
                  {helpful.slice(0, 6).map((h) => <li key={h.id}>{helpfulSentence(h)}</li>)}
                </ul>
              </Card>
            )}

            <Card>
              <div className="stack">
                <h3 className="chart-title">Compare periods</h3>
                <div className="tab-row">
                  {([
                    { key: 'week' as const, label: 'This week' },
                    { key: 'month' as const, label: 'This month' },
                    { key: 'thirty' as const, label: '30 days' },
                  ]).map((o) => (
                    <button key={o.key} type="button" aria-pressed={compareKey === o.key} onClick={() => setCompareKey(o.key)}>
                      {o.label}
                    </button>
                  ))}
                </div>

                <ComparisonBars
                  rows={comparison.rows}
                  currentLabel={comparison.currentLabel}
                  previousLabel={comparison.previousLabel}
                />

                <table className="chart-table">
                  <thead>
                    <tr>
                      <th scope="col">Measure</th>
                      <th scope="col">{comparison.currentLabel}</th>
                      <th scope="col">{comparison.previousLabel}</th>
                      <th scope="col">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.rows.map((row) => (
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

            <PhotoCard
              slot="encourage"
              heading="You're doing great."
              body={`Noticing and understanding ${child ? `${child.name}'s` : 'these'} challenging moments helps build brighter days ahead.`}
            />

            <p className="help">Counts of what your family wrote down. Not an assessment.</p>
          </>
        )}
      </div>
    </div>
  );
}

function buildComparison(
  events: Parameters<typeof summarise>[0],
  triggers: Parameters<typeof summarise>[1],
  key: CompareKey
) {
  const now = new Date();
  let currentFrom: Date;
  let currentTo: Date;
  let previousFrom: Date;
  let previousTo: Date;
  let currentLabel: string;
  let previousLabel: string;

  if (key === 'week') {
    currentFrom = startOfWeek(now);
    currentTo = addDays(currentFrom, 7);
    previousFrom = addDays(currentFrom, -7);
    previousTo = currentFrom;
    currentLabel = 'This week';
    previousLabel = 'Last week';
  } else if (key === 'month') {
    currentFrom = startOfMonth(now);
    currentTo = addMonths(currentFrom, 1);
    previousFrom = addMonths(currentFrom, -1);
    previousTo = currentFrom;
    currentLabel = 'This month';
    previousLabel = 'Last month';
  } else {
    currentTo = addDays(now, 1);
    currentFrom = addDays(currentTo, -30);
    previousTo = currentFrom;
    previousFrom = addDays(previousTo, -30);
    currentLabel = 'Last 30 days';
    previousLabel = 'Previous 30';
  }

  const current = summarise(inRange(events, currentFrom, currentTo), triggers);
  const before = summarise(inRange(events, previousFrom, previousTo), triggers);

  return { currentLabel, previousLabel, rows: compareSummaries(current, before) };
}
