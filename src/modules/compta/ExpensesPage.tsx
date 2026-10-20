import { useMemo, useState } from 'react';
import { Pencil, Plus, Settings2, Trash2, Wallet } from 'lucide-react';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { dateFr, eur, round2 } from '@/lib/utils';
import { norm } from '@/lib/wine';
import { Button, EmptyState, PageHeader, SearchInput, Select, Spinner, Stat, Table, Td, Th, useToast } from '@/ui';
import CategoriesModal from './CategoriesModal';
import ExpenseForm, { blankExpense } from './ExpenseForm';
import YearSelect from './Shared';
import type { Expense } from './types';
import { currentYear, useCompta } from './useCompta';

export default function ExpensesPage() {
  const { t, intl } = useI18n();
  const { org, commit, path } = useOrg();
  const data = useCompta();
  const { toast, confirm } = useToast();
  const [year, setYear] = useState(currentYear());
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [catsOpen, setCatsOpen] = useState(false);
  const f = (n: number) => eur(n, org.currency, intl);

  const rows = useMemo(() => {
    const n = norm(q);
    return data.expenses
      .filter((e) => e.date.startsWith(String(year)) && (!cat || e.category === cat) && (!n || norm(`${e.provider} ${e.description}`).includes(n)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data.expenses, year, cat, q]);
  const totals = useMemo(
    () => ({ ht: round2(rows.reduce((s, e) => s + e.amountHT, 0)), vat: round2(rows.reduce((s, e) => s + e.amountTVA, 0)), ttc: round2(rows.reduce((s, e) => s + e.amountTTC, 0)) }),
    [rows],
  );
  const catName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? '—';

  const remove = async (e: Expense) => {
    if (!(await confirm({ title: t('common.confirmDelete'), danger: true, confirmLabel: t('common.delete') }))) return;
    try {
      await commit([{ op: 'delete', path: path('expenses', e.id) }]);
    } catch (err) {
      toast(err instanceof Error ? err.message : t('common.error'), 'bad');
    }
  };

  if (data.loading) return <Spinner className="mx-auto mt-20" />;

  return (
    <>
      <PageHeader
        title={t('compta.expenses.title')}
        subtitle={t('compta.expenses.subtitle')}
        actions={
          <>
            <Button icon={<Settings2 className="size-4" />} onClick={() => setCatsOpen(true)}>
              {t('compta.expenses.categories')}
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing(blankExpense(data.categories[0]?.id ?? ''))}>
              {t('compta.expenses.new')}
            </Button>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label={t('compta.amountHT')} value={f(totals.ht)} />
        <Stat label={t('compta.amountVAT')} value={f(totals.vat)} />
        <Stat label={t('compta.amountTTC')} value={f(totals.ttc)} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <YearSelect value={year} onChange={setYear} />
        <Select aria-label={t('compta.expenses.category')} value={cat} onChange={(e) => setCat(e.target.value)} className="w-48">
          <option value="">{t('compta.expenses.allCategories')}</option>
          {data.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <SearchInput value={q} onChange={setQ} placeholder={t('common.search')} className="min-w-44 flex-1 sm:max-w-xs" />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<Wallet className="size-8" />} title={t('compta.expenses.empty')} hint={t('compta.expenses.emptyHint')} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t('common.date')}</Th>
              <Th>{t('compta.expenses.provider')}</Th>
              <Th>{t('compta.expenses.category')}</Th>
              <Th right>{t('compta.amountHT')}</Th>
              <Th right>{t('compta.amountVAT')}</Th>
              <Th right>{t('compta.amountTTC')}</Th>
              <Th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <Td>{dateFr(e.date, intl)}</Td>
                <Td>
                  <div className="font-medium">{e.provider || '—'}</div>
                  <div className="text-xs text-muted">{e.description}</div>
                </Td>
                <Td>{catName(e.category)}</Td>
                <Td right>{f(e.amountHT)}</Td>
                <Td right>{f(e.amountTVA)}</Td>
                <Td right>{f(e.amountTTC)}</Td>
                <Td>
                  <div className="flex">
                    <button type="button" aria-label={t('common.edit')} onClick={() => setEditing(e)} className="rounded-md p-1.5 text-muted hover:bg-surface-2">
                      <Pencil className="size-4" />
                    </button>
                    <button type="button" aria-label={t('common.delete')} onClick={() => remove(e)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-bad">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <ExpenseForm expense={editing} categories={data.categories} assets={data.assets} onClose={() => setEditing(null)} />
      <CategoriesModal open={catsOpen} onClose={() => setCatsOpen(false)} categories={data.categories} />
    </>
  );
}
