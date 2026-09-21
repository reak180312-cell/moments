import { useMemo, useState } from 'react';
import { useStore, type EventDraft } from '../data/store';
import { formatDateTime, formatDuration, formatTime } from '../lib/time';
import type { Conflict, MomentEvent } from '../lib/types';
import { Button, Sheet, useToast } from './ui';
import { difficultyWord } from './Difficulty';

/**
 * Two devices edited the same moment. Nothing has been thrown away: the
 * server's version is what everyone currently sees, and this device's edit is
 * held here until someone says what to keep.
 */

type FieldKey =
  | 'difficulty' | 'start_time' | 'duration_seconds' | 'description'
  | 'location' | 'notes' | 'trigger_ids' | 'helpful_ids';

const LABELS: Record<FieldKey, string> = {
  difficulty: 'Difficulty',
  start_time: 'Start time',
  duration_seconds: 'Duration',
  description: 'What happened',
  location: 'Where',
  notes: 'Notes',
  trigger_ids: 'Triggers',
  helpful_ids: 'What helped',
};

export function ConflictDialog({ conflict, onClose }: { conflict: Conflict; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const { mine, theirs } = conflict;

  const describe = (key: FieldKey, event: MomentEvent): string => {
    switch (key) {
      case 'difficulty':
        return event.difficulty === null ? 'Not recorded' : `${event.difficulty}/10 · ${difficultyWord(event.difficulty)}`;
      case 'start_time':
        return formatTime(event.start_time);
      case 'duration_seconds':
        return formatDuration(event.duration_seconds);
      case 'trigger_ids':
        return event.trigger_ids.map(store.triggerName).join(', ') || 'None';
      case 'helpful_ids':
        return event.helpful_ids.map(store.helpfulName).join(', ') || 'None';
      default:
        return (event[key] as string | null)?.trim() || 'Empty';
    }
  };

  const differing = useMemo(() => {
    const keys: FieldKey[] = [
      'difficulty', 'start_time', 'duration_seconds', 'description',
      'location', 'notes', 'trigger_ids', 'helpful_ids',
    ];
    return keys.filter((k) => describe(k, mine) !== describe(k, theirs));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, theirs]);

  const [choices, setChoices] = useState<Record<string, 'mine' | 'theirs'>>(
    () => Object.fromEntries(differing.map((k) => [k, 'mine' as const]))
  );
  const [busy, setBusy] = useState(false);

  const apply = async (mode: 'chosen' | 'all-mine' | 'all-theirs') => {
    setBusy(true);
    try {
      if (mode === 'all-theirs') {
        store.dismissConflict(conflict.event_id);   // the server copy is already what everyone sees
        toast('Kept the version from the other device.');
        onClose();
        return;
      }

      const pick = (key: FieldKey) =>
        mode === 'all-mine' || choices[key] === 'mine' ? mine : theirs;

      const merged: EventDraft = {
        id: conflict.event_id,
        start_time: pick('start_time').start_time,
        end_time: pick('duration_seconds').end_time,
        duration_seconds: pick('duration_seconds').duration_seconds,
        difficulty: pick('difficulty').difficulty,
        description: pick('description').description,
        location: pick('location').location,
        notes: pick('notes').notes,
        sleep_quality: theirs.sleep_quality ?? mine.sleep_quality,
        hungry: theirs.hungry ?? mine.hungry,
        school_day: theirs.school_day ?? mine.school_day,
        unusual_day: theirs.unusual_day ?? mine.unusual_day,
        status: theirs.status,
        trigger_ids: pick('trigger_ids').trigger_ids,
        helpful_ids: pick('helpful_ids').helpful_ids,
      };

      await store.resolveConflict(conflict.event_id, merged);
      toast('Saved. Both versions are still in the edit history.');
      onClose();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="This moment was edited twice"
      onClose={onClose}
      footer={
        <div className="stack" style={{ gap: '0.5rem' }}>
          <Button variant="primary" size="lg" block disabled={busy} onClick={() => void apply('chosen')}>
            Save what I've chosen
          </Button>
          <div className="row" style={{ gap: '0.5rem' }}>
            <Button block disabled={busy} onClick={() => void apply('all-mine')}>Keep all of mine</Button>
            <Button block disabled={busy} onClick={() => void apply('all-theirs')}>Keep all of theirs</Button>
          </div>
        </div>
      }
    >
      <div className="stack">
        <p style={{ color: 'var(--ink-2)', fontSize: '0.875rem' }}>
          Someone else changed this moment while your device was away. Nothing was lost —
          choose what to keep. Every version stays in the moment's edit history.
        </p>
        <p className="help">
          Their change was saved {formatDateTime(theirs.updated_at)} by {store.nameOf(theirs.updated_by)}.
        </p>

        {differing.length === 0 ? (
          <p style={{ color: 'var(--ink-2)' }}>
            The two versions now match, so there is nothing to choose between.
          </p>
        ) : (
          <table className="diff-table">
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Keep</th>
              </tr>
            </thead>
            <tbody>
              {differing.map((key) => (
                <tr key={key}>
                  <th scope="row">{LABELS[key]}</th>
                  <td>
                    <div className="pick">
                      <label className="row" style={{ gap: '0.5rem', alignItems: 'flex-start' }}>
                        <input
                          type="radio" name={`conflict-${key}`}
                          checked={choices[key] === 'mine'}
                          onChange={() => setChoices({ ...choices, [key]: 'mine' })}
                        />
                        <span>
                          <strong style={{ display: 'block', fontSize: '0.75rem', color: 'var(--ink-3)' }}>This device</strong>
                          {describe(key, mine)}
                        </span>
                      </label>
                      <label className="row" style={{ gap: '0.5rem', alignItems: 'flex-start' }}>
                        <input
                          type="radio" name={`conflict-${key}`}
                          checked={choices[key] === 'theirs'}
                          onChange={() => setChoices({ ...choices, [key]: 'theirs' })}
                        />
                        <span>
                          <strong style={{ display: 'block', fontSize: '0.75rem', color: 'var(--ink-3)' }}>
                            {store.nameOf(theirs.updated_by)}
                          </strong>
                          {describe(key, theirs)}
                        </span>
                      </label>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Sheet>
  );
}
