import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { useBack } from '../lib/router';
import {
  addDays, dayKey, formatDuration, formatLongDate, formatTime, resolveRange, startOfDay, type RangeKey,
} from '../lib/time';
import {
  byPeriod, compareSummaries, grainFor, helpfulSentence, helpfulStats, inRange, patterns,
  summarise, triggerCounts,
} from '../lib/stats';
import { download, eventsToCsv } from '../lib/export';
import { Button, Card, Chip, IconButton, SwitchRow, useToast } from '../components/ui';
import { ColumnChart, RankedBars, TrendMark } from '../components/charts';
import { DifficultyBadge, difficultyWord } from '../components/Difficulty';

const PRESETS: { key: RangeKey; label: string }[] = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '3m', label: 'Last 3 months' },
  { key: '6m', label: 'Last 6 months' },
  { key: '1y', label: 'Last year' },
];

interface Sections {
  summary: boolean;
  charts: boolean;
  triggers: boolean;
  durations: boolean;
  trends: boolean;
  events: boolean;
  notes: boolean;
}

export function ReportsScreen() {
  const store = useStore();
  const back = useBack();
  const toast = useToast();

  const [preset, setPreset] = useState<RangeKey | 'custom'>('30d');
  const [from, setFrom] = useState(() => dayKey(addDays(new Date(), -29)));
  const [to, setTo] = useState(() => dayKey(new Date()));
  const [sections, setSections] = useState<Sections>({
    summary: true, charts: true, triggers: true, durations: true,
    trends: true, events: true, notes: false,
  });

  const range = useMemo(() => {
    if (preset === 'custom') {
      const f = startOfDay(new Date(from + 'T00:00:00'));
      const t = addDays(startOfDay(new Date(to + 'T00:00:00')), 1);
      return {
        from: f, to: t,
        label: `${formatLongDate(f)} – ${formatLongDate(addDays(t, -1))}`,
        days: Math.max(1, Math.round((t.getTime() - f.getTime()) / 86_400_000)),
      };
    }
    return resolveRange(preset);
  }, [preset, from, to]);

  const scoped = useMemo(
    () => (store.activeProfileId
      ? store.allEvents.filter((e) => e.profile_id === store.activeProfileId)
      : store.allEvents),
    [store.allEvents, store.activeProfileId]
  );

  const events = useMemo(() => inRange(scoped, range.from, range.to), [scoped, range]);
  const before = useMemo(() => {
    const span = range.to.getTime() - range.from.getTime();
    return inRange(scoped, new Date(range.from.getTime() - span), range.from);
  }, [scoped, range]);

  const stats = useMemo(() => summarise(events, store.triggers), [events, store.triggers]);
  const previousStats = useMemo(() => summarise(before, store.triggers), [before, store.triggers]);
  const comparisons = useMemo(() => compareSummaries(stats, previousStats), [stats, previousStats]);
  const grain = grainFor(range.days);
  const buckets = useMemo(() => byPeriod(events, range.from, range.to, grain), [events, range, grain]);
  const triggerStats = useMemo(() => triggerCounts(events, store.triggers), [events, store.triggers]);
  const helpful = useMemo(() => helpfulStats(events, store.helpful), [events, store.helpful]);
  const observations = useMemo(
    () => patterns(scoped, store.triggers, range, before),
    [scoped, store.triggers, range, before]
  );

  const child = store.profiles.find((p) => p.id === store.activeProfileId);

  const bucketLabel = (key: string) => {
    const dt = new Date(key + 'T00:00:00');
    return grain === 'month'
      ? dt.toLocaleDateString(undefined, { month: 'short' })
      : dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };

  const exportCsv = () => {
    const csv = eventsToCsv(events, {
      trigger: store.triggerName,
      helpful: store.helpfulName,
      person: (id) => store.nameOf(id),
    });
    download(`moments-${dayKey(range.from)}-to-${dayKey(addDays(range.to, -1))}.csv`, csv, 'text/csv;charset=utf-8');
    toast('CSV downloaded to this device only.');
  };

  return (
    <div className="screen screen--wide">
      <header className="row-between no-print" style={{ marginBottom: '1rem' }}>
        <IconButton label="Back" name="back" onClick={back} />
        <h1 style={{ fontSize: '1.125rem' }}>Report</h1>
        <span style={{ width: '44px' }} />
      </header>

      <div className="stack-lg">
        <Card className="no-print">
          <div className="stack">
            <h2 className="section-title" style={{ marginTop: 0 }}>Dates</h2>
            <div className="chip-wrap">
              {PRESETS.map((p) => (
                <Chip key={p.key} selected={preset === p.key} onClick={() => setPreset(p.key)}>
                  {p.label}
                </Chip>
              ))}
              <Chip selected={preset === 'custom'} onClick={() => setPreset('custom')}>Custom</Chip>
            </div>

            {preset === 'custom' && (
              <div className="row" style={{ gap: '0.75rem' }}>
                <label className="field" style={{ flex: 1 }}>
                  <span className="label">From</span>
                  <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
                </label>
                <label className="field" style={{ flex: 1 }}>
                  <span className="label">To</span>
                  <input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
                </label>
              </div>
            )}
          </div>
        </Card>

        <Card className="no-print">
          <h2 className="section-title" style={{ marginTop: 0 }}>What to include</h2>
          <SwitchRow title="Summary" checked={sections.summary} onChange={(v) => setSections({ ...sections, summary: v })} />
          <SwitchRow title="Charts" checked={sections.charts} onChange={(v) => setSections({ ...sections, charts: v })} />
          <SwitchRow title="Triggers" checked={sections.triggers} onChange={(v) => setSections({ ...sections, triggers: v })} />
          <SwitchRow title="Durations" checked={sections.durations} onChange={(v) => setSections({ ...sections, durations: v })} />
          <SwitchRow title="Trends" description="Compared with the period before" checked={sections.trends} onChange={(v) => setSections({ ...sections, trends: v })} />
          <SwitchRow title="Individual moments" checked={sections.events} onChange={(v) => setSections({ ...sections, events: v })} />
          <SwitchRow
            title="Notes and descriptions"
            description="Free text written by your family. Leave off for a shorter, less personal report."
            checked={sections.notes}
            onChange={(v) => setSections({ ...sections, notes: v })}
          />
        </Card>

        <div className="row no-print" style={{ gap: '0.5rem' }}>
          <Button variant="primary" icon="download" style={{ flex: 1 }} onClick={() => window.print()}>
            Save as PDF
          </Button>
          <Button icon="download" style={{ flex: 1 }} onClick={exportCsv}>
            Download CSV
          </Button>
        </div>

        <p className="help no-print" style={{ textAlign: 'center' }}>
          The file is saved to this device. Moments never sends a report anywhere on its own.
        </p>

        {/* ------------------------------ the report itself ------------------------------ */}

        <article className="stack-lg" aria-label="Report preview">
          <Card className="card--pad-lg">
            <p className="eyebrow">{store.family?.name}{child ? ` · ${child.name}` : ''}</p>
            <h2 style={{ fontSize: '1.5rem', marginTop: '0.25rem' }}>Moments report</h2>
            <p style={{ color: 'var(--ink-2)' }}>{range.label}</p>
            <p className="help" style={{ marginTop: '0.75rem' }}>
              A record of what this family wrote down. It describes what was recorded and
              does not assess or diagnose anything.
            </p>
          </Card>

          {sections.summary && (
            <Card>
              <h3 className="section-title" style={{ marginTop: 0 }}>Summary</h3>
              <div className="tile-grid">
                <Tile label="Moments" value={String(stats.count)} />
                <Tile label="Average difficulty" value={stats.avgDifficulty === null ? '—' : `${stats.avgDifficulty}/10`} />
                <Tile label="Total time" value={stats.totalSeconds ? formatDuration(stats.totalSeconds) : '—'} />
                <Tile label="Average length" value={stats.avgSeconds ? formatDuration(stats.avgSeconds) : '—'} />
              </div>
              {observations.length > 0 && (
                <ul style={{ marginTop: '1rem', paddingLeft: '1.125rem', color: 'var(--ink-2)', display: 'grid', gap: '0.375rem' }}>
                  {observations.map((o) => <li key={o}>{o}</li>)}
                </ul>
              )}
            </Card>
          )}

          {sections.charts && events.length > 0 && (
            <Card>
              <h3 className="section-title" style={{ marginTop: 0 }}>How often</h3>
              <ColumnChart
                data={buckets.map((b) => ({ label: bucketLabel(b.key), value: b.count }))}
                ariaSummary={`Moments recorded per ${grain}.`}
              />
            </Card>
          )}

          {sections.triggers && triggerStats.length > 0 && (
            <Card>
              <h3 className="section-title" style={{ marginTop: 0 }}>Triggers recorded</h3>
              <RankedBars
                items={triggerStats.slice(0, 10).map((t) => ({ label: t.name, value: t.count }))}
                format={(v) => `${v}×`}
              />
              <table className="chart-table" style={{ marginTop: '1rem' }}>
                <thead>
                  <tr>
                    <th scope="col">Trigger</th>
                    <th scope="col">Times</th>
                    <th scope="col">Avg difficulty</th>
                    <th scope="col">Avg length</th>
                  </tr>
                </thead>
                <tbody>
                  {triggerStats.map((t) => (
                    <tr key={t.id}>
                      <th scope="row">{t.name}</th>
                      <td>{t.count}</td>
                      <td>{t.avgDifficulty === null ? '—' : `${t.avgDifficulty}/10`}</td>
                      <td>{t.avgSeconds ? formatDuration(t.avgSeconds) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {sections.durations && (
            <Card>
              <h3 className="section-title" style={{ marginTop: 0 }}>Durations</h3>
              <p style={{ color: 'var(--ink-2)' }}>
                {stats.timedCount} of {stats.count} moments have a recorded duration
                {stats.avgSeconds ? `, averaging ${formatDuration(stats.avgSeconds)}` : ''}.
              </p>
              {helpful.length > 0 && (
                <ul style={{ marginTop: '0.75rem', paddingLeft: '1.125rem', color: 'var(--ink-2)', display: 'grid', gap: '0.375rem' }}>
                  {helpful.slice(0, 5).map((h) => <li key={h.id}>{helpfulSentence(h)}</li>)}
                </ul>
              )}
            </Card>
          )}

          {sections.trends && (
            <Card>
              <h3 className="section-title" style={{ marginTop: 0 }}>Compared with the period before</h3>
              <table className="chart-table">
                <thead>
                  <tr>
                    <th scope="col">Measure</th>
                    <th scope="col">This period</th>
                    <th scope="col">Before</th>
                    <th scope="col">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisons.map((row) => (
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
              <p className="help" style={{ marginTop: '0.5rem' }}>
                Direction only. A rise or fall is not described as good or bad.
              </p>
            </Card>
          )}

          {sections.events && (
            <Card>
              <h3 className="section-title" style={{ marginTop: 0 }}>Individual moments</h3>
              {events.length === 0 ? (
                <p className="help">Nothing recorded in this period.</p>
              ) : (
                <div className="stack" style={{ gap: '0.875rem' }}>
                  {events.map((e) => (
                    <div key={e.id} style={{ borderBottom: '1px solid var(--line-soft)', paddingBottom: '0.75rem' }}>
                      <div className="row-between">
                        <strong>
                          {new Date(e.start_time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                          {' · '}{formatTime(e.start_time)}
                        </strong>
                        <DifficultyBadge value={e.difficulty} />
                      </div>
                      <div style={{ color: 'var(--ink-2)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                        {e.difficulty !== null && `${difficultyWord(e.difficulty)}`}
                        {e.duration_seconds ? ` · ${formatDuration(e.duration_seconds)}` : ''}
                        {e.location ? ` · ${e.location}` : ''}
                        {e.trigger_ids.length ? ` · ${e.trigger_ids.map(store.triggerName).join(', ')}` : ''}
                        {e.helpful_ids.length ? ` · helped: ${e.helpful_ids.map(store.helpfulName).join(', ')}` : ''}
                      </div>
                      {sections.notes && (e.description || e.notes) && (
                        <div style={{ fontSize: '0.875rem', marginTop: '0.375rem', whiteSpace: 'pre-wrap' }}>
                          {e.description}
                          {e.description && e.notes ? '\n' : ''}
                          {e.notes}
                        </div>
                      )}
                      <div className="help" style={{ marginTop: '0.25rem' }}>
                        Recorded by {store.nameOf(e.created_by)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          <p className="help">
            Generated {formatLongDate(new Date())} from {store.family?.name ?? 'this family'}'s
            own records.
          </p>
        </article>
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
    </div>
  );
}
