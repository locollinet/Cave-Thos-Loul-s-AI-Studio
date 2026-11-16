import type { InventorySession, Movement, StockLevel, Wine } from '@/types';
import type { Op } from '../store';
import { round2, uid } from '@/lib/utils';
import { DEFAULT_CATEGORIES } from '@/modules/compta/accounts';
import { buildDrm } from '@/modules/compta/drm';
import type { Asset, AssetCategory, DrmReport, Expense, PaymentMethodExp } from '@/modules/compta/types';
import { EXPENSE_CATEGORY_NAMES } from './catalog';
import type { DemoWorld } from './world';

/* ------------------------------------------------------------ comptabilité */

// [il y a n jours, fournisseur, catégorie, libellé, montant HT, taux de TVA, règlement]
type ExpenseSeed = [number, string, string, string, number, number, PaymentMethodExp];

const EXPENSES: ExpenseSeed[] = [
  [350, 'Foncière des Remparts', 'rent', 'Loyer du chai — 4e trimestre', 1500, 20, 'virement'],
  [260, 'Foncière des Remparts', 'rent', 'Loyer du chai — 1er trimestre', 1500, 20, 'virement'],
  [170, 'Foncière des Remparts', 'rent', 'Loyer du chai — 2e trimestre', 1500, 20, 'virement'],
  [80, 'Foncière des Remparts', 'rent', 'Loyer du chai — 3e trimestre', 1500, 20, 'virement'],
  [290, 'Mutuelle Assurances Pro', 'insurance', 'Multirisque professionnelle et marchandises', 1850, 0, 'prelevement'],
  [255, 'Énergie Plus', 'energy', 'Électricité — régulation de la cave', 410, 20, 'prelevement'],
  [75, 'Énergie Plus', 'energy', 'Électricité — régulation de la cave', 465, 20, 'prelevement'],
  [190, 'Cabinet Martin & Associés', 'fees', 'Bilan annuel et liasse fiscale', 1400, 20, 'virement'],
  [300, 'Transports Rapides du Centre', 'transport', 'Livraisons clients — fêtes de fin d’année', 640, 20, 'virement'],
  [42, 'Transports Rapides du Centre', 'transport', 'Livraisons clients', 380, 20, 'a_payer'],
  [230, 'Salon Vins & Terroirs', 'advertising', 'Stand au salon professionnel', 1500, 20, 'virement'],
  [150, 'Télécom Pro', 'telecom', 'Fibre et lignes mobiles — semestre', 360, 20, 'prelevement'],
  [118, 'Cartonnages du Val', 'supplies', 'Cartons 6 et 12 bouteilles, caisses bois', 740, 20, 'carte'],
  [60, 'Eau & Glace Service', 'supplies', 'Consommables dégustation et eau de source', 180, 5.5, 'carte'],
  [32, 'Table des Vignerons', 'travel', 'Déjeuner dégustation partenaires (TVA 10 %)', 210, 10, 'carte'],
  [70, 'Froid & Clim Services', 'maintenance', 'Entretien annuel du groupe froid', 380, 20, 'cheque'],
  [25, 'Banque des Vignerons', 'bank', 'Frais de tenue de compte et terminal de paiement', 96, 0, 'prelevement'],
  [18, 'Petite Caisse Caveau', 'supplies', 'Tire-bouchons, stop-gouttes et fournitures caisse', 140, 20, 'especes'],
];

const ASSETS: Record<'trade' | 'group', [number, string, AssetCategory, number, number][]> = {
  trade: [
    [610, 'Cave climatisée (groupe froid et isolation)', 'materiel', 18500, 10],
    [45, 'Armoire de vieillissement & présentation', 'materiel', 4800, 5],
  ],
  group: [
    [610, 'Caves de service pour les salles', 'materiel', 14000, 7],
    [45, 'Agencement comptoir dégustation & bar', 'agencement', 12000, 10],
  ],
};

/** Catégories par défaut, ~15 charges sur 12 mois et 2 immobilisations acquises les exercices précédents. */
export function buildCompta(w: DemoWorld, scale: number, kind: 'trade' | 'group'): Op[] {
  const base = `orgs/${w.orgId}`;
  const ops: Op[] = DEFAULT_CATEGORIES.map((c): Op => ({ op: 'set', path: `${base}/expenseCategories/${c.key}`, data: { id: c.key, name: EXPENSE_CATEGORY_NAMES[c.key] ?? c.key, account: c.account } }));
  for (const [ago, provider, category, description, ht, rate, paymentMethod] of EXPENSES) {
    const date = w.clock.iso(ago);
    const amountHT = round2(ht * (category === 'bank' || category === 'telecom' ? 1 : scale));
    const amountTVA = round2((amountHT * rate) / 100);
    const e: Expense = { id: uid(), date, provider, category, description, amountHT, amountTVA, amountTTC: round2(amountHT + amountTVA), paymentMethod, createdAt: w.clock.ts(date, 4 * 3_600_000) };
    ops.push({ op: 'set', path: `${base}/expenses/${e.id}`, data: e as never });
  }
  for (const [ago, name, category, ht, years] of ASSETS[kind]) {
    const date = w.clock.iso(ago);
    const a: Asset = { id: uid(), name, category, purchaseDate: date, amountHT: ht, vatAmount: round2(ht * 0.2), durationYears: years, startDepreciationDate: date, createdAt: w.clock.ts(date, 4 * 3_600_000) };
    ops.push({ op: 'set', path: `${base}/assets/${a.id}`, data: a as never });
  }
  return ops;
}

/* ------------------------------------------------------------ inventaire */

const INVENTORY_AGO = 40;
const GAPS: [string, number][] = [
  ['joguet-chinon', -1],
  ['lapierre-morgon', 1],
];

export interface InventoryPlan {
  date: string;
  name: string;
  gaps: { wineId: string; delta: number }[];
}

/** Écarts constatés à l'inventaire : ajustements ajoutés au journal avant le calcul du stock d'ouverture. */
export function planInventory(w: DemoWorld): InventoryPlan {
  const date = w.clock.iso(INVENTORY_AGO);
  const [y, m, d] = date.split('-');
  const name = `Inventaire du ${d}/${m}/${y}`;
  const gaps = GAPS.map(([k, delta]) => ({ wineId: w.wineByKey.get(k)?.id ?? '', delta })).filter((g) => g.wineId);
  for (const g of gaps) w.ledger.add({ wineId: g.wineId, siteId: w.mainSiteId, type: 'adjust', qty: g.delta, reason: 'inventaire', date, note: name });
  return { date, name, gaps };
}

/** Session clôturée : quantités comptées = stock attendu ± écarts déjà appliqués. */
export function inventoryOp(w: DemoWorld, plan: InventoryPlan): Op {
  const counts: Record<string, number> = {};
  for (const wine of w.wines) {
    const expected = w.ledger.balanceAt(wine.id, w.mainSiteId, plan.date, 4);
    const gap = plan.gaps.find((g) => g.wineId === wine.id)?.delta ?? 0;
    if (expected > 0 || gap) counts[wine.id] = expected + gap;
  }
  const closedAt = w.clock.ts(plan.date, 11 * 3_600_000);
  const s: InventorySession = { id: uid(), siteId: w.mainSiteId, name: plan.name, status: 'closed', counts, startedAt: closedAt - 2 * 3_600_000, closedAt, userName: w.actor.userName };
  return { op: 'set', path: `orgs/${w.orgId}/inventories/${s.id}`, data: s as never };
}

/** Déclaration DRM mensuelle archivée pour le mois précédent, calculée sur les mouvements réels de la démo. */
export function buildDrmDemoOp(orgId: string, wines: Wine[], stock: StockLevel[], movementOps: Op[], now: number, actorName: string): Op {
  const d = new Date(now);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const month = d.toISOString().slice(0, 7);
  const movements = movementOps
    .filter((o): o is Extract<Op, { op: 'set' }> => o.op === 'set' && o.path.includes('/movements/'))
    .map((o) => o.data as unknown as Movement);
  const rows = buildDrm({ wines, stock, movements, month });
  const report: DrmReport = { id: month, month, rows, savedAt: now - 5 * 86_400_000, savedBy: actorName };
  return { op: 'set', path: `orgs/${orgId}/drmReports/${month}`, data: JSON.parse(JSON.stringify(report)) };
}
