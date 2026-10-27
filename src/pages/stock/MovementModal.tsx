import { useEffect, useMemo, useState } from 'react';
import type { MovementReason, MovementType, Wine } from '@/types';
import { useOrg } from '@/app/org';
import { useAuth } from '@/app/auth';
import { useT } from '@/i18n';
import { Button, Field, Input, Modal, NumberInput, Segmented, Select, useToast } from '@/ui';
import { WinePicker } from '@/components/WinePicker';
import { buildMovementOps, qtyAt, stockId } from '@/data/stock';
import { today } from '@/lib/utils';

const REASONS: Record<MovementType, MovementReason[]> = {
  in: ['achat', 'retour', 'autre'],
  out: ['vente', 'consommation', 'casse', 'degustation', 'offert', 'autre'],
  transfer: ['transfert'],
  adjust: ['inventaire', 'casse', 'autre'],
};

export function MovementModal({
  onClose,
  initialType = 'in',
  initialWine,
  initialSiteId,
}: {
  onClose: () => void;
  initialType?: MovementType;
  initialWine?: Wine;
  initialSiteId?: string;
}) {
  const t = useT();
  const { toast } = useToast();
  const { user } = useAuth();
  const { orgId, sites, stock, partners, commit, activeSiteId } = useOrg();
  const [type, setType] = useState<MovementType>(initialType);
  const [wine, setWine] = useState<Wine | undefined>(initialWine);
  const [siteId, setSiteId] = useState(initialSiteId ?? (activeSiteId !== 'all' ? activeSiteId : sites[0]?.id ?? ''));
  const [toSiteId, setToSiteId] = useState(sites.find((s) => s.id !== siteId)?.id ?? '');
  const [qty, setQty] = useState<number | undefined>(1);
  const [reason, setReason] = useState<MovementReason>(REASONS[initialType][0]);
  const [date, setDate] = useState(today());
  const [cost, setCost] = useState<number | undefined>(initialWine?.buyPriceHT);
  const [partnerId, setPartnerId] = useState('');
  const [note, setNote] = useState('');
  const [bin, setBin] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (wine && siteId) {
      const existing = stock.find((s) => s.wineId === wine.id && s.siteId === siteId)?.bin ?? '';
      setBin(existing);
    }
  }, [wine, siteId, stock]);

  const available = wine ? qtyAt(stock, wine.id, siteId) : 0;
  const delta = type === 'adjust' ? qty ?? 0 : qty ?? 0;
  const insufficient = !!wine && (type === 'out' || type === 'transfer') && (qty ?? 0) > available;
  const resulting = type === 'in' ? available + (qty ?? 0) : type === 'adjust' ? available + delta : available - (qty ?? 0);
  const valid = !!wine && !!siteId && !!qty && qty !== 0 && (type === 'adjust' || qty > 0) && !insufficient && (type !== 'transfer' || (!!toSiteId && toSiteId !== siteId)) && resulting >= 0;
  const suppliers = useMemo(() => partners.filter((p) => !p.isArchived && (type === 'in' ? p.kind === 'supplier' : p.kind === 'client')), [partners, type]);

  const changeType = (v: MovementType) => {
    setType(v);
    setReason(REASONS[v][0]);
    if (v === 'adjust' && qty && qty > 0) setQty(qty);
  };

  const save = async (again: boolean) => {
    if (!wine || !user || !qty) return;
    setBusy(true);
    try {
      const ops = buildMovementOps(
        orgId,
        [{ wine, siteId, toSiteId: type === 'transfer' ? toSiteId : undefined, type, qty, reason, date, unitCostHT: type === 'in' ? cost : undefined, partnerId: partnerId || undefined, note: note || undefined }],
        { userId: user.uid, userName: user.name },
        Date.now(),
        stock,
      );
      if ((type === 'in' || type === 'adjust') && bin.trim()) {
        ops.push({
          op: 'set',
          path: `orgs/${orgId}/stock/${stockId(wine.id, siteId)}`,
          data: { bin: bin.trim() },
          merge: true,
        });
      }
      await commit(ops);
      toast(t('stock.saved'));
      if (again) {
        setWine(undefined);
        setQty(1);
        setNote('');
      } else onClose();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('stock.newMovement')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={() => save(true)} disabled={!valid} loading={busy}>
            {t('stock.saveAndNext')}
          </Button>
          <Button variant="primary" onClick={() => save(false)} disabled={!valid} loading={busy}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          value={type}
          onChange={changeType}
          className="w-full [&>button]:flex-1"
          options={(['in', 'out', 'transfer', 'adjust'] as MovementType[]).map((v) => ({ value: v, label: t(`stock.type.${v}`) }))}
        />
        <Field label={t('stock.wine')}>
          <WinePicker value={wine?.id} onChange={(w) => { setWine(w); if (type === 'in') setCost(w.buyPriceHT); }} siteId={siteId} placeholder={t('common.search')} autoFocus={!initialWine} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={type === 'transfer' ? t('stock.fromSite') : t('common.site')}>
            <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          {type === 'transfer' && (
            <Field label={t('stock.toSite')}>
              <Select value={toSiteId} onChange={(e) => setToSiteId(e.target.value)}>
                {sites
                  .filter((s) => s.id !== siteId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </Select>
            </Field>
          )}
          <Field label={type === 'adjust' ? t('stock.delta') : t('common.qty')} hint={wine ? t('stock.available', { n: available }) : undefined} error={insufficient ? t('stock.insufficient') : undefined}>
            <NumberInput value={qty} onChange={setQty} step="1" />
          </Field>
          {type !== 'transfer' && (
            <Field label={t('stock.reason')}>
              <Select value={reason} onChange={(e) => setReason(e.target.value as MovementReason)}>
                {REASONS[type].map((r) => (
                  <option key={r} value={r}>
                    {t(`reason.${r}`)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label={t('common.date')}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {type === 'in' && (
            <Field label={t('stock.unitCost')}>
              <NumberInput value={cost} onChange={setCost} step="0.01" min={0} />
            </Field>
          )}
          {(type === 'in' || type === 'adjust') && (
            <Field label={t('stock.bin')} hint="Emplacement ou clayette (ex: A1, ARM-1)">
              <Input value={bin} onChange={(e) => setBin(e.target.value)} placeholder="Ex: A1, C3-AV..." />
            </Field>
          )}
          {(type === 'in' || (type === 'out' && ['vente', 'offert'].includes(reason))) && (
            <Field label={type === 'in' ? t('stock.supplier') : t('stock.customer')}>
              <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                <option value="">—</option>
                {suppliers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <Field label={t('common.notes')}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
