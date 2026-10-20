import { round2 } from '@/lib/utils';
import type { JournalLine } from './types';

export interface BalanceRow {
  account: string;
  label: string;
  debit: number;
  credit: number;
  balance: number;
}

export function trialBalance(lines: JournalLine[]): BalanceRow[] {
  const m = new Map<string, BalanceRow>();
  for (const l of lines) {
    const r = m.get(l.account) ?? { account: l.account, label: l.accountLib, debit: 0, credit: 0, balance: 0 };
    r.debit = round2(r.debit + l.debit);
    r.credit = round2(r.credit + l.credit);
    r.balance = round2(r.debit - r.credit);
    m.set(l.account, r);
  }
  return [...m.values()].sort((a, b) => a.account.localeCompare(b.account));
}

export async function exportJournalXlsx(filename: string, lines: JournalLine[], headers: { journal: string[]; balance: string[]; journalSheet: string; balanceSheet: string }): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const journal = [headers.journal, ...lines.map((l) => [l.journal, l.num, l.date, l.account, l.accountLib, l.auxAccount, l.pieceRef, l.label, l.debit, l.credit])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(journal), headers.journalSheet);
  const balance = [headers.balance, ...trialBalance(lines).map((r) => [r.account, r.label, r.debit, r.credit, r.balance])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(balance), headers.balanceSheet);
  XLSX.writeFile(wb, filename);
}
