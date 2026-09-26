/**
 * Preview mode.
 *
 * When no database is configured, Moments can run on invented sample data so
 * the app can be walked through before anything is set up. Nothing here ever
 * leaves the device: there is no account, no sync, no network call at all.
 *
 * This is deliberately separate from the real app's data path - it seeds the
 * same local cache the real app uses, then stays out of the way.
 */

import { prefs } from './local';
import { addDays, startOfDay, uid } from './time';
import type { AppUser, ChildProfile, Family, FamilyMember, MomentEvent, Vocab } from './types';

export const DEMO_FAMILY = '00000000-0000-4000-8000-000000000001';
export const DEMO_PROFILE = '00000000-0000-4000-8000-000000000002';
export const DEMO_ME = '00000000-0000-4000-8000-000000000003';
export const DEMO_OTHER = '00000000-0000-4000-8000-000000000004';

/** Set at build time for the hosted preview; otherwise the person opts in. */
const BUILT_AS_PREVIEW = import.meta.env.VITE_DEMO === '1';

export function previewActive(configured: boolean): boolean {
  if (configured) return false;
  return BUILT_AS_PREVIEW || prefs.get('preview', false);
}

export function enterPreview(): void {
  prefs.set('preview', true);
}

/* --------------------------------------------------------------- the seed */

const TRIGGER_NAMES = [
  'Homework', 'School', 'Hunger', 'Tired', 'Noise', 'Change of plans',
  'Screen time ending', 'Argument', 'Frustration', 'Waiting',
  'Social situation', 'Overwhelmed', 'Unknown', 'Other',
];

const HELPFUL_NAMES = [
  'Quiet room', 'Break', 'Talking', 'Food', 'Music', 'Going outside',
  'Changing activity', 'Hug', 'Time alone', 'Deep breaths', 'Water', 'Other',
];

const vocab = (name: string, i: number, pinned = false): Vocab => ({
  id: `v-${name.toLowerCase().replace(/\W+/g, '-')}`,
  family_id: DEMO_FAMILY,
  name,
  is_default: true,
  is_pinned: pinned,
  is_archived: false,
  sort_order: i,
  created_at: new Date(2026, 0, 1).toISOString(),
});

export const demoTriggers: Vocab[] = TRIGGER_NAMES.map((n, i) => vocab(n, i, n === 'Homework'));
export const demoHelpful: Vocab[] = HELPFUL_NAMES.map((n, i) => vocab(n, i, n === 'Quiet room'));

export const demoPeople: Record<string, AppUser> = {
  [DEMO_ME]: { id: DEMO_ME, email: 'you@example.com', display_name: 'You', avatar_hue: 210 },
  [DEMO_OTHER]: { id: DEMO_OTHER, email: null, display_name: 'Alex', avatar_hue: 28 },
};

export const demoFamily: Family = {
  id: DEMO_FAMILY,
  name: 'Sample family',
  owner_id: DEMO_ME,
  created_at: new Date(2026, 0, 1).toISOString(),
};

export const demoProfiles: ChildProfile[] = [{
  id: DEMO_PROFILE,
  family_id: DEMO_FAMILY,
  name: 'Sam',
  colour_hue: 210,
  birth_year: null,
  is_archived: false,
  sort_order: 0,
}];

const member = (userId: string, owner: boolean): FamilyMember => ({
  id: `m-${userId}`,
  family_id: DEMO_FAMILY,
  user_id: userId,
  role: owner ? 'owner' : 'member',
  can_view: true,
  can_add: true,
  can_edit: true,
  can_delete: owner,
  can_view_stats: true,
  can_manage_members: owner,
  joined_at: new Date(2026, 0, 1).toISOString(),
});

export const demoMembers: FamilyMember[] = [member(DEMO_ME, true), member(DEMO_OTHER, false)];

/* ------------------------------------------------------------ the moments */

/** A small deterministic generator, so the sample reads the same every time. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const DESCRIPTIONS = [
  'Asked to stop the game and start homework.',
  'Maths worksheet had a question he had not seen before.',
  'Plans changed at the last minute.',
  'Long day, came home already tired.',
  'The room was loud and busy.',
  'Waiting for his turn took longer than expected.',
  'Got stuck halfway through and did not want help.',
  'Hungry before dinner was ready.',
  '',
  '',
];

const NOTES = [
  'Settled once the room was quiet.',
  'Wanted company but not conversation.',
  'Came back to it himself after a while.',
  'Easier once he had eaten.',
  '',
  '',
  '',
];

const DAYS = 48;

export function buildDemoEvents(now = new Date()): MomentEvent[] {
  const rand = rng(20260921);
  const events: MomentEvent[] = [];
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];

  // Triggers are not evenly likely - a family's record is lumpy.
  const weightedTrigger = () => {
    const r = rand();
    if (r < 0.26) return 'Homework';
    if (r < 0.44) return 'Tired';
    if (r < 0.58) return 'Change of plans';
    if (r < 0.68) return 'Noise';
    if (r < 0.76) return 'Screen time ending';
    if (r < 0.83) return 'Hunger';
    if (r < 0.89) return 'Waiting';
    if (r < 0.94) return 'Frustration';
    return pick(['School', 'Overwhelmed', 'Social situation', 'Unknown']);
  };

  const idOf = (list: Vocab[], name: string) => list.find((v) => v.name === name)!.id;

  for (let dayOffset = DAYS; dayOffset >= 0; dayOffset -= 1) {
    const day = startOfDay(addDays(now, -dayOffset));
    const weekend = day.getDay() === 0 || day.getDay() === 6;

    const roll = rand();
    let count = roll < 0.34 ? 0 : roll < 0.66 ? 1 : roll < 0.88 ? 2 : 3;
    if (weekend && count > 1) count -= 1;
    // Today always has something, so the home screen shows its real self.
    if (dayOffset === 0 && count === 0) count = 2;

    for (let i = 0; i < count; i += 1) {
      // Most often late afternoon, some mornings before school.
      const r = rand();
      const hour = r < 0.14 ? 7 : r < 0.24 ? 12 : r < 0.72 ? 16 + Math.floor(rand() * 3) : 19 + Math.floor(rand() * 2);
      const start = new Date(day);
      start.setHours(hour, Math.floor(rand() * 60), 0, 0);

      if (dayOffset === 0) {
        // Today is only as long as it has been so far. Place these in the hours
        // just gone, so the home screen has something whatever time it is.
        const minutesAgo = 6 + rand() * 300;
        const recent = new Date(now.getTime() - minutesAgo * 60_000);
        start.setTime(Math.max(day.getTime(), recent.getTime()));
      }
      if (start.getTime() > now.getTime()) continue;

      // A gentle drift downwards over the period, so comparisons have something
      // to describe. It is sample data, not a claim about anything.
      const drift = (dayOffset / DAYS) * 1.6;
      const difficulty = Math.max(1, Math.min(10, Math.round(3.6 + drift + rand() * 4)));

      const timed = rand() > 0.18;
      const minutes = Math.max(2, Math.round(difficulty * 1.7 + rand() * 8 - 3));

      const triggerNames = [weightedTrigger()];
      if (rand() < 0.28) {
        const second = weightedTrigger();
        if (second !== triggerNames[0]) triggerNames.push(second);
      }

      const helpfulNames: string[] = [];
      if (rand() < 0.72) {
        // Quiet room and breaks are the family's habit here, so they recur.
        const r2 = rand();
        helpfulNames.push(r2 < 0.34 ? 'Quiet room' : r2 < 0.58 ? 'Break' : r2 < 0.72 ? 'Talking' : pick(HELPFUL_NAMES));
        if (rand() < 0.22) helpfulNames.push(pick(['Food', 'Music', 'Going outside', 'Hug', 'Water']));
      }

      const createdBy = rand() < 0.62 ? DEMO_ME : DEMO_OTHER;
      const created = new Date(start.getTime() + 1000 * 60 * (5 + Math.floor(rand() * 40)));

      events.push({
        id: uid(),
        family_id: DEMO_FAMILY,
        profile_id: DEMO_PROFILE,
        created_by: createdBy,
        updated_by: createdBy,
        start_time: start.toISOString(),
        end_time: timed ? new Date(start.getTime() + minutes * 60000).toISOString() : null,
        duration_seconds: timed ? minutes * 60 : null,
        difficulty,
        description: pick(DESCRIPTIONS) || null,
        location: pick(['Home', 'Home', 'Home', 'School', 'Car', 'Outside', 'Family/Friends']),
        notes: rand() < 0.3 ? pick(NOTES) || null : null,
        sleep_quality: rand() < 0.3 ? pick(['poor', 'okay', 'good'] as const) : null,
        hungry: rand() < 0.22 ? pick(['yes', 'no', 'unknown'] as const) : null,
        school_day: weekend ? false : true,
        unusual_day: rand() < 0.1 ? true : null,
        status: 'complete',
        version: 1,
        deleted_at: null,
        created_at: created.toISOString(),
        updated_at: created.toISOString(),
        trigger_ids: [...new Set(triggerNames)].map((n) => idOf(demoTriggers, n)),
        helpful_ids: [...new Set(helpfulNames)].map((n) => idOf(demoHelpful, n)),
      });
    }
  }

  return events;
}
