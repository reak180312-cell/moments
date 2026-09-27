import { useEffect, useMemo, useState } from 'react';
import { useStore, type EventDraft } from '../data/store';
import { navigate, useBack } from '../lib/router';
import { fromLocalInput, toLocalInput } from '../lib/time';
import { LOCATIONS, type HungryValue, type SleepQuality } from '../lib/types';
import { Button, Chip, IconButton, useToast } from '../components/ui';
import { DifficultyScale } from '../components/Difficulty';
import { TagInput } from '../components/TagInput';
import { TimerControls, useStopwatch } from '../components/Timer';

/**
 * Every question is on the page at once, as asked for. What has gone is the
 * furniture around them: a card per field, and a line of help under each one
 * explaining what the field already says.
 */

function Block({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <section className="form-block">
      {htmlFor
        ? <label className="form-label" htmlFor={htmlFor}>{label}</label>
        : <span className="form-label">{label}</span>}
      {children}
    </section>
  );
}

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
    return null;
  };

  const save = async () => {
    setError(null);
    if (difficulty === null) {
      setError('Choose how difficult it was, from 1 to 10.');
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
      <header className="screen-bar">
        <IconButton label="Back" name="back" onClick={back} />
        <h1>{editing ? 'Edit moment' : 'Record a moment'}</h1>
        <span />
      </header>

      <div className="form-stack">
        <Block label="Start time" htmlFor="start-time">
          <input
            id="start-time"
            className="input" type="datetime-local" value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </Block>

        <Block label="How long did it last?">
          <div className="row" style={{ gap: '0.5rem' }}>
            <input
              className="input" type="number" min="0" max="600" inputMode="numeric"
              style={{ maxWidth: '6.5rem' }}
              aria-label="Duration in minutes"
              value={minutes} onChange={(e) => setMinutes(e.target.value)}
              placeholder="12"
            />
            <span style={{ color: 'var(--ink-3)' }}>minutes</span>
          </div>

          <div className="chip-wrap">
            {[2, 5, 10, 15, 30].map((m) => (
              <Chip key={m} selected={minutes === String(m)} onClick={() => setMinutes(String(m))}>
                {m}
              </Chip>
            ))}
            {minutes && <Chip dashed onClick={() => setMinutes('')}>Clear</Chip>}
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
        </Block>

        <section className="form-block" id="difficulty-section" role="group" aria-label="How difficult was it">
          <span className="form-label">How difficult was it?</span>
          <DifficultyScale value={difficulty} onChange={setDifficulty} />
        </section>

        <Block label="What set it off?">
          <TagInput
            kind="triggers" selected={triggerIds} onChange={setTriggerIds}
            placeholder="Homework, tired, a change of plan…"
          />
        </Block>

        <Block label="What happened?" htmlFor="what-happened">
          <textarea
            id="what-happened"
            className="textarea" value={description} rows={3} dir="auto"
            onChange={(e) => setDescription(e.target.value)}
          />
        </Block>

        <Block label="What helped?">
          <TagInput
            kind="helpful" selected={helpfulIds} onChange={setHelpfulIds}
            placeholder="A quiet room, a break, going outside…"
          />
        </Block>

        <Block label="Where?" htmlFor="where">
          <input
            id="where"
            className="input" list="moment-places" value={location ?? ''} dir="auto"
            onChange={(e) => setLocation(e.target.value || null)}
          />
          <datalist id="moment-places">
            {LOCATIONS.map((l) => <option key={l} value={l} />)}
          </datalist>
        </Block>

        <Block label="Notes" htmlFor="notes">
          <textarea
            id="notes"
            className="textarea" value={notes} rows={3} dir="auto"
            onChange={(e) => setNotes(e.target.value)}
          />
        </Block>

        <section className="form-block">
          <span className="form-label">About the day</span>

          <div className="mini-row" role="group" aria-label="Sleep last night">
            <span>Sleep</span>
            <div className="chip-wrap">
              {(['poor', 'okay', 'good'] as SleepQuality[]).map((s) => (
                <Chip key={s} selected={sleep === s} onClick={() => setSleep(sleep === s ? null : s)}>
                  {s === 'poor' ? 'Poor' : s === 'okay' ? 'Okay' : 'Good'}
                </Chip>
              ))}
            </div>
          </div>

          <div className="mini-row" role="group" aria-label="Hungry">
            <span>Hungry</span>
            <div className="chip-wrap">
              {(['yes', 'no', 'unknown'] as HungryValue[]).map((h) => (
                <Chip key={h} selected={hungry === h} onClick={() => setHungry(hungry === h ? null : h)}>
                  {h === 'yes' ? 'Yes' : h === 'no' ? 'No' : 'Not sure'}
                </Chip>
              ))}
            </div>
          </div>

          <div className="mini-row" role="group" aria-label="School day">
            <span>School day</span>
            <div className="chip-wrap">
              <Chip selected={schoolDay === true} onClick={() => setSchoolDay(schoolDay === true ? null : true)}>Yes</Chip>
              <Chip selected={schoolDay === false} onClick={() => setSchoolDay(schoolDay === false ? null : false)}>No</Chip>
            </div>
          </div>

          <div className="mini-row" role="group" aria-label="Unusual day">
            <span>Unusual day</span>
            <div className="chip-wrap">
              <Chip selected={unusualDay === true} onClick={() => setUnusualDay(unusualDay === true ? null : true)}>Yes</Chip>
              <Chip selected={unusualDay === false} onClick={() => setUnusualDay(unusualDay === false ? null : false)}>No</Chip>
            </div>
          </div>
        </section>

        {error && <p role="alert" className="form-error">{error}</p>}

        <div className="save-bar">
          <Button variant="primary" size="lg" block disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : editing ? 'Save' : 'Save Moment'}
          </Button>
        </div>
      </div>
    </div>
  );
}
