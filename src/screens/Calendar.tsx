import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import {
  DOW_LABELS, addDays, addMonths, dayKey, formatDayLabel, isSameDay,
  startOfDay, startOfMonth, startOfWeek,
} from '../lib/time';
import { summarise } from '../lib/stats';
import { monthSlot } from '../lib/github';
import { EmptyState, Icon } from '../components/ui';
import { MomentList, StatCell, StatSplit, iClass, showScore } from '../components/moment';

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
  const stats = summarise(selectedEvents, store.triggers);
  const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  // Each month has its own picture; the general one stands in if a month has none.
  const headPhoto = store.photoOf(monthSlot(month.getMonth() + 1)) ?? store.photoOf('calendar');

  const dayWord = stats.avgDifficulty === null
    ? null
    : stats.avgDifficulty >= 7 ? 'A harder day overall'
      : stats.avgDifficulty >= 4 ? 'A mixed day'
        : 'A gentler day overall';

  return (
    <div className="screen">
      {/* The photo fills the whole header, with the month over a frosted panel. */}
      <div className="photo-card photo-card--calendar cal-head">
        {headPhoto && <img src={headPhoto} alt="" />}
        <span className="photo-scrim" aria-hidden="true" />
        <div className="photo-text">
          <h1>{monthLabel}</h1>
          <p>Noticing the hard moments helps brighter days ahead.</p>
        </div>
        <div className="cal-nav">
          <button type="button" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
            <Icon name="back" size={18} />
          </button>
          <button type="button" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
            <Icon name="chevron" size={18} />
          </button>
        </div>
      </div>
      <div className="stack">
        <div className="ui-card cal-card">
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
                    'cal-day', iClass(peak),
                    otherMonth ? 'is-other' : '',
                    isToday ? 'is-today' : '',
                    isSelected ? 'is-selected' : '',
                  ].filter(Boolean).join(' ')}
                  aria-label={
                    `${formatDayLabel(day)}: ${list.length} moment${list.length === 1 ? '' : 's'}` +
                    (peak ? `, highest recorded intensity ${peak} out of 10` : '')
                  }
                  aria-selected={isSelected}
                  onClick={() => setSelected(startOfDay(day))}
                >
                  <span aria-hidden="true">{day.getDate()}</span>
                  <span className="cal-dots" aria-hidden="true">
                    {list.slice(0, 3).map((e) => (
                      <i key={e.id} className={iClass(e.difficulty)} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {selectedEvents.length > 0 && (
          <StatSplit
            left={
              <StatCell
                label="Average intensity"
                value={showScore(stats.avgDifficulty)}
                unit="/ 10"
                note={`Based on ${stats.count} moment${stats.count === 1 ? '' : 's'} on ${
                  selected.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
              />
            }
            right={
              <div className="stat-cell" style={{ flexWrap: 'wrap' }}>
                <div className="stat-body">
                  <div className="stat-value">
                    {stats.count}
                    <small style={{ marginLeft: '0.375rem' }}>
                      moment{stats.count === 1 ? '' : 's'} this day
                    </small>
                  </div>
                  {dayWord && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <span className={`day-pill ${iClass(stats.avgDifficulty)}`}>{dayWord}</span>
                    </div>
                  )}
                </div>
              </div>
            }
          />
        )}

        <div className="list-head">
          <h2>
            Moments on {selected.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </h2>
          {selectedEvents.length > 0 && (
            <button type="button" className="link-pill" onClick={() => location.hash = '/history'}>
              View all <Icon name="chevron" size={14} />
            </button>
          )}
        </div>

        {selectedEvents.length === 0
          ? <EmptyState emoji="·" title="Nothing recorded on this day" />
          : <MomentList events={selectedEvents} />}
      </div>
    </div>
  );
}
