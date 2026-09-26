/**
 * The sync engine.
 *
 * Rules this file exists to keep:
 *   1. The database is the only source of truth. This device holds a cache
 *      plus an outbox of writes it has not managed to send yet.
 *   2. Every write is keyed on a UUID made when the moment was recorded, and
 *      the outbox holds at most one entry per moment. Replaying it can never
 *      create a second copy of anything.
 *   3. A write carries the version it was based on. If the server has moved
 *      on, the write comes back as a conflict with both sides intact - we
 *      never overwrite silently and never drop the local edit.
 *   4. Realtime keeps every signed-in device on the same data; a catch-up
 *      fetch on reconnect covers anything realtime missed.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isConfigured, friendlyError, isNetworkError } from '../lib/supabase';
import { local, prefs } from '../lib/local';
import { uid } from '../lib/time';
import {
  DEMO_ME, DEMO_PROFILE, buildDemoEvents, demoFamily, demoHelpful, demoMembers,
  demoPeople, demoProfiles, demoTriggers, previewActive,
} from '../lib/demo';
import * as gh from '../lib/github';
import { matchVocab } from '../lib/palette';
import {
  GH_OWNER, GH_REPO, backendMode, ghConfig, ghIdentity, ghRepoUrl, type BackendMode,
  setGhIdentity, setGhToken,
} from '../lib/backend';
import {
  NO_PERMISSIONS,
  type AppUser, type ChildProfile, type Conflict, type EditHistoryEntry, type Family,
  type FamilyMember, type MomentEvent, type OutboxEntry, type Permissions, type Role,
  type Vocab, type VocabOutboxEntry,
} from '../lib/types';

const EVENT_COLUMNS = '*';

/** Preview mode: sample data, this device only, no network at all. */
const PREVIEW = previewActive(isConfigured);

/** Which store the family's record actually lives in. */
const GITHUB = !PREVIEW && backendMode === 'github';

/** A signed-in identity for the GitHub backend, shaped like a Supabase one so
 *  everything above this file stays unaware of which backend is in use. */
function fakeSession(userId: string): Session {
  return { user: { id: userId } } as unknown as Session;
}

export interface EventDraft {
  id?: string;
  profile_id?: string;
  start_time: string;
  end_time?: string | null;
  duration_seconds?: number | null;
  difficulty?: number | null;
  description?: string | null;
  location?: string | null;
  notes?: string | null;
  sleep_quality?: MomentEvent['sleep_quality'];
  hungry?: MomentEvent['hungry'];
  school_day?: boolean | null;
  unusual_day?: boolean | null;
  status?: 'draft' | 'complete';
  trigger_ids?: string[];
  helpful_ids?: string[];
}

interface State {
  ready: boolean;
  session: Session | null;
  me: AppUser | null;
  family: Family | null;
  members: FamilyMember[];
  people: Record<string, AppUser>;
  profiles: ChildProfile[];
  activeProfileId: string | null;
  triggers: Vocab[];
  helpful: Vocab[];
  events: Record<string, MomentEvent>;
  outbox: OutboxEntry[];
  vocabOutbox: VocabOutboxEntry[];
  conflicts: Conflict[];
  online: boolean;
  syncing: boolean;
  lastSyncedAt: string | null;
  loadingRemote: boolean;
  error: string | null;
}

const initialState: State = {
  ready: false, session: null, me: null, family: null, members: [], people: {},
  profiles: [], activeProfileId: null, triggers: [], helpful: [], events: {},
  outbox: [], vocabOutbox: [], conflicts: [], online: navigator.onLine,
  syncing: false, lastSyncedAt: null, loadingRemote: false, error: null,
};

interface Store extends State {
  perms: Permissions;
  allEvents: MomentEvent[];
  pendingCount: number;
  needsFamily: boolean;
  nameOf: (userId: string | null | undefined) => string;
  triggerName: (id: string) => string;
  helpfulName: (id: string) => string;

  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  createFamily: (familyName: string, childName: string) => Promise<void>;
  joinFamily: (code: string) => Promise<void>;

  saveEvent: (draft: EventDraft) => Promise<MomentEvent>;
  deleteEvent: (id: string) => Promise<void>;
  restoreEvent: (id: string) => Promise<void>;
  getHistory: (eventId: string) => Promise<EditHistoryEntry[]>;

  addTrigger: (name: string) => Promise<Vocab | null>;
  addHelpful: (name: string) => Promise<Vocab | null>;
  updateVocab: (table: 'triggers' | 'helpful_actions', id: string, patch: Partial<Vocab>) => Promise<void>;

  updateMember: (memberId: string, patch: Partial<FamilyMember>) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
  createInvite: (role: Role, label: string) => Promise<string>;
  updateMyName: (name: string) => Promise<void>;
  renameFamily: (name: string) => Promise<void>;
  renameProfile: (profileId: string, name: string) => Promise<void>;
  addProfile: (name: string) => Promise<void>;
  setActiveProfile: (id: string) => void;

  backend: BackendMode;
  repoUrl: string;
  connectGithub: (token: string, familyName: string, childName: string) => Promise<void>;
  inviteGithubUser: (username: string, role: Role) => Promise<void>;
  preview: boolean;
  resetPreview: () => Promise<void>;
  resolveConflict: (eventId: string, keep: EventDraft | null) => Promise<void>;
  dismissConflict: (eventId: string) => void;
  retryOutbox: (eventId?: string) => Promise<void>;
  discardOutbox: (eventId: string) => Promise<void>;
  sync: () => Promise<void>;
  exportFamilyData: () => Promise<unknown>;
  deleteMyData: (deleteFamily: boolean) => Promise<string>;
}

const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

function normaliseEvent(row: Record<string, unknown>): MomentEvent {
  const e = row as unknown as MomentEvent;
  return { ...e, trigger_ids: e.trigger_ids ?? [], helpful_ids: e.helpful_ids ?? [] };
}

function toPayload(e: MomentEvent): Record<string, unknown> {
  return {
    id: e.id,
    family_id: e.family_id,
    profile_id: e.profile_id,
    start_time: e.start_time,
    end_time: e.end_time,
    duration_seconds: e.duration_seconds,
    difficulty: e.difficulty,
    description: e.description,
    location: e.location,
    notes: e.notes,
    sleep_quality: e.sleep_quality,
    hungry: e.hungry,
    school_day: e.school_day,
    unusual_day: e.unusual_day,
    status: e.status,
    created_at: e.created_at,
    trigger_ids: e.trigger_ids,
    helpful_ids: e.helpful_ids,
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const flushing = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const patch = useCallback((p: Partial<State> | ((s: State) => Partial<State>)) => {
    setState((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) }));
  }, []);

  /* ------------------------------------------------------------ cache load */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [cached, events, outbox, vocabOutbox] = await Promise.all([
        local.kvGet<Partial<State>>('snapshot'),
        local.getAll<MomentEvent>('events'),
        local.getAll<OutboxEntry>('outbox'),
        local.getAll<VocabOutboxEntry>('vocab_outbox'),
      ]);
      if (cancelled) return;

      if (PREVIEW) {
        let sample = events;
        if (!sample.length) {
          sample = buildDemoEvents();
          await local.putMany('events', sample);
        }
        patch({
          ready: true,
          session: { user: { id: DEMO_ME } } as unknown as Session,
          me: demoPeople[DEMO_ME],
          family: demoFamily,
          members: demoMembers,
          people: demoPeople,
          profiles: demoProfiles,
          activeProfileId: DEMO_PROFILE,
          triggers: cached?.triggers ?? demoTriggers,
          helpful: cached?.helpful ?? demoHelpful,
          events: Object.fromEntries(sample.map((e) => [e.id, e])),
          outbox: [],
          vocabOutbox: [],
        });
        return;
      }

      const map: Record<string, MomentEvent> = {};
      const pendingIds = new Set(outbox.map((o) => o.event_id));
      events.forEach((e) => {
        map[e.id] = { ...e, _pending: pendingIds.has(e.id) };
      });

      if (GITHUB) {
        // The stored identity is this device's sign-in: no round trip needed to
        // open the app, so a cached record is on screen immediately.
        const identity = ghIdentity();
        patch({
          ...(cached ?? {}),
          events: map,
          outbox,
          vocabOutbox,
          ready: true,
          session: identity && ghConfig() ? fakeSession(identity.id) : null,
        });
        return;
      }

      patch({
        ...(cached ?? {}),
        events: map,
        outbox,
        vocabOutbox,
        ready: true,
      });
    })();
    return () => { cancelled = true; };
  }, [patch]);

  /** The parts of state worth keeping on the device between launches, so the
   *  app opens straight into the family's data rather than a loading screen. */
  const persistSnapshot = useCallback((s: Partial<State>) => {
    void local.kvSet('snapshot', {
      me: s.me, family: s.family, members: s.members, people: s.people,
      profiles: s.profiles, activeProfileId: s.activeProfileId,
      triggers: s.triggers, helpful: s.helpful, lastSyncedAt: s.lastSyncedAt,
    });
  }, []);

  /* --------------------------------------------------------------- session */

  useEffect(() => {
    if (!isConfigured) return;
    supabase.auth.getSession().then(({ data }) => patch({ session: data.session ?? null }));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      patch({ session: session ?? null });
      if (!session) {
        void local.wipe();
        setState({ ...initialState, ready: true, session: null });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [patch]);

  /* ------------------------------------------------------------ connection */

  useEffect(() => {
    const on = () => { patch({ online: true }); void flush(); void pull(); };
    const off = () => patch({ online: false });
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const onVisible = () => { if (document.visibilityState === 'visible') { void flush(); void pull(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------- the pull */

  const applyServerEvents = useCallback((rows: Record<string, unknown>[]) => {
    if (!rows.length) return;
    const events = rows.map(normaliseEvent);
    void local.putMany('events', events);
    patch((s) => {
      const next = { ...s.events };
      const queued = new Set(s.outbox.map((o) => o.event_id));
      events.forEach((e) => {
        // A moment with an unsent local change keeps the local copy on screen;
        // the version check at send time decides what happens next.
        if (queued.has(e.id)) return;
        next[e.id] = e;
      });
      return { events: next };
    });
  }, [patch]);

  const pull = useCallback(async () => {
    const s = stateRef.current;

    if (GITHUB) {
      const cfg = ghConfig();
      // Read the identity from storage rather than from React state: a pull can
      // be asked for in the same tick as the connection, before state settles.
      const identity = ghIdentity();
      if (!cfg || !identity || !navigator.onLine) return;
      patch({ loadingRemote: true });
      try {
        const snap = await gh.pullAll(cfg);
        void local.putMany('events', snap.events);

        const events: Record<string, MomentEvent> = {};
        snap.events.forEach((e) => { events[e.id] = e; });
        // A moment with an unsent local change keeps the local copy on screen.
        stateRef.current.outbox.forEach((o) => {
          const mine = stateRef.current.events[o.event_id];
          if (mine) events[o.event_id] = mine;
        });

        const storedProfile = prefs.get<string | null>('profileId', null);
        const fresh = {
          family: snap.family,
          members: snap.members,
          people: snap.people,
          profiles: snap.profiles,
          triggers: snap.triggers,
          helpful: snap.helpful,
          activeProfileId:
            snap.profiles.find((p) => p.id === storedProfile)?.id ?? snap.profiles[0]?.id ?? null,
          me: snap.people[identity.id] ?? null,
          lastSyncedAt: new Date().toISOString(),
        };
        patch({ ...fresh, events, loadingRemote: false, error: null });
        persistSnapshot(fresh);
      } catch (err) {
        patch({
          loadingRemote: false,
          error: isNetworkError(err) ? null : (err as Error).message,
        });
      }
      return;
    }

    if (!isConfigured || !s.session || !navigator.onLine) return;
    patch({ loadingRemote: true });
    try {
      const uidNow = s.session.user.id;

      const { data: memberRows, error: memberErr } = await supabase
        .from('family_members').select('*').eq('user_id', uidNow);
      if (memberErr) throw memberErr;

      const preferred = prefs.get<string | null>('familyId', null);
      const myMember =
        (memberRows ?? []).find((m) => m.family_id === preferred) ?? (memberRows ?? [])[0];

      if (!myMember) {
        patch({ family: null, members: [], loadingRemote: false });
        return;
      }
      const familyId = myMember.family_id as string;
      prefs.set('familyId', familyId);

      const [familyRes, membersRes, profilesRes, triggersRes, helpfulRes, usersRes] =
        await Promise.all([
          supabase.from('families').select('*').eq('id', familyId).single(),
          supabase.from('family_members').select('*').eq('family_id', familyId),
          supabase.from('profiles').select('*').eq('family_id', familyId).order('sort_order'),
          supabase.from('triggers').select('*').eq('family_id', familyId).order('sort_order'),
          supabase.from('helpful_actions').select('*').eq('family_id', familyId).order('sort_order'),
          supabase.from('users').select('id, email, display_name, avatar_hue'),
        ]);

      const people: Record<string, AppUser> = {};
      (usersRes.data ?? []).forEach((u) => { people[u.id as string] = u as AppUser; });

      const watermark = await local.kvGet<string>('watermark');
      let query = supabase
        .from('event_view').select(EVENT_COLUMNS)
        .eq('family_id', familyId)
        .order('updated_at', { ascending: true })
        .limit(2000);
      if (watermark) query = query.gt('updated_at', watermark);
      const { data: eventRows, error: eventErr } = await query;
      if (eventErr) throw eventErr;

      if (eventRows?.length) {
        applyServerEvents(eventRows as Record<string, unknown>[]);
        const newest = eventRows[eventRows.length - 1].updated_at as string;
        await local.kvSet('watermark', newest);
      }

      const profiles = (profilesRes.data ?? []) as ChildProfile[];
      const storedProfile = prefs.get<string | null>('profileId', null);
      const activeProfileId =
        profiles.find((p) => p.id === storedProfile)?.id ?? profiles[0]?.id ?? null;

      const fresh = {
        family: (familyRes.data ?? null) as Family | null,
        members: (membersRes.data ?? []) as FamilyMember[],
        people,
        profiles,
        activeProfileId,
        triggers: (triggersRes.data ?? []) as Vocab[],
        helpful: (helpfulRes.data ?? []) as Vocab[],
        me: people[uidNow] ?? null,
        lastSyncedAt: new Date().toISOString(),
      };

      patch((prev) => ({
        ...fresh,
        people: { ...prev.people, ...people },
        me: fresh.me ?? prev.me,
        loadingRemote: false,
        error: null,
      }));
      persistSnapshot(fresh);
    } catch (err) {
      patch({ loadingRemote: false, error: isNetworkError(err) ? null : friendlyError(err) });
    }
  }, [applyServerEvents, patch, persistSnapshot]);

  /* ------------------------------------------------------------- the push */

  const writeOutbox = useCallback(async (entry: OutboxEntry) => {
    await local.put('outbox', entry);
    patch((s) => ({
      outbox: [...s.outbox.filter((o) => o.event_id !== entry.event_id), entry],
    }));
  }, [patch]);

  const clearOutbox = useCallback(async (eventId: string) => {
    await local.del('outbox', eventId);
    patch((s) => ({ outbox: s.outbox.filter((o) => o.event_id !== eventId) }));
  }, [patch]);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    const s = stateRef.current;
    if (!navigator.onLine) return;
    if (!s.outbox.length && !s.vocabOutbox.length) return;

    if (GITHUB) {
      const cfg = ghConfig();
      const identity = ghIdentity();
      if (!cfg || !identity) return;

      flushing.current = true;
      patch({ syncing: true });
      try {
        for (const v of [...s.vocabOutbox].sort((a, b) => a.queued_at.localeCompare(b.queued_at))) {
          try {
            await gh.saveVocab(cfg, v.table, v.row as unknown as Vocab);
          } catch (err) {
            if (isNetworkError(err)) throw err;
          }
          await local.del('vocab_outbox', v.id);
          patch((st) => ({ vocabOutbox: st.vocabOutbox.filter((x) => x.id !== v.id) }));
        }

        const queue = [...stateRef.current.outbox].sort((a, b) => a.queued_at.localeCompare(b.queued_at));
        for (const entry of queue) {
          if (entry.error) continue;
          const mine = (entry.payload as unknown as MomentEvent | null)
            ?? stateRef.current.events[entry.event_id];
          if (!mine) { await clearOutbox(entry.event_id); continue; }

          try {
            const result = entry.kind === 'save'
              ? await gh.saveEvent(cfg, mine, entry.expected_version, identity.id)
              : await gh.deleteEvent(cfg, entry.event_id, mine.created_at, entry.expected_version, identity.id);

            if (result && result.status === 'conflict') {
              const theirs = result.event;
              await local.put('events', theirs);
              await clearOutbox(entry.event_id);
              patch((st) => ({
                events: { ...st.events, [entry.event_id]: theirs },
                conflicts: [
                  ...st.conflicts.filter((c) => c.event_id !== entry.event_id),
                  { event_id: entry.event_id, mine, theirs, detected_at: new Date().toISOString() },
                ],
              }));
              continue;
            }

            if (result) {
              await local.put('events', result.event);
              patch((st) => ({ events: { ...st.events, [entry.event_id]: result.event } }));
            }
            await clearOutbox(entry.event_id);
          } catch (err) {
            if (isNetworkError(err)) throw err;
            const failed: OutboxEntry = { ...entry, attempts: entry.attempts + 1, error: (err as Error).message };
            await local.put('outbox', failed);
            patch((st) => ({
              outbox: st.outbox.map((o) => (o.event_id === entry.event_id ? failed : o)),
              events: st.events[entry.event_id]
                ? { ...st.events, [entry.event_id]: { ...st.events[entry.event_id], _error: failed.error } }
                : st.events,
            }));
          }
        }
        patch({ lastSyncedAt: new Date().toISOString() });
      } catch {
        /* offline again - the queue is intact */
      } finally {
        flushing.current = false;
        patch({ syncing: false });
      }
      return;
    }

    if (!isConfigured || !s.session) return;

    flushing.current = true;
    patch({ syncing: true });
    try {
      // Vocabulary first: an event may reference a trigger created offline.
      for (const v of [...stateRef.current.vocabOutbox].sort((a, b) => a.queued_at.localeCompare(b.queued_at))) {
        try {
          const { error } = await supabase.from(v.table).upsert(v.row).select().single();
          if (error && error.code !== '23505') throw error;
          await local.del('vocab_outbox', v.id);
          patch((st) => ({ vocabOutbox: st.vocabOutbox.filter((x) => x.id !== v.id) }));
        } catch (err) {
          if (isNetworkError(err)) throw err;
          await local.del('vocab_outbox', v.id);
          patch((st) => ({ vocabOutbox: st.vocabOutbox.filter((x) => x.id !== v.id) }));
        }
      }

      const queue = [...stateRef.current.outbox].sort((a, b) => a.queued_at.localeCompare(b.queued_at));
      for (const entry of queue) {
        if (entry.error) continue; // waiting on a person, not on the network
        try {
          const { data, error } = entry.kind === 'save'
            ? await supabase.rpc('save_event', { p: entry.payload, p_expected_version: entry.expected_version })
            : await supabase.rpc('delete_event', { p_id: entry.event_id, p_expected_version: entry.expected_version });
          if (error) throw error;

          const result = data as { status: string; event?: Record<string, unknown> } | null;
          if (result?.status === 'conflict' && result.event) {
            const theirs = normaliseEvent(result.event);
            const mine = stateRef.current.events[entry.event_id];
            await local.put('events', theirs);
            await clearOutbox(entry.event_id);
            patch((st) => ({
              events: { ...st.events, [entry.event_id]: theirs },
              conflicts: [
                ...st.conflicts.filter((c) => c.event_id !== entry.event_id),
                { event_id: entry.event_id, mine, theirs, detected_at: new Date().toISOString() },
              ],
            }));
            continue;
          }

          if (result?.event) {
            const saved = normaliseEvent(result.event);
            await local.put('events', saved);
            patch((st) => ({ events: { ...st.events, [entry.event_id]: saved } }));
          }
          await clearOutbox(entry.event_id);
        } catch (err) {
          if (isNetworkError(err)) throw err; // keep the queue, try again later
          const failed: OutboxEntry = {
            ...entry, attempts: entry.attempts + 1, error: friendlyError(err),
          };
          await local.put('outbox', failed);
          patch((st) => ({
            outbox: st.outbox.map((o) => (o.event_id === entry.event_id ? failed : o)),
            events: st.events[entry.event_id]
              ? { ...st.events, [entry.event_id]: { ...st.events[entry.event_id], _error: failed.error } }
              : st.events,
          }));
        }
      }
      patch({ lastSyncedAt: new Date().toISOString() });
    } catch {
      /* offline again - the queue is intact and will be retried */
    } finally {
      flushing.current = false;
      patch({ syncing: false });
    }
  }, [clearOutbox, patch]);

  /* ------------------------------------------------------------- realtime */

  useEffect(() => {
    const familyId = state.family?.id;
    if (!isConfigured || !state.session || !familyId) return;

    const channel = supabase.channel(`family:${familyId}`);

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'events', filter: `family_id=eq.${familyId}` },
      async (payload) => {
        const row = (payload.new ?? payload.old) as { id?: string } | null;
        if (!row?.id) return;
        const { data } = await supabase.from('event_view').select(EVENT_COLUMNS).eq('id', row.id).maybeSingle();
        if (data) {
          applyServerEvents([data as Record<string, unknown>]);
          const stamp = (data as { updated_at?: string }).updated_at;
          if (stamp) {
            const current = await local.kvGet<string>('watermark');
            if (!current || stamp > current) await local.kvSet('watermark', stamp);
          }
        }
      }
    );

    (['triggers', 'helpful_actions', 'profiles', 'family_members'] as const).forEach((table) => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `family_id=eq.${familyId}` },
        () => { void pull(); }
      );
    });

    channel.subscribe();
    channelRef.current = channel;
    return () => { void supabase.removeChannel(channel); channelRef.current = null; };
  }, [state.family?.id, state.session, applyServerEvents, pull]);

  /* ------------------------------------- GitHub: watching for other devices */

  useEffect(() => {
    if (!GITHUB || !state.session) return;
    let etag: string | null = null;
    let first = true;
    let stopped = false;

    const check = async () => {
      const cfg = ghConfig();
      if (!cfg || !navigator.onLine || document.visibilityState !== 'visible') return;
      try {
        const res = await gh.hasChanged(cfg, etag);
        etag = res.etag;
        // The first check only records where the record currently stands.
        if (res.changed && !first) await pull();
        first = false;
      } catch {
        /* a failed check is not worth telling anyone about; try again shortly */
      }
    };

    void check();
    const timer = setInterval(() => { if (!stopped) void check(); }, 10_000);
    return () => { stopped = true; clearInterval(timer); };
  }, [state.session, pull]);

  /* --------------------------------------------------- pull / flush timers */

  useEffect(() => {
    if (state.session) { void pull(); void flush(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.session?.user.id]);

  useEffect(() => {
    if (!state.outbox.length) return;
    const t = setInterval(() => { void flush(); }, 20_000);
    return () => clearInterval(t);
  }, [state.outbox.length, flush]);

  /* -------------------------------------------------------------- actions */

  const myMember = useMemo(
    () => state.members.find((m) => m.user_id === state.session?.user.id) ?? null,
    [state.members, state.session?.user.id]
  );

  const perms: Permissions = useMemo(() => {
    if (!myMember) return state.family ? NO_PERMISSIONS : { ...NO_PERMISSIONS, view: true };
    if (myMember.role === 'owner') {
      return { view: true, add: true, edit: true, delete: true, stats: true, manage: true };
    }
    return {
      view: myMember.can_view,
      add: myMember.can_add,
      edit: myMember.can_edit,
      delete: myMember.can_delete,
      stats: myMember.can_view_stats,
      manage: myMember.can_manage_members,
    };
  }, [myMember, state.family]);

  const saveEvent = useCallback(async (draft: EventDraft): Promise<MomentEvent> => {
    const s = stateRef.current;
    if (!s.family || !s.session) throw new Error('Not signed in to a family yet.');
    const existing = draft.id ? s.events[draft.id] : undefined;
    if (existing ? !perms.edit : !perms.add) {
      throw new Error(existing ? 'You do not have permission to edit moments.' : 'You do not have permission to add moments.');
    }

    const now = new Date().toISOString();
    const id = draft.id ?? uid();
    const profileId = draft.profile_id ?? existing?.profile_id ?? s.activeProfileId;
    if (!profileId) throw new Error('No child profile set up yet.');

    // A field the caller did not mention keeps whatever it already had, so a
    // partial save (the live timer, a quick edit) never quietly clears notes.
    const keep = <K extends keyof EventDraft & keyof MomentEvent>(key: K, fallback: MomentEvent[K]) =>
      (key in draft ? (draft[key] as MomentEvent[K]) : existing?.[key] ?? fallback);

    const text = (value: unknown) => {
      const s2 = typeof value === 'string' ? value.trim() : value;
      return (s2 as string | null) || null;
    };

    const event: MomentEvent = {
      id,
      family_id: s.family.id,
      profile_id: profileId,
      created_by: existing?.created_by ?? s.session.user.id,
      updated_by: s.session.user.id,
      start_time: draft.start_time,
      end_time: keep('end_time', null),
      duration_seconds: keep('duration_seconds', null),
      difficulty: keep('difficulty', null),
      description: text(keep('description', null)),
      location: text(keep('location', null)),
      notes: text(keep('notes', null)),
      sleep_quality: keep('sleep_quality', null),
      hungry: keep('hungry', null),
      school_day: keep('school_day', null),
      unusual_day: keep('unusual_day', null),
      status: draft.status ?? existing?.status ?? 'complete',
      version: existing?.version ?? 1,
      deleted_at: null,
      created_at: existing?.created_at ?? now,
      updated_at: now,
      trigger_ids: draft.trigger_ids ?? existing?.trigger_ids ?? [],
      helpful_ids: draft.helpful_ids ?? existing?.helpful_ids ?? [],
      _pending: !PREVIEW,
    };

    await local.put('events', { ...event, _pending: undefined, _error: undefined });
    patch((st) => ({ events: { ...st.events, [id]: event } }));

    if (PREVIEW) return event;   // sample data: nothing to send anywhere

    // An event this device has never managed to send keeps expected_version null,
    // so a replay is recognised as the same insert rather than a new one.
    const queued = s.outbox.find((o) => o.event_id === id);
    const expected = queued ? queued.expected_version : existing ? existing.version : null;

    await writeOutbox({
      event_id: id,
      kind: 'save',
      // The GitHub backend writes whole records, so the queue carries one.
      payload: GITHUB
        ? ({ ...event, _pending: undefined, _error: undefined } as unknown as Record<string, unknown>)
        : toPayload(event),
      expected_version: expected,
      queued_at: queued?.queued_at ?? now,
      attempts: 0,
    });
    void flush();
    return event;
  }, [flush, patch, perms.add, perms.edit, writeOutbox]);

  const deleteEvent = useCallback(async (id: string) => {
    const s = stateRef.current;
    if (!perms.delete) throw new Error('You do not have permission to delete moments.');
    const existing = s.events[id];
    if (!existing) return;
    const marked: MomentEvent = { ...existing, deleted_at: new Date().toISOString(), _pending: !PREVIEW };
    await local.put('events', marked);
    patch((st) => ({ events: { ...st.events, [id]: marked } }));
    if (PREVIEW) return;
    const queued = s.outbox.find((o) => o.event_id === id);
    await writeOutbox({
      event_id: id,
      kind: 'delete',
      payload: GITHUB ? ({ ...marked, _pending: undefined } as unknown as Record<string, unknown>) : null,
      expected_version: queued && queued.expected_version === null ? null : existing.version,
      queued_at: new Date().toISOString(),
      attempts: 0,
    });
    void flush();
  }, [flush, patch, perms.delete, writeOutbox]);

  const restoreEvent = useCallback(async (id: string) => {
    if (!perms.edit) throw new Error('You do not have permission to edit moments.');

    if (GITHUB) {
      const cfg = ghConfig();
      const identity = ghIdentity();
      const existing = stateRef.current.events[id];
      if (!cfg || !identity || !existing) return;
      const restored = await gh.restoreEvent(cfg, id, existing.created_at, identity.id);
      if (restored) {
        await local.put('events', restored);
        patch((st) => ({ events: { ...st.events, [id]: restored } }));
      }
      return;
    }

    const { data, error } = await supabase.rpc('restore_event', { p_id: id });
    if (error) throw new Error(friendlyError(error));
    const result = data as { event?: Record<string, unknown> };
    if (result?.event) applyServerEvents([result.event]);
  }, [applyServerEvents, perms.edit]);

  const getHistory = useCallback(async (eventId: string): Promise<EditHistoryEntry[]> => {
    if (PREVIEW) {
      const e = stateRef.current.events[eventId];
      if (!e) return [];
      const entries: EditHistoryEntry[] = [{
        id: `${eventId}-created`, event_id: eventId, changed_by: e.created_by,
        action: 'created', changes: [], version: 1, changed_at: e.created_at,
      }];
      if (e.updated_at !== e.created_at) {
        entries.push({
          id: `${eventId}-updated`, event_id: eventId, changed_by: e.updated_by,
          action: 'updated', changes: [{ field: 'event', to: 'edited' }],
          version: e.version, changed_at: e.updated_at,
        });
      }
      return entries;
    }

    if (GITHUB) {
      const cfg = ghConfig();
      const event = stateRef.current.events[eventId];
      if (!cfg || !event || !navigator.onLine) {
        return (await local.kvGet<EditHistoryEntry[]>(`history:${eventId}`)) ?? [];
      }
      try {
        const entries = await gh.getHistory(cfg, event);
        await local.kvSet(`history:${eventId}`, entries);
        return entries;
      } catch {
        return (await local.kvGet<EditHistoryEntry[]>(`history:${eventId}`)) ?? [];
      }
    }

    const cached = await local.kvGet<EditHistoryEntry[]>(`history:${eventId}`);
    if (navigator.onLine && isConfigured) {
      const { data } = await supabase
        .from('event_edit_history').select('*')
        .eq('event_id', eventId).order('changed_at', { ascending: true });
      if (data) {
        await local.kvSet(`history:${eventId}`, data);
        return data as EditHistoryEntry[];
      }
    }
    return cached ?? [];
  }, []);

  const addVocab = useCallback(async (
    table: 'triggers' | 'helpful_actions', name: string
  ): Promise<Vocab | null> => {
    const s = stateRef.current;
    if (!s.family || !s.session) return null;
    if (!perms.add) throw new Error('You do not have permission to add options.');
    const clean = name.trim();
    if (!clean) return null;
    const list = table === 'triggers' ? s.triggers : s.helpful;
    const dup = matchVocab(list, clean);
    if (dup) return dup;

    const row: Vocab = {
      id: uid(), family_id: s.family.id, name: clean, is_default: false,
      is_pinned: false, is_archived: false, sort_order: 500 + list.length,
      created_at: new Date().toISOString(),
    };
    patch((st) => (table === 'triggers'
      ? { triggers: [...st.triggers, row] }
      : { helpful: [...st.helpful, row] }));

    if (PREVIEW) {
      persistSnapshot({
        ...s,
        triggers: table === 'triggers' ? [...s.triggers, row] : s.triggers,
        helpful: table === 'helpful_actions' ? [...s.helpful, row] : s.helpful,
      });
      return row;
    }

    const entry: VocabOutboxEntry = {
      id: row.id, table, row: { ...row, created_by: s.session.user.id },
      queued_at: new Date().toISOString(),
    };
    await local.put('vocab_outbox', entry);
    patch((st) => ({ vocabOutbox: [...st.vocabOutbox, entry] }));
    void flush();
    return row;
  }, [flush, patch, perms.add]);

  const updateVocab = useCallback(async (
    table: 'triggers' | 'helpful_actions', id: string, update: Partial<Vocab>
  ) => {
    const s = stateRef.current;
    if (!perms.edit) throw new Error('You do not have permission to change options.');
    const list = table === 'triggers' ? s.triggers : s.helpful;
    const row = list.find((t) => t.id === id);
    if (!row) return;
    const next = { ...row, ...update };
    patch((st) => (table === 'triggers'
      ? { triggers: st.triggers.map((t) => (t.id === id ? next : t)) }
      : { helpful: st.helpful.map((t) => (t.id === id ? next : t))}));

    if (PREVIEW) {
      persistSnapshot({
        ...s,
        triggers: table === 'triggers' ? s.triggers.map((t) => (t.id === id ? next : t)) : s.triggers,
        helpful: table === 'helpful_actions' ? s.helpful.map((t) => (t.id === id ? next : t)) : s.helpful,
      });
      return;
    }

    const entry: VocabOutboxEntry = { id, table, row: next, queued_at: new Date().toISOString() };
    await local.put('vocab_outbox', entry);
    patch((st) => ({ vocabOutbox: [...st.vocabOutbox.filter((v) => v.id !== id), entry] }));
    void flush();
  }, [flush, patch, perms.edit]);

  /* ---------------------------------------------------------- family admin */

  const requireOnline = () => {
    if (PREVIEW) {
      throw new Error(
        'This is a preview with sample data. Connect your own database to manage a real family.'
      );
    }
    if (!navigator.onLine) throw new Error('This needs a connection. Try again when you are back online.');
  };

  /** Throw away the sample data and lay down a fresh set. */
  const resetPreview = useCallback(async () => {
    await local.wipe();
    window.location.reload();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(friendlyError(error));
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const { error } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { data: { display_name: displayName.trim() || 'Family member' } },
    });
    if (error) throw new Error(friendlyError(error));
  }, []);

  const signOut = useCallback(async () => {
    if (PREVIEW) {
      prefs.set('preview', false);
      await local.wipe();
      window.location.reload();
      return;
    }
    const pending = stateRef.current.outbox.length;
    if (pending > 0) throw new Error(`${pending} moment${pending === 1 ? '' : 's'} still waiting to sync. Stay signed in until they upload.`);

    if (GITHUB) {
      setGhToken(null);
      setGhIdentity(null);
      await local.wipe();
      window.location.reload();
      return;
    }

    await supabase.auth.signOut();
    await local.wipe();
  }, []);

  /** Connect this device to the family's private repository. */
  const connectGithub = useCallback(async (token: string, familyName: string, childName: string) => {
    const cfg = { owner: GH_OWNER, repo: GH_REPO, token: token.trim() };
    const identity = await gh.whoAmI(cfg);
    await gh.bootstrap(cfg, identity, familyName, childName);
    setGhToken(cfg.token);
    setGhIdentity(identity);
    patch({ session: fakeSession(identity.id) });
    await pull();
  }, [patch, pull]);

  const createFamily = useCallback(async (familyName: string, childName: string) => {
    requireOnline();
    const { data, error } = await supabase.rpc('create_family', {
      p_family_name: familyName, p_child_name: childName,
    });
    if (error) throw new Error(friendlyError(error));
    const result = data as { family_id: string; profile_id: string };
    prefs.set('familyId', result.family_id);
    prefs.set('profileId', result.profile_id);
    await pull();
  }, [pull]);

  const joinFamily = useCallback(async (code: string) => {
    requireOnline();
    const { data, error } = await supabase.rpc('accept_invite', { p_code: code.trim() });
    if (error) throw new Error(friendlyError(error));
    prefs.set('familyId', (data as { family_id: string }).family_id);
    await local.kvSet('watermark', null);
    await pull();
  }, [pull]);

  /** One place for every change to family.json, with the same retry-on-race
   *  the event writes use. */
  const editFamilyFile = useCallback(async (
    message: string, change: (current: gh.FamilyFile) => gh.FamilyFile
  ) => {
    const cfg = ghConfig();
    if (!cfg) throw new Error('Not connected to the family record.');
    if (!navigator.onLine) {
      throw new Error('This needs a connection. Try again when you are back online.');
    }
    await gh.updateFamily(cfg, message, change);
    await pull();
  }, [pull]);

  const updateMember = useCallback(async (memberId: string, update: Partial<FamilyMember>) => {
    if (GITHUB) {
      await editFamilyFile('Update what a family member can do', (f) => ({
        ...f,
        members: f.members.map((m) => (m.id === memberId ? { ...m, ...update } : m)),
      }));
      return;
    }
    requireOnline();
    const { error } = await supabase.from('family_members').update(update).eq('id', memberId);
    if (error) throw new Error(friendlyError(error));
    await pull();
  }, [editFamilyFile, pull]);

  const removeMember = useCallback(async (memberId: string) => {
    if (GITHUB) {
      const member = stateRef.current.members.find((m) => m.id === memberId);
      await editFamilyFile('Remove a family member', (f) => ({
        ...f,
        members: f.members.filter((m) => m.id !== memberId),
      }));
      // Losing the listing is not enough - take the repository access too.
      const cfg = ghConfig();
      if (cfg && member?.user_id.startsWith('gh:')) {
        await gh.removeCollaborator(cfg, member.user_id.slice(3)).catch(() => {});
      }
      return;
    }
    requireOnline();
    const { error } = await supabase.from('family_members').delete().eq('id', memberId);
    if (error) throw new Error(friendlyError(error));
    await pull();
  }, [editFamilyFile, pull]);

  const createInvite = useCallback(async (role: Role, label: string): Promise<string> => {
    requireOnline();
    const s = stateRef.current;
    if (!s.family) throw new Error('No family yet.');
    const { data, error } = await supabase.rpc('create_invite', {
      p_family: s.family.id, p_role: role, p_label: label,
    });
    if (error) throw new Error(friendlyError(error));
    return (data as { code: string }).code;
  }, []);

  /** On the GitHub backend the invitation is repository access. */
  const inviteGithubUser = useCallback(async (username: string, role: Role) => {
    const cfg = ghConfig();
    if (!cfg) throw new Error('Not connected to the family record.');
    const clean = username.trim().replace(/^@/, '');
    if (!clean) throw new Error('Enter their GitHub username.');
    await gh.inviteCollaborator(cfg, clean);
    await editFamilyFile(`Invite ${clean}`, (f) => {
      const id = `gh:${clean}`;
      if (f.members.some((m) => m.user_id === id)) return f;
      return {
        ...f,
        people: { ...f.people, [id]: { id, email: null, display_name: clean, avatar_hue: 28 } },
        members: [...f.members, {
          id: uid(), family_id: f.family.id, user_id: id, role,
          can_view: true, can_add: role !== 'viewer', can_edit: role !== 'viewer',
          can_delete: false, can_view_stats: true, can_manage_members: false,
          joined_at: new Date().toISOString(),
        }],
      };
    });
  }, [editFamilyFile]);

  const updateMyName = useCallback(async (name: string) => {
    const s = stateRef.current;
    if (!s.session) return;
    const myId = s.session.user.id;
    if (GITHUB) {
      await editFamilyFile('Update a name', (f) => ({
        ...f,
        people: {
          ...f.people,
          [myId]: {
            ...(f.people[myId] ?? { id: myId, email: null, avatar_hue: 210 }),
            display_name: name.trim() || 'Family member',
          },
        },
      }));
      return;
    }
    requireOnline();
    const { error } = await supabase.from('users')
      .update({ display_name: name.trim() || 'Family member', updated_at: new Date().toISOString() })
      .eq('id', myId);
    if (error) throw new Error(friendlyError(error));
    await pull();
  }, [editFamilyFile, pull]);

  const renameFamily = useCallback(async (name: string) => {
    if (GITHUB) {
      await editFamilyFile('Rename the family', (f) => ({
        ...f, family: { ...f.family, name: name.trim() || 'Our family' },
      }));
      return;
    }
    requireOnline();
    const s = stateRef.current;
    if (!s.family) return;
    const { error } = await supabase.from('families').update({ name: name.trim() }).eq('id', s.family.id);
    if (error) throw new Error(friendlyError(error));
    await pull();
  }, [editFamilyFile, pull]);

  const renameProfile = useCallback(async (profileId: string, name: string) => {
    if (GITHUB) {
      await editFamilyFile('Rename a child profile', (f) => ({
        ...f,
        profiles: f.profiles.map((p) => (p.id === profileId ? { ...p, name: name.trim() } : p)),
      }));
      return;
    }
    requireOnline();
    const { error } = await supabase.from('profiles').update({ name: name.trim() }).eq('id', profileId);
    if (error) throw new Error(friendlyError(error));
    await pull();
  }, [editFamilyFile, pull]);

  const addProfile = useCallback(async (name: string) => {
    if (GITHUB) {
      await editFamilyFile('Add a child profile', (f) => ({
        ...f,
        profiles: [...f.profiles, {
          id: uid(), family_id: f.family.id, name: name.trim(), colour_hue: 28,
          birth_year: null, is_archived: false, sort_order: f.profiles.length,
        }],
      }));
      return;
    }
    requireOnline();
    const s = stateRef.current;
    if (!s.family) return;
    const { error } = await supabase.from('profiles').insert({
      family_id: s.family.id, name: name.trim(), sort_order: s.profiles.length,
    });
    if (error) throw new Error(friendlyError(error));
    await pull();
  }, [editFamilyFile, pull]);

  const setActiveProfile = useCallback((id: string) => {
    prefs.set('profileId', id);
    patch({ activeProfileId: id });
  }, [patch]);

  /* ------------------------------------------------------------ conflicts */

  const resolveConflict = useCallback(async (eventId: string, keep: EventDraft | null) => {
    if (keep) await saveEvent({ ...keep, id: eventId });
    patch((s) => ({ conflicts: s.conflicts.filter((c) => c.event_id !== eventId) }));
  }, [patch, saveEvent]);

  const dismissConflict = useCallback((eventId: string) => {
    patch((s) => ({ conflicts: s.conflicts.filter((c) => c.event_id !== eventId) }));
  }, [patch]);

  const retryOutbox = useCallback(async (eventId?: string) => {
    const s = stateRef.current;
    const targets = eventId ? s.outbox.filter((o) => o.event_id === eventId) : s.outbox;
    for (const t of targets) {
      const cleared: OutboxEntry = { ...t, error: undefined, attempts: 0 };
      await local.put('outbox', cleared);
    }
    patch((st) => ({
      outbox: st.outbox.map((o) =>
        !eventId || o.event_id === eventId ? { ...o, error: undefined, attempts: 0 } : o),
    }));
    await flush();
  }, [flush, patch]);

  const discardOutbox = useCallback(async (eventId: string) => {
    await clearOutbox(eventId);
    const { data } = await supabase.from('event_view').select(EVENT_COLUMNS).eq('id', eventId).maybeSingle();
    if (data) applyServerEvents([data as Record<string, unknown>]);
    else {
      await local.del('events', eventId);
      patch((s) => {
        const next = { ...s.events };
        delete next[eventId];
        return { events: next };
      });
    }
  }, [applyServerEvents, clearOutbox, patch]);

  const exportFamilyData = useCallback(async () => {
    if (PREVIEW || GITHUB) {
      const s = stateRef.current;
      return {
        exported_at: new Date().toISOString(),
        note: 'Sample data from the Moments preview.',
        family: s.family,
        members: s.members,
        people: Object.values(s.people),
        profiles: s.profiles,
        triggers: s.triggers,
        helpful_actions: s.helpful,
        events: Object.values(s.events).filter((e) => !e.deleted_at),
      };
    }
    requireOnline();
    const s = stateRef.current;
    if (!s.family) return null;
    const { data, error } = await supabase.rpc('export_family_data', { p_family: s.family.id });
    if (error) throw new Error(friendlyError(error));
    return data;
  }, []);

  const deleteMyData = useCallback(async (deleteFamily: boolean): Promise<string> => {
    if (GITHUB) {
      const cfg = ghConfig();
      if (!cfg) throw new Error('Not connected to the family record.');
      if (!navigator.onLine) throw new Error('This needs a connection.');
      await gh.eraseAll(cfg);
      setGhToken(null);
      setGhIdentity(null);
      await local.wipe();
      return 'records_erased';
    }
    requireOnline();
    const s = stateRef.current;
    if (!s.family) return 'nothing_to_delete';
    const { data, error } = await supabase.rpc('delete_my_data', {
      p_family: s.family.id, p_delete_family: deleteFamily,
    });
    if (error) throw new Error(friendlyError(error));
    await local.wipe();
    return (data as { status: string }).status;
  }, []);

  /* ----------------------------------------------------------- selectors */

  const allEvents = useMemo(
    () => Object.values(state.events)
      .filter((e) => !e.deleted_at)
      .sort((a, b) => b.start_time.localeCompare(a.start_time)),
    [state.events]
  );

  const nameOf = useCallback((userId: string | null | undefined) => {
    if (!userId) return 'Someone';
    if (userId === state.session?.user.id) return 'You';
    return state.people[userId]?.display_name ?? 'Family member';
  }, [state.people, state.session?.user.id]);

  const triggerName = useCallback(
    (id: string) => state.triggers.find((t) => t.id === id)?.name ?? 'Trigger',
    [state.triggers]
  );
  const helpfulName = useCallback(
    (id: string) => state.helpful.find((t) => t.id === id)?.name ?? 'Response',
    [state.helpful]
  );

  const value: Store = {
    ...state,
    perms,
    allEvents,
    pendingCount: state.outbox.length,
    needsFamily: Boolean(state.session && state.ready && !state.family && !state.loadingRemote),
    nameOf, triggerName, helpfulName,
    signIn, signUp, signOut, createFamily, joinFamily,
    saveEvent, deleteEvent, restoreEvent, getHistory,
    addTrigger: (name) => addVocab('triggers', name),
    addHelpful: (name) => addVocab('helpful_actions', name),
    updateVocab,
    updateMember, removeMember, createInvite, updateMyName, renameFamily,
    renameProfile, addProfile, setActiveProfile,
    backend: backendMode,
    repoUrl: ghRepoUrl,
    connectGithub, inviteGithubUser,
    preview: PREVIEW, resetPreview,
    resolveConflict, dismissConflict, retryOutbox, discardOutbox,
    sync: async () => { await pull(); await flush(); },
    exportFamilyData, deleteMyData,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
