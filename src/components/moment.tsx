import type { ReactNode } from 'react';
import { navigate } from '../lib/router';
import { formatDayLabel, formatTime } from '../lib/time';
import type { MomentEvent } from '../lib/types';
import { useStore } from '../data/store';
import { difficultyWord } from './Difficulty';
import { Avatar, Icon } from './ui';

/** The tint a score wears, everywhere it appears. */
export function iClass(score: number | null | undefined): string {
  return `i-${score && score >= 1 && score <= 10 ? Math.round(score) : 0}`;
}

/** Averages carry one decimal; a single moment is a whole number. */
export function showScore(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/* ----------------------------------------------------------- page head */

export function PageHead({
  title, subtitle, trailing,
}: { title: ReactNode; subtitle?: string; trailing?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {trailing}
    </header>
  );
}

/** The child this record is about, and a way into their settings. */
export function ChildPill() {
  const store = useStore();
  const child = store.profiles.find((p) => p.id === store.activeProfileId);
  if (!child) return null;
  const face = store.photoOf('profile');

  return (
    <button type="button" className="child-pill" onClick={() => navigate('/settings')}>
      {face ? <img src={face} alt="" /> : <Avatar name={child.name} hue={child.colour_hue} />}
      <span>{child.name}</span>
      <Icon name="chevron" size={14} />
    </button>
  );
}

/* ---------------------------------------------------------- photo card */

export function PhotoCard({
  slot, heading, body,
}: { slot: 'home' | 'history' | 'insights' | 'encourage'; heading: string; body?: string }) {
  const store = useStore();
  const photo = store.photoOf(slot);

  return (
    <div className="photo-card">
      {photo && <img src={photo} alt="" />}
      <span className="photo-scrim" aria-hidden="true" />
      <div className="photo-text">
        <h2>{heading}</h2>
        {body && <p>{body}</p>}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- stat card */

export function StatSplit({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="ui-card">
      <div className="stat-split">
        {left}
        <span className="rule" aria-hidden="true" />
        {right}
      </div>
    </div>
  );
}

export function StatCell({
  icon, label, value, unit, note, tone,
}: {
  icon?: 'insights' | 'calendar' | 'clock';
  label?: string;
  value: ReactNode;
  unit?: string;
  note?: string;
  tone?: 'good';
}) {
  return (
    <div className="stat-cell">
      {icon && (
        <span className={`icon-tile ${tone === 'good' ? 'icon-tile--good' : ''}`} aria-hidden="true">
          <Icon name={icon} size={18} />
        </span>
      )}
      <div className="stat-body">
        {label && <div className="stat-label">{label}</div>}
        <div className="stat-value">{value}{unit && <small>{unit}</small>}</div>
        {note && <div className="stat-note">{note}</div>}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- moment card */

export function MomentCard({ event, showDate }: { event: MomentEvent; showDate?: boolean }) {
  const { triggerName, helpfulName } = useStore();
  const triggers = event.trigger_ids.map(triggerName);
  const helped = event.helpful_ids.map(helpfulName);

  // What someone wrote comes first; the trigger names are the fallback.
  const title = event.description?.trim() || triggers.join(' · ') || 'Moment';
  const note = event.notes?.trim();
  // If the title is only the trigger names, repeating them as tags says nothing.
  const showTriggerTags = Boolean(event.description?.trim());

  return (
    <li>
      <button
        type="button"
        className="moment-card"
        onClick={() => navigate(`/event/${event.id}`)}
        aria-label={
          `${formatTime(event.start_time)}. ${title}. Intensity ${event.difficulty ?? 'not recorded'}` +
          `${event.difficulty ? ' out of 10, ' + difficultyWord(event.difficulty) : ''}.`
        }
      >
        <span className={`score-tile ${iClass(event.difficulty)}`} aria-hidden="true">
          <b>{showScore(event.difficulty)}</b>
          <span>/ 10</span>
        </span>

        <span className="moment-body">
          <span className="moment-time">
            {showDate
              ? new Date(event.start_time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' · '
              : ''}
            {formatTime(event.start_time)}
            {event._pending ? ' · waiting' : ''}
          </span>
          <span className="moment-title" dir="auto">{title}</span>
          {note && <span className="moment-note" dir="auto">{note}</span>}
          {((showTriggerTags && triggers.length > 0) || helped.length > 0) && (
            <span className="moment-tags">
              {showTriggerTags && triggers.map((t) => <span key={t} className="moment-tag">{t}</span>)}
              {helped.map((h) => <span key={h} className="moment-tag moment-tag--good">{h}</span>)}
            </span>
          )}
        </span>

        <span className="moment-chev" aria-hidden="true"><Icon name="chevron" size={18} /></span>
      </button>
    </li>
  );
}

export function MomentList({ events, showDate }: { events: MomentEvent[]; showDate?: boolean }) {
  return (
    <ul className="moment-list">
      {events.map((e) => <MomentCard key={e.id} event={e} showDate={showDate} />)}
    </ul>
  );
}

/** History groups by day, with the day's count beside its heading. */
export function MomentByDay({ events }: { events: MomentEvent[] }) {
  const groups: { day: string; items: MomentEvent[] }[] = [];
  events.forEach((e) => {
    const day = formatDayLabel(e.start_time);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(e);
    else groups.push({ day, items: [e] });
  });

  return (
    <div>
      {groups.map((group) => (
        <section key={group.day}>
          <div className="list-head">
            <h2>{group.day}</h2>
            <span className="list-count">
              {group.items.length} moment{group.items.length === 1 ? '' : 's'}
            </span>
          </div>
          <MomentList events={group.items} />
        </section>
      ))}
    </div>
  );
}
