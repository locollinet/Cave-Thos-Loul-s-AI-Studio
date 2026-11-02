import {
  collection,
  deleteField,
  doc,
  getDoc,
  increment,
  limit as fbLimit,
  onSnapshot,
  orderBy as fbOrderBy,
  query,
  runTransaction,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from './firebase';
import { DELETE_FIELD, SERVER_TIME } from './sentinels';

export { DELETE_FIELD, SERVER_TIME };

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
  /** Réserve le numéro suivant et écrit les opérations construites avec lui, dans une seule transaction. */
  commitWithSequence(orgId: string, counterKey: string, build: (seq: number) => Op[]): Promise<number>;
}

const MAX_ATOMIC_OPS = 500;

const split = (path: string): { coll: string; id: string } => {
  const i = path.lastIndexOf('/');
  return { coll: path.slice(0, i), id: path.slice(i + 1) };
};

/* ---------------------------------------------------------------- Champs confidentiels */

/**
 * Prix d'achat, coefficients et coûts : rangés dans une collection annexe (même identifiant) que les règles
 * réservent aux rôles de back-office. Les écrans lisent des objets fusionnés, sans rien savoir de ce découpage.
 */
export const PRIVATE_FIELDS: Record<string, { coll: string; fields: string[]; keep: string[] }> = {
  wines: { coll: 'wineCosts', fields: ['buyPriceHT', 'coefficient'], keep: [] },
  movements: { coll: 'movementCosts', fields: ['unitCostHT'], keep: ['createdAt'] },
};

const ORG_DOC = /^orgs\/([^/]+)\/([^/]+)\/([^/]+)$/;
const ORG_COLL = /^orgs\/([^/]+)\/([^/]+)$/;

/** Déplace les champs confidentiels des écritures vers leur collection annexe. */
export function splitPrivateOps(ops: Op[]): Op[] {
  const out: Op[] = [];
  for (const o of ops) {
    const m = ORG_DOC.exec(o.path);
    const spec = m ? PRIVATE_FIELDS[m[2]] : undefined;
    if (!m || !spec || o.op === 'inc') {
      out.push(o);
      continue;
    }
    const sidePath = `orgs/${m[1]}/${spec.coll}/${m[3]}`;
    if (o.op === 'delete') {
      out.push(o, { op: 'delete', path: sidePath });
      continue;
    }
    const pub: Record<string, unknown> = {};
    const side: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o.data)) {
      if (!spec.fields.includes(k)) pub[k] = v;
      else if (v !== undefined) side[k] = v;
      // Une écriture complète qui vide explicitement le champ l'efface aussi dans l'annexe.
      else if (!o.merge) side[k] = DELETE_FIELD;
    }
    out.push({ ...o, data: pub });
    if (Object.keys(side).length) {
      for (const k of spec.keep) if (o.data[k] !== undefined) side[k] = o.data[k];
      out.push({ op: 'set', path: sidePath, data: { id: m[3], ...side }, merge: true });
    }
  }
  return out;
}

/** Superpose aux documents les champs confidentiels lus dans l'annexe. */
export function mergePrivate<T>(rows: T[], side: Record<string, unknown>[]): T[] {
  if (!side.length) return rows;
  const byId = new Map(side.map((s) => [s.id as string, s]));
  return rows.map((r) => {
    const s = byId.get((r as { id?: string }).id ?? '');
    if (!s) return r;
    const { id: _id, createdAt: _createdAt, ...fields } = s;
    return { ...r, ...fields };
  });
}

/** Documents encore porteurs de champs confidentiels (données antérieures au découpage). */
export function legacyPrivateRows(coll: string, rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const spec = PRIVATE_FIELDS[coll];
  return spec ? rows.filter((r) => spec.fields.some((f) => r[f] !== undefined)) : [];
}

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

/** Applique les valeurs spéciales (horodatage, effacement) à un document local. */
const applyLocal = (base: Record<string, unknown>, data: Record<string, unknown>, now: number): Record<string, unknown> => {
  const out = { ...base };
  for (const [k, v] of Object.entries(data)) {
    if (v === DELETE_FIELD) delete out[k];
    else out[k] = v === SERVER_TIME ? now : v;
  }
  return out;
};

const tooLarge = (n: number) => new Error(`Opération métier trop volumineuse pour être exécutée atomiquement (${n} écritures, maximum ${MAX_ATOMIC_OPS}).`);

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
  async commit(ops, options) {
    if (ops.length > MAX_ATOMIC_OPS && !options?.allowChunking) throw tooLarge(ops.length);
    const now = Date.now();
    const touched = new Map<string, Record<string, Record<string, unknown>>>();
    const get = (coll: string) => {
      if (!touched.has(coll)) touched.set(coll, readColl(coll));
      return touched.get(coll)!;
    };
    for (const o of ops) {
      const { coll, id } = split(o.path);
      const c = get(coll);
      if (o.op === 'delete') delete c[id];
      else if (o.op === 'set') c[id] = applyLocal(o.merge ? (c[id] ?? {}) : {}, o.data, now);
      else {
        const cur = c[id] ?? {};
        c[id] = { ...applyLocal(cur, o.data ?? {}, now), [o.field]: ((cur[o.field] as number) ?? 0) + o.by };
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
  async commitWithSequence(orgId, counterKey, build) {
    const path = `orgs/${orgId}/counters/${counterKey}`;
    const next = (((await localStore.getDoc<{ value?: number }>(path))?.value) ?? 0) + 1;
    const ops = build(next);
    await localStore.commit([{ op: 'set', path, data: { id: counterKey, value: next, updatedAt: Date.now() }, merge: true }, ...ops]);
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

// Les valeurs undefined sont retirées (en profondeur) : l'écriture ne dépend pas du réglage ignoreUndefinedProperties.
const withoutUndefined = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.filter((x) => x !== undefined).map(withoutUndefined);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, withoutUndefined(x)]));
  }
  return v;
};

const toFirestore = (data: Record<string, unknown>): DocumentData => {
  const out: DocumentData = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    out[k] = v === SERVER_TIME ? serverTimestamp() : v === DELETE_FIELD ? deleteField() : withoutUndefined(v);
  }
  return out;
};

interface Writer {
  set(ref: DocumentReference, data: DocumentData, options: { merge: boolean }): unknown;
  delete(ref: DocumentReference): unknown;
}

function write(w: Writer, ref: DocumentReference, o: Op): void {
  if (o.op === 'delete') w.delete(ref);
  else if (o.op === 'set') w.set(ref, toFirestore(o.data), { merge: !!o.merge });
  else w.set(ref, { ...toFirestore(o.data ?? {}), [o.field]: increment(o.by) }, { merge: true });
}

const fsQuery = (path: string, opts?: QueryOpts) => {
  const db = getFirebaseDb();
  const parts: Parameters<typeof query>[1][] = [];
  if (opts?.orderBy) parts.push(fbOrderBy(opts.orderBy[0], opts.orderBy[1]));
  if (opts?.limit) parts.push(fbLimit(opts.limit));
  return parts.length ? query(collection(db, path), ...parts) : collection(db, path);
};

const migrated = new Set<string>();

/** Range dans l'annexe les champs confidentiels des documents antérieurs au découpage (rôles de back-office). */
async function migrateLegacy(path: string, coll: string, rows: Record<string, unknown>[]): Promise<void> {
  const spec = PRIVATE_FIELDS[coll];
  const legacy = legacyPrivateRows(coll, rows);
  // Les mouvements sont immuables : seuls les vins sont migrés.
  if (coll !== 'wines' || !legacy.length || migrated.has(path)) return;
  migrated.add(path);
  const db = getFirebaseDb();
  const sidePath = path.replace(/\/[^/]+$/, `/${spec.coll}`);
  try {
    for (let i = 0; i < legacy.length; i += 200) {
      const batch = writeBatch(db);
      for (const r of legacy.slice(i, i + 200)) {
        const present = spec.fields.filter((f) => r[f] !== undefined);
        batch.set(doc(db, `${sidePath}/${r.id}`), { id: r.id, ...Object.fromEntries(present.map((f) => [f, r[f]])) }, { merge: true });
        batch.set(doc(db, `${path}/${r.id}`), Object.fromEntries(present.map((f) => [f, deleteField()])), { merge: true });
      }
      await batch.commit();
    }
  } catch (e) {
    console.warn('Migration des prix d’achat différée', (e as Error).message);
  }
}

export const firestoreStore: DataStore = {
  mode: 'firebase',
  subscribeCollection(path, cb, opts, onError) {
    const m = ORG_COLL.exec(path);
    const spec = m ? PRIVATE_FIELDS[m[2]] : undefined;
    if (!m || !spec) return onSnapshot(fsQuery(path, opts), (snap) => cb(snap.docs.map((d) => d.data()) as never), (e) => onError?.(e));

    // Annexe confidentielle : lue si le rôle le permet, ignorée sinon (refus des règles).
    let main: DocumentData[] | null = null;
    let side: DocumentData[] = [];
    let sideReadable = false;
    const emitMerged = () => {
      if (!main) return;
      cb(mergePrivate(main, side) as never);
      if (sideReadable) void migrateLegacy(path, m[2], main);
    };
    const sideOpts = opts?.orderBy && !spec.keep.includes(opts.orderBy[0]) ? undefined : opts;
    const unsubMain = onSnapshot(
      fsQuery(path, opts),
      (snap) => {
        main = snap.docs.map((d) => d.data());
        emitMerged();
      },
      (e) => onError?.(e),
    );
    const unsubSide = onSnapshot(
      fsQuery(`orgs/${m[1]}/${spec.coll}`, sideOpts),
      (snap) => {
        side = snap.docs.map((d) => d.data());
        sideReadable = true;
        emitMerged();
      },
      () => {
        side = [];
        emitMerged();
      },
    );
    return () => {
      unsubMain();
      unsubSide();
    };
  },
  subscribeDoc(path, cb, onError) {
    return onSnapshot(doc(getFirebaseDb(), path), (s) => cb((s.exists() ? s.data() : null) as never), (e) => onError?.(e));
  },
  async getDoc(path) {
    const db = getFirebaseDb();
    const s = await getDoc(doc(db, path));
    if (!s.exists()) return null as never;
    const m = ORG_DOC.exec(path);
    const spec = m ? PRIVATE_FIELDS[m[2]] : undefined;
    if (m && spec) {
      const side = await getDoc(doc(db, `orgs/${m[1]}/${spec.coll}/${m[3]}`)).catch(() => null);
      if (side?.exists()) return mergePrivate([s.data()], [side.data()])[0] as never;
    }
    return s.data() as never;
  },
  async commit(ops, options) {
    return commitToFirestore(getFirebaseDb(), ops, options);
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
  async commitWithSequence(orgId, counterKey, build) {
    return commitWithSequenceToFirestore(getFirebaseDb(), orgId, counterKey, build);
  },
};

/** Écrit un lot dans Firestore (champs confidentiels séparés, valeurs spéciales converties). */
export async function commitToFirestore(db: Firestore, ops: Op[], options?: CommitOptions): Promise<void> {
  const all = splitPrivateOps(ops);
  if (!all.length) return;
  // Règle d'atomicité : une opération métier n'est jamais morcelée, sauf import ou génération de démo.
  if (all.length > MAX_ATOMIC_OPS && !options?.allowChunking) throw tooLarge(all.length);
  const size = all.length > MAX_ATOMIC_OPS ? 450 : MAX_ATOMIC_OPS;
  for (let i = 0; i < all.length; i += size) {
    const batch = writeBatch(db);
    for (const o of all.slice(i, i + size)) write(batch, doc(db, o.path), o);
    await batch.commit();
  }
}

/** Réserve le numéro suivant du compteur et écrit les opérations construites avec lui, en une transaction. */
export async function commitWithSequenceToFirestore(db: Firestore, orgId: string, counterKey: string, build: (seq: number) => Op[]): Promise<number> {
  const ref = doc(db, `orgs/${orgId}/counters/${counterKey}`);
  return await runTransaction(db, async (txn) => {
    const snap = await txn.get(ref);
    const next = ((snap.data()?.value as number) ?? 0) + 1;
    const ops = splitPrivateOps(build(next));
    if (ops.length + 1 > MAX_ATOMIC_OPS) throw tooLarge(ops.length + 1);
    txn.set(ref, { id: counterKey, value: next, updatedAt: Date.now() }, { merge: true });
    for (const o of ops) write(txn, doc(db, o.path), o);
    return next;
  });
}

export const getStore = (demo: boolean): DataStore => (demo || !isFirebaseConfigured() ? localStore : firestoreStore);
