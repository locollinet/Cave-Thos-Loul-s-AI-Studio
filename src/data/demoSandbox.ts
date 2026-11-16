import type { Member, ModuleId, Org, OrgProfile, Partner, Site, StockLevel, UserProfile, Wine } from '@/types';
import { resetLocalOrgData, type DataStore, type Op } from './store';
import { demoLegalInfo } from './demoModels';
import { buildFullDemoOps } from './demoSetup';
import { DEMO_BRAND, buildCarte } from './demo/carte';
import { buildCompta, buildDrmDemoOp } from './demo/backoffice';
import { buildSales } from './demo/sales';
import { CLIENTS, SUPPLIERS, WINE_SEEDS, type ClientKey } from './demo/catalog';
import { makeClock, makeRng, seedOf, Ledger } from './demo/ledger';
import type { DemoWorld } from './demo/world';
import { buildServiceDemoOps } from '@/modules/service/demo';
import { buildOffersDemoOps } from '@/modules/negoce/offers/demo';
import type { Offer } from '@/modules/negoce/offers/types';
import type { WineList } from '@/modules/carte/types';
import type { ExpenseCategory } from '@/modules/compta/types';
import { uid } from '@/lib/utils';

export const ALL_DEMO_MODULES: ModuleId[] = ['stock', 'carte', 'achats', 'negoce', 'compta', 'pilotage'];

interface UserDoc {
  uid: string;
  orgIds: string[];
  activeOrgId?: string;
}

function readCollectionOnce<T>(store: DataStore, path: string): Promise<T[]> {
  return new Promise((resolve) => {
    let settled = false;
    let unsub: () => void = () => undefined;
    const finish = (rows: T[]) => {
      if (settled) return;
      settled = true;
      queueMicrotask(() => unsub());
      resolve(rows);
    };
    unsub = store.subscribeCollection<T>(path, (rows) => finish(rows), undefined, () => finish([]));
  });
}

/**
 * Crée une organisation Bac à Sable dédiée (`isDemo: true`) avec les 6 modules activés
 * et l'ensemble des données fictives (Compta, DRM, Négoce, Factur-X, Carte FR/EN/IT, Service, Photos, Doublons…).
 * Bascule automatiquement l'utilisateur sur cette organisation.
 */
export async function createFullSandboxOrg(
  store: DataStore,
  user: UserProfile,
  name = '🧪 Bac à Sable — Démo Complète',
  profile: OrgProfile = 'restaurant',
): Promise<string> {
  const newOrgId = `sandbox-${uid()}`;
  const mainSiteId = uid();
  const now = Date.now();
  const legal = demoLegalInfo(name);

  const newOrg: Org = {
    id: newOrgId,
    ownerUid: user.uid,
    name,
    profile,
    modules: [...ALL_DEMO_MODULES],
    locale: 'fr',
    currency: 'EUR',
    legal,
    invoicePrefix: 'FAC',
    quotePrefix: 'DEV',
    defaultVatRate: 20,
    defaultCoefficient: 1.6,
    createdAt: now,
    isDemo: true,
    expiresAt: now + 30 * 86_400_000,
    brand: DEMO_BRAND,
    brandApp: true,
  };

  const mainSite: Site = {
    id: mainSiteId,
    name: profile === 'restaurant' ? 'Cave du restaurant' : 'Cave principale',
    kind: 'cave',
    createdAt: now,
  };

  const ownerMember: Member = {
    uid: user.uid,
    name: user.name,
    email: user.email,
    role: 'owner',
    createdAt: now,
  };

  const demoOps = buildFullDemoOps(newOrgId, mainSiteId, profile, {
    orgName: name,
    modules: ALL_DEMO_MODULES,
    locale: 'fr',
    defaultVatRate: 20,
    legal,
    now,
    actor: { userId: user.uid, userName: user.name },
    sampleMembers: store.mode === 'local',
  });

  await store.commit([
    { op: 'set', path: `orgs/${newOrgId}`, data: newOrg as never },
    { op: 'set', path: `orgs/${newOrgId}/members/${user.uid}`, data: ownerMember as never },
  ]);
  await store.commit([{ op: 'set', path: `orgs/${newOrgId}/sites/${mainSiteId}`, data: mainSite as never }]);
  await store.commit(demoOps, { allowChunking: true });

  const prev = (await store.getDoc<UserDoc>(`users/${user.uid}`)) ?? { uid: user.uid, orgIds: [] };
  await store.commit([
    {
      op: 'set',
      path: `users/${user.uid}`,
      data: { uid: user.uid, orgIds: [...new Set([...prev.orgIds, newOrgId])], activeOrgId: newOrgId },
    },
  ]);
  return newOrgId;
}

const DELETABLE_SANDBOX_COLLECTIONS = [
  'invites',
  'sites',
  'producers',
  'wines',
  'wineCosts',
  'wineImages',
  'stock',
  'inventories',
  'bottles',
  'allocations',
  'wineLists',
  'openBottles',
  'racks',
  'partners',
  'purchaseInvoices',
  'documents',
  'payments',
  'consignments',
  'expenses',
  'expenseCategories',
  'assets',
  'drmReports',
  'offers',
] as const;

/**
 * Supprime proprement toutes les données supprimables d'une organisation de démo/test,
 * ses instantanés publics (`public_lists`, `public_offers`), et la retire de la liste de l'utilisateur.
 * Respecte strictement `firestore.rules` (mouvements/compteurs immuables ignorés si Firebase).
 */
export async function deleteSandboxOrg(
  store: DataStore,
  orgId: string,
  user: UserProfile,
  fallbackOrgId?: string,
): Promise<void> {
  const lists = await readCollectionOnce<WineList>(store, `orgs/${orgId}/wineLists`);
  const offers = await readCollectionOnce<Offer>(store, `orgs/${orgId}/offers`);

  const ops: Op[] = [];
  for (const l of lists) {
    if (l.publicId) ops.push({ op: 'delete', path: `public_lists/${l.publicId}` });
  }
  for (const o of offers) {
    if (o.publicId) ops.push({ op: 'delete', path: `public_offers/${o.publicId}` });
  }

  for (const coll of DELETABLE_SANDBOX_COLLECTIONS) {
    const rows = await readCollectionOnce<{ id?: string; email?: string }>(store, `orgs/${orgId}/${coll}`);
    for (const r of rows) {
      const docId = coll === 'invites' ? r.email : r.id;
      if (docId) ops.push({ op: 'delete', path: `orgs/${orgId}/${coll}/${docId}` });
    }
  }

  if (ops.length) await store.commit(ops, { allowChunking: true });

  const userDoc = (await store.getDoc<UserDoc>(`users/${user.uid}`)) ?? { uid: user.uid, orgIds: [] };
  const nextIds = userDoc.orgIds.filter((id) => id !== orgId);
  const nextActive = fallbackOrgId && fallbackOrgId !== orgId ? fallbackOrgId : nextIds[0];
  await store.commit([
    {
      op: 'set',
      path: `users/${user.uid}`,
      data: {
        uid: user.uid,
        orgIds: nextIds,
        ...(nextActive ? { activeOrgId: nextActive } : {}),
      },
    },
  ]);

  if (store.mode === 'local') {
    resetLocalOrgData(orgId);
    await store.commit([{ op: 'delete', path: `orgs/${orgId}` }]);
  } else if (user.isPlatformAdmin) {
    await store.commit([{ op: 'delete', path: `orgs/${orgId}` }]).catch(() => undefined);
  }
}

/**
 * Complète les modules vides d'une organisation de démo existante (ex. Compta, Négoce, Carte, Légal)
 * sans écraser les données existantes ni toucher aux compteurs déjà incrémentés.
 */
export async function completeOrgDemoData(
  store: DataStore,
  org: Org,
  sites: Site[],
  wines: Wine[],
  partners: Partner[],
  stock: StockLevel[],
  user: UserProfile,
): Promise<number> {
  const now = Date.now();
  const orgId = org.id;
  const mainSiteId = sites[0]?.id ?? 'main';
  const clock = makeClock(now);
  const rng = makeRng(seedOf(org.profile));

  const [expenses, assets, cats, docs, offers, lists, openBottles, drmReports] = await Promise.all([
    readCollectionOnce(store, `orgs/${orgId}/expenses`),
    readCollectionOnce(store, `orgs/${orgId}/assets`),
    readCollectionOnce<ExpenseCategory>(store, `orgs/${orgId}/expenseCategories`),
    readCollectionOnce(store, `orgs/${orgId}/documents`),
    readCollectionOnce(store, `orgs/${orgId}/offers`),
    readCollectionOnce(store, `orgs/${orgId}/wineLists`),
    readCollectionOnce(store, `orgs/${orgId}/openBottles`),
    readCollectionOnce(store, `orgs/${orgId}/drmReports`),
  ]);

  const ops: Op[] = [];

  // Activer tous les modules (si autorisé par les règles) + compléter les mentions légales Factur-X si manquantes
  const legalPatch = !org.legal?.siret ? demoLegalInfo(org.name) : org.legal;
  const canEditModules = store.mode === 'local' || !!org.isDemo || !!user.isPlatformAdmin;
  ops.push({
    op: 'set',
    path: `orgs/${orgId}`,
    data: {
      ...(canEditModules ? { modules: [...ALL_DEMO_MODULES] } : {}),
      legal: legalPatch,
      ...(!org.brand ? { brand: DEMO_BRAND } : {}),
    },
    merge: true,
  });

  // Partenaires clients si aucun client
  let clientsList = partners.filter((p) => p.kind === 'client' && !p.isArchived);
  const clientMap = new Map<ClientKey, Partner>();
  if (!clientsList.length) {
    for (const { key, ...rest } of CLIENTS) {
      const p: Partner = { id: uid(), kind: 'client', ...rest, createdAt: now - 30 * 86_400_000 };
      clientMap.set(key, p);
      ops.push({ op: 'set', path: `orgs/${orgId}/partners/${p.id}`, data: JSON.parse(JSON.stringify(p)) });
    }
    clientsList = [...clientMap.values()];
  } else {
    const keys = CLIENTS.map((c) => c.key);
    keys.forEach((k, idx) => clientMap.set(k, clientsList[idx % clientsList.length]));
  }

  const suppliers = SUPPLIERS.map((seed) => {
    const { key: _k, regions: _r, numberPrefix: _n, ...rest } = seed;
    const match = partners.find((p) => p.kind === 'supplier' && p.name === seed.name);
    const partner: Partner = match ?? { id: uid(), kind: 'supplier', ...rest, createdAt: now - 30 * 86_400_000 };
    return { partner, seed };
  });

  const wineByKey = new Map<string, Wine>();
  const seedById = new Map<string, (typeof WINE_SEEDS)[number]>();
  for (const w of wines) {
    const hit = WINE_SEEDS.find((s) => s.name === w.name && s.producer === w.producer && s.vintage === w.vintage);
    if (hit) {
      wineByKey.set(hit.key, w);
      seedById.set(w.id, hit);
    }
  }

  const world: DemoWorld = {
    orgId,
    profile: org.profile,
    clock,
    rng,
    actor: { userId: user.uid, userName: user.name },
    mainSiteId,
    sites,
    wines,
    wineByKey,
    seedById,
    suppliers,
    clients: clientMap,
    ledger: new Ledger(),
  };

  if (expenses.length === 0 || assets.length === 0 || cats.length === 0) {
    const comptaOps = buildCompta(world, org.profile === 'chaine' ? 2.5 : 1, org.profile === 'restaurant' || org.profile === 'chaine' ? 'group' : 'trade');
    for (const o of comptaOps) {
      if (expenses.length > 0 && o.path.includes('/expenses/')) continue;
      if (assets.length > 0 && o.path.includes('/assets/')) continue;
      if (cats.length > 0 && o.path.includes('/expenseCategories/')) continue;
      ops.push(o);
    }
  }

  if (drmReports.length === 0) {
    const mvs = await readCollectionOnce(store, `orgs/${orgId}/movements`);
    const mvOps: Op[] = mvs.map((m, i) => ({ op: 'set', path: `orgs/${orgId}/movements/m${i}`, data: m as Record<string, unknown> }));
    ops.push(buildDrmDemoOp(orgId, wines, stock, mvOps, now, user.name));
  }

  if (docs.length === 0 && wines.length > 0) {
    const existingCounters = new Set((await readCollectionOnce<{ id: string }>(store, `orgs/${orgId}/counters`)).map((c) => c.id));
    const sales = buildSales(world, true);
    for (const o of sales.ops) {
      if (o.path.includes('/counters/')) {
        const key = o.path.split('/').pop() ?? '';
        if (existingCounters.has(key)) continue;
      }
      ops.push(o);
    }
  }

  if (offers.length === 0 && wines.length > 0) {
    const offerOps = buildOffersDemoOps(orgId, wines, clientsList, now, { name: org.name, locale: org.locale, defaultVatRate: org.defaultVatRate, legal: legalPatch });
    for (const o of offerOps) {
      if (o.path.includes('/counters/')) continue;
      ops.push(o);
    }
  }

  if (lists.length === 0 && wines.length > 0) {
    ops.push(...buildCarte(orgId, org.name, wines, wineByKey, stock, now).ops);
  }

  if (openBottles.length === 0 && wines.length > 0) {
    const serviceSite = sites.find((s) => s.kind === 'bar' && stock.some((l) => l.siteId === s.id && l.qty > 0))?.id ?? mainSiteId;
    const hasStockOnSite = (wineId: string) => (stock.find((l) => l.wineId === wineId && l.siteId === serviceSite)?.qty ?? 0) >= 1;
    let glassWines = wines.filter((w) => w.byGlass?.enabled && !w.isArchived && hasStockOnSite(w.id));
    if (!glassWines.length) {
      const candidates = wines.filter((w) => !w.isArchived && !w.isPreSale && hasStockOnSite(w.id) && (seedById.get(w.id)?.glass || w.color === 'blanc' || w.color === 'bulles')).slice(0, 4);
      glassWines = candidates.map((w) => {
        const glass = { enabled: true, glassCl: 12.5, priceTTC: seedById.get(w.id)?.glass ?? 14 };
        ops.push({ op: 'set', path: `orgs/${orgId}/wines/${w.id}`, data: { byGlass: glass }, merge: true });
        return { ...w, byGlass: glass };
      });
    }
    if (glassWines.length) {
      ops.push(...buildServiceDemoOps(orgId, serviceSite, glassWines, now, { userId: user.uid, userName: user.name }));
    }
  }

  if (ops.length) await store.commit(ops, { allowChunking: true });
  return ops.length;
}
