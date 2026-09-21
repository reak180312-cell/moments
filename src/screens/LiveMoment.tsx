import { useEffect, useRef, useState } from 'react';
import { useStore } from '../data/store';
import { navigate, useBack } from '../lib/router';
import { formatClock, formatTime } from '../lib/time';
import { Button, Card, IconButton, Sheet, useToast } from '../components/ui';
import { DifficultyScale } from '../components/Difficulty';
import { VocabPicker } from '../components/VocabPicker';

/**
 * Live mode: for when it is happening right now.
 *
 * The moment is written to the shared record the instant it starts, as a draft,
 * so it cannot be lost and so another parent's device can see it running. While
 * it is happening there is nothing to fill in but a number.
 */
export function LiveMomentScreen({ draftId }: { draftId: string | null }) {
  const store = useStore();
  const back = useBack();
  const toast = useToast();

  const existing = draftId ? store.events[draftId] : undefined;
  const [eventId, setEventId] = useState<string | null>(draftId);
  const [startedAt, setStartedAt] = useState<Date>(() =>
    existing ? new Date(existing.start_time) : new Date()
  );
  const [difficulty, setDifficulty] = useState<number | null>(existing?.difficulty ?? null);
  const [triggerIds, setTriggerIds] = useState<string[]>(existing?.trigger_ids ?? []);
  const [showTriggers, setShowTriggers] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const created = useRef(false);

  // Start the draft immediately - one write, then nothing else is required.
  useEffect(() => {
    if (draftId || created.current) return;
    created.current = true;
    const start = new Date();
    setStartedAt(start);
    store
      .saveEvent({ start_time: start.toISOString(), status: 'draft' })
      .then((saved) => setEventId(saved.id))
      .catch((err) => setError((err as Error).message));
  }, [draftId, store]);

  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  const persistDraft = (patch: { difficulty?: number | null; trigger_ids?: string[] }) => {
    if (!eventId) return;
    void store.saveEvent({
      id: eventId,
      start_time: startedAt.toISOString(),
      status: 'draft',
      difficulty: patch.difficulty ?? difficulty,
      trigger_ids: patch.trigger_ids ?? triggerIds,
    }).catch(() => { /* it stays queued; nothing is lost */ });
  };

  const finish = async () => {
    if (difficulty === null) {
      setError('Choose a number from 1 to 10 to finish.');
      return;
    }
    if (!eventId) return;
    setBusy(true);
    try {
      const end = new Date();
      await store.saveEvent({
        id: eventId,
        start_time: startedAt.toISOString(),
        end_time: end.toISOString(),
        duration_seconds: Math.max(1, Math.floor((end.getTime() - startedAt.getTime()) / 1000)),
        difficulty,
        trigger_ids: triggerIds,
        status: 'complete',
      });
      toast('Moment saved.');
      navigate(`/record?id=${eventId}`, true);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (eventId && store.perms.delete) {
      await store.deleteEvent(eventId).catch(() => {});
    }
    back();
  };

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column' }}>
      <header className="row-between" style={{ marginBottom: '1.5rem' }}>
        <IconButton label="Back" name="back" onClick={back} />
        <h1 style={{ fontSize: '1.125rem' }}>Happening now</h1>
        <span style={{ width: '44px' }} />
      </header>

      <div className="stack-lg">
        <Card className="card--pad-lg">
          <div className="stack">
            <p className="timer-display" aria-hidden="true">{formatClock(elapsed)}</p>
            <p className="timer-sub">
              Started at {formatTime(startedAt)}
              <span className="sr-only" aria-live="polite" aria-atomic="true">
                {`Running for ${Math.floor(elapsed / 60)} minutes`}
              </span>
            </p>
          </div>
        </Card>

        <Card>
          <span className="label">How difficult is it?</span>
          <div style={{ marginTop: '0.5rem' }}>
            <DifficultyScale
              value={difficulty}
              onChange={(v) => { setDifficulty(v); setError(null); persistDraft({ difficulty: v }); }}
              compact
            />
          </div>
        </Card>

        <Button icon="plus" block onClick={() => setShowTriggers(true)}>
          {triggerIds.length
            ? `${triggerIds.length} trigger${triggerIds.length === 1 ? '' : 's'} added`
            : 'Add Trigger'}
        </Button>

        {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}

        <Button variant="primary" size="lg" block disabled={busy} onClick={() => void finish()}>
          {busy ? 'Saving…' : 'Finish'}
        </Button>

        <Button variant="plain" block onClick={() => void cancel()}>
          Cancel this moment
        </Button>

        <p className="help" style={{ textAlign: 'center' }}>
          Saved already — you can close the app and come back to it.
        </p>
      </div>

      {showTriggers && (
        <Sheet
          title="What set it off?"
          onClose={() => { setShowTriggers(false); persistDraft({ trigger_ids: triggerIds }); }}
          footer={
            <Button
              variant="primary" size="lg" block
              onClick={() => { setShowTriggers(false); persistDraft({ trigger_ids: triggerIds }); }}
            >
              Done
            </Button>
          }
        >
          <VocabPicker kind="triggers" selected={triggerIds} onChange={setTriggerIds} />
        </Sheet>
      )}
    </div>
  );
}
