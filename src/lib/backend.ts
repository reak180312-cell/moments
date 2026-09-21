/**
 * Which backend this build talks to, and the one secret the GitHub backend
 * needs. The token is kept in this device's localStorage and nowhere else:
 * never in the repository, never in a URL, never sent anywhere but GitHub.
 */

import { isConfigured } from './supabase';
import type { GhConfig, GhIdentity } from './github';

export type BackendMode = 'supabase' | 'github' | 'none';

export const GH_OWNER = (import.meta.env.VITE_GH_OWNER as string | undefined) ?? '';
export const GH_REPO = (import.meta.env.VITE_GH_REPO as string | undefined) ?? 'moments-data';

export const backendMode: BackendMode =
  import.meta.env.VITE_BACKEND === 'github' && GH_OWNER
    ? 'github'
    : isConfigured
      ? 'supabase'
      : 'none';

const TOKEN_KEY = 'moments.gh.token';
const IDENTITY_KEY = 'moments.gh.identity';

export function ghToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setGhToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked: the person will have to reconnect each session */
  }
}

export function ghIdentity(): GhIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    return raw ? (JSON.parse(raw) as GhIdentity) : null;
  } catch {
    return null;
  }
}

export function setGhIdentity(identity: GhIdentity | null): void {
  try {
    if (identity) localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    else localStorage.removeItem(IDENTITY_KEY);
  } catch {
    /* ignore */
  }
}

export function ghConfig(): GhConfig | null {
  const token = ghToken();
  if (!token || !GH_OWNER) return null;
  return { owner: GH_OWNER, repo: GH_REPO, token };
}

export const ghRepoUrl = `https://github.com/${GH_OWNER}/${GH_REPO}`;
