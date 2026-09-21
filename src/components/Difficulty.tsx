import { useRef } from 'react';

/**
 * "How difficult was it?" - a 1-10 scale.
 *
 * 10 is not a failure and is not styled like one: the ramp is a single calm
 * hue that simply deepens, and every step carries its number and its word,
 * so the meaning never rests on colour.
 */

export const DIFFICULTY_WORDS: Record<number, string> = {
  1: 'Very mild',
  2: 'Mild',
  3: 'Mild',
  4: 'Moderate',
  5: 'Moderate',
  6: 'Quite hard',
  7: 'Hard',
  8: 'Hard',
  9: 'Very hard',
  10: 'Extremely difficult',
};

export function difficultyWord(value: number | null | undefined): string {
  if (!value) return 'Not recorded';
  return DIFFICULTY_WORDS[value] ?? '';
}

export function dClass(value: number | null | undefined): string {
  return `d-${value && value >= 1 && value <= 10 ? value : 0}`;
}

export function DifficultyBadge({ value, showWord }: { value: number | null; showWord?: boolean }) {
  if (value === null) {
    return <span className="tag">Difficulty not recorded</span>;
  }
  return (
    <span className={`dscore ${dClass(value)}`}>
      <span aria-hidden="true">{value}</span>
      <small aria-hidden="true">/10</small>
      <span className="sr-only">
        Difficulty {value} out of 10, {difficultyWord(value)}
      </span>
      {showWord && <small style={{ marginLeft: '0.25rem' }} aria-hidden="true">{difficultyWord(value)}</small>}
    </span>
  );
}

export function DifficultyScale({
  value, onChange, compact,
}: { value: number | null; onChange: (v: number) => void; compact?: boolean }) {
  const groupRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
    const step = keys[event.key];
    if (!step) return;
    event.preventDefault();
    const next = Math.min(10, Math.max(1, index + step));
    onChange(next);
    const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('.difficulty-btn');
    buttons?.[next - 1]?.focus();
  };

  return (
    <div className="difficulty">
      <div
        className="difficulty-grid" role="radiogroup"
        aria-label="How difficult was it, from 1 to 10" ref={groupRef}
      >
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const selected = value === n;
          const under = value !== null && n < value;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${n} out of 10, ${DIFFICULTY_WORDS[n]}`}
              tabIndex={selected || (value === null && n === 1) ? 0 : -1}
              className={`difficulty-btn ${dClass(n)} ${selected ? 'is-on' : ''} ${under ? 'is-under' : ''}`}
              onClick={() => onChange(n)}
              onKeyDown={(e) => onKeyDown(e, n)}
            >
              <span aria-hidden="true">{n}</span>
            </button>
          );
        })}
      </div>

      {!compact && (
        <div className="difficulty-legend" aria-hidden="true">
          <span>1 · Very mild</span>
          <span>10 · Extremely difficult</span>
        </div>
      )}

      <p className="difficulty-readout" aria-live="polite">
        {value === null
          ? 'Choose the number that felt closest.'
          : <><strong>{value}/10</strong> · {difficultyWord(value)}</>}
      </p>
    </div>
  );
}
