import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False until .env is filled in - the app then shows setup instructions
 *  instead of failing silently. */
export const isConfigured = Boolean(url && anonKey && url.startsWith('https://'));

/**
 * One client for the whole app. All traffic is HTTPS to the project's own
 * Supabase instance; the anon key carries no privileges of its own - every
 * request is authorized by the signed-in user's JWT against the row level
 * security policies in supabase/schema.sql.
 */
export const supabase: SupabaseClient = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'moments.auth',
    },
    realtime: { params: { eventsPerSecond: 8 } },
    global: { headers: { 'x-application-name': 'moments' } },
  }
);

/** Turns a Postgres/PostgREST error into something a parent can act on. */
export function friendlyError(error: unknown): string {
  const raw =
    typeof error === 'string'
      ? error
      : (error as { message?: string } | null)?.message ?? 'Something went wrong.';
  if (/not_allowed|42501|permission/i.test(raw)) return 'You do not have permission to do that.';
  if (/invite_not_found/i.test(raw)) return 'That invite code was not recognised.';
  if (/invite_expired/i.test(raw)) return 'That invite has expired. Ask for a new one.';
  if (/invite_already_used/i.test(raw)) return 'That invite has already been used.';
  if (/invite_revoked/i.test(raw)) return 'That invite was cancelled.';
  if (/Failed to fetch|NetworkError|network/i.test(raw)) return 'No connection right now.';
  if (/Invalid login credentials/i.test(raw)) return 'That email and password did not match.';
  if (/User already registered/i.test(raw)) return 'There is already an account with that email.';
  if (/Password should be/i.test(raw)) return 'Please choose a password of at least 8 characters.';
  return raw;
}

export function isNetworkError(error: unknown): boolean {
  const raw = (error as { message?: string } | null)?.message ?? String(error ?? '');
  return /Failed to fetch|NetworkError|network|timeout|ECONN|offline/i.test(raw);
}
