import type { OrgProfile, Partner, Producer, Site, StockLevel, Wine } from '@/types';
import type { Op } from './store';
import type { WineList } from '@/modules/carte/types';
import { canonicalKey } from '@/lib/wine';
import { round2, uid } from '@/lib/utils';
import { stockId, type Actor } from './stock';
import { CLIENTS, SUPPLIERS, WINE_SEEDS, type ClientKey, type WineSeed } from './demo/catalog';
import { Ledger, makeClock, makeRng, seedOf } from './demo/ledger';
import { DEMO_ACTOR, type DemoWorld } from './demo/world';
import { buildSales } from './demo/sales';
import { buildHospitalityDemand, type SecondarySite, type Target } from './demo/hospitality';
import { buildPurchases } from './demo/purchases';
import { buildCompta, inventoryOp, planInventory } from './demo/backoffice';
import { buildCarte } from './demo/carte';
import { formatBinSummary, generateRackSlots } from '@/lib/cellar';

/** Contexte exposé aux compléments de démo (offres, bouteilles ouvertes…), une fois le stock final connu. */
export interface DemoContext {
  orgId: string;
  profile: OrgProfile;
  now: number;
  today: string;
  actor: Actor;
  mainSiteId: string;
  /** Site où le service au verre a lieu (bar en restauration, sinon la cave principale). */
  serviceSiteId: string;
  sites: Site[];
  wines: Wine[];
  wineByKey: Map<string, Wine>;
  suppliers: Partner[];
  clients: Partner[];
  stock: StockLevel[];
  stockQty: (wineId: string, siteId: string) => number;
  wineList?: WineList;
}

export interface DemoOptions {
  /** Nom de l'établissement, repris dans l'instantané public de la carte (republié automatiquement sinon). */
  orgName?: string;
  now?: number;
  /** Écritures complémentaires ajoutées à la fin du lot (ex. buildServiceDemoOps). */
  extras?: (ctx: DemoContext) => Op[];
}

const HOSPITALITY: OrgProfile[] = ['restaurant', 'chaine'];
const OPENING_AGO = 365;
const CHAIN_HOTEL_WINES = ['fevre-montmains', 'leflaive-puligny', 'huet-haut-lieu', 'zind-windsbuhl', 'jamet-cote-rotie', 'lascases', 'mas-jullien', 'lapierre-morgon', 'tempier-rose', 'ruinart-bdb', 'dujac-gevrey'];

/** Prix carte TTC : coefficient dégressif avec le prix d'achat, arrondi. */
function menuPrice(buyHT: number): number {
  const coef = buyHT < 50 ? 3.2 : buyHT < 150 ? 2.6 : buyHT < 500 ? 2 : 1.6;
  const ttc = buyHT * coef * 1.2;
  const step = ttc < 100 ? 1 : ttc < 500 ? 5 : 10;
  return Math.round(ttc / step) * step;
}

const json = <T,>(v: T): Record<string, unknown> => JSON.parse(JSON.stringify(v));

/**
 * Données de démonstration fictives (personnes, clients et sociétés inventés) : catalogue enrichi,
 * 12 mois d'historique de stock, ventes, achats, comptabilité, inventaire et carte publiée selon le profil.
 */
export function buildDemo(orgId: string, mainSiteId: string, profile: OrgProfile, opts: DemoOptions = {}): { ops: Op[]; ctx: DemoContext } {
  const now = opts.now ?? Date.now();
  const clock = makeClock(now);
  const rng = makeRng(seedOf(profile));
  const hospitality = HOSPITALITY.includes(profile);
  const base = `orgs/${orgId}`;
  const created = now - OPENING_AGO * 86_400_000;

  /* ---------------------------------------------------------- sites */
  const siteOps: Op[] = [];
  const mainSite: Site = {
    id: mainSiteId,
    name: profile === 'restaurant' ? 'Cave du restaurant' : 'Cave principale',
    kind: 'cave',
    createdAt: created,
    layout: {
      racks: [
        {
          id: 'rack-eurocave',
          name: 'Armoire EuroCave (Vieillissement)',
          prefix: 'ARM',
          geometry: 'staggered_shelf',
          rows: 5,
          cols: 6,
          doubleDepth: true,
          staggered: true,
        },
        {
          id: 'rack-matrix-a',
          name: 'Casier Principal (Allée A)',
          prefix: 'A',
          geometry: 'matrix',
          rows: 4,
          cols: 6,
          doubleDepth: false,
          staggered: false,
        },
        {
          id: 'rack-bulk-reserve',
          name: 'Réserve Caisses & Vrac',
          prefix: 'VRAC',
          geometry: 'bulk',
          rows: 2,
          cols: 4,
          doubleDepth: false,
          staggered: false,
        },
      ],
    },
  };
  const sites: Site[] = [mainSite];
  const addSite = (name: string, kind: Site['kind']) => {
    const s: Site = { id: uid(), name, kind, createdAt: created };
    sites.push(s);
    siteOps.push({ op: 'set', path: `${base}/sites/${s.id}`, data: s as never });
    return s;
  };
  let bar: Site | undefined;
  let hotel: Site | undefined;
  if (profile === 'restaurant') bar = addSite('Salle & bar', 'bar');
  if (profile === 'chaine') {
    mainSite.name = 'Le Grand Palais — Paris';
    siteOps.push({ op: 'set', path: `${base}/sites/${mainSiteId}`, data: { name: mainSite.name }, merge: true });
    hotel = addSite('Hôtel du Lac — Annecy', 'restaurant');
    bar = addSite('Bar du Palais', 'bar');
  }

  /* ---------------------------------------------------------- référentiel */
  const producers = new Map<string, Producer>();
  const wines: Wine[] = [];
  const seedById = new Map<string, WineSeed>();
  const wineByKey = new Map<string, Wine>();
  WINE_SEEDS.forEach((s, i) => {
    let p = producers.get(s.producer);
    if (!p) {
      p = { id: uid(), name: s.producer, region: s.region, country: s.country, createdAt: created };
      producers.set(s.producer, p);
    }
    const formatCl = s.format ?? 75;
    const buy = round2(formatCl === 150 ? s.buy * 2.1 : s.buy);
    const w: Wine = {
      id: uid(),
      producerId: p.id,
      producer: s.producer,
      name: s.name,
      appellation: s.appellation,
      vintage: s.vintage,
      color: s.color,
      formatCl,
      region: s.region,
      subRegion: s.subRegion,
      country: s.country,
      grapes: s.grapes,
      buyPriceHT: buy,
      sellPriceHT: round2(buy * 1.6),
      alertThreshold: buy > 150 ? 1 : 6,
      apogeeFrom: s.apogee?.[0],
      apogeeTo: s.apogee?.[1],
      technicalSheet: s.sheet ? { ...s.sheet, generatedByAI: false } : undefined,
      menuPriceTTC: hospitality ? menuPrice(buy) : undefined,
      byGlass: hospitality && s.glass ? { enabled: true, glassCl: 12.5, priceTTC: s.glass } : undefined,
      canonicalKey: '',
      createdAt: created + i * 60_000,
      updatedAt: now,
    };
    w.canonicalKey = canonicalKey(w);
    wines.push(w);
    seedById.set(w.id, s);
    wineByKey.set(s.key, w);
  });

  /* ---------------------------------------------------------- partenaires */
  const suppliers = SUPPLIERS.map((seed) => {
    const { key: _k, regions: _r, numberPrefix: _n, ...rest } = seed;
    const partner: Partner = { id: uid(), kind: 'supplier', ...rest, createdAt: created };
    return { partner, seed };
  });
  const clients = new Map<ClientKey, Partner>();
  for (const { key, ...rest } of CLIENTS) clients.set(key, { id: uid(), kind: 'client', ...rest, createdAt: created });

  const world: DemoWorld = { orgId, profile, clock, rng, actor: DEMO_ACTOR, mainSiteId, sites, wines, wineByKey, seedById, suppliers, clients, ledger: new Ledger() };

  /* ---------------------------------------------------------- sorties (12 mois) */
  const ops: Op[] = [];
  let targets: Target[] = wines.map((w) => ({ wineId: w.id, siteId: mainSiteId, target: seedById.get(w.id)!.qty }));
  const salesOps: Op[] = [];
  if (profile === 'negoce' || profile === 'independant') {
    salesOps.push(...buildSales(world, profile === 'independant').ops);
  } else {
    const servable = (w: Wine) => {
      const s = seedById.get(w.id)!;
      return w.formatCl === 75 && s.buy <= 150 && (w.color === 'bulles' || w.color === 'rose' || !!s.glass);
    };
    const secondaries: SecondarySite[] = [];
    if (profile === 'restaurant' && bar) {
      secondaries.push({ siteId: bar.id, name: bar.name, wines: wines.filter(servable), factor: 0.6, every: 2, batch: 1, target: (s) => Math.ceil(s.qty * 0.25) });
    }
    if (profile === 'chaine' && hotel && bar) {
      secondaries.push(
        { siteId: hotel.id, name: hotel.name, wines: CHAIN_HOTEL_WINES.map((k) => wineByKey.get(k)!).filter(Boolean), factor: 0.5, every: 4, batch: 2, target: (s) => Math.ceil(s.qty * 0.2) },
        { siteId: bar.id, name: bar.name, wines: wines.filter(servable), factor: 0.7, every: 4, batch: 2, target: (s) => Math.ceil(s.qty * 0.2) },
      );
    }
    targets = buildHospitalityDemand(world, { mainFactor: profile === 'chaine' ? 1.3 : 1, reason: profile === 'chaine' ? 'vente' : 'consommation', secondaries, vatRate: 20 });
  }

  /* ---------------------------------------------------------- achats, inventaire, ouverture */
  const purchases = buildPurchases(world);
  const inventory = planInventory(world);
  const byId = new Map(wines.map((w) => [w.id, w]));
  for (const o of world.ledger.openingNeeds(targets)) {
    world.ledger.add(
      { wineId: o.wineId, siteId: o.siteId, type: 'in', qty: o.qty, reason: 'achat', date: clock.iso(OPENING_AGO), unitCostHT: byId.get(o.wineId)?.buyPriceHT, note: "Reprise du stock à l'ouverture" },
      0,
    );
  }
  const built = world.ledger.build(orgId, byId, DEMO_ACTOR, clock);
  for (const w of wines) w.buyPriceHT = built.lastCost.get(w.id) ?? w.buyPriceHT;

  const eurocaveRack = mainSite.layout?.racks.find((r) => r.id === 'rack-eurocave');
  const eurocaveSlots = eurocaveRack ? generateRackSlots(eurocaveRack) : [];
  let eurocaveSlotIdx = 0;

  const matrixRack = mainSite.layout?.racks.find((r) => r.id === 'rack-matrix-a');
  const matrixSlots = matrixRack ? generateRackSlots(matrixRack) : [];
  let matrixSlotIdx = 0;

  const stock: StockLevel[] = [];
  wines.forEach((w, i) => {
    const qty = built.balances.get(stockId(w.id, mainSiteId))?.qty ?? 0;
    let bin: string | undefined;
    let bins: string[] | undefined;

    if (i < 8 && qty > 0) {
      // Dans l'armoire EuroCave : 1 bouteille par alvéole
      const assigned = eurocaveSlots.slice(eurocaveSlotIdx, eurocaveSlotIdx + qty).map((s) => s.code);
      eurocaveSlotIdx += assigned.length;
      bins = assigned;
      bin = formatBinSummary(assigned);
    } else if (i < 16 && qty > 0) {
      // Dans le casier classique Allée A : 1 bouteille par alvéole
      const count = Math.min(qty, 4);
      const assigned = matrixSlots.slice(matrixSlotIdx, matrixSlotIdx + count).map((s) => s.code);
      matrixSlotIdx += assigned.length;
      bins = assigned;
      bin = formatBinSummary(assigned);
    } else if (i < 19 && qty > 0) {
      // Zone vrac / caisses
      bin = `VRAC-R1-C${i - 15}`;
    } else {
      // Sans emplacement pour tester l'assignation rapide
      bin = undefined;
    }
    stock.push({ id: stockId(w.id, mainSiteId), wineId: w.id, siteId: mainSiteId, qty, bin, bins, updatedAt: now });
  });
  for (const b of built.balances.values()) if (b.siteId !== mainSiteId) stock.push({ id: stockId(b.wineId, b.siteId), wineId: b.wineId, siteId: b.siteId, qty: b.qty, updatedAt: now });

  /* ---------------------------------------------------------- assemblage */
  let wineList: WineList | undefined;
  const carteOps: Op[] = [];
  if (hospitality) {
    const carte = buildCarte(orgId, opts.orgName ?? '', wines, wineByKey, stock, now);
    carteOps.push(...carte.ops);
    wineList = carte.list;
  }

  ops.push(
    ...siteOps,
    ...[...producers.values()].map((p): Op => ({ op: 'set', path: `${base}/producers/${p.id}`, data: p as never })),
    ...wines.map((w): Op => ({ op: 'set', path: `${base}/wines/${w.id}`, data: json(w) })),
    ...suppliers.map(({ partner }): Op => ({ op: 'set', path: `${base}/partners/${partner.id}`, data: json(partner) })),
    ...[...clients.values()].map((c): Op => ({ op: 'set', path: `${base}/partners/${c.id}`, data: json(c) })),
    ...built.ops,
    ...stock.map((s): Op => ({ op: 'set', path: `${base}/stock/${s.id}`, data: s as never })),
    ...purchases.ops,
    ...salesOps,
    inventoryOp(world, inventory),
  );
  if (profile === 'negoce' || profile === 'independant') ops.push(...buildCompta(world, 1, 'trade'));
  if (profile === 'chaine') ops.push(...buildCompta(world, 2.5, 'group'));
  ops.push(...carteOps);

  const qtyMap = new Map(stock.map((s) => [s.id, s.qty]));
  const ctx: DemoContext = {
    orgId,
    profile,
    now,
    today: clock.today,
    actor: DEMO_ACTOR,
    mainSiteId,
    serviceSiteId: bar?.id ?? mainSiteId,
    sites,
    wines,
    wineByKey,
    suppliers: suppliers.map((s) => s.partner),
    clients: [...clients.values()],
    stock,
    stockQty: (wineId, siteId) => qtyMap.get(stockId(wineId, siteId)) ?? 0,
    wineList,
  };
  if (opts.extras) ops.push(...opts.extras(ctx));
  return { ops, ctx };
}

/** Écritures de la démo pour une organisation fraîchement créée (voir `buildDemo` pour le contexte). */
export function buildDemoOps(orgId: string, mainSiteId: string, profile: OrgProfile, opts?: DemoOptions): Op[] {
  return buildDemo(orgId, mainSiteId, profile, opts).ops;
}
