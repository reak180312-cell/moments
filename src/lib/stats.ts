/**
 * Everything the Insights, Reports and Summary screens read.
 *
 * House rules for anything that produces words here:
 *   - describe what was recorded, never what it means;
 *   - "tended to", "was recorded", never "caused", "improved", "fixed";
 *   - no metric is labelled good or bad, only higher, lower or similar.
 */

import {
  DOW_LABELS, dayKey, dowIndex, formatDuration, hourRangeLabel, partOfDay,
  startOfDay, addDays, startOfWeek, startOfMonth, addMonths, previousRange,
  type PartOfDay, type Range,
} from './time';
import type { MomentEvent, Vocab } from './types';

export interface Summary {
  count: number;
  avgDifficulty: number | null;
  totalSeconds: number;
  avgSeconds: number | null;
  timedCount: number;
  topTrigger: { id: string; name: string; count: number } | null;
}

export function inRange(events: MomentEvent[], from: Date, to: Date): MomentEvent[] {
  const a = from.getTime();
  const b = to.getTime();
  return events.filter((e) => {
    const t = new Date(e.start_time).getTime();
    return t >= a && t < b;
  });
}

export function forRange(events: MomentEvent[], range: Range): MomentEvent[] {
  return inRange(events, range.from, range.to);
}

/** The same span, immediately before this one - for "compared with". */
export function previousRangeEvents(events: MomentEvent[], range: Range): MomentEvent[] {
  const before = previousRange(range);
  return inRange(events, before.from, before.to);
}

export function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function round1(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

export function summarise(events: MomentEvent[], triggers: Vocab[]): Summary {
  const difficulties = events.map((e) => e.difficulty).filter((d): d is number => typeof d === 'number');
  const durations = events.map((e) => e.duration_seconds).filter((d): d is number => typeof d === 'number' && d > 0);
  const counts = triggerCounts(events, triggers);
  return {
    count: events.length,
    avgDifficulty: round1(mean(difficulties)),
    totalSeconds: durations.reduce((a, b) => a + b, 0),
    avgSeconds: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    timedCount: durations.length,
    topTrigger: counts[0] ? { id: counts[0].id, name: counts[0].name, count: counts[0].count } : null,
  };
}

/* ------------------------------------------------------------- groupings */

export interface DayBucket { key: string; date: Date; count: number; avgDifficulty: number | null; totalSeconds: number }

export function byDay(events: MomentEvent[], from: Date, to: Date): DayBucket[] {
  const buckets = new Map<string, MomentEvent[]>();
  let cursor = startOfDay(from);
  const end = to.getTime();
  while (cursor.getTime() < end) {
    buckets.set(dayKey(cursor), []);
    cursor = addDays(cursor, 1);
  }
  events.forEach((e) => {
    const k = dayKey(e.start_time);
    if (buckets.has(k)) buckets.get(k)!.push(e);
  });
  return [...buckets.entries()].map(([key, list]) => ({
    key,
    date: new Date(key + 'T00:00:00'),
    count: list.length,
    avgDifficulty: round1(mean(list.map((e) => e.difficulty ?? NaN).filter((n) => !Number.isNaN(n)))),
    totalSeconds: list.reduce((sum, e) => sum + (e.duration_seconds ?? 0), 0),
  }));
}

/** Weekly or monthly buckets, for ranges too long to read a day at a time. */
export function byPeriod(
  events: MomentEvent[], from: Date, to: Date, grain: 'day' | 'week' | 'month'
): DayBucket[] {
  if (grain === 'day') return byDay(events, from, to);
  const step = (dt: Date) => (grain === 'week' ? startOfWeek(dt) : startOfMonth(dt));
  const next = (dt: Date) => (grain === 'week' ? addDays(dt, 7) : addMonths(dt, 1));
  const buckets = new Map<string, MomentEvent[]>();
  let cursor = step(from);
  while (cursor.getTime() < to.getTime()) {
    buckets.set(dayKey(cursor), []);
    cursor = next(cursor);
  }
  events.forEach((e) => {
    const k = dayKey(step(new Date(e.start_time)));
    if (buckets.has(k)) buckets.get(k)!.push(e);
  });
  return [...buckets.entries()].map(([key, list]) => ({
    key,
    date: new Date(key + 'T00:00:00'),
    count: list.length,
    avgDifficulty: round1(mean(list.map((e) => e.difficulty ?? NaN).filter((n) => !Number.isNaN(n)))),
    totalSeconds: list.reduce((sum, e) => sum + (e.duration_seconds ?? 0), 0),
  }));
}

export function grainFor(days: number): 'day' | 'week' | 'month' {
  if (days <= 31) return 'day';
  if (days <= 200) return 'week';
  return 'month';
}

export function byHour(events: MomentEvent[]): { hour: number; count: number }[] {
  const out = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  events.forEach((e) => { out[new Date(e.start_time).getHours()].count += 1; });
  return out;
}

export function byPartOfDay(events: MomentEvent[]): { key: PartOfDay; count: number }[] {
  const order: PartOfDay[] = ['Morning', 'Afternoon', 'Evening', 'Night'];
  const counts = new Map<PartOfDay, number>(order.map((k) => [k, 0]));
  events.forEach((e) => {
    const k = partOfDay(new Date(e.start_time).getHours());
    counts.set(k, (counts.get(k) ?? 0) + 1);
  });
  return order.map((key) => ({ key, count: counts.get(key) ?? 0 }));
}

export function byDayOfWeek(events: MomentEvent[]): { label: string; index: number; count: number; avgDifficulty: number | null }[] {
  const groups: MomentEvent[][] = Array.from({ length: 7 }, () => []);
  events.forEach((e) => groups[dowIndex(e.start_time)].push(e));
  return groups.map((list, index) => ({
    label: DOW_LABELS[index],
    index,
    count: list.length,
    avgDifficulty: round1(mean(list.map((e) => e.difficulty ?? NaN).filter((n) => !Number.isNaN(n)))),
  }));
}

/* -------------------------------------------------------------- triggers */

export interface TriggerStat {
  id: string;
  name: string;
  count: number;
  avgDifficulty: number | null;
  avgSeconds: number | null;
  peakHour: number | null;
  topHelpful: string | null;
}

export function triggerCounts(events: MomentEvent[], triggers: Vocab[]): TriggerStat[] {
  const byId = new Map<string, MomentEvent[]>();
  events.forEach((e) => e.trigger_ids.forEach((id) => {
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id)!.push(e);
  }));

  const stats: TriggerStat[] = [];
  byId.forEach((list, id) => {
    const trigger = triggers.find((t) => t.id === id);
    const hours = byHour(list);
    const peak = hours.reduce((best, h) => (h.count > best.count ? h : best), { hour: 0, count: 0 });
    const helpfulTally = new Map<string, number>();
    list.forEach((e) => e.helpful_ids.forEach((h) => helpfulTally.set(h, (helpfulTally.get(h) ?? 0) + 1)));
    const topHelpful = [...helpfulTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const durations = list.map((e) => e.duration_seconds).filter((d): d is number => typeof d === 'number' && d > 0);
    stats.push({
      id,
      name: trigger?.name ?? 'Trigger',
      count: list.length,
      avgDifficulty: round1(mean(list.map((e) => e.difficulty ?? NaN).filter((n) => !Number.isNaN(n)))),
      avgSeconds: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      peakHour: peak.count > 0 ? peak.hour : null,
      topHelpful,
    });
  });
  return stats.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/* -------------------------------------------------------- what was helpful */

export interface HelpfulStat {
  id: string;
  name: string;
  count: number;
  avgSeconds: number | null;
  avgDifficulty: number | null;
  /** How this compares with moments where it was not recorded. Descriptive only. */
  durationDeltaSeconds: number | null;
  difficultyDelta: number | null;
}

export function helpfulStats(events: MomentEvent[], helpful: Vocab[]): HelpfulStat[] {
  const withAny = events.filter((e) => e.helpful_ids.length > 0);
  const out: HelpfulStat[] = [];

  helpful.forEach((action) => {
    const withIt = withAny.filter((e) => e.helpful_ids.includes(action.id));
    if (withIt.length < 3) return;                     // too few to describe
    const withoutIt = withAny.filter((e) => !e.helpful_ids.includes(action.id));

    const dur = (list: MomentEvent[]) =>
      mean(list.map((e) => e.duration_seconds).filter((d): d is number => typeof d === 'number' && d > 0));
    const diff = (list: MomentEvent[]) =>
      mean(list.map((e) => e.difficulty).filter((d): d is number => typeof d === 'number'));

    const a = dur(withIt);
    const b = dur(withoutIt);
    const da = diff(withIt);
    const db = diff(withoutIt);

    out.push({
      id: action.id,
      name: action.name,
      count: withIt.length,
      avgSeconds: a === null ? null : Math.round(a),
      avgDifficulty: round1(da),
      durationDeltaSeconds: a !== null && b !== null ? Math.round(a - b) : null,
      difficultyDelta: da !== null && db !== null ? round1(da - db) : null,
    });
  });

  return out.sort((a, b) => b.count - a.count);
}

/** Careful wording: an observation about what was recorded, not a claim. */
export function helpfulSentence(stat: HelpfulStat): string | null {
  if (stat.durationDeltaSeconds !== null && Math.abs(stat.durationDeltaSeconds) >= 60) {
    const shorter = stat.durationDeltaSeconds < 0;
    return `Moments where “${stat.name}” was recorded tended to be ${shorter ? 'shorter' : 'longer'} — around ${formatDuration(stat.avgSeconds ?? 0)} on average.`;
  }
  if (stat.difficultyDelta !== null && Math.abs(stat.difficultyDelta) >= 0.5) {
    const lower = stat.difficultyDelta < 0;
    return `Moments where “${stat.name}” was recorded tended to have a ${lower ? 'lower' : 'higher'} recorded difficulty — around ${stat.avgDifficulty}/10.`;
  }
  return `“${stat.name}” was recorded ${stat.count} time${stat.count === 1 ? '' : 's'}.`;
}

/* ------------------------------------------------------------ comparisons */

export type Direction = 'up' | 'down' | 'flat' | 'none';

export interface Comparison {
  label: string;
  current: number | null;
  previous: number | null;
  direction: Direction;
  format: (value: number | null) => string;
}

export function direction(current: number | null, previous: number | null, tolerance = 0.08): Direction {
  if (current === null || previous === null) return 'none';
  if (previous === 0 && current === 0) return 'flat';
  const base = Math.abs(previous) || 1;
  const change = (current - previous) / base;
  if (Math.abs(change) < tolerance) return 'flat';
  return change > 0 ? 'up' : 'down';
}

export const directionSymbol: Record<Direction, string> = {
  up: '↑', down: '↓', flat: '→', none: '·',
};

export const directionWord: Record<Direction, string> = {
  up: 'higher', down: 'lower', flat: 'about the same', none: 'no comparison',
};

export function compareSummaries(current: Summary, previous: Summary): Comparison[] {
  const asCount = (v: number | null) => (v === null ? '—' : String(v));
  const asScore = (v: number | null) => (v === null ? '—' : `${v}/10`);
  const asTime = (v: number | null) => (v === null ? '—' : formatDuration(v));
  return [
    { label: 'Moments recorded', current: current.count, previous: previous.count, direction: direction(current.count, previous.count), format: asCount },
    { label: 'Average difficulty', current: current.avgDifficulty, previous: previous.avgDifficulty, direction: direction(current.avgDifficulty, previous.avgDifficulty, 0.05), format: asScore },
    { label: 'Total time', current: current.totalSeconds, previous: previous.totalSeconds, direction: direction(current.totalSeconds, previous.totalSeconds), format: asTime },
    { label: 'Average length', current: current.avgSeconds, previous: previous.avgSeconds, direction: direction(current.avgSeconds, previous.avgSeconds), format: asTime },
  ];
}

/* --------------------------------------------------------------- patterns */

/** Plain observations about what is in the record. Nothing diagnostic. */
export function patterns(events: MomentEvent[], triggers: Vocab[], range: Range, previous?: MomentEvent[]): string[] {
  const out: string[] = [];
  const list = forRange(events, range);
  if (list.length < 3) return out;

  const counts = triggerCounts(list, triggers);
  if (counts[0] && counts[0].count >= 3) {
    out.push(`${counts[0].name} was recorded as a trigger ${counts[0].count} time${counts[0].count === 1 ? '' : 's'} in ${range.label.toLowerCase()}.`);
  }

  const hours = byHour(list);
  let bestStart = 0;
  let bestSum = 0;
  for (let h = 0; h < 21; h += 1) {
    const sum = hours[h].count + hours[h + 1].count + hours[h + 2].count;
    if (sum > bestSum) { bestSum = sum; bestStart = h; }
  }
  if (bestSum >= Math.max(3, list.length * 0.35)) {
    out.push(`Most recorded moments in ${range.label.toLowerCase()} happened between ${hourRangeLabel(bestStart, bestStart + 3)}.`);
  }

  const dows = byDayOfWeek(list);
  const topDow = [...dows].sort((a, b) => b.count - a.count)[0];
  if (topDow && topDow.count >= 3 && topDow.count >= list.length * 0.3) {
    out.push(`${DOW_LABELS[topDow.index]} had the most recorded moments (${topDow.count}).`);
  }

  if (previous?.length) {
    const now = summarise(list, triggers);
    const before = summarise(previous, triggers);
    if (now.avgDifficulty !== null && before.avgDifficulty !== null
        && Math.abs(now.avgDifficulty - before.avgDifficulty) >= 0.4) {
      out.push(`Average recorded difficulty changed from ${before.avgDifficulty} to ${now.avgDifficulty} compared with the period before.`);
    }
    if (Math.abs(now.count - before.count) >= 2) {
      const fewer = now.count < before.count;
      out.push(`${Math.abs(now.count - before.count)} ${fewer ? 'fewer' : 'more'} moments were recorded than in the period before.`);
    }
  }

  const durations = list.filter((e) => (e.duration_seconds ?? 0) > 0);
  if (durations.length >= 3) {
    const avg = mean(durations.map((e) => e.duration_seconds!));
    out.push(`Recorded moments lasted about ${formatDuration(Math.round(avg ?? 0))} on average.`);
  }

  return out.slice(0, 5);
}

/* -------------------------------------------------------- weekly summary */

export interface WeeklySummary {
  weekStart: Date;
  summary: Summary;
  previous: Summary;
  topTriggers: TriggerStat[];
  peakWindow: string | null;
  comparisons: Comparison[];
}

export function weeklySummary(events: MomentEvent[], triggers: Vocab[], now = new Date()): WeeklySummary {
  const weekStart = startOfWeek(now);
  const weekEnd = addDays(weekStart, 7);
  const prevStart = addDays(weekStart, -7);

  const thisWeek = inRange(events, weekStart, weekEnd);
  const lastWeek = inRange(events, prevStart, weekStart);

  const hours = byHour(thisWeek);
  let bestStart = -1;
  let bestSum = 0;
  for (let h = 0; h < 22; h += 1) {
    const sum = hours[h].count + hours[h + 1].count;
    if (sum > bestSum) { bestSum = sum; bestStart = h; }
  }

  const summary = summarise(thisWeek, triggers);
  const previous = summarise(lastWeek, triggers);

  return {
    weekStart,
    summary,
    previous,
    topTriggers: triggerCounts(thisWeek, triggers).slice(0, 3),
    peakWindow: bestSum >= 2 && bestStart >= 0 ? hourRangeLabel(bestStart, bestStart + 2) : null,
    comparisons: compareSummaries(summary, previous),
  };
}

/* ------------------------------------------------------------- filtering */

export interface EventFilters {
  search: string;
  difficultyMin: number;
  difficultyMax: number;
  triggerIds: string[];
  helpfulIds: string[];
  locations: string[];
  createdBy: string[];
  durationMin: number | null;   // seconds
  durationMax: number | null;
}

export const emptyFilters: EventFilters = {
  search: '', difficultyMin: 1, difficultyMax: 10,
  triggerIds: [], helpfulIds: [], locations: [], createdBy: [],
  durationMin: null, durationMax: null,
};

export function filtersActive(f: EventFilters): number {
  let n = 0;
  if (f.difficultyMin > 1 || f.difficultyMax < 10) n += 1;
  if (f.triggerIds.length) n += 1;
  if (f.helpfulIds.length) n += 1;
  if (f.locations.length) n += 1;
  if (f.createdBy.length) n += 1;
  if (f.durationMin !== null || f.durationMax !== null) n += 1;
  return n;
}

export function applyFilters(
  events: MomentEvent[], f: EventFilters, lookup: { trigger: (id: string) => string; helpful: (id: string) => string }
): MomentEvent[] {
  const term = f.search.trim().toLowerCase();
  return events.filter((e) => {
    if (e.difficulty !== null && (e.difficulty < f.difficultyMin || e.difficulty > f.difficultyMax)) return false;
    if (e.difficulty === null && (f.difficultyMin > 1 || f.difficultyMax < 10)) return false;
    if (f.triggerIds.length && !f.triggerIds.some((id) => e.trigger_ids.includes(id))) return false;
    if (f.helpfulIds.length && !f.helpfulIds.some((id) => e.helpful_ids.includes(id))) return false;
    if (f.locations.length && !(e.location && f.locations.includes(e.location))) return false;
    if (f.createdBy.length && !f.createdBy.includes(e.created_by)) return false;
    if (f.durationMin !== null && (e.duration_seconds ?? 0) < f.durationMin) return false;
    if (f.durationMax !== null && (e.duration_seconds ?? Number.MAX_SAFE_INTEGER) > f.durationMax) return false;
    if (term) {
      const hay = [
        e.description ?? '', e.notes ?? '', e.location ?? '',
        ...e.trigger_ids.map(lookup.trigger),
        ...e.helpful_ids.map(lookup.helpful),
      ].join(' ').toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });
}
