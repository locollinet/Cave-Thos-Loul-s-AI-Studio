import type { OrgProfile, Partner, Producer, RareBottle, Site, StockLevel, Wine, WineAllocation } from '@/types';
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
  /** Auteur des mouvements ; sur Firebase, l'utilisateur connecté (les règles exigent sa signature). */
  actor?: Actor;
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
          name: 'Caveau Bourgogne — Grands Crus (Quinconce)',
          prefix: 'ARM',
          geometry: 'staggered_shelf',
          rows: 5,
          cols: 6,
          doubleDepth: true,
          staggered: true,
        },
        {
          id: 'rack-matrix-a',
          name: 'Travée Gastronomique (Allée A)',
          prefix: 'A',
          geometry: 'matrix',
          rows: 4,
          cols: 6,
          doubleDepth: true,
          staggered: false,
        },
        {
          id: 'rack-bulk-reserve',
          name: 'Loge Caisses Bois d’Origine (CBO)',
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
    const id = uid();
    const s: Site = {
      id,
      name,
      kind,
      createdAt: created,
      layout: {
        racks: [
          {
            id: `rack-salle-${id}`,
            name: kind === 'bar' ? 'Armoire Sommelier & Vins au Verre' : 'Cave de Jour — Service de Salle',
            prefix: 'SAL',
            geometry: 'staggered_shelf',
            rows: 4,
            cols: 6,
            doubleDepth: true,
            staggered: true,
          },
          {
            id: `rack-travee-${id}`,
            name: 'Travée Réserve de Service',
            prefix: 'SRV',
            geometry: 'matrix',
            rows: 3,
            cols: 6,
            doubleDepth: false,
            staggered: false,
          },
        ],
      },
    };
    sites.push(s);
    siteOps.push({ op: 'set', path: `${base}/sites/${s.id}`, data: s as never });
    return s;
  };
  let bar: Site | undefined;
  let hotel: Site | undefined;
  let gastro: Site | undefined;
  if (profile === 'restaurant') {
    bar = addSite('Salle & bar', 'bar');
    gastro = addSite('Table Gastronomique & Bistrot', 'restaurant');
  }
  if (profile === 'chaine') {
    mainSite.name = 'Le Grand Palais — Paris';
    hotel = addSite('Hôtel du Lac — Annecy', 'restaurant');
    bar = addSite('Bar du Palais', 'bar');
  }
  siteOps.unshift({
    op: 'set',
    path: `${base}/sites/${mainSiteId}`,
    data: { layout: mainSite.layout, ...(profile === 'chaine' ? { name: mainSite.name } : {}) } as never,
    merge: true,
  });

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
      hideFromMenu: s.key === 'commaraine-clos-2021' || s.key === 'roulot-luchets-2021', // En garde dans la cave voûtée
      isExceptional: ['drc-tache', 'commaraine-clos-2017', 'cristal', 'yquem'].includes(s.key) || undefined,
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

  const actor = opts?.actor ?? DEMO_ACTOR;
  const world: DemoWorld = { orgId, profile, clock, rng, actor, mainSiteId, sites, wines, wineByKey, seedById, suppliers, clients, ledger: new Ledger() };

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
      if (gastro) {
        const gastroWines = ['commaraine-clos-2018', 'commaraine-clos-2019', 'leflaive-puligny', 'leflaive-puligny-2019', 'roulot-luchets', 'dujac-gevrey', 'lascases', 'jamet-cote-rotie', 'krug-gc', 'zind-windsbuhl']
          .map((k) => wineByKey.get(k)!)
          .filter(Boolean);
        secondaries.push({ siteId: gastro.id, name: gastro.name, wines: gastroWines, factor: 0.55, every: 3, batch: 2, target: (s) => Math.max(2, Math.ceil(s.qty * 0.25)) });
      }
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
  const built = world.ledger.build(orgId, byId, actor, clock);
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

    if (i < 14 && qty > 0) {
      // Dans le Caveau Bourgogne — Grands Crus (Quinconce) : jusqu'à 6 btl par cuvée pour peupler les 5 étages Devant + Derrière
      const count = Math.min(qty, 6);
      const assigned = eurocaveSlots.slice(eurocaveSlotIdx, eurocaveSlotIdx + count).map((s) => s.code);
      eurocaveSlotIdx += assigned.length;
      bins = assigned;
      bin = formatBinSummary(assigned);
    } else if (i < 24 && qty > 0) {
      // Dans la Travée Gastronomique Allée A : 1 bouteille par alvéole
      const count = Math.min(qty, 4);
      const assigned = matrixSlots.slice(matrixSlotIdx, matrixSlotIdx + count).map((s) => s.code);
      matrixSlotIdx += assigned.length;
      bins = assigned;
      bin = formatBinSummary(assigned);
    } else if (i < 28 && qty > 0) {
      // Zone caisses bois d'origine (CBO)
      bin = `VRAC-R${i < 26 ? 1 : 2}-C${((i - 24) % 4) + 1}`;
    } else {
      // Sans emplacement pour tester le rangement automatique ou unitaire
      bin = undefined;
    }
    stock.push({ id: stockId(w.id, mainSiteId), wineId: w.id, siteId: mainSiteId, qty, bin, bins, updatedAt: now });
  });

  // Rangement initial sur les sites secondaires (Salle & bar, Table Gastronomique, Hôtel du Lac, Bar du Palais)
  const secCursorBySite = new Map<string, number>();
  for (const b of built.balances.values()) {
    if (b.siteId === mainSiteId) continue;
    const secSite = sites.find((s) => s.id === b.siteId);
    const primaryRack = secSite?.layout?.racks?.[0];
    let bin: string | undefined;
    let bins: string[] | undefined;

    if (primaryRack && b.qty > 0) {
      const slots = generateRackSlots(primaryRack);
      const cur = secCursorBySite.get(b.siteId) ?? 0;
      if (cur < Math.floor(slots.length * 0.75)) {
        const count = Math.min(b.qty, 4);
        const assigned = slots.slice(cur, cur + count).map((s) => s.code);
        secCursorBySite.set(b.siteId, cur + assigned.length);
        bins = assigned;
        bin = formatBinSummary(assigned);
      }
    }
    stock.push({
      id: stockId(b.wineId, b.siteId),
      wineId: b.wineId,
      siteId: b.siteId,
      qty: b.qty,
      bin,
      bins,
      updatedAt: now,
    });
  }

  /* ---------------------------------------------------------- assemblage */
  let wineList: WineList | undefined;
  const carteOps: Op[] = [];
  if (hospitality) {
    const carte = buildCarte(orgId, opts.orgName ?? '', wines, wineByKey, stock, now);
    carteOps.push(...carte.ops);
    wineList = carte.list;
  }

  const rareBottleOps: Op[] = [
    { key: 'drc-tache', number: '00418 / 01850', bin: 'ARM-R1-C1', conditionLevel: 'goulot' as const, conditionLabel: 'parfaite' as const, conditionCapsule: 'integre' as const, cbo: true, provenance: 'Allocation directe Domaine de la Romanée-Conti' },
    { key: 'commaraine-clos-2017', number: '00112 / 02400', bin: 'ARM-R1-C2', conditionLevel: 'goulot' as const, conditionLabel: 'parfaite' as const, conditionCapsule: 'ciree' as const, cbo: true, provenance: 'Réserve historique du Château (Monopole)' },
    { key: 'cristal', number: 'CR-2013-089', bin: 'ARM-R2-C1', conditionLevel: 'goulot' as const, conditionLabel: 'parfaite' as const, conditionCapsule: 'integre' as const, cbo: true, provenance: 'Maison Louis Roederer — Reims' },
    { key: 'yquem', number: 'YQ-2014-014', bin: 'ARM-R2-C2', conditionLevel: 'bas_goulot' as const, conditionLabel: 'parfaite' as const, conditionCapsule: 'integre' as const, cbo: false, provenance: 'Place de Bordeaux' },
  ].flatMap((b) => {
    const w = wineByKey.get(b.key);
    if (!w) return [];
    const id = `rb-${b.key}`;
    const doc: RareBottle = {
      id,
      wineId: w.id,
      siteId: mainSiteId,
      bin: b.bin,
      bottleNumber: b.number,
      conditionLevel: b.conditionLevel,
      conditionLabel: b.conditionLabel,
      conditionCapsule: b.conditionCapsule,
      cbo: b.cbo,
      provenance: b.provenance,
      status: 'in_cellar',
      createdAt: created,
      updatedAt: now,
    };
    return [{
      op: 'set' as const,
      path: `${base}/bottles/${id}`,
      data: doc as unknown as Record<string, unknown>,
    }];
  });

  const allocationOps: Op[] = (
    [
      {
        id: 'alloc_commaraine_1',
        producerName: 'Château de La Commaraine',
        cuveeName: 'Pommard 1er Cru Clos de la Commaraine (Monopole)',
        vintage: '2022',
        formatCl: 75,
        campaignYear: 2026,
        quotaBottles: 36,
        orderedBottles: 36,
        receivedBottles: 24,
        unitPriceHT: 82,
        status: 'confirmed',
        deadlineDate: '2026-11-30',
        notes: 'Dotation prioritaire Tables du Château & Caveau (solde 12 btl à réceptionner).',
        createdAt: now - 30 * 86_400_000,
      },
      {
        id: 'alloc_drc_1',
        producerName: 'Domaine de la Romanée-Conti',
        cuveeName: 'La Tâche Grand Cru (Monopole)',
        vintage: '2021',
        formatCl: 75,
        campaignYear: 2026,
        quotaBottles: 6,
        orderedBottles: 6,
        receivedBottles: 6,
        unitPriceHT: 1850,
        status: 'delivered',
        notes: 'Caisse bois scellée (CBO) reçue en cave voûtée centrale — flacons numérotés.',
        createdAt: now - 60 * 86_400_000,
      },
      {
        id: 'alloc_leflaive_1',
        producerName: 'Domaine Leflaive',
        cuveeName: 'Puligny-Montrachet & 1er Cru Clavoillon',
        vintage: '2022',
        formatCl: 75,
        campaignYear: 2026,
        quotaBottles: 24,
        orderedBottles: 24,
        receivedBottles: 12,
        unitPriceHT: 135,
        status: 'confirmed',
        deadlineDate: '2026-12-15',
        notes: '1re tranche livrée pour la verticale Table Gastronomique.',
        createdAt: now - 40 * 86_400_000,
      },
      {
        id: 'alloc_coche_1',
        producerName: 'Domaine Coche-Dury',
        cuveeName: 'Meursault & Bourgogne Blanc',
        vintage: '2022',
        formatCl: 75,
        campaignYear: 2026,
        quotaBottles: 12,
        orderedBottles: 12,
        receivedBottles: 6,
        unitPriceHT: 380,
        status: 'confirmed',
        notes: 'Premier arrivage de 6 btl reçu.',
        createdAt: now - 45 * 86_400_000,
      },
      {
        id: 'alloc_roumier_1',
        producerName: 'Domaine Georges Roumier',
        cuveeName: 'Chambolle-Musigny 1er Cru Les Amoureuses',
        vintage: '2022',
        formatCl: 75,
        campaignYear: 2026,
        quotaBottles: 6,
        orderedBottles: 6,
        receivedBottles: 0,
        unitPriceHT: 1100,
        status: 'confirmed',
        notes: 'Souscription primeur confirmée — livraison hiver.',
        createdAt: now - 20 * 86_400_000,
      },
    ] satisfies WineAllocation[]
  ).map((a) => ({
    op: 'set' as const,
    path: `${base}/allocations/${a.id}`,
    data: json({ ...a, producerId: producers.get(a.producerName)?.id }),
  }));

  // Surcharges par site (Lot 4) pour illustrer Cave de garde vs Caveau / Bistrot vs Table Gastro
  if (hospitality) {
    const clos21 = wineByKey.get('commaraine-clos-2021');
    const drc = wineByKey.get('drc-tache');
    const clos19 = wineByKey.get('commaraine-clos-2019');
    for (const s of stock) {
      if ((s.wineId === clos21?.id || s.wineId === drc?.id) && s.siteId === mainSiteId) {
        s.hiddenOnSite = true;
      }
      if (s.wineId === clos19?.id && bar && s.siteId === bar.id) {
        s.byGlass = true;
        s.alertThreshold = 3;
      }
    }
  }

  ops.push(
    ...siteOps,
    ...[...producers.values()].map((p): Op => ({ op: 'set', path: `${base}/producers/${p.id}`, data: p as never })),
    ...wines.map((w): Op => ({ op: 'set', path: `${base}/wines/${w.id}`, data: json(w) })),
    ...rareBottleOps,
    ...allocationOps,
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
    actor,
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
