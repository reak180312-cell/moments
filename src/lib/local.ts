/**
 * The device-local cache.
 *
 * This is a cache and an outbox - never a second source of truth. Everything
 * here either came from the server or is waiting to go to it. Clearing it
 * loses nothing that has already synced.
 */

const DB_NAME = 'moments';
const DB_VERSION = 1;

export type StoreName = 'events' | 'outbox' | 'vocab_outbox' | 'kv' | 'history';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'event_id' });
      if (!db.objectStoreNames.contains('vocab_outbox')) db.createObjectStore('vocab_outbox', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('history')) db.createObjectStore('history', { keyPath: 'event_id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export const local = {
  async getAll<T>(store: StoreName): Promise<T[]> {
    try {
      return (await tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)) ?? [];
    } catch {
      return [];
    }
  },

  async put<T>(store: StoreName, value: T, key?: IDBValidKey): Promise<void> {
    try {
      await tx(store, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key)));
    } catch {
      /* private mode / blocked storage: the app still works, just without a cache */
    }
  },

  async putMany<T>(store: StoreName, values: T[]): Promise<void> {
    if (!values.length) return;
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const t = db.transaction(store, 'readwrite');
        const os = t.objectStore(store);
        values.forEach((v) => os.put(v));
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
    } catch {
      /* ignore */
    }
  },

  async del(store: StoreName, key: IDBValidKey): Promise<void> {
    try {
      await tx(store, 'readwrite', (s) => s.delete(key));
    } catch {
      /* ignore */
    }
  },

  async clear(store: StoreName): Promise<void> {
    try {
      await tx(store, 'readwrite', (s) => s.clear());
    } catch {
      /* ignore */
    }
  },

  async kvGet<T>(key: string): Promise<T | null> {
    try {
      const v = await tx<T>('kv', 'readonly', (s) => s.get(key) as IDBRequest<T>);
      return v ?? null;
    } catch {
      return null;
    }
  },

  async kvSet<T>(key: string, value: T): Promise<void> {
    await local.put('kv', value, key);
  },

  async wipe(): Promise<void> {
    await Promise.all(
      (['events', 'outbox', 'vocab_outbox', 'kv', 'history'] as StoreName[]).map((s) => local.clear(s))
    );
  },
};

/** Small, non-sensitive preferences (theme, text size). Never family data. */
export const prefs = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem('moments.' + key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem('moments.' + key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
};
