import type { Movement, StockLevel, Wine, WineColor } from '@/types';
import { stockDeltas } from '@/data/stock';
import type { DrmCategory, DrmRow, Qty } from './types';

export const DRM_CATEGORIES: DrmCategory[] = ['tranquilles', 'mousseux', 'spiritueux', 'autres'];

export const drmCategoryOf = (color: WineColor | undefined): DrmCategory =>
  color === 'bulles' ? 'mousseux' : color === 'spiritueux' ? 'spiritueux' : color === 'autre' || !color ? 'autres' : 'tranquilles';

export const toHl = (bottles: number, formatCl: number): number => (bottles * formatCl) / 10000;
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

type EntryKey = 'achats' | 'retours' | 'autres';
type ExitKey = 'ventes' | 'consommation' | 'casse' | 'degustation' | 'offerts' | 'autres';

const zero = (): Qty => ({ bottles: 0, hl: 0 });
const add = (q: Qty, bottles: number, formatCl: number) => {
  q.bottles += bottles;
  q.hl = r4(q.hl + toHl(bottles, formatCl));
};

const emptyRow = (category: DrmCategory): DrmRow => ({
  category,
  opening: zero(),
  entries: { achats: zero(), retours: zero(), autres: zero(), total: zero() },
  exits: { ventes: zero(), consommation: zero(), casse: zero(), degustation: zero(), offerts: zero(), autres: zero(), total: zero() },
  closing: zero(),
});

export function classifyMovement(m: Pick<Movement, 'type' | 'reason'>, delta: number): { side: 'entries'; key: EntryKey } | { side: 'exits'; key: ExitKey } {
  if (m.type === 'in' && delta > 0) return { side: 'entries', key: m.reason === 'achat' ? 'achats' : m.reason === 'retour' ? 'retours' : 'autres' };
  if (m.type === 'out' && delta < 0) {
    if (m.reason === 'vente' || m.reason === 'depot_vente') return { side: 'exits', key: 'ventes' };
    if (m.reason === 'bouchonne' || m.reason === 'oxyde' || m.reason === 'casse') return { side: 'exits', key: 'casse' };
    if (m.reason === 'consommation' || m.reason === 'degustation') return { side: 'exits', key: m.reason };
    if (m.reason === 'offert') return { side: 'exits', key: 'offerts' };
    return { side: 'exits', key: 'autres' };
  }
  return delta > 0 ? { side: 'entries', key: 'autres' } : { side: 'exits', key: 'autres' };
}

const monthBounds = (month: string): { from: string; to: string } => {
  const [y, m] = month.split('-').map(Number);
  return { from: `${month}-01`, to: `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}` };
};

export interface DrmInput {
  wines: Wine[];
  stock: StockLevel[];
  movements: Movement[];
  month: string; // yyyy-mm
  siteId?: string; // sinon tous les sites (transferts neutres)
}

/** Net de stock d'un mouvement : tous sites confondus, ou pour un site donné. */
function movementDelta(m: Movement, siteId?: string): number {
  const d = stockDeltas(m);
  return d.filter((x) => !siteId || x.siteId === siteId).reduce((s, x) => s + x.delta, 0);
}

/**
 * Stock de clôture ancré sur le stock actuel (moins les mouvements postérieurs au mois),
 * stock d'ouverture = clôture − mouvements du mois.
 */
export function buildDrm({ wines, stock, movements, month, siteId }: DrmInput): DrmRow[] {
  const { from, to } = monthBounds(month);
  const byId = new Map(wines.map((w) => [w.id, w]));
  const rows = new Map<DrmCategory, DrmRow>(DRM_CATEGORIES.map((c) => [c, emptyRow(c)]));
  const closing = new Map<string, number>();
  for (const s of stock) if (!siteId || s.siteId === siteId) closing.set(s.wineId, (closing.get(s.wineId) ?? 0) + s.qty);
  const periodNet = new Map<string, number>();

  for (const m of movements) {
    const delta = movementDelta(m, siteId);
    if (!delta) continue;
    if (m.date > to) {
      closing.set(m.wineId, (closing.get(m.wineId) ?? 0) - delta);
    } else if (m.date >= from) {
      periodNet.set(m.wineId, (periodNet.get(m.wineId) ?? 0) + delta);
      const w = byId.get(m.wineId);
      const row = rows.get(drmCategoryOf(w?.color))!;
      const cl = w?.formatCl ?? 75;
      const c = classifyMovement(m, delta);
      const q = Math.abs(delta);
      if (c.side === 'entries') {
        add(row.entries[c.key], q, cl);
        add(row.entries.total, q, cl);
      } else {
        add(row.exits[c.key], q, cl);
        add(row.exits.total, q, cl);
      }
    }
  }

  for (const [wineId, qty] of closing) {
    const w = byId.get(wineId);
    const row = rows.get(drmCategoryOf(w?.color))!;
    const cl = w?.formatCl ?? 75;
    add(row.closing, qty, cl);
    add(row.opening, qty - (periodNet.get(wineId) ?? 0), cl);
  }
  return DRM_CATEGORIES.map((c) => rows.get(c)!);
}

export const drmTotals = (rows: DrmRow[]): { opening: Qty; entries: Qty; exits: Qty; closing: Qty } => {
  const t = { opening: zero(), entries: zero(), exits: zero(), closing: zero() };
  for (const r of rows) {
    for (const k of ['opening', 'closing'] as const) {
      t[k].bottles += r[k].bottles;
      t[k].hl = r4(t[k].hl + r[k].hl);
    }
    t.entries.bottles += r.entries.total.bottles;
    t.entries.hl = r4(t.entries.hl + r.entries.total.hl);
    t.exits.bottles += r.exits.total.bottles;
    t.exits.hl = r4(t.exits.hl + r.exits.total.hl);
  }
  return t;
};

export function drmCsvRows(rows: DrmRow[], labels: Record<string, string>): (string | number)[][] {
  const head = [labels.category, labels.opening, labels.achats, labels.retours, labels.entriesOther, labels.entries, labels.ventes, labels.consommation, labels.casse, labels.degustation, labels.offerts, labels.exitsOther, labels.exits, labels.closing];
  const line = (r: DrmRow, k: 'bottles' | 'hl') => [
    labels[`cat.${r.category}`],
    r.opening[k],
    r.entries.achats[k],
    r.entries.retours[k],
    r.entries.autres[k],
    r.entries.total[k],
    r.exits.ventes[k],
    r.exits.consommation[k],
    r.exits.casse[k],
    r.exits.degustation[k],
    r.exits.offerts[k],
    r.exits.autres[k],
    r.exits.total[k],
    r.closing[k],
  ];
  return [[labels.bottles], head, ...rows.map((r) => line(r, 'bottles')), [], [labels.hl], head, ...rows.map((r) => line(r, 'hl'))];
}
