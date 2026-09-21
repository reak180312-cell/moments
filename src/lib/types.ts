/** Shared shapes. These mirror supabase/schema.sql exactly. */

export type Role = 'owner' | 'member' | 'viewer';

export type PermissionKey =
  | 'can_view' | 'can_add' | 'can_edit' | 'can_delete' | 'can_view_stats' | 'can_manage_members';

export interface AppUser {
  id: string;
  email: string | null;
  display_name: string;
  avatar_hue: number;
}

export interface Family {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export interface FamilyMember {
  id: string;
  family_id: string;
  user_id: string;
  role: Role;
  can_view: boolean;
  can_add: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_view_stats: boolean;
  can_manage_members: boolean;
  joined_at: string;
}

export interface ChildProfile {
  id: string;
  family_id: string;
  name: string;
  colour_hue: number;
  birth_year: number | null;
  is_archived: boolean;
  sort_order: number;
}

export interface Vocab {
  id: string;
  family_id: string;
  name: string;
  is_default: boolean;
  is_pinned: boolean;
  is_archived: boolean;
  sort_order: number;
  created_at: string;
}

export type SleepQuality = 'poor' | 'okay' | 'good';
export type HungryValue = 'yes' | 'no' | 'unknown';

export const LOCATIONS = ['Home', 'School', 'Car', 'Outside', 'Family/Friends', 'Other'] as const;

export interface MomentEvent {
  id: string;
  family_id: string;
  profile_id: string;
  created_by: string;
  updated_by: string | null;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  difficulty: number | null;
  description: string | null;
  location: string | null;
  notes: string | null;
  sleep_quality: SleepQuality | null;
  hungry: HungryValue | null;
  school_day: boolean | null;
  unusual_day: boolean | null;
  status: 'draft' | 'complete';
  version: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  trigger_ids: string[];
  helpful_ids: string[];
  /** Local-only: this device still has an unsent change for this moment. */
  _pending?: boolean;
  /** Local-only: the last send failed for a reason retrying will not fix. */
  _error?: string;
}

export interface EditHistoryEntry {
  id: string;
  event_id: string;
  changed_by: string | null;
  action: 'created' | 'updated' | 'deleted' | 'restored';
  changes: { field: string; from?: unknown; to?: unknown }[];
  version: number | null;
  changed_at: string;
}

/** A queued write. One entry per event id: later edits replace the entry,
 *  so replaying the queue can never produce a duplicate or an out-of-order write. */
export interface OutboxEntry {
  event_id: string;
  kind: 'save' | 'delete';
  payload: Record<string, unknown> | null;
  expected_version: number | null;
  queued_at: string;
  attempts: number;
  error?: string;
}

/** A queued new trigger / helpful action, so custom options work offline too. */
export interface VocabOutboxEntry {
  id: string;
  table: 'triggers' | 'helpful_actions';
  row: Record<string, unknown>;
  queued_at: string;
}

export interface Conflict {
  event_id: string;
  mine: MomentEvent;
  theirs: MomentEvent;
  detected_at: string;
}

export interface Permissions {
  view: boolean;
  add: boolean;
  edit: boolean;
  delete: boolean;
  stats: boolean;
  manage: boolean;
}

export const NO_PERMISSIONS: Permissions = {
  view: false, add: false, edit: false, delete: false, stats: false, manage: false,
};
