import { useMemo, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, FileText, TriangleAlert } from 'lucide-react';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { downloadBlob, eur, toCsv } from '@/lib/utils';
import { Button, PageHeader, Spinner, Table, Td, Th, useToast } from '@/ui';
import AccountMapEditor from './AccountMapEditor';
import { exportJournalXlsx } from './exportXlsx';
import { fecContent, fecFilename, journalCsvRows } from './fec';
import { accountLabels, buildJournal, checkBalance } from './journal';
import YearSelect, { Disclaimer } from './Shared';
import { currentYear, useCompta } from './useCompta';

const MAX_ROWS = 300;

export default function JournalPage() {
  const { t, intl } = useI18n();
  const { org } = useOrg();
  const data = useCompta();
  const { toast } = useToast();
  const [year, setYear] = useState(currentYear());
  const f = (n: number) => eur(n, org.currency, intl);

  const lines = useMemo(() => {
    const names = Object.fromEntries(Object.keys(data.accounts).map((k) => [k, t(`compta.acc.${k}`)]));
    const labels = accountLabels(data.accounts, data.categories, names);
    return buildJournal({ year, docs: data.docs, payments: data.payments, purchases: data.purchases, expenses: data.expenses, categories: data.categories, assets: data.assets, accounts: data.accounts }, labels);
  }, [year, data.docs, data.payments, data.purchases, data.expenses, data.categories, data.assets, data.accounts, t]);
  const check = useMemo(() => checkBalance(lines), [lines]);
  const header = ['journal', 'num', 'date', 'account', 'accountLib', 'aux', 'piece', 'label', 'debit', 'credit'].map((k) => t(`compta.journal.col.${k}`));

  const exportFec = () => {
    if (!check.balanced) {
      toast(t('compta.journal.unbalancedBlock'), 'bad');
      return;
    }
    if (!org.legal.siret.replace(/\D/g, '')) toast(t('compta.journal.noSiret'), 'info');
    downloadBlob(fecFilename(org.legal.siret, year), fecContent(lines), 'text/plain;charset=utf-8');
  };
  const exportCsv = () => downloadBlob(`Journal_${year}.csv`, toCsv(journalCsvRows(lines, header)), 'text/csv;charset=utf-8');
  const exportXlsx = () =>
    exportJournalXlsx(`Compta_${year}.xlsx`, lines, {
      journal: header,
      balance: ['account', 'label', 'debit', 'credit', 'balance'].map((k) => t(`compta.journal.bal.${k}`)),
      journalSheet: t('compta.journal.title'),
      balanceSheet: t('compta.journal.balanceSheet'),
    }).catch((e: unknown) => toast(e instanceof Error ? e.message : t('common.error'), 'bad'));

  if (data.loading) return <Spinner className="mx-auto mt-20" />;

  return (
    <>
      <PageHeader
        title={t('compta.journal.title')}
        subtitle={t('compta.journal.subtitle')}
        actions={
          <>
            <YearSelect value={year} onChange={setYear} />
            <Button icon={<FileSpreadsheet className="size-4" />} onClick={exportXlsx} disabled={!lines.length}>
              XLSX
            </Button>
            <Button icon={<Download className="size-4" />} onClick={exportCsv} disabled={!lines.length}>
              CSV
            </Button>
            <Button variant="primary" icon={<FileText className="size-4" />} onClick={exportFec} disabled={!lines.length}>
              {t('compta.journal.exportFec')}
            </Button>
          </>
        }
      />
      <Disclaimer text={t('compta.disclaimer')} />

      {lines.length > 0 &&
        (check.balanced ? (
          <div role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-ok/30 bg-ok/10 px-4 py-2.5 text-sm text-ok">
            <CheckCircle2 className="size-4" />
            {t('compta.journal.balanced', { debit: f(check.totalDebit), credit: f(check.totalCredit) })}
          </div>
        ) : (
          <div role="alert" className="mb-4 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
            <div className="flex items-center gap-2 font-medium">
              <TriangleAlert className="size-4" />
              {t('compta.journal.unbalanced', { debit: f(check.totalDebit), credit: f(check.totalCredit) })}
            </div>
            <ul className="mt-1 list-disc pl-6 text-xs">
              {check.unbalancedPieces.map((p) => (
                <li key={`${p.journal}-${p.pieceRef}`}>{t('compta.journal.unbalancedPiece', { journal: p.journal, piece: p.pieceRef, gap: f(p.gap) })}</li>
              ))}
            </ul>
          </div>
        ))}

      <AccountMapEditor accounts={data.accounts} />

      {lines.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted">{t('compta.journal.empty')}</p>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>{t('compta.journal.col.journal')}</Th>
                <Th>{t('compta.journal.col.date')}</Th>
                <Th>{t('compta.journal.col.account')}</Th>
                <Th>{t('compta.journal.col.piece')}</Th>
                <Th>{t('compta.journal.col.label')}</Th>
                <Th right>{t('compta.journal.col.debit')}</Th>
                <Th right>{t('compta.journal.col.credit')}</Th>
              </tr>
            </thead>
            <tbody>
              {lines.slice(0, MAX_ROWS).map((l, i) => (
                <tr key={i}>
                  <Td>
                    {l.journal} <span className="text-xs text-muted">#{l.num}</span>
                  </Td>
                  <Td>{l.date}</Td>
                  <Td>
                    <span className="tabular">{l.account}</span> <span className="text-xs text-muted">{l.accountLib}</span>
                  </Td>
                  <Td>{l.pieceRef}</Td>
                  <Td className="max-w-64 truncate">{l.label}</Td>
                  <Td right>{l.debit ? f(l.debit) : ''}</Td>
                  <Td right>{l.credit ? f(l.credit) : ''}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {lines.length > MAX_ROWS && <p className="mt-2 text-xs text-muted">{t('compta.journal.truncated', { n: MAX_ROWS, total: lines.length })}</p>}
        </>
      )}
    </>
  );
}
