import type { PurchaseInvoice } from '@/types';
import { round2 } from '@/lib/utils';
import { computeTotals } from '../negoce/calc';
import type { Payment, SaleDocument } from '../negoce/types';
import { categoryAccount, vatCollectedAccount } from './accounts';
import { depreciationForYear } from './assets';
import { assetsWithoutExpense } from './vat';
import type { AccountMap, Asset, BalanceCheck, Expense, ExpenseCategory, JournalLine } from './types';

export const JOURNALS: Record<string, string> = { VE: 'Journal des ventes', AC: 'Journal des achats', BQ: 'Journal de banque', CA: 'Journal de caisse', OD: 'Opérations diverses' };

interface PieceLine {
  account: string;
  aux?: { num: string; lib: string };
  debit: number;
  credit: number;
}
interface Piece {
  journal: keyof typeof JOURNALS;
  date: string;
  pieceRef: string;
  label: string;
  lines: PieceLine[];
}

export interface JournalInput {
  year: number;
  docs: SaleDocument[];
  payments: Payment[];
  purchases: PurchaseInvoice[];
  expenses: Expense[];
  categories: ExpenseCategory[];
  assets: Asset[];
  accounts: AccountMap;
}

const dc = (account: string, amount: number, side: 'D' | 'C', aux?: PieceLine['aux']): PieceLine => ({
  account,
  aux,
  debit: side === 'D' ? round2(amount) : 0,
  credit: side === 'C' ? round2(amount) : 0,
});
const flip = (l: PieceLine): PieceLine => ({ ...l, debit: l.credit, credit: l.debit });
const customerAux = (d: Pick<SaleDocument, 'partnerId' | 'partnerName'>) => ({ num: `C${d.partnerId.slice(0, 8)}`, lib: d.partnerName });
const supplierAux = (id: string | undefined, name: string) => ({ num: `F${(id ?? name.replace(/\W+/g, '')).slice(0, 8).toUpperCase()}`, lib: name });
const isCash = (m: string | undefined) => !!m && /esp|cash/i.test(m);

function salesPieces(i: JournalInput): Piece[] {
  const out: Piece[] = [];
  for (const d of i.docs) {
    if ((d.type !== 'invoice' && d.type !== 'credit_note') || (d.status !== 'validated' && d.status !== 'paid') || !d.date.startsWith(String(i.year))) continue;
    const t = computeTotals(d.lines, d.shippingHT, d.shippingVatRate, d.discountPct);
    let goods = 0;
    let services = 0;
    d.lines.forEach((l, idx) => {
      if (l.isService) services += t.lineNets[idx];
      else goods += t.lineNets[idx];
    });
    const lines: PieceLine[] = [
      dc(i.accounts.customers, t.totalTTC, 'D', customerAux(d)),
      dc(i.accounts.salesGoods, goods, 'C'),
      dc(i.accounts.salesServices, services, 'C'),
      dc(i.accounts.salesShipping, t.shippingHT, 'C'),
      ...t.breakdown.map((r) => dc(vatCollectedAccount(i.accounts, r.rate), r.vat, 'C')),
    ].filter((l) => l.debit || l.credit);
    if (!lines.length) continue;
    out.push({ journal: 'VE', date: d.date, pieceRef: d.number, label: `${d.type === 'credit_note' ? 'Avoir' : 'Facture'} ${d.partnerName}`, lines: d.type === 'credit_note' ? lines.map(flip) : lines });
  }
  return out;
}

function paymentPieces(i: JournalInput): Piece[] {
  const byId = new Map(i.docs.map((d) => [d.id, d]));
  const out: Piece[] = [];
  for (const p of i.payments) {
    const d = byId.get(p.documentId);
    if (!d || !p.date.startsWith(String(i.year)) || p.amount <= 0) continue;
    const cash = p.method === 'especes';
    out.push({
      journal: cash ? 'CA' : 'BQ',
      date: p.date,
      pieceRef: p.reference || d.number,
      label: `Règlement ${d.number} ${d.partnerName}`,
      lines: [dc(cash ? i.accounts.cash : i.accounts.bank, p.amount, 'D'), dc(i.accounts.customers, p.amount, 'C', customerAux(d))],
    });
  }
  return out;
}

function purchasePieces(i: JournalInput): Piece[] {
  const out: Piece[] = [];
  for (const p of i.purchases) {
    if (p.status === 'draft' || !p.date.startsWith(String(i.year))) continue;
    const aux = supplierAux(p.supplierId, p.supplierName);
    out.push({
      journal: 'AC',
      date: p.date,
      pieceRef: p.number,
      label: `Facture ${p.supplierName}`,
      lines: [dc(i.accounts.purchases, p.totalHT, 'D'), dc(i.accounts.vatDeductible, p.totalVAT, 'D'), dc(i.accounts.suppliers, p.totalTTC, 'C', aux)].filter((l) => l.debit || l.credit),
    });
    if (p.status === 'paid' && p.paymentDate && p.paymentDate.startsWith(String(i.year))) {
      const cash = isCash(p.paymentMethod);
      out.push({
        journal: cash ? 'CA' : 'BQ',
        date: p.paymentDate,
        pieceRef: p.number,
        label: `Règlement ${p.supplierName}`,
        lines: [dc(i.accounts.suppliers, p.totalTTC, 'D', aux), dc(cash ? i.accounts.cash : i.accounts.bank, p.totalTTC, 'C')],
      });
    }
  }
  return out;
}

function expensePieces(i: JournalInput): Piece[] {
  const out: Piece[] = [];
  const assetById = new Map(i.assets.map((a) => [a.id, a]));
  for (const e of i.expenses) {
    if (!e.date.startsWith(String(i.year))) continue;
    const asset = e.assetId ? assetById.get(e.assetId) : undefined;
    const debitAccount = asset ? i.accounts[`asset.${asset.category}`] : categoryAccount(i.categories, e);
    const total = round2(e.amountHT + e.amountTVA);
    const unpaid = e.paymentMethod === 'a_payer';
    const cash = e.paymentMethod === 'especes';
    const credit = unpaid ? dc(i.accounts.suppliers, total, 'C', supplierAux(undefined, e.provider || 'Divers')) : dc(cash ? i.accounts.cash : i.accounts.bank, total, 'C');
    out.push({
      journal: unpaid ? 'AC' : cash ? 'CA' : 'BQ',
      date: e.date,
      pieceRef: (e.description ?? '').slice(0, 40) || e.provider || '—',
      label: `${e.provider ?? ''} ${e.description ?? ''}`.trim(),
      lines: [dc(debitAccount, e.amountHT, 'D'), dc(asset ? i.accounts.vatDeductibleAssets : i.accounts.vatDeductible, e.amountTVA, 'D'), credit].filter((l) => l.debit || l.credit),
    });
  }
  return out;
}

function assetPieces(i: JournalInput): Piece[] {
  const out: Piece[] = [];
  for (const a of assetsWithoutExpense(i.assets, i.expenses)) {
    if (!a.purchaseDate.startsWith(String(i.year))) continue;
    out.push({
      journal: 'AC',
      date: a.purchaseDate,
      pieceRef: a.name.slice(0, 40),
      label: `Acquisition ${a.name}`,
      lines: [dc(i.accounts[`asset.${a.category}`], a.amountHT, 'D'), dc(i.accounts.vatDeductibleAssets, a.vatAmount, 'D'), dc(i.accounts.assetSuppliers, round2(a.amountHT + a.vatAmount), 'C')].filter((l) => l.debit || l.credit),
    });
  }
  for (const a of i.assets) {
    const dot = depreciationForYear(a, i.year);
    if (dot <= 0) continue;
    out.push({
      journal: 'OD',
      date: `${i.year}-12-31`,
      pieceRef: `DOT-${i.year}`,
      label: `Dotation ${a.name}`,
      lines: [dc(i.accounts.depreciationExpense, dot, 'D'), dc(i.accounts[`amort.${a.category}`], dot, 'C')],
    });
  }
  return out;
}

export function accountLabels(accounts: AccountMap, categories: ExpenseCategory[], names: Record<string, string>): Record<string, string> {
  const m: Record<string, string> = {};
  for (const [k, code] of Object.entries(accounts)) m[code] = names[k] ?? code;
  for (const c of categories) m[c.account] = c.name;
  return m;
}

/** Écritures de l'exercice, numérotées sans trou par journal. */
export function buildJournal(i: JournalInput, labels: Record<string, string> = {}): JournalLine[] {
  const pieces = [...salesPieces(i), ...paymentPieces(i), ...purchasePieces(i), ...expensePieces(i), ...assetPieces(i)].sort((a, b) =>
    a.date === b.date ? String(a.journal).localeCompare(String(b.journal)) : a.date.localeCompare(b.date),
  );
  const counters = new Map<string, number>();
  const lines: JournalLine[] = [];
  for (const p of pieces) {
    const num = (counters.get(p.journal) ?? 0) + 1;
    counters.set(p.journal, num);
    for (const l of p.lines) {
      lines.push({
        journal: p.journal,
        journalLib: JOURNALS[p.journal],
        num,
        date: p.date,
        account: l.account,
        accountLib: labels[l.account] ?? l.account,
        auxAccount: l.aux?.num ?? '',
        auxLib: l.aux?.lib ?? '',
        pieceRef: p.pieceRef,
        pieceDate: p.date,
        label: p.label,
        debit: l.debit,
        credit: l.credit,
      });
    }
  }
  return lines;
}

export function checkBalance(lines: JournalLine[]): BalanceCheck {
  const pieces = new Map<string, { journal: string; pieceRef: string; gap: number }>();
  let totalDebit = 0;
  let totalCredit = 0;
  for (const l of lines) {
    totalDebit += l.debit;
    totalCredit += l.credit;
    const k = `${l.journal}#${l.num}`;
    const p = pieces.get(k) ?? { journal: l.journal, pieceRef: l.pieceRef, gap: 0 };
    p.gap = round2(p.gap + l.debit - l.credit);
    pieces.set(k, p);
  }
  const unbalancedPieces = [...pieces.values()].filter((p) => Math.abs(p.gap) > 0.004);
  return { balanced: Math.abs(totalDebit - totalCredit) < 0.005 && unbalancedPieces.length === 0, totalDebit: round2(totalDebit), totalCredit: round2(totalCredit), unbalancedPieces };
}
