import { useEffect, useState } from 'react';
import { useStore } from '../data/store';
import { navigate, useBack } from '../lib/router';
import {
  formatDateTime, formatDuration, formatLongDate, formatTime, relativeTime,
} from '../lib/time';
import type { EditHistoryEntry } from '../lib/types';
import { Button, ConfirmDialog, EmptyState, Icon, IconButton, useToast } from '../components/ui';
import { DifficultyBadge, dClass, difficultyWord } from '../components/Difficulty';

/**
 * One moment. Only what was actually recorded is shown - a column of "Not
 * recorded" rows told the reader nothing except that the form is long.
 */
export function EventDetailScreen({ eventId }: { eventId: string }) {
  const store = useStore();
  const back = useBack();
  const toast = useToast();
  const event = store.events[eventId];
  const [history, setHistory] = useState<EditHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { getHistory } = store;
  useEffect(() => {
    let alive = true;
    getHistory(eventId).then((h) => { if (alive) setHistory(h); }).catch(() => {});
    return () => { alive = false; };
  }, [eventId, getHistory, event?.version]);

  if (!event) {
    return (
      <div className="screen">
        <header className="screen-bar">
          <IconButton label="Back" name="back" onClick={back} />
          <h1>Moment</h1>
          <span />
        </header>
        <EmptyState
          emoji="·"
          title="Not on this device"
          body="It may have been deleted, or it may not have synced here yet."
          action={<Button onClick={() => navigate('/history')}>Back to history</Button>}
        />
      </div>
    );
  }

  const triggers = event.trigger_ids.map(store.triggerName);
  const helped = event.helpful_ids.map(store.helpfulName);
  const deleted = Boolean(event.deleted_at);
  const edited = event.updated_at !== event.created_at;

  const context = [
    event.sleep_quality && ['Sleep', capitalise(event.sleep_quality)],
    event.hungry && ['Hungry', event.hungry === 'unknown' ? 'Not sure' : capitalise(event.hungry)],
    event.school_day !== null && ['School day', event.school_day ? 'Yes' : 'No'],
    event.unusual_day !== null && ['Unusual day', event.unusual_day ? 'Yes' : 'No'],
  ].filter(Boolean) as [string, string][];

  const remove = async () => {
    try {
      await store.deleteEvent(eventId);
      setConfirmDelete(false);
      toast('Moment deleted.', {
        label: 'Undo',
        onAction: () => { void store.restoreEvent(eventId).catch(() => {}); },
      });
      back();
    } catch (err) {
      toast((err as Error).message);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="screen">
      <header className="screen-bar">
        <IconButton label="Back" name="back" onClick={back} />
        <h1>Moment</h1>
        <span />
      </header>

      <div className="detail">
        {deleted && (
          <div className="banner">
            <div style={{ flex: 1 }}><strong>Deleted.</strong> Its history is kept.</div>
            {store.perms.edit && (
              <Button size="sm" onClick={() => void store.restoreEvent(eventId)}>Restore</Button>
            )}
          </div>
        )}

        {event._error && (
          <div className="banner">
            <div style={{ flex: 1 }}>
              <strong>Not saved.</strong> {event._error}
            </div>
            <Button size="sm" onClick={() => void store.retryOutbox(eventId)}>Retry</Button>
          </div>
        )}

        {event._pending && !event._error && (
          <div className="banner"><span className="pending-dot" />Waiting to sync</div>
        )}

        <div className="detail-head">
          <span className={`detail-score ${dClass(event.difficulty)}`} aria-hidden="true">
            {event.difficulty ?? '–'}
          </span>
          <div>
            <h2>{event.difficulty ? difficultyWord(event.difficulty) : 'Difficulty not recorded'}</h2>
            <p>
              {formatLongDate(event.start_time)} · {formatTime(event.start_time)}
              {event.duration_seconds ? ` · ${formatDuration(event.duration_seconds)}` : ''}
            </p>
            <span className="sr-only"><DifficultyBadge value={event.difficulty} /></span>
          </div>
        </div>

        {event.description && <p className="detail-quote" dir="auto">{event.description}</p>}

        <dl className="detail-list">
          {triggers.length > 0 && <Row label="Triggers" value={triggers.join(', ')} />}
          {helped.length > 0 && <Row label="What helped" value={helped.join(', ')} />}
          {event.location && <Row label="Where" value={event.location} />}
          {event.notes && <Row label="Notes" value={event.notes} block />}
          {context.map(([label, value]) => <Row key={label} label={label} value={value} />)}
          <Row label="Recorded by" value={`${store.nameOf(event.created_by)} · ${formatDateTime(event.created_at)}`} />
          {edited && (
            <Row
              label="Last edited"
              value={`${store.nameOf(event.updated_by)} · ${relativeTime(event.updated_at)}`}
            />
          )}
        </dl>

        {!deleted && (
          <div className="detail-actions">
            {store.perms.edit && (
              <Button variant="primary" block onClick={() => navigate(`/record?id=${event.id}`)}>
                Edit
              </Button>
            )}
            {store.perms.add && (
              <Button variant="plain" onClick={() => navigate(`/record?duplicate=${event.id}`)}>
                Duplicate
              </Button>
            )}
            {store.perms.delete && (
              <Button variant="plain" className="btn--danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
          </div>
        )}

        <div className="detail-history">
          <button
            type="button"
            className="disclose"
            aria-expanded={showHistory}
            onClick={() => setShowHistory((v) => !v)}
          >
            <span>Edit history</span>
            <Icon name="chevron" size={16} />
          </button>

          {showHistory && (
            history.length === 0
              ? <p className="help">Nothing recorded on this device yet.</p>
              : (
                <div className="stack" style={{ gap: '1rem', marginTop: '0.75rem' }}>
                  {history.map((entry) => (
                    <div key={entry.id} className="history-entry">
                      <span className="dot" aria-hidden="true" />
                      <div>
                        <div style={{ fontSize: '0.875rem' }}>{describeHistory(entry, store.nameOf)}</div>
                        <div className="when">{formatDateTime(entry.changed_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )
          )}
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this moment?"
          body="It will go from every device. You can undo this straight away."
          confirmLabel="Delete"
          destructive
          onConfirm={() => void remove()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

function Row({ label, value, block }: { label: string; value: string; block?: boolean }) {
  return (
    <div className={block ? 'detail-row detail-row--block' : 'detail-row'}>
      <dt>{label}</dt>
      <dd dir="auto">{value}</dd>
    </div>
  );
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const FIELD_WORDS: Record<string, string> = {
  difficulty: 'Difficulty',
  start_time: 'Start time',
  duration: 'Duration',
  description: 'What happened',
  location: 'Where',
  notes: 'Notes',
  sleep_quality: 'Sleep',
  hungry: 'Hungry',
  school_day: 'School day',
  unusual_day: 'Unusual day',
  status: 'Status',
  triggers: 'Triggers',
  what_helped: 'What helped',
  event: 'Moment',
};

function describeHistory(entry: EditHistoryEntry, nameOf: (id: string | null) => string): string {
  const who = nameOf(entry.changed_by);
  if (entry.action === 'created') return `Created by ${who}`;
  if (entry.action === 'deleted') return `Deleted by ${who}`;
  if (entry.action === 'restored') return `Restored by ${who}`;

  const parts = entry.changes.map((c) => {
    const field = FIELD_WORDS[c.field] ?? c.field;
    if (c.field === 'difficulty' && c.from != null && c.to != null) {
      return `${field} ${c.from} → ${c.to}`;
    }
    if (c.to === 'changed') return `${field} changed`;
    if (c.from == null && c.to != null) return `${field} added`;
    if (c.from != null && c.to == null) return `${field} cleared`;
    return `${field} edited`;
  });

  return `${parts.length ? parts.join(', ') : 'Edited'} by ${who}`;
}
