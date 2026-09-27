import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../data/store';
import { navigate } from '../lib/router';
import {
  addDays, formatDuration, formatTime, startOfDay, endOfDay, startOfMonth, startOfWeek,
} from '../lib/time';
import { inRange, summarise } from '../lib/stats';
import { Button, Card, EmptyState, Icon } from '../components/ui';
import { SyncStatus } from '../components/EventList';
import { dClass, difficultyWord } from '../components/Difficulty';
import { triggerClass } from '../lib/palette';
import type { MomentEvent } from '../lib/types';

type Period = 'day' | 'week' | 'month';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

export function HomeScreen({ onQuickRecord }: { onQuickRecord: () => void }) {
  const store = useStore();
  const { allEvents, triggers, profiles, activeProfileId, perms, photoUrl } = store;
  const [now, setNow] = useState(() => new Date());
  const [period, setPeriod] = useState<Period>('day');

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

  const window = useMemo(() => {
    if (period === 'day') return { from: startOfDay(now), to: endOfDay(now) };
    if (period === 'week') return { from: startOfWeek(now), to: addDays(startOfWeek(now), 7) };
    return { from: startOfMonth(now), to: addDays(endOfDay(now), 1) };
  }, [period, now]);

  const events = useMemo(() => inRange(scoped, window.from, window.to), [scoped, window]);
  const stats = useMemo(() => summarise(events, triggers), [events, triggers]);
  const openDraft = scoped.find((e) => e.status === 'draft');

  return (
    <div className="screen">
      <div className="stack-lg">
        {store.preview && (
          <div className="banner banner--accent">
            <span className="banner-icon"><Icon name="info" size={20} /></span>
            <div style={{ flex: 1 }}>
              <strong>Preview.</strong> Invented sample data about a made-up child, kept on
              this device only. Nothing here is real and nothing syncs.
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

        {perms.add ? (
          <RecordButton photoUrl={photoUrl} childName={child?.name} onQuick={onQuickRecord} />
        ) : (
          <Card className="card--quiet">
            <p style={{ color: 'var(--ink-2)', fontSize: '0.875rem' }}>
              You can view this family's moments. Recording is turned off for your account.
            </p>
          </Card>
        )}

        {perms.add && (
          <div className="row" style={{ justifyContent: 'center', gap: '0.25rem' }}>
            <Button variant="plain" size="sm" icon="clock" onClick={() => navigate('/live')}>
              Start a timer instead
            </Button>
          </div>
        )}

        <section aria-label="Recent moments" className="stack">
          <div className="segmented" role="group" aria-label="Show">
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

          <div className="score-line">
            <span>Average score</span>
            <strong className={`score-value ${dClass(stats.avgDifficulty ? Math.round(stats.avgDifficulty) : null)}`}>
              {stats.avgDifficulty === null ? '—' : stats.avgDifficulty}
            </strong>
            <span className="score-meta">
              {stats.count} moment{stats.count === 1 ? '' : 's'}
              {stats.totalSeconds > 0 && ` · ${formatDuration(stats.totalSeconds)}`}
            </span>
          </div>

          {events.length === 0 ? (
            <Card className="card--quiet">
              <EmptyState
                emoji="🌤️"
                title={period === 'day' ? 'Nothing recorded today' : 'Nothing recorded yet'}
                body="That is worth noting too. When something happens, recording it takes about ten seconds."
              />
            </Card>
          ) : (
            <ul className="score-list">
              {events.map((e) => <ScoreRow key={e.id} event={e} showDay={period !== 'day'} />)}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** One moment: its score in a circle, and what was written about it. */
function ScoreRow({ event, showDay }: { event: MomentEvent; showDay: boolean }) {
  const { triggerName, nameOf } = useStore();
  const triggers = event.trigger_ids.map(triggerName);
  // What someone wrote comes first; the trigger is the fallback.
  const text = event.description?.trim() || triggers.join(' · ') || 'No note';
  const tone = triggers.length ? triggerClass(triggers[0]) : 'c-0';

  return (
    <li>
      <button
        type="button"
        className={`score-row ${tone}`}
        onClick={() => navigate(`/event/${event.id}`)}
        aria-label={
          `${formatTime(event.start_time)}. Difficulty ${event.difficulty ?? 'not recorded'}` +
          `${event.difficulty ? ' out of 10, ' + difficultyWord(event.difficulty) : ''}. ${text}`
        }
      >
        <span className={`score-bubble ${dClass(event.difficulty)}`} aria-hidden="true">
          {event.difficulty ?? '–'}
        </span>
        <span className="score-text">
          {/* dir="auto" so Hebrew, Arabic and English each read the right way. */}
          <span className="score-title" dir="auto">{text}</span>
          <span className="score-sub" dir="auto">
            {showDay && `${new Date(event.start_time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · `}
            {formatTime(event.start_time)}
            {event.duration_seconds ? ` · ${formatDuration(event.duration_seconds)}` : ''}
            {` · ${nameOf(event.created_by)}`}
          </span>
        </span>
        {event._pending && <span className="pending-dot" aria-label="Waiting to sync" />}
      </button>
    </li>
  );
}

/** Tap to record in full; press and hold for Quick Record. */
function RecordButton({
  photoUrl, childName, onQuick,
}: { photoUrl: string | null; childName?: string; onQuick: () => void }) {
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
      className={`record-hero ${photoUrl ? 'has-photo' : ''}`}
      aria-label="Record the moment. Press and hold for quick record."
      onPointerDown={start}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => { if (!held.current) navigate('/record'); }}
    >
      {photoUrl && (
        <>
          <span
            className="record-hero-blur"
            style={{ backgroundImage: `url("${photoUrl}")` }}
            aria-hidden="true"
          />
          {/* Decorative: the button already says what it does. */}
          <img className="record-hero-photo" src={photoUrl} alt="" />
        </>
      )}
      <span className="record-hero-label">
        <Icon name="plus" size={20} />
        <span>
          Record the moment
          <small>{childName ? `for ${childName} · hold for quick record` : 'Hold for quick record'}</small>
        </span>
      </span>
    </button>
  );
}
