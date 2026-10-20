import {
  collection,
  doc,
  getDoc,
  increment,
  limit as fbLimit,
  onSnapshot,
  orderBy as fbOrderBy,
  query,
  runTransaction,
  setDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from './firebase';

export type Op =
  | { op: 'set'; path: string; data: Record<string, unknown>; merge?: boolean }
  | { op: 'delete'; path: string }
  // Incrémente un champ numérique de façon atomique ; `data` = champs complémentaires fusionnés.
  | { op: 'inc'; path: string; field: string; by: number; data?: Record<string, unknown> };

export interface QueryOpts {
  orderBy?: [string, 'asc' | 'desc'];
  limit?: number;
}

export interface CommitOptions {
  allowChunking?: boolean; // réservé aux imports et à la génération de démo
}

export interface DataStore {
  mode: 'local' | 'firebase';
  subscribeCollection<T>(path: string, cb: (rows: T[]) => void, opts?: QueryOpts, onError?: (e: Error) => void): () => void;
  subscribeDoc<T>(path: string, cb: (row: T | null) => void, onError?: (e: Error) => void): () => void;
  getDoc<T>(path: string): Promise<T | null>;
  commit(ops: Op[], options?: CommitOptions): Promise<void>;
  getNextSequence(orgId: string, counterKey: string): Promise<number>;
}

const split = (path: string): { coll: string; id: string } => {
  const i = path.lastIndexOf('/');
  return { coll: path.slice(0, i), id: path.slice(i + 1) };
};

/* ---------------------------------------------------------------- Local (démo) */

const LS = 'lt:';
const listeners = new Map<string, Set<() => void>>();

const readColl = (coll: string): Record<string, Record<string, unknown>> => {
  try {
    return JSON.parse(localStorage.getItem(LS + coll) ?? '{}');
  } catch {
    return {};
  }
};
const writeColl = (coll: string, v: Record<string, Record<string, unknown>>) => localStorage.setItem(LS + coll, JSON.stringify(v));
const emit = (coll: string) => listeners.get(coll)?.forEach((fn) => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key?.startsWith(LS)) emit(e.key.slice(LS.length));
  });
}

const sortRows = (rows: Record<string, unknown>[], opts?: QueryOpts) => {
  let out = rows;
  if (opts?.orderBy) {
    const [f, dir] = opts.orderBy;
    out = [...out].sort((a, b) => {
      const x = a[f] as number | string;
      const y = b[f] as number | string;
      return (x > y ? 1 : x < y ? -1 : 0) * (dir === 'desc' ? -1 : 1);
    });
  }
  return opts?.limit ? out.slice(0, opts.limit) : out;
};

export const localStore: DataStore = {
  mode: 'local',
  subscribeCollection(path, cb, opts) {
    const run = () => cb(sortRows(Object.values(readColl(path)), opts) as never);
    if (!listeners.has(path)) listeners.set(path, new Set());
    listeners.get(path)!.add(run);
    queueMicrotask(run);
    return () => listeners.get(path)?.delete(run);
  },
  subscribeDoc(path, cb) {
    const { coll, id } = split(path);
    const run = () => cb((readColl(coll)[id] as never) ?? null);
    if (!listeners.has(coll)) listeners.set(coll, new Set());
    listeners.get(coll)!.add(run);
    queueMicrotask(run);
    return () => listeners.get(coll)?.delete(run);
  },
  async getDoc(path) {
    const { coll, id } = split(path);
    return (readColl(coll)[id] as never) ?? null;
  },
  async commit(ops) {
    const touched = new Map<string, Record<string, Record<string, unknown>>>();
    const get = (coll: string) => {
      if (!touched.has(coll)) touched.set(coll, readColl(coll));
      return touched.get(coll)!;
    };
    for (const o of ops) {
      const { coll, id } = split(o.path);
      const c = get(coll);
      if (o.op === 'delete') delete c[id];
      else if (o.op === 'set') c[id] = o.merge ? { ...(c[id] ?? {}), ...o.data } : { ...o.data };
      else {
        const cur = c[id] ?? {};
        c[id] = { ...cur, ...(o.data ?? {}), [o.field]: ((cur[o.field] as number) ?? 0) + o.by };
      }
    }
    for (const [coll, v] of touched) writeColl(coll, v);
    for (const coll of touched.keys()) emit(coll);
  },
  async getNextSequence(orgId, counterKey) {
    const coll = `orgs/${orgId}/counters`;
    const c = readColl(coll);
    const cur = (c[counterKey]?.value as number) ?? 0;
    const next = cur + 1;
    c[counterKey] = { ...(c[counterKey] ?? {}), id: counterKey, value: next, updatedAt: Date.now() };
    writeColl(coll, c);
    emit(coll);
    return next;
  },
};

/** Supprime toutes les données locales (mode démo). */
export function resetLocalData(): void {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(LS))
    .forEach((k) => localStorage.removeItem(k));
  listeners.forEach((s) => s.forEach((fn) => fn()));
}

/* ---------------------------------------------------------------- Firestore */

export const firestoreStore: DataStore = {
  mode: 'firebase',
  subscribeCollection(path, cb, opts, onError) {
    const db = getFirebaseDb();
    const parts: Parameters<typeof query>[1][] = [];
    if (opts?.orderBy) parts.push(fbOrderBy(opts.orderBy[0], opts.orderBy[1]));
    if (opts?.limit) parts.push(fbLimit(opts.limit));
    const q = parts.length ? query(collection(db, path), ...parts) : collection(db, path);
    return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data()) as never), (e) => onError?.(e));
  },
  subscribeDoc(path, cb, onError) {
    return onSnapshot(doc(getFirebaseDb(), path), (s) => cb((s.exists() ? s.data() : null) as never), (e) => onError?.(e));
  },
  async getDoc(path) {
    const s = await getDoc(doc(getFirebaseDb(), path));
    return (s.exists() ? s.data() : null) as never;
  },
  async commit(ops, options) {
    const db = getFirebaseDb();
    if (!ops.length) return;
    if (ops.length === 1) {
      const o = ops[0];
      const ref = doc(db, o.path);
      if (o.op === 'delete') return deleteDoc(ref);
      if (o.op === 'set') return setDoc(ref, o.data, { merge: !!o.merge });
      return setDoc(ref, { ...(o.data ?? {}), [o.field]: increment(o.by) }, { merge: true });
    }
    // Règle d'atomicité : les opérations métier ne doivent pas être morcelées silencieusement.
    if (ops.length > 500 && !options?.allowChunking) {
      throw new Error(`Opération métier trop volumineuse pour être exécutée atomiquement (${ops.length} écritures, maximum 500).`);
    }
    for (let i = 0; i < ops.length; i += 450) {
      const batch = writeBatch(db);
      for (const o of ops.slice(i, i + 450)) {
        const ref = doc(db, o.path);
        if (o.op === 'delete') batch.delete(ref);
        else if (o.op === 'set') batch.set(ref, o.data, { merge: !!o.merge });
        else batch.set(ref, { ...(o.data ?? {}), [o.field]: increment(o.by) }, { merge: true });
      }
      await batch.commit();
    }
  },
  async getNextSequence(orgId, counterKey) {
    const db = getFirebaseDb();
    const ref = doc(db, `orgs/${orgId}/counters/${counterKey}`);
    return await runTransaction(db, async (txn) => {
      const snap = await txn.get(ref);
      const cur = (snap.data()?.value as number) ?? 0;
      const next = cur + 1;
      txn.set(ref, { id: counterKey, value: next, updatedAt: Date.now() }, { merge: true });
      return next;
    });
  },
};

export const getStore = (demo: boolean): DataStore => (demo || !isFirebaseConfigured() ? localStore : firestoreStore);
