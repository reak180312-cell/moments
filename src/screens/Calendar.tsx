import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import {
  DOW_LABELS, addMonths, dayKey, formatDayLabel, formatDuration, isSameDay,
  startOfDay, startOfMonth, startOfWeek, addDays,
} from '../lib/time';
import { summarise } from '../lib/stats';
import { Card, EmptyState, IconButton } from '../components/ui';
import { MomentList } from '../components/EventList';
import { dClass } from '../components/Difficulty';

export function CalendarScreen() {
  const store = useStore();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<Date>(() => startOfDay(new Date()));

  const scoped = useMemo(
    () => (store.activeProfileId
      ? store.allEvents.filter((e) => e.profile_id === store.activeProfileId)
      : store.allEvents),
    [store.allEvents, store.activeProfileId]
  );

  const byDay = useMemo(() => {
    const map = new Map<string, typeof scoped>();
    scoped.forEach((e) => {
      const k = dayKey(e.start_time);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    });
    return map;
  }, [scoped]);

  // Six weeks from the Monday on or before the 1st - a stable grid all year.
  const gridStart = startOfWeek(month);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  const selectedEvents = byDay.get(dayKey(selected)) ?? [];
  const selectedStats = summarise(selectedEvents, store.triggers);
  const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <p className="eyebrow">Calendar</p>
          <h1>{monthLabel}</h1>
        </div>
        <div className="row" style={{ gap: '0.25rem' }}>
          <IconButton label="Previous month" name="back" onClick={() => setMonth(addMonths(month, -1))} />
          <IconButton label="Next month" name="chevron" onClick={() => setMonth(addMonths(month, 1))} />
        </div>
      </header>

      <div className="stack-lg">
        <Card>
          <div className="cal-grid" role="grid" aria-label={`Moments recorded in ${monthLabel}`}>
            {DOW_LABELS.map((d) => (
              <div key={d} className="cal-dow" role="columnheader" aria-label={d}>{d}</div>
            ))}

            {days.map((day) => {
              const list = byDay.get(dayKey(day)) ?? [];
              const otherMonth = day.getMonth() !== month.getMonth();
              const isToday = isSameDay(day, new Date());
              const isSelected = isSameDay(day, selected);
              const scores = list.map((e) => e.difficulty).filter((n): n is number => typeof n === 'number');
              const peak = scores.length ? Math.max(...scores) : null;

              return (
                <button
                  key={dayKey(day)}
                  type="button"
                  role="gridcell"
                  className={[
                    'cal-day',
                    dClass(peak),
                    otherMonth ? 'is-other' : '',
                    isToday ? 'is-today' : '',
                    isSelected ? 'is-selected' : '',
                  ].filter(Boolean).join(' ')}
                  aria-label={
                    `${formatDayLabel(day)}: ${list.length} moment${list.length === 1 ? '' : 's'}` +
                    (peak ? `, highest recorded difficulty ${peak} out of 10` : '')
                  }
                  aria-selected={isSelected}
                  onClick={() => setSelected(startOfDay(day))}
                >
                  <span aria-hidden="true">{day.getDate()}</span>
                  <span className="cal-dots" aria-hidden="true">
                    {list.slice(0, 3).map((e) => (
                      <i key={e.id} className={dClass(e.difficulty)} style={{ background: 'var(--fill)' }} />
                    ))}
                  </span>
                  {list.length > 3 && <span className="cal-count" aria-hidden="true">{list.length}</span>}
                </button>
              );
            })}
          </div>

          <p className="help" style={{ marginTop: '0.75rem' }}>
            Each dot is one recorded moment; a deeper shade means a higher recorded
            difficulty. The number below shows the count on busier days.
          </p>
        </Card>

        <section className="stack" style={{ gap: '0.5rem' }}>
          <h2 className="section-title">{formatDayLabel(selected)}</h2>

          {selectedEvents.length === 0 ? (
            <Card className="card--quiet">
              <EmptyState emoji="·" title="Nothing recorded on this day" />
            </Card>
          ) : (
            <>
              <Card className="card--quiet">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span>{selectedStats.count} moment{selectedStats.count === 1 ? '' : 's'}</span>
                  {selectedStats.avgDifficulty !== null && (
                    <span>Average {selectedStats.avgDifficulty}/10</span>
                  )}
                  {selectedStats.totalSeconds > 0 && (
                    <span>{formatDuration(selectedStats.totalSeconds)} total</span>
                  )}
                </div>
              </Card>
              <MomentList events={selectedEvents} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
