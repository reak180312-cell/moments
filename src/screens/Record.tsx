import { useEffect, useMemo, useState } from 'react';
import { useStore, type EventDraft } from '../data/store';
import { navigate, useBack } from '../lib/router';
import { formatDuration, fromLocalInput, toLocalInput } from '../lib/time';
import { LOCATIONS, type HungryValue, type SleepQuality } from '../lib/types';
import { Button, Card, Chip, Field, Fieldset, IconButton, useToast } from '../components/ui';
import { DifficultyScale } from '../components/Difficulty';
import { TagInput } from '../components/TagInput';
import { TimerControls, useStopwatch } from '../components/Timer';

export function RecordScreen({ eventId, duplicateOf }: { eventId: string | null; duplicateOf: string | null }) {
  const store = useStore();
  const back = useBack();
  const toast = useToast();

  const source = useMemo(() => {
    const id = eventId ?? duplicateOf;
    return id ? store.events[id] ?? null : null;
  }, [eventId, duplicateOf, store.events]);

  const editing = Boolean(eventId && source);

  const [startTime, setStartTime] = useState(() =>
    toLocalInput(source && editing ? source.start_time : new Date())
  );
  const [difficulty, setDifficulty] = useState<number | null>(source?.difficulty ?? null);
  const [triggerIds, setTriggerIds] = useState<string[]>(source?.trigger_ids ?? []);
  const [helpfulIds, setHelpfulIds] = useState<string[]>(source?.helpful_ids ?? []);
  const [description, setDescription] = useState(source?.description ?? '');
  const [notes, setNotes] = useState(source?.notes ?? '');
  const [location, setLocation] = useState<string | null>(source?.location ?? null);
  const [sleep, setSleep] = useState<SleepQuality | null>(source?.sleep_quality ?? null);
  const [hungry, setHungry] = useState<HungryValue | null>(source?.hungry ?? null);
  const [schoolDay, setSchoolDay] = useState<boolean | null>(source?.school_day ?? null);
  const [unusualDay, setUnusualDay] = useState<boolean | null>(source?.unusual_day ?? null);
  const [minutes, setMinutes] = useState(
    source?.duration_seconds ? String(Math.round(source.duration_seconds / 60)) : ''
  );
  const stopwatch = useStopwatch(0);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Duplicating starts a fresh moment at the current time.
  useEffect(() => {
    if (duplicateOf && source) setStartTime(toLocalInput(new Date()));
  }, [duplicateOf, source]);

  const durationSeconds = (): number | null => {
    if (minutes.trim()) {
      const n = Number(minutes);
      return Number.isFinite(n) && n >= 0 ? Math.round(n * 60) : null;
    }
    // A timer still running when Save is pressed counts for what it has run.
    if (stopwatch.started && stopwatch.seconds > 0) return stopwatch.seconds;
    return null;   // an empty box means no duration, including when clearing one
  };

  const save = async () => {
    setError(null);
    if (difficulty === null) {
      setError('Please choose how difficult it was, from 1 to 10.');
      document.getElementById('difficulty-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setBusy(true);
    try {
      const start = fromLocalInput(startTime);
      const secs = durationSeconds();
      const draft: EventDraft = {
        id: eventId ?? undefined,
        start_time: start.toISOString(),
        end_time: secs ? new Date(start.getTime() + secs * 1000).toISOString() : null,
        duration_seconds: secs,
        difficulty,
        description,
        notes,
        location,
        sleep_quality: sleep,
        hungry,
        school_day: schoolDay,
        unusual_day: unusualDay,
        status: 'complete',
        trigger_ids: triggerIds,
        helpful_ids: helpfulIds,
      };
      const saved = await store.saveEvent(draft);
      toast(editing ? 'Moment updated.' : 'Moment saved.');
      navigate(`/event/${saved.id}`, true);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <header className="row-between" style={{ marginBottom: '1rem' }}>
        <IconButton label="Back" name="back" onClick={back} />
        <h1 style={{ fontSize: '1.125rem' }}>{editing ? 'Edit moment' : 'Record a moment'}</h1>
        <span style={{ width: '44px' }} />
      </header>

      <div className="stack-lg">
        <Card>
          <Field label="Start time">
            <input
              className="input" type="datetime-local" value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </Field>
          <p className="help" style={{ marginTop: '0.375rem' }}>
            Set to now. Change it if you are writing this up later.
          </p>
        </Card>

        <Card>
          <Fieldset label="How long did it last?">
            <div className="stack">
              <p className="help" style={{ marginTop: '-0.125rem' }}>
                Optional. Type it, tap one, or run the timer.
              </p>
              <div className="row" style={{ gap: '0.5rem' }}>
                <input
                  className="input" type="number" min="0" max="600" inputMode="numeric"
                  style={{ maxWidth: '7rem' }}
                  aria-label="Duration in minutes"
                  value={minutes} onChange={(e) => setMinutes(e.target.value)}
                  placeholder="12"
                />
                <span style={{ color: 'var(--ink-2)' }}>minutes</span>
              </div>

              <div className="chip-wrap">
                {[2, 5, 10, 15, 30].map((m) => (
                  <Chip key={m} selected={minutes === String(m)} onClick={() => setMinutes(String(m))}>
                    {m} min
                  </Chip>
                ))}
                {minutes && (
                  <Chip dashed onClick={() => setMinutes('')}>Clear</Chip>
                )}
              </div>

              <div className="or-rule" aria-hidden="true"><span>or time it</span></div>

              <TimerControls
                seconds={stopwatch.seconds}
                running={stopwatch.running}
                started={stopwatch.started}
                onStart={stopwatch.start}
                onPause={stopwatch.pause}
                onResume={stopwatch.start}
                onFinish={() => {
                  stopwatch.pause();
                  setMinutes(String(Math.max(1, Math.round(stopwatch.seconds / 60))));
                }}
              />
            </div>
          </Fieldset>
        </Card>

        <Card id="difficulty-section">
          <Fieldset label="How difficult was it?">
            <DifficultyScale value={difficulty} onChange={setDifficulty} />
          </Fieldset>
        </Card>

        <Card>
          <Fieldset label="What set it off?">
            <TagInput
              kind="triggers" selected={triggerIds} onChange={setTriggerIds}
              placeholder="Homework, tired, a change of plan…"
            />
          </Fieldset>
        </Card>

        <Card>
          <Field label="What happened?" help="A sentence is plenty.">
            <textarea
              className="textarea" value={description} rows={3}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Asked to stop the game and start homework."
            />
          </Field>
        </Card>

        <Card>
          <Fieldset label="What helped?">
            <TagInput
              kind="helpful" selected={helpfulIds} onChange={setHelpfulIds}
              placeholder="A quiet room, a break, going outside…"
            />
          </Fieldset>
        </Card>

        <Card>
          <Field label="Where?" help="Anywhere you like — the suggestions are only suggestions.">
            <input
              className="input" list="moment-places" value={location ?? ''}
              placeholder="Home, school, the car…"
              onChange={(e) => setLocation(e.target.value || null)}
            />
            <datalist id="moment-places">
              {LOCATIONS.map((l) => <option key={l} value={l} />)}
            </datalist>
          </Field>
        </Card>

        <Card>
          <Field label="Notes" help="Anything you want to remember. Optional.">
            <textarea
              className="textarea" value={notes} rows={3}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </Card>

        <Card>
          <div className="stack">
            <span className="label">
              Anything else about the day?{' '}
              <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>All optional</span>
            </span>

            <Fieldset label="Sleep last night">
              <div className="chip-wrap">
                {(['poor', 'okay', 'good'] as SleepQuality[]).map((s) => (
                  <Chip key={s} selected={sleep === s} onClick={() => setSleep(sleep === s ? null : s)}>
                    {s === 'poor' ? 'Poor' : s === 'okay' ? 'Okay' : 'Good'}
                  </Chip>
                ))}
              </div>
            </Fieldset>

            <Fieldset label="Hungry?">
              <div className="chip-wrap">
                {(['yes', 'no', 'unknown'] as HungryValue[]).map((h) => (
                  <Chip key={h} selected={hungry === h} onClick={() => setHungry(hungry === h ? null : h)}>
                    {h === 'yes' ? 'Yes' : h === 'no' ? 'No' : 'Not sure'}
                  </Chip>
                ))}
              </div>
            </Fieldset>

            <Fieldset label="School day?">
              <div className="chip-wrap">
                <Chip selected={schoolDay === true} onClick={() => setSchoolDay(schoolDay === true ? null : true)}>Yes</Chip>
                <Chip selected={schoolDay === false} onClick={() => setSchoolDay(schoolDay === false ? null : false)}>No</Chip>
              </div>
            </Fieldset>

            <Fieldset label="Unusual day?">
              <div className="chip-wrap">
                <Chip selected={unusualDay === true} onClick={() => setUnusualDay(unusualDay === true ? null : true)}>Yes</Chip>
                <Chip selected={unusualDay === false} onClick={() => setUnusualDay(unusualDay === false ? null : false)}>No</Chip>
              </div>
            </Fieldset>
          </div>
        </Card>

        {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}

        <div className="save-bar">
          <Button variant="primary" size="lg" block disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Save Moment'}
          </Button>
        </div>

        {durationSeconds() !== null && (
          <p className="help" style={{ textAlign: 'center' }}>
            Duration: {formatDuration(durationSeconds())}
          </p>
        )}

        {!store.online && (
          <p className="help" style={{ textAlign: 'center' }}>
            You are offline. This will be saved on this device and uploaded automatically.
          </p>
        )}
      </div>
    </div>
  );
}
