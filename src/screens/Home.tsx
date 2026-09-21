import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../data/store';
import { navigate } from '../lib/router';
import { formatDuration, formatTime, startOfDay, endOfDay, formatLongDate } from '../lib/time';
import { inRange, summarise, weeklySummary } from '../lib/stats';
import { Button, Card, EmptyState, Icon } from '../components/ui';
import { MomentList, SyncStatus } from '../components/EventList';

export function HomeScreen({ onQuickRecord }: { onQuickRecord: () => void }) {
  const store = useStore();
  const { allEvents, triggers, profiles, activeProfileId, perms } = store;
  const [now, setNow] = useState(() => new Date());

  // Keep "today" honest if the app is left open past midnight.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const child = profiles.find((p) => p.id === activeProfileId);
  const scoped = useMemo(
    () => (activeProfileId ? allEvents.filter((e) => e.profile_id === activeProfileId) : allEvents),
    [allEvents, activeProfileId]
  );

  const today = useMemo(
    () => inRange(scoped, startOfDay(now), endOfDay(now)),
    [scoped, now]
  );
  const stats = useMemo(() => summarise(today, triggers), [today, triggers]);
  const week = useMemo(() => weeklySummary(scoped, triggers, now), [scoped, triggers, now]);

  const openDraft = scoped.find((e) => e.status === 'draft');

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <p className="eyebrow">{formatLongDate(now)}</p>
          <h1>How has today been?</h1>
          {child && profiles.length > 1 && (
            <p className="eyebrow" style={{ marginTop: '0.25rem' }}>{child.name}</p>
          )}
        </div>
      </header>

      <div className="stack-lg">
        {store.preview && (
          <div className="banner banner--accent">
            <span className="banner-icon"><Icon name="info" size={20} /></span>
            <div style={{ flex: 1 }}>
              <strong>Preview.</strong> Everything here is invented sample data about a
              made-up child, kept on this device only. Try anything you like — nothing
              syncs and nothing is real.
            </div>
          </div>
        )}
        <SyncStatus />

        {openDraft && (
          <button
            type="button" className="card-button"
            onClick={() => navigate(`/live?id=${openDraft.id}`)}
          >
            <div className="row-between">
              <span>
                <strong>A moment is still open</strong>
                <span style={{ display: 'block', color: 'var(--ink-3)', fontSize: '0.8125rem' }}>
                  Started at {formatTime(openDraft.start_time)} — finish it when you can.
                </span>
              </span>
              <Icon name="chevron" size={18} />
            </div>
          </button>
        )}

        <section aria-label="Today at a glance">
          <div className="tile-grid">
            <Tile
              label="Difficult moments"
              value={String(stats.count)}
              sub={stats.count === 0 ? 'Nothing recorded yet' : 'recorded today'}
            />
            <Tile
              label="Average difficulty"
              value={stats.avgDifficulty === null ? '—' : String(stats.avgDifficulty)}
              unit={stats.avgDifficulty === null ? undefined : '/10'}
              sub={stats.count > 0 ? `across ${stats.count} moment${stats.count === 1 ? '' : 's'}` : '—'}
            />
            <Tile
              label="Total time"
              value={stats.totalSeconds ? formatDuration(stats.totalSeconds) : '—'}
              sub={stats.timedCount ? `${stats.timedCount} timed` : 'no durations yet'}
            />
            <Tile
              label="Most common trigger"
              value={stats.topTrigger?.name ?? '—'}
              small
              sub={stats.topTrigger ? `${stats.topTrigger.count}×  today` : 'none recorded'}
            />
          </div>
        </section>

        {perms.add ? (
          <div className="stack">
            <RecordButton onQuick={onQuickRecord} />
            <div className="row" style={{ gap: '0.5rem' }}>
              <Button icon="clock" onClick={() => navigate('/live')} style={{ flex: 1 }}>
                Start Moment
              </Button>
              <Button icon="bolt" onClick={onQuickRecord} style={{ flex: 1 }}>
                Quick Record
              </Button>
            </div>
          </div>
        ) : (
          <Card className="card--quiet">
            <p style={{ color: 'var(--ink-2)', fontSize: '0.875rem' }}>
              You can view this family's moments. Recording is turned off for your account.
            </p>
          </Card>
        )}

        <section className="stack" style={{ gap: '0.5rem' }}>
          <h2 className="section-title">Today's moments</h2>
          {today.length === 0 ? (
            <Card className="card--quiet">
              <EmptyState
                emoji="🌤️"
                title="Nothing recorded today"
                body="That is worth noting too. When something happens, recording it takes about ten seconds."
              />
            </Card>
          ) : (
            <MomentList events={today} />
          )}
        </section>

        {week.summary.count > 0 && (
          <button type="button" className="card-button" onClick={() => navigate('/summary')}>
            <div className="row-between">
              <span>
                <strong>This week so far</strong>
                <span style={{ display: 'block', color: 'var(--ink-3)', fontSize: '0.8125rem' }}>
                  {week.summary.count} moment{week.summary.count === 1 ? '' : 's'}
                  {week.summary.avgDifficulty !== null && ` · average difficulty ${week.summary.avgDifficulty}/10`}
                </span>
              </span>
              <Icon name="chevron" size={18} />
            </div>
          </button>
        )}
      </div>
    </div>
  );
}

function Tile({
  label, value, unit, sub, small,
}: { label: string; value: string; unit?: string; sub?: string; small?: boolean }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className="tile-value" style={small ? { fontSize: '1.125rem', lineHeight: 1.3 } : undefined}>
        {value}
        {unit && <span className="unit">{unit}</span>}
      </span>
      {sub && <span className="tile-sub">{sub}</span>}
    </div>
  );
}

/** Tap to record in full; press and hold for Quick Record. */
function RecordButton({ onQuick }: { onQuick: () => void }) {
  const timer = useRef<number | null>(null);
  const held = useRef(false);

  const start = () => {
    held.current = false;
    timer.current = window.setTimeout(() => {
      held.current = true;
      if ('vibrate' in navigator) navigator.vibrate?.(12);
      onQuick();
    }, 450);
  };
  const end = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  return (
    <button
      type="button"
      className="record-btn"
      onPointerDown={start}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => { if (!held.current) navigate('/record'); }}
    >
      <Icon name="plus" size={24} />
      <span>
        Record a Moment
        <span className="hint">Hold for quick record</span>
      </span>
    </button>
  );
}
