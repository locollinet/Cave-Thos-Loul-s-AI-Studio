import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, PackageCheck, Plus, Save } from 'lucide-react';
import { useCollection, useOrg } from '@/app/org';
import { useT } from '@/i18n';
import { Button, Card, Field, Input, NumberInput, Select, useToast } from '@/ui';
import type { PurchaseInvoice } from '@/types';
import { norm } from '@/lib/wine';
import { checkTotals, emptyLine, findDuplicate } from './logic';
import { buildInvoiceOps, draftTotals, isReceivable } from './receive';
import type { InvoiceDraft, ReviewLine } from './types';
import { ReviewLineCard } from './ReviewLineCard';
import { TotalsBox } from './TotalsBox';

interface Props {
  initial: InvoiceDraft;
  createdAt?: number;
}

export function Review({ initial, createdAt }: Props) {
  const t = useT();
  const nav = useNavigate();
  const { toast } = useToast();
  const { org, orgId, sites, wines, producers, partners, member, commit } = useOrg();
  const { rows: invoices } = useCollection<PurchaseInvoice>('purchaseInvoices');
  const [draft, setDraft] = useState<InvoiceDraft>(initial);
  const [busy, setBusy] = useState<'draft' | 'receive' | null>(null);

  const suppliers = useMemo(() => partners.filter((p) => p.kind === 'supplier' && !p.isArchived), [partners]);
  const totals = useMemo(() => draftTotals(draft, org.defaultVatRate), [draft, org.defaultVatRate]);
  const check = useMemo(() => checkTotals(totals, { ht: draft.declaredHT, vat: draft.declaredVAT }), [totals, draft.declaredHT, draft.declaredVAT]);
  const duplicate = useMemo(() => findDuplicate(invoices, draft.supplierName, draft.number, draft.id), [invoices, draft.supplierName, draft.number, draft.id]);

  const patch = (p: Partial<InvoiceDraft>) => setDraft((d) => ({ ...d, ...p }));
  const patchLine = (key: string, p: Partial<ReviewLine>) => setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...p } : l)) }));
  const unresolved = draft.lines.filter((l) => l.choice !== 'skip' && !isReceivable(l) && l.qty > 0).length;
  const receivable = draft.lines.filter(isReceivable).length;
  const canReceive = !!draft.supplierName.trim() && !!draft.date && !!draft.siteId && receivable > 0 && unresolved === 0 && !duplicate;
  const canDraft = !!draft.supplierName.trim() && draft.lines.length > 0 && !duplicate;

  const run = async (mode: 'draft' | 'receive') => {
    setBusy(mode);
    try {
      const { ops } = buildInvoiceOps(draft, mode, { orgId, org, actor: { userId: member?.uid ?? '', userName: member?.name ?? '' }, wines, producers, partners }, createdAt);
      await commit(ops);
      toast(t(mode === 'receive' ? 'achats.received' : 'achats.draftSaved'));
      nav('/achats');
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error'), 'bad');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t('achats.f.supplier')}>
          <Input list="achats-suppliers" value={draft.supplierName} onChange={(e) => patch({ supplierName: e.target.value })} />
          <datalist id="achats-suppliers">
            {suppliers.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </Field>
        <Field label={t('achats.f.number')}>
          <Input value={draft.number} onChange={(e) => patch({ number: e.target.value })} />
        </Field>
        <Field label={t('achats.f.site')}>
          <Select value={draft.siteId} onChange={(e) => patch({ siteId: e.target.value })}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('achats.f.date')}>
          <Input type="date" value={draft.date} onChange={(e) => patch({ date: e.target.value })} />
        </Field>
        <Field label={t('achats.f.dueDate')}>
          <Input type="date" value={draft.dueDate} onChange={(e) => patch({ dueDate: e.target.value })} />
        </Field>
        <Field label={t('achats.f.shipping')}>
          <NumberInput step={0.01} min={0} value={draft.shippingHT || undefined} onChange={(v) => patch({ shippingHT: v ?? 0 })} />
        </Field>
        {!suppliers.some((s) => norm(s.name) === norm(draft.supplierName)) && draft.supplierName.trim() && (
          <p className="text-xs text-muted sm:col-span-2 lg:col-span-3">{t('achats.f.newSupplier')}</p>
        )}
      </Card>

      {duplicate && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {t('achats.duplicate', { supplier: duplicate.supplierName, number: duplicate.number })}
        </p>
      )}

      <div className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{t('achats.lines', { n: draft.lines.length })}</h2>
        {draft.lines.map((l) => (
          <ReviewLineCard key={l.key} line={l} wines={wines} invoices={invoices} onChange={(p) => patchLine(l.key, p)} onRemove={() => setDraft((d) => ({ ...d, lines: d.lines.filter((x) => x.key !== l.key) }))} />
        ))}
        <Button icon={<Plus className="size-4" />} onClick={() => setDraft((d) => ({ ...d, lines: [...d.lines, emptyLine(org.defaultVatRate)] }))}>
          {t('achats.addLine')}
        </Button>
      </div>

      <TotalsBox draft={draft} computed={totals} check={check} onChange={patch} />

      {unresolved > 0 && <p className="text-sm text-warn">{t('achats.unresolved', { n: unresolved })}</p>}
      <div className="sticky bottom-16 z-10 flex flex-wrap justify-end gap-2 rounded-xl border border-border bg-surface/95 p-3 backdrop-blur md:bottom-3">
        <Button onClick={() => nav('/achats')}>{t('common.cancel')}</Button>
        <Button icon={<Save className="size-4" />} loading={busy === 'draft'} disabled={!canDraft || busy !== null} onClick={() => run('draft')}>
          {t('achats.saveDraft')}
        </Button>
        <Button variant="primary" icon={<PackageCheck className="size-4" />} loading={busy === 'receive'} disabled={!canReceive || busy !== null} onClick={() => run('receive')}>
          {t('achats.receive')}
        </Button>
      </div>
    </div>
  );
}
