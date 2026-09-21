/** Dates, durations and the human words for them. All local-time. */

export function uid(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  // Fallback for older WebViews - still a v4-shaped UUID from a CSPRNG.
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h
    .slice(8, 10)
    .join('')}-${h.slice(10, 16).join('')}`;
}

export const MINUTE = 60;
export const HOUR = 3600;
export const DAY_MS = 86_400_000;

export function d(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function startOfDay(value: string | number | Date): Date {
  const x = d(value);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}

export function endOfDay(value: string | number | Date): Date {
  const x = startOfDay(value);
  x.setDate(x.getDate() + 1);
  return x;
}

export function addDays(value: string | number | Date, days: number): Date {
  const x = d(value);
  const out = new Date(x);
  out.setDate(out.getDate() + days);
  return out;
}

/** Weeks start on Monday. */
export function startOfWeek(value: string | number | Date): Date {
  const x = startOfDay(value);
  const shift = (x.getDay() + 6) % 7;
  return addDays(x, -shift);
}

export function startOfMonth(value: string | number | Date): Date {
  const x = d(value);
  return new Date(x.getFullYear(), x.getMonth(), 1);
}

export function addMonths(value: string | number | Date, months: number): Date {
  const x = d(value);
  return new Date(x.getFullYear(), x.getMonth() + months, x.getDate());
}

export function dayKey(value: string | number | Date): string {
  const x = d(value);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function isSameDay(a: string | number | Date, b: string | number | Date): boolean {
  return dayKey(a) === dayKey(b);
}

/* ----------------------------------------------------------- formatting */

export function formatTime(value: string | number | Date): string {
  return d(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatDate(value: string | number | Date): string {
  return d(value).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatLongDate(value: string | number | Date): string {
  return d(value).toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function formatDayLabel(value: string | number | Date): string {
  const today = startOfDay(new Date());
  const that = startOfDay(value);
  const diff = Math.round((that.getTime() - today.getTime()) / DAY_MS);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  const sameYear = that.getFullYear() === today.getFullYear();
  return d(value).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    year: sameYear ? undefined : 'numeric',
  });
}

export function formatDateTime(value: string | number | Date): string {
  return `${formatDayLabel(value)}, ${formatTime(value)}`;
}

/** "12 min" / "1h 05m" / "45 sec" - never a bare number of seconds. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Total across many moments, e.g. "1h 24m today". */
export function formatTotal(seconds: number): string {
  if (!seconds) return '0 min';
  return formatDuration(seconds);
}

/** Running clock for the live timer: 04:31 or 1:04:31. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function relativeTime(value: string | number | Date): string {
  const ms = Date.now() - d(value).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return formatDayLabel(value);
}

/** For an <input type="datetime-local">. */
export function toLocalInput(value: string | number | Date): string {
  const x = d(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

export function fromLocalInput(value: string): Date {
  return new Date(value);
}

/* --------------------------------------------------------------- ranges */

export type RangeKey =
  | 'today' | 'yesterday' | '7d' | '30d' | '3m' | '6m' | '1y' | 'all' | 'custom';

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '3m', label: '3 months' },
  { key: '6m', label: '6 months' },
  { key: '1y', label: '1 year' },
  { key: 'all', label: 'All time' },
];

export interface Range { from: Date; to: Date; label: string; days: number }

export function resolveRange(key: RangeKey, now: Date = new Date()): Range {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  switch (key) {
    case 'today':
      return { from: today, to: tomorrow, label: 'Today', days: 1 };
    case 'yesterday':
      return { from: addDays(today, -1), to: today, label: 'Yesterday', days: 1 };
    case '7d':
      return { from: addDays(today, -6), to: tomorrow, label: 'Last 7 days', days: 7 };
    case '30d':
      return { from: addDays(today, -29), to: tomorrow, label: 'Last 30 days', days: 30 };
    case '3m':
      return { from: addMonths(today, -3), to: tomorrow, label: 'Last 3 months', days: 91 };
    case '6m':
      return { from: addMonths(today, -6), to: tomorrow, label: 'Last 6 months', days: 182 };
    case '1y':
      return { from: addMonths(today, -12), to: tomorrow, label: 'Last year', days: 365 };
    default:
      return { from: new Date(2000, 0, 1), to: tomorrow, label: 'All time', days: 9999 };
  }
}

/** The matching earlier window, for "compared with". */
export function previousRange(r: Range): Range {
  const span = r.to.getTime() - r.from.getTime();
  return {
    from: new Date(r.from.getTime() - span),
    to: new Date(r.from.getTime()),
    label: 'the period before',
    days: r.days,
  };
}

export const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DOW_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Monday = 0. */
export function dowIndex(value: string | number | Date): number {
  return (d(value).getDay() + 6) % 7;
}

export type PartOfDay = 'Morning' | 'Afternoon' | 'Evening' | 'Night';

export const PARTS_OF_DAY: { key: PartOfDay; label: string; hint: string }[] = [
  { key: 'Morning', label: 'Morning', hint: '5 AM – 12 PM' },
  { key: 'Afternoon', label: 'Afternoon', hint: '12 – 5 PM' },
  { key: 'Evening', label: 'Evening', hint: '5 – 10 PM' },
  { key: 'Night', label: 'Night', hint: '10 PM – 5 AM' },
];

export function partOfDay(hour: number): PartOfDay {
  if (hour >= 5 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 17) return 'Afternoon';
  if (hour >= 17 && hour < 22) return 'Evening';
  return 'Night';
}

export function hourLabel(hour: number): string {
  const h = ((hour + 11) % 12) + 1;
  return `${h} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** "4–6 PM" from a pair of hour numbers. */
export function hourRangeLabel(from: number, to: number): string {
  const suffix = (h: number) => (h < 12 ? 'AM' : 'PM');
  const twelve = (h: number) => ((h + 11) % 12) + 1;
  if (suffix(from) === suffix(to % 24)) return `${twelve(from)}–${twelve(to % 24)} ${suffix(to % 24)}`;
  return `${twelve(from)} ${suffix(from)} – ${twelve(to % 24)} ${suffix(to % 24)}`;
}
