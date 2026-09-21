import { useCallback, useEffect, useRef, useState } from 'react';
import { formatClock } from '../lib/time';
import { Button } from './ui';

/**
 * A stopwatch that keeps time from wall-clock timestamps, so it stays correct
 * if the screen sleeps, the tab is backgrounded, or the app is reopened.
 */
export function useStopwatch(initialSeconds = 0, autoStartFrom?: number | null) {
  const [accumulated, setAccumulated] = useState(initialSeconds);
  const [runningSince, setRunningSince] = useState<number | null>(autoStartFrom ?? null);
  const [, forceTick] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (runningSince === null) return;
    const t = setInterval(() => { if (mounted.current) forceTick((x) => x + 1); }, 500);
    return () => clearInterval(t);
  }, [runningSince]);

  const seconds = accumulated + (runningSince !== null ? (Date.now() - runningSince) / 1000 : 0);

  const start = useCallback(() => setRunningSince((s) => s ?? Date.now()), []);
  const pause = useCallback(() => {
    setRunningSince((since) => {
      if (since !== null) setAccumulated((a) => a + (Date.now() - since) / 1000);
      return null;
    });
  }, []);
  const reset = useCallback((to = 0) => { setAccumulated(to); setRunningSince(null); }, []);

  return {
    seconds: Math.floor(seconds),
    running: runningSince !== null,
    started: runningSince !== null || accumulated > 0,
    start, pause, reset,
  };
}

export function TimerControls({
  seconds, running, started, onStart, onPause, onResume, onFinish, finishLabel = 'Finish',
}: {
  seconds: number; running: boolean; started: boolean;
  onStart: () => void; onPause: () => void; onResume: () => void; onFinish: () => void;
  finishLabel?: string;
}) {
  return (
    <div className="stack" style={{ gap: '0.75rem' }}>
      <div>
        <p className="timer-display" aria-live="off">{formatClock(seconds)}</p>
        <p className="timer-sub" aria-live="polite">
          {!started ? 'Timer ready' : running ? 'Timer running' : 'Timer paused'}
          <span className="sr-only">
            {` — ${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds`}
          </span>
        </p>
      </div>

      <div className="row" style={{ justifyContent: 'center', gap: '0.5rem' }}>
        {!started && (
          <Button variant="primary" size="lg" icon="play" onClick={onStart}>Start Timer</Button>
        )}
        {started && running && (
          <Button icon="pause" onClick={onPause}>Pause</Button>
        )}
        {started && !running && (
          <Button icon="play" onClick={onResume}>Resume</Button>
        )}
        {started && (
          <Button variant="primary" icon="stop" onClick={onFinish}>{finishLabel}</Button>
        )}
      </div>
    </div>
  );
}
