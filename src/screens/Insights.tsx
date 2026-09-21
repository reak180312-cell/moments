import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { navigate } from '../lib/router';
import {
  PARTS_OF_DAY, addDays, formatDuration, hourLabel, resolveRange, startOfMonth, startOfWeek,
  addMonths, type RangeKey,
} from '../lib/time';
import {
  byDayOfWeek, byHour, byPartOfDay, byPeriod, compareSummaries, directionSymbol,
  forRange, grainFor, helpfulSentence, helpfulStats, inRange, patterns, previousRangeEvents,
  summarise, triggerCounts,
} from '../lib/stats';
import { Button, Card, Chip, EmptyState, Icon } from '../components/ui';
import { ChartFrame, ColumnChart, ComparisonBars, DataTable, LineChart, RankedBars, TrendMark } from '../components/charts';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '3m', label: '3 months' },
  { key: '6m', label: '6 months' },
  { key: '1y', label: '1 year' },
  { key: 'all', label: 'All time' },
];

type CompareKey = 'week' | 'month' | 'thirty';

export function InsightsScreen() {
  const store = useStore();
  const [rangeKey, setRangeKey] = useState<RangeKey>('30d');
  const [compareKey, setCompareKey] = useState<CompareKey>('week');

  const range = useMemo(() => resolveRange(rangeKey), [rangeKey]);

  const scoped = useMemo(
    () => (store.activeProfileId
      ? store.allEvents.filter((e) => e.profile_id === store.activeProfileId)
      : store.allEvents),
    [store.allEvents, store.activeProfileId]
  );

  const events = useMemo(() => forRange(scoped, range), [scoped, range]);
  const previous = useMemo(() => previousRangeEvents(scoped, range), [scoped, range]);
  const stats = useMemo(() => summarise(events, store.triggers), [events, store.triggers]);
  const grain = grainFor(range.days);

  const buckets = useMemo(
    () => byPeriod(events, range.from, range.to, grain),
    [events, range, grain]
  );

  const observations = useMemo(
    () => patterns(scoped, store.triggers, range, previous),
    [scoped, store.triggers, range, previous]
  );

  const triggerStats = useMemo(() => triggerCounts(events, store.triggers), [events, store.triggers]);
  const helpful = useMemo(() => helpfulStats(events, store.helpful), [events, store.helpful]);
  const hours = useMemo(() => byHour(events), [events]);
  const parts = useMemo(() => byPartOfDay(events), [events]);
  const dows = useMemo(() => byDayOfWeek(events), [events]);

  const comparison = useMemo(() => buildComparison(scoped, store.triggers, compareKey), [scoped, store.triggers, compareKey]);

  if (!store.perms.stats) {
    return (
      <div className="screen">
        <h1>Insights</h1>
        <Card className="card--quiet" style={{ marginTop: '1rem' }}>
          <EmptyState
            emoji="🔒"
            title="Statistics are turned off for your account"
            body="Whoever owns this family space can turn them on in Settings."
          />
        </Card>
      </div>
    );
  }

  const bucketLabel = (key: string) => {
    const dt = new Date(key + 'T00:00:00');
    if (grain === 'month') return dt.toLocaleDateString(undefined, { month: 'short' });
    return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };

  return (
    <div className="screen screen--wide">
      <header className="screen-head">
        <div>
          <p className="eyebrow">Insights</p>
          <h1>{range.label}</h1>
        </div>
        <Button icon="download" size="sm" onClick={() => navigate('/reports')}>Report</Button>
      </header>

      <div className="stack-lg">
        <div className="chip-wrap" role="group" aria-label="Time range" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
          {RANGES.map((r) => (
            <Chip key={r.key} selected={rangeKey === r.key} onClick={() => setRangeKey(r.key)}>
              {r.label}
            </Chip>
          ))}
        </div>

        {events.length === 0 ? (
          <Card className="card--quiet">
            <EmptyState
              emoji="🌱"
              title="Not enough recorded yet"
              body="Once a few moments are recorded, this page fills in with what was noted — and nothing more than that."
            />
          </Card>
        ) : (
          <>
            <div className="tile-grid">
              <Tile label="Moments" value={String(stats.count)} sub={range.label.toLowerCase()} />
              <Tile
                label="Average difficulty"
                value={stats.avgDifficulty === null ? '—' : String(stats.avgDifficulty)}
                unit={stats.avgDifficulty === null ? undefined : '/10'}
              />
              <Tile label="Total time" value={stats.totalSeconds ? formatDuration(stats.totalSeconds) : '—'} />
              <Tile label="Average length" value={stats.avgSeconds ? formatDuration(stats.avgSeconds) : '—'} />
            </div>

            {observations.length > 0 && (
              <Card>
                <div className="stack">
                  <div className="row" style={{ gap: '0.5rem' }}>
                    <Icon name="info" size={18} />
                    <h2 className="chart-title" style={{ margin: 0 }}>What the record shows</h2>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '1.125rem', color: 'var(--ink-2)', display: 'grid', gap: '0.5rem' }}>
                    {observations.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                  <p className="help">
                    These are counts from what your family recorded. They describe the record,
                    not the reason behind it.
                  </p>
                </div>
              </Card>
            )}

            <ChartFrame
              title="How often"
              subtitle={`Moments recorded per ${grain}`}
              table={
                <DataTable
                  columns={[grain === 'month' ? 'Month' : grain === 'week' ? 'Week of' : 'Day', 'Moments']}
                  rows={buckets.map((b) => [bucketLabel(b.key), b.count])}
                />
              }
            >
              <ColumnChart
                data={buckets.map((b) => ({ label: bucketLabel(b.key), value: b.count }))}
                ariaSummary={`Moments recorded per ${grain} over ${range.label.toLowerCase()}. ${stats.count} in total.`}
              />
            </ChartFrame>

            <ChartFrame
              title="Average difficulty"
              subtitle="The average recorded score over time, out of 10"
              table={
                <DataTable
                  columns={['Period', 'Average difficulty']}
                  rows={buckets.filter((b) => b.avgDifficulty !== null).map((b) => [bucketLabel(b.key), `${b.avgDifficulty}/10`])}
                />
              }
              footnote="Gaps are periods with nothing recorded."
            >
              <LineChart
                data={buckets.map((b) => ({ label: bucketLabel(b.key), value: b.avgDifficulty }))}
                domain={[0, 10]}
                format={(v) => `${Math.round(v * 10) / 10}/10`}
                ariaSummary={`Average recorded difficulty over ${range.label.toLowerCase()}.`}
              />
            </ChartFrame>

            <ChartFrame
              title="How long"
              subtitle="Total recorded time per period"
              table={
                <DataTable
                  columns={['Period', 'Total time']}
                  rows={buckets.map((b) => [bucketLabel(b.key), formatDuration(b.totalSeconds)])}
                />
              }
              footnote={
                stats.timedCount < stats.count
                  ? `${stats.timedCount} of ${stats.count} moments have a recorded duration.`
                  : undefined
              }
            >
              <ColumnChart
                data={buckets.map((b) => ({ label: bucketLabel(b.key), value: Math.round(b.totalSeconds / 60) }))}
                format={(v) => `${v} min`}
                ariaSummary="Total recorded minutes per period."
              />
            </ChartFrame>

            <ChartFrame
              title="Triggers"
              subtitle="Most often recorded in this period"
              table={
                <DataTable
                  columns={['Trigger', 'Times', 'Avg difficulty']}
                  rows={triggerStats.map((t) => [t.name, t.count, t.avgDifficulty === null ? '—' : `${t.avgDifficulty}/10`])}
                />
              }
            >
              {triggerStats.length ? (
                <RankedBars
                  items={triggerStats.slice(0, 8).map((t) => ({ id: t.id, label: t.name, value: t.count }))}
                  onSelect={(id) => navigate(`/trigger/${id}`)}
                  format={(v) => `${v}×`}
                />
              ) : (
                <p className="help">No triggers recorded in this period.</p>
              )}
            </ChartFrame>

            <ChartFrame
              title="Time of day"
              subtitle="When moments were recorded"
              table={
                <DataTable
                  columns={['Hour', 'Moments']}
                  rows={hours.filter((h) => h.count > 0).map((h) => [hourLabel(h.hour), h.count])}
                />
              }
            >
              <div className="stack">
                <RankedBars
                  items={parts.map((p) => ({
                    label: `${p.key} · ${PARTS_OF_DAY.find((x) => x.key === p.key)?.hint ?? ''}`,
                    value: p.count,
                  }))}
                  format={(v) => `${v}×`}
                />
                <div style={{ marginTop: '0.5rem' }}>
                  <p className="chart-sub" style={{ marginBottom: '0.375rem' }}>Hour by hour</p>
                  <ColumnChart
                    data={hours.map((h) => ({ label: h.hour % 3 === 0 ? hourLabel(h.hour) : '', value: h.count }))}
                    height={130}
                    labelEvery={3}
                    ariaSummary="Moments recorded in each hour of the day."
                  />
                </div>
              </div>
            </ChartFrame>

            <ChartFrame
              title="Day of week"
              subtitle="Monday to Sunday"
              table={
                <DataTable
                  columns={['Day', 'Moments', 'Avg difficulty']}
                  rows={dows.map((d) => [d.label, d.count, d.avgDifficulty === null ? '—' : `${d.avgDifficulty}/10`])}
                />
              }
            >
              <ColumnChart
                data={dows.map((d) => ({ label: d.label, value: d.count }))}
                labelEvery={1}
                ariaSummary="Moments recorded on each day of the week."
              />
            </ChartFrame>

            <Card>
              <div className="stack">
                <div className="chart-head">
                  <h3 className="chart-title">What helped</h3>
                  <p className="chart-sub">What was recorded alongside moments — described, not concluded.</p>
                </div>
                {helpful.length === 0 ? (
                  <p className="help">
                    Nothing recorded often enough yet. Once a response has been noted three
                    times or more, it appears here.
                  </p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: '1.125rem', color: 'var(--ink-2)', display: 'grid', gap: '0.5rem' }}>
                    {helpful.slice(0, 6).map((h) => (
                      <li key={h.id}>{helpfulSentence(h)}</li>
                    ))}
                  </ul>
                )}
                <p className="help">
                  These are patterns in what was written down. Moments differ, and the record
                  cannot show why one was shorter than another.
                </p>
              </div>
            </Card>

            <Card>
              <div className="stack">
                <div className="chart-head">
                  <h3 className="chart-title">Compare periods</h3>
                  <p className="chart-sub">{comparison.label}</p>
                </div>

                <div className="chip-wrap">
                  {([
                    { key: 'week' as const, label: 'This week vs last' },
                    { key: 'month' as const, label: 'This month vs last' },
                    { key: 'thirty' as const, label: '30 days vs previous' },
                  ]).map((o) => (
                    <Chip key={o.key} selected={compareKey === o.key} onClick={() => setCompareKey(o.key)}>
                      {o.label}
                    </Chip>
                  ))}
                </div>

                <ComparisonBars
                  rows={comparison.rows}
                  currentLabel={comparison.currentLabel}
                  previousLabel={comparison.previousLabel}
                />

                <table className="chart-table">
                  <caption className="sr-only">Comparison between the two periods</caption>
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

                <p className="help">
                  Arrows show direction only ({directionSymbol.up} higher, {directionSymbol.down} lower,
                  {' '}{directionSymbol.flat} similar). A change in either direction is not
                  good or bad on its own.
                </p>
              </div>
            </Card>

            <Card className="card--quiet">
              <p style={{ fontSize: '0.8125rem', color: 'var(--ink-2)' }}>
                Moments is a record-keeping app. It counts and describes what your family
                wrote down. It does not assess, diagnose or explain — those conversations
                belong with your child and the people who support them.
              </p>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}{unit && <span className="unit">{unit}</span>}</span>
      {sub && <span className="tile-sub">{sub}</span>}
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
  let label: string;

  if (key === 'week') {
    currentFrom = startOfWeek(now);
    currentTo = addDays(currentFrom, 7);
    previousFrom = addDays(currentFrom, -7);
    previousTo = currentFrom;
    currentLabel = 'This week';
    previousLabel = 'Last week';
    label = 'Monday to Sunday, compared with the week before';
  } else if (key === 'month') {
    currentFrom = startOfMonth(now);
    currentTo = addMonths(currentFrom, 1);
    previousFrom = addMonths(currentFrom, -1);
    previousTo = currentFrom;
    currentLabel = 'This month';
    previousLabel = 'Last month';
    label = 'Calendar month, compared with the month before';
  } else {
    currentTo = addDays(now, 1);
    currentFrom = addDays(currentTo, -30);
    previousTo = currentFrom;
    previousFrom = addDays(previousTo, -30);
    currentLabel = 'Last 30 days';
    previousLabel = 'Previous 30';
    label = 'The last 30 days, compared with the 30 before that';
  }

  const current = summarise(inRange(events, currentFrom, currentTo), triggers);
  const before = summarise(inRange(events, previousFrom, previousTo), triggers);

  return {
    label, currentLabel, previousLabel,
    rows: compareSummaries(current, before),
    current, before,
  };
}
