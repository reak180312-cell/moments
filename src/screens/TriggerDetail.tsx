import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { useBack } from '../lib/router';
import {
  addDays, formatDuration, hourRangeLabel, resolveRange, startOfDay, type RangeKey,
} from '../lib/time';
import { byPeriod, forRange, grainFor, triggerCounts } from '../lib/stats';
import { Button, Card, Chip, EmptyState, IconButton } from '../components/ui';
import { ChartFrame, ColumnChart, DataTable } from '../components/charts';
import { MomentList } from '../components/EventList';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: '30d', label: '30 days' },
  { key: '3m', label: '3 months' },
  { key: '1y', label: '1 year' },
  { key: 'all', label: 'All time' },
];

export function TriggerDetailScreen({ triggerId }: { triggerId: string }) {
  const store = useStore();
  const back = useBack();
  const [rangeKey, setRangeKey] = useState<RangeKey>('3m');

  const trigger = store.triggers.find((t) => t.id === triggerId);
  const range = useMemo(() => resolveRange(rangeKey), [rangeKey]);

  const scoped = useMemo(
    () => store.allEvents.filter(
      (e) => e.trigger_ids.includes(triggerId)
        && (!store.activeProfileId || e.profile_id === store.activeProfileId)
    ),
    [store.allEvents, store.activeProfileId, triggerId]
  );

  const inWindow = useMemo(() => forRange(scoped, range), [scoped, range]);
  const stat = useMemo(
    () => triggerCounts(inWindow, store.triggers).find((t) => t.id === triggerId),
    [inWindow, store.triggers, triggerId]
  );

  const effectiveFrom = rangeKey === 'all'
    ? startOfDay(scoped.length ? scoped[scoped.length - 1].start_time : addDays(new Date(), -30))
    : range.from;
  const grain = grainFor(rangeKey === 'all' ? 366 : range.days);
  const buckets = useMemo(
    () => byPeriod(inWindow, effectiveFrom, range.to, grain),
    [inWindow, effectiveFrom, range.to, grain]
  );

  if (!trigger) {
    return (
      <div className="screen">
        <header className="row-between" style={{ marginBottom: '1rem' }}>
          <IconButton label="Back" name="back" onClick={back} />
          <span />
        </header>
        <EmptyState emoji="·" title="That trigger is not on this device yet" />
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
    <div className="screen">
      <header className="row-between" style={{ marginBottom: '1rem' }}>
        <IconButton label="Back" name="back" onClick={back} />
        <h1 style={{ fontSize: '1.125rem' }}>Trigger</h1>
        <span style={{ width: '44px' }} />
      </header>

      <div className="stack-lg">
        <Card className="card--pad-lg">
          <div className="row-between">
            <div>
              <h2 style={{ fontSize: '1.5rem' }}>{trigger.name}</h2>
              <p className="eyebrow">
                Recorded {stat?.count ?? 0} time{(stat?.count ?? 0) === 1 ? '' : 's'} · {range.label.toLowerCase()}
              </p>
            </div>
            {store.perms.edit && (
              <Button
                size="sm"
                icon="pin"
                onClick={() => void store.updateVocab('triggers', trigger.id, { is_pinned: !trigger.is_pinned })}
              >
                {trigger.is_pinned ? 'Unpin' : 'Pin'}
              </Button>
            )}
          </div>
        </Card>

        <div className="chip-wrap" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <Chip key={r.key} selected={rangeKey === r.key} onClick={() => setRangeKey(r.key)}>
              {r.label}
            </Chip>
          ))}
        </div>

        <div className="tile-grid">
          <Tile label="Recorded" value={String(stat?.count ?? 0)} sub="times" />
          <Tile
            label="Average difficulty"
            value={stat?.avgDifficulty === null || stat === undefined ? '—' : String(stat.avgDifficulty)}
            unit={stat?.avgDifficulty ? '/10' : undefined}
          />
          <Tile label="Average length" value={stat?.avgSeconds ? formatDuration(stat.avgSeconds) : '—'} />
          <Tile
            label="Most common time"
            value={stat?.peakHour === null || stat === undefined ? '—' : hourRangeLabel(stat.peakHour, stat.peakHour + 2)}
            small
          />
        </div>

        {stat?.topHelpful && (
          <Card className="card--quiet">
            <p style={{ color: 'var(--ink-2)', fontSize: '0.875rem' }}>
              Most often recorded alongside it: <strong>{store.helpfulName(stat.topHelpful)}</strong>.
              That is what was written down, not a conclusion about what works.
            </p>
          </Card>
        )}

        <ChartFrame
          title="Over time"
          subtitle={`Times “${trigger.name}” was recorded per ${grain}`}
          table={
            <DataTable
              columns={[grain === 'month' ? 'Month' : grain === 'week' ? 'Week of' : 'Day', 'Times']}
              rows={buckets.map((b) => [bucketLabel(b.key), b.count])}
            />
          }
        >
          <ColumnChart
            data={buckets.map((b) => ({ label: bucketLabel(b.key), value: b.count }))}
            ariaSummary={`How often ${trigger.name} was recorded over ${range.label.toLowerCase()}.`}
          />
        </ChartFrame>

        <section className="stack" style={{ gap: '0.5rem' }}>
          <h2 className="section-title">Moments with this trigger</h2>
          {inWindow.length === 0 ? (
            <Card className="card--quiet">
              <EmptyState emoji="·" title="Nothing in this period" />
            </Card>
          ) : (
            <MomentList events={inWindow.slice(0, 40)} groupByDay />
          )}
        </section>
      </div>
    </div>
  );
}

function Tile({ label, value, unit, sub, small }: { label: string; value: string; unit?: string; sub?: string; small?: boolean }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className="tile-value" style={small ? { fontSize: '1rem', lineHeight: 1.4 } : undefined}>
        {value}{unit && <span className="unit">{unit}</span>}
      </span>
      {sub && <span className="tile-sub">{sub}</span>}
    </div>
  );
}
