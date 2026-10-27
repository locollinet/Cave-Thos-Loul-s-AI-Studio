import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  Invite,
  Locale,
  Member,
  ModuleId,
  Org,
  OrgProfile,
  Partner,
  Producer,
  Role,
  Site,
  StockLevel,
  Wine,
} from '@/types';
import { getStore, type DataStore, type Op, type QueryOpts } from '@/data/store';
import { useAuth } from './auth';
import { uid } from '@/lib/utils';
import { PROFILE_MODULES, atLeast } from '@/registry';

interface UserDoc {
  uid: string;
  orgIds: string[];
  activeOrgId?: string;
}

export const emptyLegal = (): Org['legal'] => ({
  legalName: '',
  legalForm: '',
  address: '',
  postalCode: '',
  city: '',
  country: 'France',
  phone: '',
  email: '',
  siret: '',
  vatNumber: '',
  exciseNumber: '',
  iban: '',
  bic: '',
  legalMentions: '',
});

export interface CreateOrgInput {
  name: string;
  profile: OrgProfile;
  modules?: ModuleId[];
  locale: Locale;
  withDemoData?: boolean;
}

interface OrgCtx {
  store: DataStore;
  orgId: string;
  org: Org;
  role: Role;
  member: Member | undefined;
  sites: Site[];
  wines: Wine[];
  producers: Producer[];
  partners: Partner[];
  stock: StockLevel[];
  members: Member[];
  hasModule: (m: ModuleId) => boolean;
  can: (min: Role) => boolean;
  path: (collection: string, id?: string) => string;
  commit: (ops: Op[]) => Promise<void>;
  updateOrg: (patch: Partial<Org>) => Promise<void>;
  activeSiteId: string; // 'all' ou id de site
  setActiveSiteId: (id: string) => void;
  orgs: { id: string; name: string }[];
  switchOrg: (id: string) => Promise<void>;
  overrideRole?: Role | null;
  setOverrideRole: (role: Role | null) => void;
}

const Ctx = createContext<OrgCtx | null>(null);

interface Gate {
  status: 'loading' | 'none' | 'ready' | 'error';
  error?: string;
  createOrg: (input: CreateOrgInput) => Promise<void>;
  joinOrg: (orgId: string) => Promise<void>;
}
const GateCtx = createContext<Gate | null>(null);
export const useOrgGate = (): Gate => {
  const g = useContext(GateCtx);
  if (!g) throw new Error('useOrgGate hors OrgProvider');
  return g;
};

function useStoreSub<T>(store: DataStore, path: string | null, opts?: QueryOpts): { rows: T[]; loading: boolean } {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(!!path);
  const key = JSON.stringify(opts ?? {});
  useEffect(() => {
    if (!path) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return store.subscribeCollection<T>(
      path,
      (r) => {
        setRows(r);
        setLoading(false);
      },
      opts,
      (e) => {
        console.warn('Lecture refusée', path, e.message);
        setLoading(false);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, path, key]);
  return { rows, loading };
}

/** Collection de l'organisation courante, hors collections « cœur » (mouvements, documents, cartes…). */
export function useCollection<T>(name: string, opts?: QueryOpts): { rows: T[]; loading: boolean } {
  const { store, orgId } = useOrg();
  return useStoreSub<T>(store, `orgs/${orgId}/${name}`, opts);
}

export function OrgProvider({ children, fallback }: { children: ReactNode; fallback: (gate: Gate) => ReactNode }) {
  const { user, demo } = useAuth();
  const store = useMemo(() => getStore(demo), [demo]);
  const uidv = user?.uid ?? null;

  const [userDoc, setUserDoc] = useState<UserDoc | null | undefined>(undefined);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!uidv) return;
    setUserDoc(undefined);
    return store.subscribeDoc<UserDoc>(`users/${uidv}`, (d) => setUserDoc(d), (e) => setError(e.message));
  }, [store, uidv]);

  const orgId = userDoc ? (userDoc.activeOrgId && userDoc.orgIds.includes(userDoc.activeOrgId) ? userDoc.activeOrgId : userDoc.orgIds[0]) : undefined;

  const [org, setOrg] = useState<Org | null | undefined>(undefined);
  useEffect(() => {
    if (!orgId) {
      setOrg(undefined);
      return;
    }
    return store.subscribeDoc<Org>(`orgs/${orgId}`, (d) => setOrg(d), (e) => setError(e.message));
  }, [store, orgId]);

  const base = orgId ? `orgs/${orgId}` : null;
  const sitesQ = useStoreSub<Site>(store, base && `${base}/sites`);
  const winesQ = useStoreSub<Wine>(store, base && `${base}/wines`);
  const producersQ = useStoreSub<Producer>(store, base && `${base}/producers`);
  const partnersQ = useStoreSub<Partner>(store, base && `${base}/partners`);
  const stockQ = useStoreSub<StockLevel>(store, base && `${base}/stock`);
  const membersQ = useStoreSub<Member>(store, base && `${base}/members`);

  const [orgNames, setOrgNames] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!userDoc?.orgIds.length) return;
    let cancelled = false;
    Promise.all(userDoc.orgIds.map((id) => store.getDoc<Org>(`orgs/${id}`).then((o) => ({ id, name: o?.name ?? id })).catch(() => ({ id, name: id })))).then(
      (r) => !cancelled && setOrgNames(r),
    );
    return () => {
      cancelled = true;
    };
  }, [store, userDoc?.orgIds.join(',')]);

  const [activeSiteId, setActiveSite] = useState<string>(() => localStorage.getItem('lt-active-site') ?? 'all');
  const setActiveSiteId = useCallback((id: string) => {
    localStorage.setItem('lt-active-site', id);
    setActiveSite(id);
  }, []);

  const createOrg = useCallback(
    async (input: CreateOrgInput) => {
      if (!user) return;
      const id = uid();
      const now = Date.now();
      const o: Org = {
        id,
        ownerUid: user.uid,
        name: input.name,
        profile: input.profile,
        modules: input.modules ?? PROFILE_MODULES[input.profile],
        locale: input.locale,
        currency: 'EUR',
        legal: { ...emptyLegal(), legalName: input.name },
        invoicePrefix: 'FAC',
        quotePrefix: 'DEV',
        defaultVatRate: 20,
        defaultCoefficient: 1.6,
        createdAt: now,
      };
      const ownerDoc: Member = { uid: user.uid, email: user.email, name: user.name, role: 'owner', createdAt: now };
      const ops: Op[] = [
        { op: 'set', path: `orgs/${id}`, data: o as never },
        { op: 'set', path: `orgs/${id}/members/${user.uid}`, data: ownerDoc as never },
      ];
      await store.commit(ops);
      const mainSite: Site = { id: uid(), name: input.profile === 'restaurant' ? 'Cave du restaurant' : 'Cave principale', kind: 'cave', createdAt: now };
      await store.commit([{ op: 'set', path: `orgs/${id}/sites/${mainSite.id}`, data: mainSite as never }]);
      if (input.withDemoData) {
        const { buildFullDemoOps } = await import('@/data/demoSetup');
        await store.commit(buildFullDemoOps(id, mainSite.id, input.profile, { orgName: input.name, modules: o.modules, locale: input.locale, defaultVatRate: o.defaultVatRate, legal: o.legal }), { allowChunking: true });
      }
      const prev = (await store.getDoc<UserDoc>(`users/${user.uid}`)) ?? { uid: user.uid, orgIds: [] };
      await store.commit([
        { op: 'set', path: `users/${user.uid}`, data: { uid: user.uid, orgIds: [...prev.orgIds, id], activeOrgId: id } },
      ]);
    },
    [store, user],
  );

  const joinOrg = useCallback(
    async (joinId: string) => {
      if (!user) return;
      const email = user.email.toLowerCase();
      const invite = await store.getDoc<Invite>(`orgs/${joinId}/invites/${email}`);
      if (!invite) throw new Error('Aucune invitation pour cet email dans cette organisation.');
      if (invite.expiresAt && Date.now() > invite.expiresAt) {
        throw new Error('Cette invitation a expiré (délai de 7 jours dépassé). Demandez un nouveau lien.');
      }
      const m: Member = { uid: user.uid, email, name: user.name, role: invite.role, createdAt: Date.now() };
      await store.commit([
        { op: 'set', path: `orgs/${joinId}/members/${user.uid}`, data: m as never },
        { op: 'delete', path: `orgs/${joinId}/invites/${email}` },
      ]);
      const prev = (await store.getDoc<UserDoc>(`users/${user.uid}`)) ?? { uid: user.uid, orgIds: [] };
      await store.commit([
        { op: 'set', path: `users/${user.uid}`, data: { uid: user.uid, orgIds: [...new Set([...prev.orgIds, joinId])], activeOrgId: joinId } },
      ]);
    },
    [store, user],
  );

  const switchOrg = useCallback(
    async (id: string) => {
      if (!user || !userDoc) return;
      await store.commit([{ op: 'set', path: `users/${user.uid}`, data: { ...userDoc, activeOrgId: id } }]);
    },
    [store, user, userDoc],
  );

  const [overrideRole, setOverrideRoleState] = useState<Role | null>(() => {
    try {
      const s = sessionStorage.getItem('lt-role-override');
      return (s as Role) || null;
    } catch {
      return null;
    }
  });

  const setOverrideRole = useCallback((r: Role | null) => {
    try {
      if (r) sessionStorage.setItem('lt-role-override', r);
      else sessionStorage.removeItem('lt-role-override');
    } catch {
      /* ignore */
    }
    setOverrideRoleState(r);
  }, []);

  const member = membersQ.rows.find((m) => m.uid === uidv);
  const status: Gate['status'] = error
    ? 'error'
    : userDoc === undefined || (orgId && (org === undefined || membersQ.loading))
      ? 'loading'
      : !userDoc || !orgId || !org || !member
        ? 'none'
        : 'ready';

  const gate: Gate = { status, error, createOrg, joinOrg };

  const isDemoEnv = !!user?.demo || !!org?.isDemo || !!user?.isPlatformAdmin;
  const effectiveRole: Role = (isDemoEnv && overrideRole) ? overrideRole : (member?.role ?? 'staff');

  const value = useMemo<OrgCtx | null>(() => {
    if (status !== 'ready' || !org || !orgId || !member) return null;
    return {
      store,
      orgId,
      org,
      role: effectiveRole,
      member,
      sites: sitesQ.rows.filter((s) => !s.isArchived).sort((a, b) => a.name.localeCompare(b.name)),
      wines: winesQ.rows,
      producers: producersQ.rows,
      partners: partnersQ.rows,
      stock: stockQ.rows,
      members: membersQ.rows,
      hasModule: (m) => org.modules.includes(m),
      can: (min) => atLeast(effectiveRole, min),
      path: (c, id) => `orgs/${orgId}/${c}${id ? `/${id}` : ''}`,
      commit: (ops) => store.commit(ops),
      updateOrg: (patch) => store.commit([{ op: 'set', path: `orgs/${orgId}`, data: patch as never, merge: true }]),
      activeSiteId,
      setActiveSiteId,
      orgs: orgNames,
      switchOrg,
      overrideRole,
      setOverrideRole,
    };
  }, [status, store, org, orgId, member, effectiveRole, overrideRole, setOverrideRole, sitesQ.rows, winesQ.rows, producersQ.rows, partnersQ.rows, stockQ.rows, membersQ.rows, activeSiteId, setActiveSiteId, orgNames, switchOrg]);

  return (
    <GateCtx.Provider value={gate}>
      {value ? <Ctx.Provider value={value}>{children}</Ctx.Provider> : fallback(gate)}
    </GateCtx.Provider>
  );
}

export function useOrg(): OrgCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useOrg hors OrgProvider');
  return c;
}
