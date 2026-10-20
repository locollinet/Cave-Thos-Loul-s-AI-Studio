import { useMemo, useState } from 'react';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Button, Card, Input, useToast } from '@/ui';
import { ACCOUNTS_DOC_ID, DEFAULT_ACCOUNTS } from './accounts';
import type { AccountMap } from './types';

export default function AccountMapEditor({ accounts }: { accounts: AccountMap }) {
  const { t } = useI18n();
  const { commit, path } = useOrg();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const keys = useMemo(() => Object.keys(DEFAULT_ACCOUNTS), []);

  const save = async (map: Partial<AccountMap>) => {
    try {
      await commit([{ op: 'set', path: path('expenseCategories', ACCOUNTS_DOC_ID), data: { id: ACCOUNTS_DOC_ID, map } }]);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error'), 'bad');
    }
  };

  const change = (key: string, value: string) => {
    const code = value.trim();
    if (!code || code === accounts[key]) return;
    const custom = Object.fromEntries(Object.entries({ ...accounts, [key]: code }).filter(([k, v]) => v !== DEFAULT_ACCOUNTS[k]));
    void save(custom);
  };

  return (
    <Card className="mb-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold">{t('compta.journal.accounts')}</h2>
          <p className="text-xs text-muted">{t('compta.journal.accountsHint')}</p>
        </div>
        <Button size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? t('common.close') : t('common.edit')}
        </Button>
      </div>
      {open && (
        <div className="mt-4 grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {keys.map((k) => (
            <label key={k} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted">{t(`compta.acc.${k}`)}</span>
              <Input defaultValue={accounts[k]} key={accounts[k]} onBlur={(e) => change(k, e.target.value)} className="h-8 w-28" inputMode="numeric" />
            </label>
          ))}
          <div className="sm:col-span-2 lg:col-span-3">
            <Button size="sm" variant="ghost" onClick={() => void save({})}>
              {t('compta.journal.resetAccounts')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
