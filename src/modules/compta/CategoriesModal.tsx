import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useOrg } from '@/app/org';
import { useT } from '@/i18n';
import { uid } from '@/lib/utils';
import { Button, Field, Input, Modal, useToast } from '@/ui';
import { DEFAULT_CATEGORIES } from './accounts';
import type { ExpenseCategory } from './types';

export default function CategoriesModal({ open, onClose, categories }: { open: boolean; onClose: () => void; categories: ExpenseCategory[] }) {
  const t = useT();
  const { commit, path } = useOrg();
  const { toast, confirm } = useToast();
  const [name, setName] = useState('');
  const [account, setAccount] = useState('618000');

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error'), 'bad');
    }
  };

  const add = () =>
    name.trim() &&
    run(async () => {
      const c: ExpenseCategory = { id: uid(), name: name.trim(), account: account.trim() || '618000' };
      await commit([{ op: 'set', path: path('expenseCategories', c.id), data: c as never }]);
      setName('');
    });

  const loadDefaults = () =>
    run(async () => {
      const ops = DEFAULT_CATEGORIES.filter((d) => !categories.some((c) => c.id === d.key)).map((d) => ({
        op: 'set' as const,
        path: path('expenseCategories', d.key),
        data: { id: d.key, name: t(`compta.cat.${d.key}`), account: d.account },
      }));
      if (ops.length) await commit(ops);
    });

  const rename = (c: ExpenseCategory, patch: Partial<ExpenseCategory>) => run(() => commit([{ op: 'set', path: path('expenseCategories', c.id), data: patch as never, merge: true }]));

  const remove = async (c: ExpenseCategory) => {
    if (!(await confirm({ title: t('common.confirmDelete'), danger: true, confirmLabel: t('common.delete') }))) return;
    await run(() => commit([{ op: 'delete', path: path('expenseCategories', c.id) }]));
  };

  return (
    <Modal open={open} onClose={onClose} title={t('compta.expenses.categories')} size="lg" footer={<Button onClick={onClose}>{t('common.close')}</Button>}>
      <div className="space-y-4">
        {categories.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted">
            <p className="mb-2">{t('compta.expenses.noCategories')}</p>
            <Button onClick={loadDefaults}>{t('compta.expenses.loadDefaults')}</Button>
          </div>
        )}
        <ul className="space-y-2">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <Input aria-label={t('common.name')} defaultValue={c.name} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && rename(c, { name: e.target.value.trim() })} />
              <Input aria-label={t('compta.account')} defaultValue={c.account} onBlur={(e) => e.target.value !== c.account && rename(c, { account: e.target.value.trim() })} className="w-28" inputMode="numeric" />
              <button type="button" aria-label={t('common.delete')} onClick={() => remove(c)} className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-bad">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
          <Field label={t('common.name')} className="min-w-40 flex-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          </Field>
          <Field label={t('compta.account')} className="w-32">
            <Input value={account} onChange={(e) => setAccount(e.target.value)} inputMode="numeric" />
          </Field>
          <Button icon={<Plus className="size-4" />} onClick={add} disabled={!name.trim()}>
            {t('common.add')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
