import assert from 'node:assert';
import {
  applyFilters, byDayOfWeek, byHour, byPartOfDay, byPeriod, compareSummaries, direction,
  emptyFilters, helpfulStats, helpfulSentence, patterns, summarise, triggerCounts, weeklySummary,
} from '../src/lib/stats';
import { formatClock, formatDuration, resolveRange, startOfWeek, addDays, uid } from '../src/lib/time';
import { eventsToCsv } from '../src/lib/export';
import type { MomentEvent, Vocab } from '../src/lib/types';

const T = (id: string, name: string): Vocab => ({
  id, family_id: 'f', name, is_default: true, is_pinned: false,
  is_archived: false, sort_order: 0, created_at: '2026-01-01T00:00:00Z',
});

const triggers = [T('t1', 'Homework'), T('t2', 'Tired'), T('t3', 'Noise')];
const helpful = [T('h1', 'Quiet room'), T('h2', 'Break')];

let n = 0;
function ev(opts: Partial<MomentEvent> & { start: Date }): MomentEvent {
  n += 1;
  return {
    id: `e${n}`, family_id: 'f', profile_id: 'p', created_by: 'u1', updated_by: 'u1',
    start_time: opts.start.toISOString(), end_time: null,
    duration_seconds: opts.duration_seconds ?? null, difficulty: opts.difficulty ?? 5,
    description: opts.description ?? null, location: opts.location ?? null, notes: opts.notes ?? null,
    sleep_quality: null, hungry: null, school_day: null, unusual_day: null,
    status: 'complete', version: 1, deleted_at: null,
    created_at: opts.start.toISOString(), updated_at: opts.start.toISOString(),
    trigger_ids: opts.trigger_ids ?? [], helpful_ids: opts.helpful_ids ?? [],
  };
}

const today = new Date();
today.setHours(16, 30, 0, 0);
const at = (daysAgo: number, hour: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d;
};

/* ---------------------------------------------------------------- basics */

assert.equal(formatDuration(45), '45 sec');
assert.equal(formatDuration(720), '12 min');
assert.equal(formatDuration(3900), '1h 05m');
assert.equal(formatDuration(null), '—');
assert.equal(formatClock(61), '01:01');
assert.equal(formatClock(3725), '1:02:05');
assert.match(uid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

/* -------------------------------------------------------------- summary */

const events: MomentEvent[] = [
  ev({ start: at(0, 16), difficulty: 7, duration_seconds: 720, trigger_ids: ['t1'], helpful_ids: ['h2'] }),
  ev({ start: at(0, 14), difficulty: 4, duration_seconds: 300, trigger_ids: ['t2'] }),
  ev({ start: at(1, 17), difficulty: 8, duration_seconds: 900, trigger_ids: ['t1'], helpful_ids: ['h1'] }),
  ev({ start: at(2, 18), difficulty: 6, duration_seconds: 600, trigger_ids: ['t1'], helpful_ids: ['h1'] }),
  ev({ start: at(3, 9), difficulty: 3, trigger_ids: ['t3'], helpful_ids: ['h1'] }),
  ev({ start: at(4, 17), difficulty: 9, duration_seconds: 1500, trigger_ids: ['t1'] }),
];

const s = summarise(events, triggers);
assert.equal(s.count, 6);
assert.equal(s.avgDifficulty, 6.2);                 // (7+4+8+6+3+9)/6 = 6.1666 -> 6.2
assert.equal(s.totalSeconds, 720 + 300 + 900 + 600 + 1500);
assert.equal(s.timedCount, 5);
assert.equal(s.avgSeconds, Math.round(4020 / 5));
assert.equal(s.topTrigger?.name, 'Homework');
assert.equal(s.topTrigger?.count, 4);

const empty = summarise([], triggers);
assert.equal(empty.count, 0);
assert.equal(empty.avgDifficulty, null);
assert.equal(empty.avgSeconds, null);
assert.equal(empty.topTrigger, null);

/* ------------------------------------------------------------- triggers */

const ts = triggerCounts(events, triggers);
assert.equal(ts[0].name, 'Homework');
assert.equal(ts[0].count, 4);
assert.equal(ts[0].avgDifficulty, 7.5);             // 7, 8, 6, 9
assert.equal(ts[0].avgSeconds, Math.round((720 + 900 + 600 + 1500) / 4));
assert.equal(ts[0].topHelpful, 'h1');               // quiet room recorded twice with homework
assert.equal(ts.find((t) => t.name === 'Noise')?.avgSeconds, null);

/* ------------------------------------------------------------ groupings */

const hours = byHour(events);
assert.equal(hours.reduce((a, b) => a + b.count, 0), 6);
assert.equal(hours[17].count, 2);

const parts = byPartOfDay(events);
assert.equal(parts.find((p) => p.key === 'Morning')?.count, 1);
assert.equal(parts.find((p) => p.key === 'Evening')?.count, 3);
assert.equal(parts.reduce((a, b) => a + b.count, 0), 6);

assert.equal(byDayOfWeek(events).reduce((a, b) => a + b.count, 0), 6);

const range7 = resolveRange('7d');
const daily = byPeriod(events, range7.from, range7.to, 'day');
assert.equal(daily.length, 7, 'seven day buckets');
assert.equal(daily[daily.length - 1].count, 2, 'two moments today');
assert.equal(daily.reduce((a, b) => a + b.count, 0), 6);

/* -------------------------------------------------------- what helped */

const many: MomentEvent[] = [
  ...events,
  ev({ start: at(5, 16), difficulty: 5, duration_seconds: 300, helpful_ids: ['h1'] }),
  ev({ start: at(6, 16), difficulty: 5, duration_seconds: 240, helpful_ids: ['h1'] }),
];
const hs = helpfulStats(many, helpful);
const quiet = hs.find((h) => h.name === 'Quiet room');
assert.ok(quiet, 'quiet room reported once recorded 3+ times');
assert.equal(quiet!.count, 5);
const sentence = helpfulSentence(quiet!);
assert.ok(sentence && /tended to|was recorded/.test(sentence), 'descriptive wording');
assert.ok(!/cause|fix|improve|prove/i.test(sentence!), 'no causal claim: ' + sentence);
// Recorded fewer than three times: not described at all.
assert.equal(hs.find((h) => h.name === 'Break'), undefined);

/* ------------------------------------------------------------ direction */

assert.equal(direction(10, 5), 'up');
assert.equal(direction(5, 10), 'down');
assert.equal(direction(10, 10), 'flat');
assert.equal(direction(10, null), 'none');
assert.equal(direction(0, 0), 'flat');
assert.equal(direction(101, 100), 'flat', 'a 1% change is not a trend');

const cmp = compareSummaries(summarise(events, triggers), summarise([], triggers));
assert.equal(cmp.length, 4);
assert.equal(cmp[0].label, 'Moments recorded');
assert.equal(cmp[1].format(6.2), '6.2/10');
assert.equal(cmp[3].format(null), '—');

/* -------------------------------------------------------------- filters */

const lookup = {
  trigger: (id: string) => triggers.find((t) => t.id === id)?.name ?? '',
  helpful: (id: string) => helpful.find((t) => t.id === id)?.name ?? '',
};
assert.equal(applyFilters(events, emptyFilters, lookup).length, 6);
assert.equal(applyFilters(events, { ...emptyFilters, difficultyMin: 7 }, lookup).length, 3);
assert.equal(applyFilters(events, { ...emptyFilters, triggerIds: ['t1'] }, lookup).length, 4);
// A moment with no recorded duration is not claimed to be short.
assert.equal(applyFilters(events, { ...emptyFilters, durationMax: 600 }, lookup).length, 2);
assert.equal(applyFilters(events, { ...emptyFilters, durationMin: 900 }, lookup).length, 2);
assert.equal(applyFilters(events, { ...emptyFilters, search: 'homework' }, lookup).length, 4);
assert.equal(applyFilters(events, { ...emptyFilters, search: 'nothing here' }, lookup).length, 0);

/* ------------------------------------------------------------- patterns */

const lines = patterns(events, triggers, resolveRange('7d'), []);
assert.ok(lines.length > 0, 'produces observations');
lines.forEach((line) => {
  assert.ok(!/caused|because|diagnos|disorder|symptom|behaviour problem/i.test(line), 'neutral: ' + line);
});
assert.ok(lines.some((l) => /Homework was recorded as a trigger 4 times/.test(l)), lines.join(' | '));
assert.equal(patterns(events.slice(0, 2), triggers, resolveRange('7d'), []).length, 0, 'stays quiet on thin data');

/* -------------------------------------------------- weekly summary */

const weekStart = startOfWeek(new Date());
const thisWeek = [
  ev({ start: new Date(weekStart.getTime() + 36e5 * 17), difficulty: 6, duration_seconds: 600, trigger_ids: ['t1'] }),
  ev({ start: new Date(weekStart.getTime() + 36e5 * 41), difficulty: 4, duration_seconds: 300, trigger_ids: ['t1'] }),
];
const lastWeek = [ev({ start: addDays(weekStart, -3), difficulty: 8, duration_seconds: 900, trigger_ids: ['t2'] })];
const ws = weeklySummary([...thisWeek, ...lastWeek], triggers, new Date());
assert.equal(ws.summary.count, 2);
assert.equal(ws.previous.count, 1);
assert.equal(ws.summary.avgDifficulty, 5);
assert.equal(ws.topTriggers[0].name, 'Homework');

/* ------------------------------------------------------------------ csv */

const csv = eventsToCsv(events.slice(0, 2), { ...lookup, person: () => 'Dad' });
const rows = csv.trim().split('\r\n');
assert.equal(rows.length, 3, 'header plus two rows');
assert.ok(rows[0].includes('Difficulty (1-10)'));
assert.ok(rows[1].includes('Dad'));
const quoted = eventsToCsv(
  [ev({ start: at(0, 10), notes: 'He said "no", loudly\nthen calmed' })],
  { ...lookup, person: () => 'Mum' }
);
assert.ok(quoted.includes('"He said ""no"", loudly'), 'quotes and newlines escaped');

console.log('all logic checks passed');
