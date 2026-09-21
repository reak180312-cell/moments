/**
 * A live test of the GitHub backend, against a real repository.
 *
 * Not part of `npm test` - it needs a token and it writes to GitHub. Run with:
 *   GH_TOKEN=$(gh auth token) GH_OWNER=<you> GH_REPO=moments-data npm run test:github
 *
 * It finishes by erasing what it wrote and re-seeding the repository, so the
 * record is left clean and ready to use.
 */

import assert from 'node:assert';
import * as gh from '../src/lib/github';
import { uid } from '../src/lib/time';
import type { MomentEvent } from '../src/lib/types';

const token = process.env.GH_TOKEN;
const owner = process.env.GH_OWNER;
const repo = process.env.GH_REPO ?? 'moments-data';

if (!token || !owner) {
  console.error('Set GH_TOKEN and GH_OWNER.');
  process.exit(1);
}

const cfg: gh.GhConfig = { owner, repo, token };

function makeEvent(actor: string, over: Partial<MomentEvent> = {}): MomentEvent {
  const now = new Date().toISOString();
  return {
    id: uid(),
    family_id: 'test',
    profile_id: 'test',
    created_by: actor,
    updated_by: actor,
    start_time: now,
    end_time: null,
    duration_seconds: 600,
    difficulty: 5,
    description: 'Self-test record',
    location: 'Home',
    notes: null,
    sleep_quality: null,
    hungry: null,
    school_day: null,
    unusual_day: null,
    status: 'complete',
    version: 1,
    deleted_at: null,
    created_at: now,
    updated_at: now,
    trigger_ids: [],
    helpful_ids: [],
    ...over,
  };
}

async function main() {
  const step = (n: string) => console.log(`  · ${n}`);

  console.log('identity');
  const me = await gh.whoAmI(cfg);
  assert.ok(me.id.startsWith('gh:'), 'identity looks like gh:<login>');
  step(`signed in as ${me.login}`);

  console.log('bootstrap');
  await gh.bootstrap(cfg, me, 'Self test family', 'Test child');
  const first = await gh.pullAll(cfg);
  assert.ok(first.family, 'family record exists');
  assert.ok(first.triggers.length >= 14, `starting triggers seeded (${first.triggers.length})`);
  assert.ok(first.helpful.length >= 12, 'starting helpful responses seeded');
  assert.ok(first.members.some((m) => m.user_id === me.id), 'connecting account is a member');
  assert.ok(first.profiles.length >= 1, 'a child profile exists');
  step(`family "${first.family!.name}" with ${first.triggers.length} triggers`);

  console.log('saving a moment');
  const event = makeEvent(me.id, { trigger_ids: [first.triggers[0].id] });
  const saved = await gh.saveEvent(cfg, event, null, me.id);
  assert.equal(saved.status, 'ok');
  assert.equal(saved.event.version, 1, 'a new moment starts at version 1');
  step(`stored ${saved.event.id}`);

  console.log('replaying the same queued write');
  const replay = await gh.saveEvent(cfg, event, null, me.id);
  assert.equal(replay.status, 'ok');
  assert.equal(replay.event.version, 1, 'a replay does not bump the version');
  const afterReplay = await gh.pullAll(cfg);
  assert.equal(
    afterReplay.events.filter((e) => e.id === event.id).length, 1,
    'a replayed write never creates a second copy'
  );
  step('one copy, not two');

  console.log('editing it');
  const edited = await gh.saveEvent(cfg, { ...saved.event, difficulty: 8 }, 1, me.id);
  assert.equal(edited.status, 'ok');
  assert.equal(edited.event.version, 2);
  assert.equal(edited.event.difficulty, 8);
  step('version 1 -> 2');

  console.log('a second device editing from a stale version');
  const stale = await gh.saveEvent(cfg, { ...saved.event, difficulty: 3 }, 1, me.id);
  assert.equal(stale.status, 'conflict', 'a stale edit is refused, not applied');
  assert.equal(stale.event.difficulty, 8, 'and it hands back what the record actually holds');
  assert.equal(stale.event.version, 2);
  step('conflict surfaced with both sides intact');

  console.log('history');
  const history = await gh.getHistory(cfg, saved.event);
  assert.ok(history.length >= 2, `created and updated are both recorded (${history.length})`);
  assert.equal(history[0].action, 'created');
  assert.ok(
    history.some((h) => h.changes.some((c) => c.field === 'difficulty' && c.from === 5 && c.to === 8)),
    'the difficulty change is described'
  );
  step(history.map((h) => h.action).join(' -> '));

  console.log('two devices writing at the same moment');
  const a = makeEvent(me.id, { description: 'Device A' });
  const b = makeEvent(me.id, { description: 'Device B' });
  const [ra, rb] = await Promise.all([
    gh.saveEvent(cfg, a, null, me.id),
    gh.saveEvent(cfg, b, null, me.id),
  ]);
  assert.equal(ra.status, 'ok');
  assert.equal(rb.status, 'ok');
  const both = await gh.pullAll(cfg);
  assert.ok(both.events.some((e) => e.id === a.id), 'the first survived');
  assert.ok(both.events.some((e) => e.id === b.id), 'and so did the second');
  step('simultaneous writes both kept');

  console.log('deleting and restoring');
  const removed = await gh.deleteEvent(cfg, event.id, event.created_at, 2, me.id);
  assert.ok(removed && removed.status === 'ok');
  assert.ok(removed.event.deleted_at, 'a delete is recorded, not erased');
  const afterDelete = await gh.pullAll(cfg);
  assert.ok(
    afterDelete.events.find((e) => e.id === event.id)?.deleted_at,
    'other devices can see that it was deleted'
  );
  const restored = await gh.restoreEvent(cfg, event.id, event.created_at, me.id);
  assert.ok(restored && !restored.deleted_at, 'and it can be brought back');
  step('deleted, then restored');

  console.log('custom trigger');
  const custom = {
    id: uid(), family_id: first.family!.id, name: `Self test ${Date.now()}`,
    is_default: false, is_pinned: false, is_archived: false, sort_order: 99,
    created_at: new Date().toISOString(),
  };
  await gh.saveVocab(cfg, 'triggers', custom);
  const withCustom = await gh.pullAll(cfg);
  assert.ok(withCustom.triggers.some((t) => t.id === custom.id), 'a custom trigger is stored');
  step('custom trigger stored');

  console.log('change detection');
  const poll1 = await gh.hasChanged(cfg, null);
  assert.ok(poll1.etag, 'an etag is returned to poll with');
  const poll2 = await gh.hasChanged(cfg, poll1.etag);
  assert.equal(poll2.changed, false, 'an unchanged record costs nothing');
  step('polling works and is cheap when nothing moved');

  console.log('cleaning up');
  await gh.eraseAll(cfg);
  const erased = await gh.pullAll(cfg);
  assert.equal(erased.events.length, 0, 'the test records are gone');
  await gh.bootstrap(cfg, me, 'Our family', 'My child');
  const fresh = await gh.pullAll(cfg);
  assert.ok(fresh.family && fresh.triggers.length >= 14, 're-seeded and ready to use');
  step('repository left clean');

  console.log('\nall GitHub backend checks passed');
}

main().catch((err) => {
  console.error('\nFAILED:', err);
  process.exit(1);
});
