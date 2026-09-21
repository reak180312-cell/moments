/**
 * A sync backend built on a private GitHub repository.
 *
 * Why this exists: the Supabase backend in supabase/schema.sql is the better
 * architecture - it enforces permissions in the database and pushes changes in
 * real time. But it needs someone to create a project. This backend needs no
 * new account at all: the data lives in a private repo, and the git history it
 * accumulates is a genuine audit trail.
 *
 * What it keeps from the Supabase design
 *   - the same client-generated UUIDs, so a replayed write is never a duplicate;
 *   - the same `version` check, so a conflicting edit is surfaced, not swallowed;
 *   - the same shape of data, so the app above does not know which is in use.
 *
 * What it gives up, honestly
 *   - changes arrive on a poll (about ten seconds), not instantly;
 *   - anyone with write access to the repo can write anything, so roles here are
 *     a shared agreement between people, not a rule the server enforces.
 */

import type {
  AppUser, ChildProfile, EditHistoryEntry, Family, FamilyMember, MomentEvent, Vocab,
} from './types';
import { uid } from './time';

const API = 'https://api.github.com';
const BRANCH = 'main';

export interface GhConfig {
  owner: string;
  repo: string;
  token: string;
}

export interface GhIdentity {
  id: string;           // "gh:octocat"
  login: string;
  display_name: string;
}

/* ------------------------------------------------------------ primitives */

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function fromBase64(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export class GhError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call(cfg: GhConfig, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${cfg.token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401) throw new GhError('That access token was not accepted by GitHub.', 401);
  if (res.status === 403) {
    const body = await res.clone().text();
    if (/rate limit/i.test(body)) throw new GhError('GitHub is rate limiting this token. Try again shortly.', 403);
    throw new GhError('That token does not have permission for this repository.', 403);
  }
  return res;
}

/* ------------------------------------------------------------ file access */

interface FileRead<T> { data: T | null; sha: string | null }

async function readJson<T>(cfg: GhConfig, path: string): Promise<FileRead<T>> {
  const res = await call(cfg, `/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${BRANCH}&t=${Date.now()}`);
  if (res.status === 404) return { data: null, sha: null };
  if (!res.ok) throw new GhError(`Could not read ${path} (${res.status}).`, res.status);
  const body = await res.json() as { content?: string; sha: string };
  if (!body.content) return { data: null, sha: body.sha };
  return { data: JSON.parse(fromBase64(body.content)) as T, sha: body.sha };
}

/** Returns null when the write raced another device and must be retried. */
async function writeJson(
  cfg: GhConfig, path: string, data: unknown, sha: string | null, message: string
): Promise<string | null> {
  const res = await call(cfg, `/repos/${cfg.owner}/${cfg.repo}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: toBase64(JSON.stringify(data, null, 1)),
      branch: BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  if (res.status === 409 || res.status === 422) return null;   // someone else wrote first
  if (!res.ok) throw new GhError(`Could not save ${path} (${res.status}).`, res.status);
  const body = await res.json() as { content: { sha: string } };
  return body.content.sha;
}

/* ---------------------------------------------------------- the data shape */

/** An event plus its own audit trail, so history travels with the record. */
export type StoredEvent = MomentEvent & { history?: EditHistoryEntry[] };

type MonthFile = Record<string, StoredEvent>;

interface FamilyFile {
  family: Family;
  members: FamilyMember[];
  people: Record<string, AppUser>;
  profiles: ChildProfile[];
}

interface VocabFile {
  triggers: Vocab[];
  helpful: Vocab[];
}

const FAMILY_PATH = 'family.json';
const VOCAB_PATH = 'vocab.json';

/** Events are sharded by the month they were created in - a fixed address that
 *  an edit never moves, so two devices always aim at the same file. */
function monthPath(event: { created_at: string }): string {
  const d = new Date(event.created_at);
  return `months/${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}.json`;
}

const DEFAULT_TRIGGERS = [
  'Homework', 'School', 'Hunger', 'Tired', 'Noise', 'Change of plans',
  'Screen time ending', 'Argument', 'Frustration', 'Waiting',
  'Social situation', 'Overwhelmed', 'Unknown', 'Other',
];

const DEFAULT_HELPFUL = [
  'Quiet room', 'Break', 'Talking', 'Food', 'Music', 'Going outside',
  'Changing activity', 'Hug', 'Time alone', 'Deep breaths', 'Water', 'Other',
];

/* ------------------------------------------------------------- connecting */

export async function whoAmI(cfg: GhConfig): Promise<GhIdentity> {
  const res = await call(cfg, '/user');
  if (!res.ok) throw new GhError('GitHub did not recognise that token.', res.status);
  const user = await res.json() as { login: string; name: string | null };
  return {
    id: `gh:${user.login}`,
    login: user.login,
    display_name: user.name?.trim() || user.login,
  };
}

async function repoExists(cfg: GhConfig): Promise<boolean> {
  const res = await call(cfg, `/repos/${cfg.owner}/${cfg.repo}`);
  return res.ok;
}

/**
 * Makes sure the private repository and its starting files exist, and that the
 * person connecting is listed in the family. Safe to run on every connection.
 */
export async function bootstrap(
  cfg: GhConfig, me: GhIdentity, familyName = 'Our family', childName = 'My child'
): Promise<void> {
  if (!(await repoExists(cfg))) {
    const res = await call(cfg, '/user/repos', {
      method: 'POST',
      body: JSON.stringify({
        name: cfg.repo,
        private: true,
        auto_init: true,
        description: 'Private data for the Moments app. Not code.',
      }),
    });
    if (!res.ok) {
      throw new GhError(
        `The repository ${cfg.owner}/${cfg.repo} does not exist and could not be created. ` +
        'Ask whoever set up the family to invite you to it.',
        res.status
      );
    }
    // A freshly initialised repo takes a moment before commits are accepted.
    await new Promise((r) => setTimeout(r, 1500));
  }

  const family = await readJson<FamilyFile>(cfg, FAMILY_PATH);
  if (!family.data) {
    const now = new Date().toISOString();
    const seed: FamilyFile = {
      family: { id: uid(), name: familyName, owner_id: me.id, created_at: now },
      members: [{
        id: uid(), family_id: 'local', user_id: me.id, role: 'owner',
        can_view: true, can_add: true, can_edit: true, can_delete: true,
        can_view_stats: true, can_manage_members: true, joined_at: now,
      }],
      people: { [me.id]: { id: me.id, email: null, display_name: me.display_name, avatar_hue: 210 } },
      profiles: [{
        id: uid(), family_id: 'local', name: childName, colour_hue: 210,
        birth_year: null, is_archived: false, sort_order: 0,
      }],
    };
    await writeJson(cfg, FAMILY_PATH, seed, null, 'Start the family record');
  } else if (!family.data.members.some((m) => m.user_id === me.id)) {
    // Someone invited to the repository adds themselves on first connection.
    const now = new Date().toISOString();
    const next: FamilyFile = {
      ...family.data,
      members: [...family.data.members, {
        id: uid(), family_id: family.data.family.id, user_id: me.id, role: 'member',
        can_view: true, can_add: true, can_edit: true, can_delete: false,
        can_view_stats: true, can_manage_members: false, joined_at: now,
      }],
      people: {
        ...family.data.people,
        [me.id]: { id: me.id, email: null, display_name: me.display_name, avatar_hue: 28 },
      },
    };
    await writeJson(cfg, FAMILY_PATH, next, family.sha, 'Add a family member');
  }

  const vocab = await readJson<VocabFile>(cfg, VOCAB_PATH);
  if (!vocab.data) {
    const familyId = (await readJson<FamilyFile>(cfg, FAMILY_PATH)).data?.family.id ?? 'local';
    const make = (name: string, i: number): Vocab => ({
      id: uid(), family_id: familyId, name, is_default: true, is_pinned: false,
      is_archived: false, sort_order: i, created_at: new Date().toISOString(),
    });
    await writeJson(cfg, VOCAB_PATH, {
      triggers: DEFAULT_TRIGGERS.map(make),
      helpful: DEFAULT_HELPFUL.map(make),
    }, null, 'Add the starting triggers');
  }
}

/* ------------------------------------------------------------------ pull */

export interface GhSnapshot {
  family: Family | null;
  members: FamilyMember[];
  people: Record<string, AppUser>;
  profiles: ChildProfile[];
  triggers: Vocab[];
  helpful: Vocab[];
  events: MomentEvent[];
}

export async function pullAll(cfg: GhConfig): Promise<GhSnapshot> {
  const tree = await call(cfg, `/repos/${cfg.owner}/${cfg.repo}/git/trees/${BRANCH}?recursive=1&t=${Date.now()}`);
  if (!tree.ok) throw new GhError(`Could not read the record (${tree.status}).`, tree.status);
  const body = await tree.json() as { tree: { path: string; sha: string; type: string }[] };

  const monthBlobs = body.tree.filter((n) => n.type === 'blob' && n.path.startsWith('months/') && n.path.endsWith('.json'));

  const readBlob = async (sha: string): Promise<unknown> => {
    const res = await call(cfg, `/repos/${cfg.owner}/${cfg.repo}/git/blobs/${sha}`);
    if (!res.ok) return null;
    const blob = await res.json() as { content: string; encoding: string };
    return JSON.parse(blob.encoding === 'base64' ? fromBase64(blob.content) : blob.content);
  };

  const [familyFile, vocabFile] = await Promise.all([
    readJson<FamilyFile>(cfg, FAMILY_PATH),
    readJson<VocabFile>(cfg, VOCAB_PATH),
  ]);

  const events: MomentEvent[] = [];
  // A little at a time, so a long history does not open 50 sockets at once.
  for (let i = 0; i < monthBlobs.length; i += 6) {
    const batch = await Promise.all(monthBlobs.slice(i, i + 6).map((n) => readBlob(n.sha)));
    batch.forEach((month) => {
      if (!month) return;
      Object.values(month as MonthFile).forEach((e) => {
        const { history: _history, ...event } = e;
        events.push({ ...event, trigger_ids: event.trigger_ids ?? [], helpful_ids: event.helpful_ids ?? [] });
      });
    });
  }

  return {
    family: familyFile.data?.family ?? null,
    members: familyFile.data?.members ?? [],
    people: familyFile.data?.people ?? {},
    profiles: familyFile.data?.profiles ?? [],
    triggers: vocabFile.data?.triggers ?? [],
    helpful: vocabFile.data?.helpful ?? [],
    events,
  };
}

/** Cheap change detection: a 304 costs nothing against the rate limit. */
export async function hasChanged(cfg: GhConfig, etag: string | null): Promise<{ changed: boolean; etag: string | null }> {
  const res = await call(cfg, `/repos/${cfg.owner}/${cfg.repo}/commits?per_page=1`, {
    headers: etag ? { 'If-None-Match': etag } : {},
  });
  if (res.status === 304) return { changed: false, etag };
  return { changed: res.ok, etag: res.headers.get('etag') };
}

/* ------------------------------------------------------------------ push */

export interface GhSaveResult {
  status: 'ok' | 'conflict';
  event: MomentEvent;
}

function diff(before: MomentEvent | undefined, after: MomentEvent): EditHistoryEntry['changes'] {
  if (!before) return [{ field: 'event', to: 'created' }];
  const fields: (keyof MomentEvent)[] = [
    'difficulty', 'start_time', 'duration_seconds', 'description', 'location',
    'notes', 'sleep_quality', 'hungry', 'school_day', 'unusual_day', 'status',
  ];
  const changes: EditHistoryEntry['changes'] = [];
  fields.forEach((f) => {
    if (before[f] !== after[f]) {
      changes.push({ field: f === 'duration_seconds' ? 'duration' : f, from: before[f], to: after[f] });
    }
  });
  const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
  if (!same(before.trigger_ids, after.trigger_ids)) changes.push({ field: 'triggers', to: 'changed' });
  if (!same(before.helpful_ids, after.helpful_ids)) changes.push({ field: 'what_helped', to: 'changed' });
  return changes;
}

/**
 * Save one moment.
 *
 * Two kinds of collision are handled differently, on purpose:
 *   - two devices writing the same month file at the same moment is a race over
 *     a container. Re-read and retry: both moments survive.
 *   - two devices editing the same moment is a real disagreement. Return the
 *     other version and let a person decide.
 */
export async function saveEvent(
  cfg: GhConfig, event: MomentEvent, expectedVersion: number | null, actor: string
): Promise<GhSaveResult> {
  const path = monthPath(event);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const file = await readJson<MonthFile>(cfg, path);
    const bucket: MonthFile = file.data ?? {};
    const remote = bucket[event.id];

    if (remote) {
      if (expectedVersion === null) {
        // A queued write being replayed: it is already stored. Not a duplicate.
        const { history: _h, ...stored } = remote;
        return { status: 'ok', event: stored };
      }
      if (remote.version !== expectedVersion) {
        const { history: _h, ...stored } = remote;
        return { status: 'conflict', event: stored };
      }
    }

    const now = new Date().toISOString();
    const version = (remote?.version ?? 0) + 1;
    const changes = diff(remote, event);
    const entry: EditHistoryEntry = {
      id: uid(),
      event_id: event.id,
      changed_by: actor,
      action: remote ? (remote.deleted_at ? 'restored' : 'updated') : 'created',
      changes,
      version,
      changed_at: now,
    };

    const next: StoredEvent = {
      ...event,
      version,
      updated_by: actor,
      updated_at: now,
      created_by: remote?.created_by ?? event.created_by,
      created_at: remote?.created_at ?? event.created_at,
      deleted_at: null,
      history: changes.length ? [...(remote?.history ?? []), entry] : (remote?.history ?? [entry]),
    };

    bucket[event.id] = next;
    const written = await writeJson(cfg, path, bucket, file.sha, remote ? 'Update a moment' : 'Record a moment');
    if (written !== null) {
      const { history: _h, ...stored } = next;
      return { status: 'ok', event: stored };
    }
  }

  throw new GhError('The record is busy right now. It will try again shortly.', 409);
}

export async function deleteEvent(
  cfg: GhConfig, eventId: string, createdAt: string, expectedVersion: number | null, actor: string
): Promise<GhSaveResult | null> {
  const path = monthPath({ created_at: createdAt });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const file = await readJson<MonthFile>(cfg, path);
    const bucket: MonthFile = file.data ?? {};
    const remote = bucket[eventId];
    if (!remote) return null;                                  // never stored: nothing to delete
    if (remote.deleted_at) {
      const { history: _h, ...stored } = remote;
      return { status: 'ok', event: stored };
    }
    if (expectedVersion !== null && remote.version !== expectedVersion) {
      const { history: _h, ...stored } = remote;
      return { status: 'conflict', event: stored };
    }

    const now = new Date().toISOString();
    const version = remote.version + 1;
    const next: StoredEvent = {
      ...remote,
      deleted_at: now,
      updated_at: now,
      updated_by: actor,
      version,
      history: [...(remote.history ?? []), {
        id: uid(), event_id: eventId, changed_by: actor, action: 'deleted',
        changes: [{ field: 'event', to: 'deleted' }], version, changed_at: now,
      }],
    };

    bucket[eventId] = next;
    const written = await writeJson(cfg, path, bucket, file.sha, 'Delete a moment');
    if (written !== null) {
      const { history: _h, ...stored } = next;
      return { status: 'ok', event: stored };
    }
  }

  throw new GhError('The record is busy right now. It will try again shortly.', 409);
}

export async function restoreEvent(
  cfg: GhConfig, eventId: string, createdAt: string, actor: string
): Promise<MomentEvent | null> {
  const path = monthPath({ created_at: createdAt });
  const file = await readJson<MonthFile>(cfg, path);
  const bucket: MonthFile = file.data ?? {};
  const remote = bucket[eventId];
  if (!remote) return null;

  const now = new Date().toISOString();
  const version = remote.version + 1;
  const next: StoredEvent = {
    ...remote, deleted_at: null, updated_at: now, updated_by: actor, version,
    history: [...(remote.history ?? []), {
      id: uid(), event_id: eventId, changed_by: actor, action: 'restored',
      changes: [{ field: 'event', to: 'restored' }], version, changed_at: now,
    }],
  };
  bucket[eventId] = next;
  await writeJson(cfg, path, bucket, file.sha, 'Restore a moment');
  const { history: _h, ...stored } = next;
  return stored;
}

export async function getHistory(cfg: GhConfig, event: MomentEvent): Promise<EditHistoryEntry[]> {
  const file = await readJson<MonthFile>(cfg, monthPath(event));
  return file.data?.[event.id]?.history ?? [];
}

/* ------------------------------------------------------ vocabulary & family */

async function mutate<T>(
  cfg: GhConfig, path: string, message: string, change: (current: T | null) => T
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const file = await readJson<T>(cfg, path);
    const next = change(file.data);
    const written = await writeJson(cfg, path, next, file.sha, message);
    if (written !== null) return next;
  }
  throw new GhError('The record is busy right now. Try again in a moment.', 409);
}

export async function saveVocab(cfg: GhConfig, table: 'triggers' | 'helpful_actions', row: Vocab): Promise<void> {
  const key = table === 'triggers' ? 'triggers' : 'helpful';
  await mutate<VocabFile>(cfg, VOCAB_PATH, 'Update the options', (current) => {
    const base: VocabFile = current ?? { triggers: [], helpful: [] };
    const list = base[key];
    const without = list.filter((v) => v.id !== row.id);
    return { ...base, [key]: [...without, row] };
  });
}

export async function updateFamily(
  cfg: GhConfig, message: string, change: (current: FamilyFile) => FamilyFile
): Promise<FamilyFile> {
  return mutate<FamilyFile>(cfg, FAMILY_PATH, message, (current) => {
    if (!current) throw new GhError('The family record is missing.', 404);
    return change(current);
  });
}

/** Invites by GitHub username: the repository is the family's boundary. */
export async function inviteCollaborator(cfg: GhConfig, username: string): Promise<void> {
  const res = await call(cfg, `/repos/${cfg.owner}/${cfg.repo}/collaborators/${username.trim()}`, {
    method: 'PUT',
    body: JSON.stringify({ permission: 'push' }),
  });
  if (!res.ok && res.status !== 204 && res.status !== 201) {
    throw new GhError(`GitHub would not add ${username} (${res.status}). Check the username.`, res.status);
  }
}

export async function removeCollaborator(cfg: GhConfig, username: string): Promise<void> {
  await call(cfg, `/repos/${cfg.owner}/${cfg.repo}/collaborators/${username.trim()}`, { method: 'DELETE' });
}

/**
 * Removes every record file from the repository.
 *
 * Be straight about what this does and does not do: the files stop existing,
 * but git keeps the earlier commits. Only deleting the repository on GitHub
 * removes it all, and that is deliberately left to a person.
 */
export async function eraseAll(cfg: GhConfig): Promise<void> {
  const tree = await call(cfg, `/repos/${cfg.owner}/${cfg.repo}/git/trees/${BRANCH}?recursive=1`);
  if (!tree.ok) throw new GhError('Could not read the record to erase it.', tree.status);
  const body = await tree.json() as { tree: { path: string; type: string }[] };

  const targets = body.tree
    .filter((n) => n.type === 'blob')
    .filter((n) => n.path === FAMILY_PATH || n.path === VOCAB_PATH || n.path.startsWith('months/'))
    .map((n) => n.path);

  for (const path of targets) {
    const file = await readJson<unknown>(cfg, path);
    if (!file.sha) continue;
    await call(cfg, `/repos/${cfg.owner}/${cfg.repo}/contents/${path}`, {
      method: 'DELETE',
      body: JSON.stringify({ message: 'Erase the record', sha: file.sha, branch: BRANCH }),
    });
  }
}

export type { FamilyFile, VocabFile };
