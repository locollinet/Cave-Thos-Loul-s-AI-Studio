import { useMemo, useState } from 'react';
import { PackageOpen, Plus, Undo2 } from 'lucide-react';
import type { Wine } from '@/types';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { qtyAt } from '@/data/stock';
import { eur, today, uid } from '@/lib/utils';
import { wineLabel } from '@/lib/wine';
import { Button, EmptyState, Field, Modal, NumberInput, PageHeader, Select, Spinner, Table, Td, Th, useToast } from '@/ui';
import { groupConsignments } from './calc';
import { depositOps, returnOps } from './ops';
import PartnerPicker from './PartnerPicker';
import type { Consignment } from './types';
import { useSales } from './useSales';
import WinePicker from './WinePicker';

export default function ConsignmentsPage() {
  const { t, intl } = useI18n();
  const { org, orgId, wines, partners, sites, stock, member, commit, activeSiteId } = useOrg();
  const { consignments, loading } = useSales();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Consignment | null>(null);
  const [wine, setWine] = useState<Wine | null>(null);
  const [ret, setRet] = useState<{ c: Consignment; qty: number } | null>(null);
  const groups = useMemo(() => groupConsignments(consignments), [consignments]);
  const f = (n: number) => eur(n, org.currency, intl);
  const actor = { userId: member?.uid ?? '', userName: member?.name ?? '' };
  const wineOf = (id: string) => wines.find((w) => w.id === id);

  const openNew = () => {
    setWine(null);
    setDraft({ id: uid(), partnerId: '', wineId: '', qty: 1, priceHT: 0, siteId: activeSiteId !== 'all' ? activeSiteId : (sites[0]?.id ?? ''), createdAt: Date.now() });
  };

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
      toast(t('common.saved'));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error'), 'bad');
    }
  };

  const submitDeposit = () =>
    draft &&
    wine &&
    run(async () => {
      await commit(depositOps(orgId, { ...draft, wineId: wine.id }, wine, actor, today()));
      setDraft(null);
    });

  const submitReturn = () =>
    ret &&
    run(async () => {
      const w = wineOf(ret.c.wineId);
      if (w) await commit(returnOps(orgId, ret.c, w, ret.qty, actor, today()));
      setRet(null);
    });

  const available = draft && wine ? qtyAt(stock, wine.id, draft.siteId) : 0;
  const canDeposit = !!draft && !!wine && !!draft.partnerId && draft.qty > 0;

  if (loading) return <Spinner className="mx-auto mt-20" />;

  return (
    <>
      <PageHeader
        title={t('negoce.consignments')}
        subtitle={t('negoce.consignmentsSubtitle')}
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={openNew}>
            {t('negoce.newDeposit')}
          </Button>
        }
      />
      {groups.length === 0 ? (
        <EmptyState icon={<PackageOpen className="size-8" />} title={t('negoce.noConsignments')} hint={t('negoce.noConsignmentsHint')} />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.partnerId} aria-label={partners.find((p) => p.id === g.partnerId)?.name}>
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-semibold">{partners.find((p) => p.id === g.partnerId)?.name ?? g.partnerId}</h2>
                <span className="text-sm text-muted">
                  {t('negoce.atClient', { n: g.bottles })} · {f(g.valueHT)} {t('common.ht')}
                </span>
              </div>
              <Table>
                <thead>
                  <tr>
                    <Th>{t('negoce.wine')}</Th>
                    <Th right>{t('common.qty')}</Th>
                    <Th right>{t('negoce.unitPrice')}</Th>
                    <Th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((c) => {
                    const w = wineOf(c.wineId);
                    return (
                      <tr key={c.id}>
                        <Td>{w ? wineLabel(w) : c.wineId}</Td>
                        <Td right>{c.qty}</Td>
                        <Td right>{f(c.priceHT)}</Td>
                        <Td>
                          <Button size="sm" icon={<Undo2 className="size-3.5" />} onClick={() => setRet({ c, qty: c.qty })}>
                            {t('negoce.returnStock')}
                          </Button>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={t('negoce.newDeposit')}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>{t('common.cancel')}</Button>
            <Button variant="primary" disabled={!canDeposit} onClick={submitDeposit}>
              {t('negoce.deposit')}
            </Button>
          </>
        }
      >
        {draft && (
          <div className="grid gap-3">
            <Field label={t('negoce.client')}>
              <PartnerPicker value={draft.partnerId} onChange={(p) => setDraft({ ...draft, partnerId: p.id })} />
            </Field>
            <Field label={t('common.site')}>
              <Select value={draft.siteId} onChange={(e) => setDraft({ ...draft, siteId: e.target.value })}>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            {wine ? (
              <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
                <span>{wineLabel(wine)}</span>
                <button type="button" className="text-brand underline" onClick={() => setWine(null)}>
                  {t('common.edit')}
                </button>
              </div>
            ) : (
              <WinePicker
                siteId={draft.siteId}
                onPick={(w) => {
                  setWine(w);
                  setDraft({ ...draft, wineId: w.id, priceHT: w.sellPriceHT ?? 0 });
                }}
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('common.qty')} error={wine && draft.qty > available ? t('negoce.shortageLine', { requested: draft.qty, available }) : undefined}>
                <NumberInput min={1} value={draft.qty} onChange={(v) => setDraft({ ...draft, qty: v ?? 0 })} />
              </Field>
              <Field label={t('negoce.unitPrice')}>
                <NumberInput min={0} step="any" value={draft.priceHT} onChange={(v) => setDraft({ ...draft, priceHT: v ?? 0 })} />
              </Field>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!ret}
        onClose={() => setRet(null)}
        title={t('negoce.returnStock')}
        size="sm"
        footer={
          <>
            <Button onClick={() => setRet(null)}>{t('common.cancel')}</Button>
            <Button variant="primary" disabled={!ret || ret.qty <= 0} onClick={submitReturn}>
              {t('negoce.returnStock')}
            </Button>
          </>
        }
      >
        {ret && (
          <Field label={t('common.qty')} hint={t('negoce.returnHint', { n: ret.c.qty })}>
            <NumberInput min={1} max={ret.c.qty} value={ret.qty} onChange={(v) => setRet({ ...ret, qty: Math.min(v ?? 0, ret.c.qty) })} />
          </Field>
        )}
      </Modal>
    </>
  );
}
