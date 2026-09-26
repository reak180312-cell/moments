import { useState } from 'react';
import { useStore } from '../data/store';
import { navigate } from '../lib/router';
import { formatTime } from '../lib/time';
import { Button, Sheet, useToast } from './ui';
import { DifficultyScale } from './Difficulty';
import { VocabPicker } from './VocabPicker';

/**
 * Quick Record: difficulty, trigger, done. Everything else can be added later
 * from the moment's own page. The whole point is that it fits in the gap
 * between one thing and the next.
 */
export function QuickRecordSheet({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [at] = useState(() => new Date());
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [triggerIds, setTriggerIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (difficulty === null) {
      setError('Choose a number from 1 to 10.');
      return;
    }
    setBusy(true);
    try {
      const saved = await store.saveEvent({
        start_time: at.toISOString(),
        difficulty,
        trigger_ids: triggerIds,
        status: 'complete',
      });
      onClose();
      toast('Moment saved.', { label: 'Add details', onAction: () => navigate(`/record?id=${saved.id}`) });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="Quick record"
      onClose={onClose}
      footer={
        <Button variant="primary" size="lg" block disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save Moment'}
        </Button>
      }
    >
      <div className="stack-lg">
        <p style={{ color: 'var(--ink-3)', fontSize: '0.875rem' }}>
          Recorded at {formatTime(at)}. You can fill in the rest whenever it suits.
        </p>

        <div role="group" aria-label="How difficult was it">
          <span className="label">How difficult was it?</span>
          <DifficultyScale value={difficulty} onChange={(v) => { setDifficulty(v); setError(null); }} compact />
        </div>

        <div role="group" aria-label="Trigger">
          <span className="label">Trigger</span>
          <div style={{ marginTop: '0.5rem' }}>
            <VocabPicker kind="triggers" selected={triggerIds} onChange={setTriggerIds} />
          </div>
        </div>

        {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>{error}</p>}
      </div>
    </Sheet>
  );
}
