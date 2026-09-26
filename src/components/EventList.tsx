import { navigate } from '../lib/router';
import { formatDayLabel, formatDuration, formatTime } from '../lib/time';
import type { MomentEvent } from '../lib/types';
import { useStore } from '../data/store';
import { DifficultyBadge, difficultyWord } from './Difficulty';
import { helpfulClass, triggerClass } from '../lib/palette';
import { Icon } from './ui';

export function MomentRow({ event, showDay }: { event: MomentEvent; showDay?: boolean }) {
  const { triggerName, helpfulName, nameOf } = useStore();
  const triggers = event.trigger_ids.map(triggerName);
  const helped = event.helpful_ids.map(helpfulName);
  const isOpen = event.status === 'draft';

  const summary = triggers.length
    ? triggers.join(' · ')
    : event.description?.trim() || 'No trigger recorded';

  // The row takes its colour from its first trigger, so a scan down the
  // timeline shows repetition. The names are right there too.
  const tone = triggers.length ? triggerClass(triggers[0]) : 'c-0';

  return (
    <button
      type="button"
      className={`tl-item ${tone}`}
      onClick={() => navigate(`/event/${event.id}`)}
      aria-label={
        `${showDay ? formatDayLabel(event.start_time) + ', ' : ''}${formatTime(event.start_time)}. ` +
        `Difficulty ${event.difficulty ?? 'not recorded'}${event.difficulty ? ' out of 10, ' + difficultyWord(event.difficulty) : ''}. ` +
        `${event.duration_seconds ? 'Lasted ' + formatDuration(event.duration_seconds) + '. ' : ''}` +
        `${triggers.length ? 'Triggers: ' + triggers.join(', ') + '.' : ''}`
      }
    >
      <span className="tl-time" aria-hidden="true">
        {formatTime(event.start_time)}
        <small>
          {showDay ? formatDayLabel(event.start_time) : formatDuration(event.duration_seconds)}
        </small>
      </span>

      <span className="tl-body">
        <span className="tl-truncate" style={{ fontWeight: 600 }}>{summary}</span>
        <span className="tl-meta" aria-hidden="true">
          {showDay && event.duration_seconds ? <span>{formatDuration(event.duration_seconds)}</span> : null}
          {event.location && <span className="tag">{event.location}</span>}
          {helped.length > 0 && (
            <span className={`tag tag--cat ${helpfulClass}`}>
              {helped.length === 1 ? helped[0] : `${helped.length} helped`}
            </span>
          )}
          <span>· {nameOf(event.created_by)}</span>
        </span>
      </span>

      <span className="tl-trail">
        <DifficultyBadge value={event.difficulty} />
        {isOpen && <span className="tag" style={{ color: 'var(--accent-ink)' }}>Still open</span>}
        {event._pending && <span className="pending-dot">Waiting</span>}
        {event._error && <span className="tag" style={{ color: 'var(--danger)' }}>Needs attention</span>}
      </span>
    </button>
  );
}

export function MomentList({ events, groupByDay }: { events: MomentEvent[]; groupByDay?: boolean }) {
  if (!groupByDay) {
    return (
      <div className="timeline">
        {events.map((e) => <MomentRow key={e.id} event={e} />)}
      </div>
    );
  }

  const groups: { day: string; items: MomentEvent[] }[] = [];
  events.forEach((e) => {
    const day = formatDayLabel(e.start_time);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(e);
    else groups.push({ day, items: [e] });
  });

  return (
    <div className="stack-lg">
      {groups.map((group) => (
        <section key={group.day} className="stack" style={{ gap: '0.5rem' }}>
          <h2 className="section-title" style={{ margin: 0 }}>{group.day}</h2>
          <div className="timeline">
            {group.items.map((e) => <MomentRow key={e.id} event={e} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

export function SyncStatus() {
  const { online, pendingCount, syncing, lastSyncedAt, retryOutbox, outbox } = useStore();
  const failed = outbox.filter((o) => o.error);

  if (failed.length > 0) {
    return (
      <div className="banner" role="status">
        <span className="banner-icon"><Icon name="info" size={20} /></span>
        <div style={{ flex: 1 }}>
          <strong>{failed.length} change{failed.length === 1 ? '' : 's'} could not be saved.</strong>
          <div style={{ fontSize: '0.8125rem' }}>{failed[0].error}</div>
        </div>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => void retryOutbox()}>
          Try again
        </button>
      </div>
    );
  }

  if (!online) {
    return (
      <div className="banner" role="status">
        <span className="banner-icon"><Icon name="cloud-off" size={20} /></span>
        <div style={{ flex: 1 }}>
          <strong>Offline.</strong>{' '}
          {pendingCount > 0
            ? `${pendingCount} moment${pendingCount === 1 ? '' : 's'} saved here and waiting to sync.`
            : 'You can keep recording — everything uploads when you are back.'}
        </div>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div className="banner" role="status">
        <span className="pending-dot" />
        <div style={{ flex: 1 }}>
          {syncing ? 'Syncing…' : `${pendingCount} moment${pendingCount === 1 ? '' : 's'} waiting to sync.`}
        </div>
      </div>
    );
  }

  if (!lastSyncedAt) return null;
  return null;
}
