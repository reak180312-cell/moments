import { useEffect, useState } from 'react';
import { useStore } from '../data/store';
import { navigate, useBack } from '../lib/router';
import {
  formatDateTime, formatDuration, formatLongDate, formatTime, relativeTime,
} from '../lib/time';
import type { EditHistoryEntry } from '../lib/types';
import { Button, Card, ConfirmDialog, EmptyState, Icon, IconButton, useToast } from '../components/ui';
import { DifficultyBadge, difficultyWord } from '../components/Difficulty';

export function EventDetailScreen({ eventId }: { eventId: string }) {
  const store = useStore();
  const back = useBack();
  const toast = useToast();
  const event = store.events[eventId];
  const [history, setHistory] = useState<EditHistoryEntry[]>([]);
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
        <header className="row-between" style={{ marginBottom: '1rem' }}>
          <IconButton label="Back" name="back" onClick={back} />
          <span />
        </header>
        <EmptyState
          emoji="·"
          title="This moment is not on this device"
          body="It may have been deleted, or it may not have synced here yet."
          action={<Button onClick={() => navigate('/history')}>Back to history</Button>}
        />
      </div>
    );
  }

  const triggers = event.trigger_ids.map(store.triggerName);
  const helped = event.helpful_ids.map(store.helpfulName);
  const deleted = Boolean(event.deleted_at);

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
      <header className="row-between" style={{ marginBottom: '1rem' }}>
        <IconButton label="Back" name="back" onClick={back} />
        <h1 style={{ fontSize: '1.125rem' }}>Moment</h1>
        <span style={{ width: '44px' }} />
      </header>

      <div className="stack-lg">
        {deleted && (
          <div className="banner">
            <span className="banner-icon"><Icon name="info" size={20} /></span>
            <div style={{ flex: 1 }}>
              <strong>This moment is deleted.</strong> Its history is kept.
            </div>
            {store.perms.edit && (
              <Button size="sm" onClick={() => void store.restoreEvent(eventId)}>Restore</Button>
            )}
          </div>
        )}

        {event._pending && (
          <div className="banner">
            <span className="pending-dot" />
            <div style={{ flex: 1 }}>Saved on this device — waiting to sync to the others.</div>
          </div>
        )}

        {event._error && (
          <div className="banner">
            <span className="banner-icon"><Icon name="info" size={20} /></span>
            <div style={{ flex: 1 }}>
              <strong>This change was not saved.</strong>
              <div style={{ fontSize: '0.8125rem' }}>{event._error}</div>
            </div>
            <Button size="sm" onClick={() => void store.retryOutbox(eventId)}>Try again</Button>
          </div>
        )}

        <Card className="card--pad-lg">
          <div className="stack">
            <div className="row-between">
              <div>
                <p className="eyebrow">{formatLongDate(event.start_time)}</p>
                <h2 style={{ fontSize: '1.5rem' }}>{formatTime(event.start_time)}</h2>
              </div>
              <DifficultyBadge value={event.difficulty} />
            </div>

            <p style={{ color: 'var(--ink-2)' }}>
              {event.difficulty !== null && <>Difficulty {event.difficulty}/10 · {difficultyWord(event.difficulty)}</>}
              {event.duration_seconds ? ` · ${formatDuration(event.duration_seconds)}` : ''}
            </p>
          </div>
        </Card>

        <Card>
          <dl className="stack" style={{ margin: 0, gap: '0.875rem' }}>
            <Row label="Start time" value={formatTime(event.start_time)} />
            <Row label="End time" value={event.end_time ? formatTime(event.end_time) : 'Not recorded'} />
            <Row label="Duration" value={formatDuration(event.duration_seconds)} />
            <Row
              label="Difficulty"
              value={event.difficulty === null ? 'Not recorded' : `${event.difficulty}/10 · ${difficultyWord(event.difficulty)}`}
            />
            <Row label="Triggers" value={triggers.length ? triggers.join(', ') : 'None recorded'} />
            <Row label="Where" value={event.location ?? 'Not recorded'} />
            <Row label="What happened" value={event.description ?? 'Not recorded'} block />
            <Row label="What helped" value={helped.length ? helped.join(', ') : 'Not recorded'} />
            <Row label="Notes" value={event.notes ?? 'None'} block />
          </dl>
        </Card>

        {(event.sleep_quality || event.hungry || event.school_day !== null || event.unusual_day !== null) && (
          <Card>
            <h3 className="section-title" style={{ marginTop: 0 }}>About the day</h3>
            <dl className="stack" style={{ margin: 0, gap: '0.875rem' }}>
              {event.sleep_quality && <Row label="Sleep" value={capitalise(event.sleep_quality)} />}
              {event.hungry && <Row label="Hungry" value={event.hungry === 'unknown' ? 'Not sure' : capitalise(event.hungry)} />}
              {event.school_day !== null && <Row label="School day" value={event.school_day ? 'Yes' : 'No'} />}
              {event.unusual_day !== null && <Row label="Unusual day" value={event.unusual_day ? 'Yes' : 'No'} />}
            </dl>
          </Card>
        )}

        <Card className="card--quiet">
          <dl className="stack" style={{ margin: 0, gap: '0.75rem' }}>
            <Row label="Recorded by" value={store.nameOf(event.created_by)} />
            <Row label="Created" value={formatDateTime(event.created_at)} />
            <Row
              label="Last edited"
              value={
                event.updated_at === event.created_at
                  ? 'Not edited'
                  : `${formatDateTime(event.updated_at)} by ${store.nameOf(event.updated_by)}`
              }
            />
          </dl>
        </Card>

        {!deleted && (
          <div className="row" style={{ gap: '0.5rem' }}>
            {store.perms.edit && (
              <Button icon="edit" style={{ flex: 1 }} onClick={() => navigate(`/record?id=${event.id}`)}>
                Edit
              </Button>
            )}
            {store.perms.add && (
              <Button icon="copy" style={{ flex: 1 }} onClick={() => navigate(`/record?duplicate=${event.id}`)}>
                Duplicate
              </Button>
            )}
            {store.perms.delete && (
              <Button icon="trash" variant="danger" style={{ flex: 1 }} onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
          </div>
        )}

        <Card>
          <h3 className="section-title" style={{ marginTop: 0 }}>Edit history</h3>
          {history.length === 0 ? (
            <p className="help">No history recorded on this device yet.</p>
          ) : (
            <div className="stack" style={{ gap: '1.25rem' }}>
              {history.map((entry) => (
                <div key={entry.id} className="history-entry">
                  <span className="dot" aria-hidden="true" />
                  <div>
                    <div style={{ fontSize: '0.875rem' }}>{describeHistory(entry, store.nameOf)}</div>
                    <div className="when">
                      {formatDateTime(entry.changed_at)} · {relativeTime(entry.changed_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="help" style={{ marginTop: '0.75rem' }}>
            Edits never overwrite this list — it is kept so you can always see what changed.
          </p>
        </Card>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this moment?"
          body="It will be removed from every device. Its edit history is kept, and you can undo this straight away."
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
    <div style={block ? undefined : { display: 'flex', justifyContent: 'space-between', gap: '1.5rem' }}>
      <dt style={{ color: 'var(--ink-3)', fontSize: '0.875rem', flex: 'none' }}>{label}</dt>
      <dd
        style={{
          margin: 0, textAlign: block ? 'left' : 'right',
          color: value.startsWith('Not recorded') || value === 'None' ? 'var(--ink-3)' : 'var(--ink)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {value}
      </dd>
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
      return `${field} changed from ${c.from} to ${c.to}`;
    }
    if (c.to === 'changed') return `${field} changed`;
    if (c.from == null && c.to != null) return `${field} added`;
    if (c.from != null && c.to == null) return `${field} cleared`;
    return `${field} edited`;
  });

  return `${parts.length ? parts.join(', ') : 'Edited'} by ${who}`;
}
