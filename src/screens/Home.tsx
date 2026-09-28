import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../data/store';
import { navigate } from '../lib/router';
import {
  addDays, endOfDay, formatTime, startOfDay, startOfMonth, startOfWeek,
} from '../lib/time';
import { inRange, summarise } from '../lib/stats';
import { EmptyState, Icon } from '../components/ui';
import { SyncStatus } from '../components/EventList';
import {
  ChildPill, MomentList, PageHead, PhotoCard, StatCell, StatSplit, showScore,
} from '../components/moment';

type Period = 'day' | 'week' | 'month';

const PERIODS: { key: Period; label: string; heading: string }[] = [
  { key: 'day', label: 'Day', heading: "Today's moments" },
  { key: 'week', label: 'Week', heading: 'This week' },
  { key: 'month', label: 'Month', heading: 'This month' },
];

export function HomeScreen({ onQuickRecord }: { onQuickRecord: () => void }) {
  const store = useStore();
  const { allEvents, triggers, activeProfileId, perms } = store;
  const [now, setNow] = useState(() => new Date());
  const [period, setPeriod] = useState<Period>('day');

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const scoped = useMemo(
    () => (activeProfileId ? allEvents.filter((e) => e.profile_id === activeProfileId) : allEvents),
    [allEvents, activeProfileId]
  );

  const window = useMemo(() => {
    if (period === 'day') return { from: startOfDay(now), to: endOfDay(now) };
    if (period === 'week') return { from: startOfWeek(now), to: addDays(startOfWeek(now), 7) };
    return { from: startOfMonth(now), to: addDays(endOfDay(now), 1) };
  }, [period, now]);

  const events = useMemo(() => inRange(scoped, window.from, window.to), [scoped, window]);
  const stats = useMemo(() => summarise(events, triggers), [events, triggers]);
  const openDraft = scoped.find((e) => e.status === 'draft');
  const heading = PERIODS.find((p) => p.key === period)!.heading;

  return (
    <div className="screen">
      <PageHead title="Today" subtitle="Notice patterns." trailing={<ChildPill />} />

      <div className="stack">
        {store.preview && (
          <div className="banner banner--accent">
            <div style={{ flex: 1 }}><strong>Preview.</strong> Sample data, this device only.</div>
          </div>
        )}

        <SyncStatus />

        {openDraft && (
          <button type="button" className="card-button" onClick={() => navigate(`/live?id=${openDraft.id}`)}>
            <div className="row-between">
              <span>
                <strong>A moment is still open</strong>
                <span style={{ display: 'block', color: 'var(--ink-3)', fontSize: '0.8125rem' }}>
                  Started at {formatTime(openDraft.start_time)}
                </span>
              </span>
              <Icon name="chevron" size={18} />
            </div>
          </button>
        )}

        <PhotoCard
          slot="home"
          heading={'One step\nat a time.'.replace('\n', ' ')}
          body="Hard moments happen."
        />

        {perms.add ? (
          <div>
            <RecordButton onQuick={onQuickRecord} />
            <p className="record-hint">Takes about 10 seconds</p>
          </div>
        ) : (
          <p className="help">Recording is turned off for your account.</p>
        )}

        <StatSplit
          left={
            <StatCell
              icon="insights"
              label="Average intensity"
              value={showScore(stats.avgDifficulty)}
              unit={stats.avgDifficulty === null ? undefined : '/ 10'}
            />
          }
          right={
            <StatCell
              icon="calendar"
              value={String(stats.count)}
              note={period === 'day' ? 'moments today' : `moments this ${period}`}
            />
          }
        />

        <div className="tab-row" role="group" aria-label="Show">
          {PERIODS.map((p) => (
            <button
              key={p.key} type="button"
              aria-pressed={period === p.key}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="list-head">
          <h2>{heading}</h2>
          <button type="button" className="link-pill" onClick={() => navigate('/history')}>
            View all <Icon name="chevron" size={14} />
          </button>
        </div>

        {events.length === 0 ? (
          <EmptyState
            emoji="🌤️"
            title="Nothing recorded yet"
            body="When something happens, recording it takes about ten seconds."
          />
        ) : (
          <MomentList events={events} showDate={period !== 'day'} />
        )}
      </div>
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
      className="record-cta"
      aria-label="Record a moment. Press and hold for quick record."
      onPointerDown={start}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => { if (!held.current) navigate('/record'); }}
    >
      <Icon name="plus" size={20} />
      Record a moment
    </button>
  );
}
