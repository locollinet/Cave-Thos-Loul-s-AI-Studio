import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, Info, Save, TriangleAlert, Truck } from 'lucide-react';
import type { Partner, Wine } from '@/types';
import { useOrg } from '@/app/org';
import type { Op } from '@/data/store';
import { qtyAt } from '@/data/stock';
import { useI18n } from '@/i18n';
import { today } from '@/lib/utils';
import { wineLabel } from '@/lib/wine';
import { Button, Card, EmptyState, Field, Input, Modal, NumberInput, PageHeader, Select, Spinner, Textarea, useToast } from '@/ui';
import {
  computeTotals,
  counterKey,
  docMargin,
  dueDateFor,
  formatNumber,
  lineMargin,
  newDocument,
  newLine,
  partnerSnapshot,
  priceForPartner,
  prefixFor,
  saveBlockers,
  stockShortages,
  withTotals,
} from './calc';
import DocumentSheet from './DocumentSheet';
import { offerPath } from './offers/ops';
import { offerToQuote } from './offers/calc';
import type { Offer } from './offers/types';
import { useOffers } from './offers/useOffers';
import { nextSeq, saveDocumentOps } from './ops';
import type { DocLine, DocType, SaleDocument } from './types';
import { isLocked, useDocActions } from './useDocActions';
import { useSales } from './useSales';
import LinesEditor, { type LineInsight } from './LinesEditor';
import MarginBox from './MarginBox';
import PartnerPicker from './PartnerPicker';
import TotalsBox from './TotalsBox';
import WinePicker from './WinePicker';

const TYPES: DocType[] = ['quote', 'invoice', 'credit_note'];

export default function DocumentEditor() {
  const { id = 'new' } = useParams();
  const [sp] = useSearchParams();
  const offerId = id === 'new' ? sp.get('offer') : null;
  const { t } = useI18n();
  const { docs, loading } = useSales();
  const { offers, loading: offersLoading } = useOffers();
  const existing = id === 'new' ? undefined : docs.find((d) => d.id === id);

  if (id !== 'new' && loading) return <Spinner className="mx-auto mt-20" />;
  if (offerId && offersLoading) return <Spinner className="mx-auto mt-20" />;
  if (id !== 'new' && !existing) return <EmptyState title={t('negoce.notFound')} />;
  if (existing && isLocked(existing)) return <Navigate to={`/negoce/view/${existing.id}`} replace />;
  return <EditorInit existing={existing} offer={offerId ? offers.find((o) => o.id === offerId) : undefined} type={sp.get('type') ?? ''} clientId={sp.get('client') ?? ''} />;
}

function EditorInit({ existing, offer, type: rawType, clientId }: { existing?: SaleDocument; offer?: Offer; type: string; clientId: string }) {
  const { sites, activeSiteId, org, member, partners, wines } = useOrg();
  const initial = useMemo(() => {
    if (existing) return existing;
    const siteId = activeSiteId !== 'all' ? activeSiteId : (sites[0]?.id ?? '');
    const base = { siteId, vatRate: org.defaultVatRate, userId: member?.uid ?? '', date: today() };
    if (offer) return offerToQuote(offer, partners.find((p) => p.id === offer.partnerId), wines, base);
    const type: DocType = (TYPES as string[]).includes(rawType) ? (rawType as DocType) : 'quote';
    const doc = newDocument(type, base);
    const client = partners.find((p) => p.id === clientId && p.kind === 'client');
    if (!client) return doc;
    const snap = partnerSnapshot(client);
    return { ...doc, ...snap, dueDate: dueDateFor(doc.date, snap.paymentTermsDays) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, offer?.id]);
  return <EditorForm key={initial.id} initial={initial} isNew={!existing} />;
}

const useMedia = (query: string): boolean => {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
};

function EditorForm({ initial, isNew }: { initial: SaleDocument; isNew: boolean }) {
  const { t } = useI18n();
  const { org, orgId, sites, partners, stock, wines, commit, store, can, role } = useOrg();
  const showMargin = can('manager') || role === 'accountant';
  const wide = useMedia('(min-width: 1280px)');
  const [preview, setPreview] = useState(false);
  const { consignments, docs } = useSales();
  const { validate } = useDocActions();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<SaleDocument>(initial);
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => computeTotals(doc.lines, doc.shippingHT, doc.shippingVatRate, doc.discountPct), [doc.lines, doc.shippingHT, doc.shippingVatRate, doc.discountPct]);
  const partner = partners.find((p) => p.id === doc.partnerId);
  const shortages = useMemo(() => (doc.type === 'credit_note' ? [] : stockShortages(doc.lines, stock, doc.siteId)), [doc.lines, doc.type, stock, doc.siteId]);
  const shortIds = useMemo(() => new Set(shortages.map((s) => s.wineId)), [shortages]);
  const insights = useMemo<(LineInsight | undefined)[]>(
    () =>
      doc.lines.map((l, i) => {
        const w = l.wineId ? wines.find((x) => x.id === l.wineId) : undefined;
        if (!w || l.isService) return undefined;
        return { stock: qtyAt(stock, w.id, doc.siteId), buyPriceHT: w.buyPriceHT, margin: lineMargin(l, totals.lineNets[i] ?? 0, w.buyPriceHT) };
      }),
    [doc.lines, doc.siteId, wines, stock, totals.lineNets],
  );
  const margin = useMemo(() => docMargin(doc.lines, totals.lineNets, wines), [doc.lines, totals.lineNets, wines]);
  const usedConsignments = new Set(doc.lines.map((l) => l.fromConsignment).filter(Boolean));
  const openConsignments = consignments.filter((c) => c.partnerId === doc.partnerId && c.qty > 0 && !usedConsignments.has(c.id));

  const patch = (p: Partial<SaleDocument>) => setDoc((d) => ({ ...d, ...p }));
  const setLines = (lines: DocLine[]) => patch({ lines });

  const pickPartner = (p: Partner) => {
    const snap = partnerSnapshot(p);
    setDoc((d) => ({ ...d, ...snap, dueDate: dueDateFor(d.date, snap.paymentTermsDays) }));
  };

  const addWine = (w: Wine) => {
    const price = priceForPartner(w, partner);
    setLines([...doc.lines, { ...newLine(org.defaultVatRate), wineId: w.id, description: wineLabel(w), ...price }]);
  };

  const addService = (description: string) => setLines([...doc.lines, { ...newLine(org.defaultVatRate), description, isService: true }]);

  const addConsignment = (cid: string) => {
    const c = consignments.find((x) => x.id === cid);
    const w = wines.find((x) => x.id === c?.wineId);
    if (!c || !w) return;
    setLines([...doc.lines, { ...newLine(org.defaultVatRate), wineId: w.id, description: wineLabel(w), qty: c.qty, unitPriceHT: c.priceHT, fromConsignment: c.id }]);
  };

  const save = async (): Promise<SaleDocument | null> => {
    setSaving(true);
    try {
      let d = withTotals(doc);
      const ops: Op[] = [];
      if (d.type === 'quote' && !d.number) {
        const prefix = prefixFor('quote', org);
        const key = counterKey(prefix, d.date.slice(0, 4));
        const seq = await store.getNextSequence(orgId, key);
        d = { ...d, number: formatNumber(prefix, d.date.slice(0, 4), seq) };
      }
      if (isNew && d.offerId) ops.push({ op: 'set', path: offerPath(orgId, d.offerId), data: { quoteId: d.id, updatedAt: Date.now() }, merge: true });
      await commit([...ops, ...saveDocumentOps(orgId, d)]);
      setDoc(d);
      toast(t('common.saved'));
      return d;
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error'), 'bad');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const onSave = async () => {
    const d = await save();
    if (d && isNew) navigate(`/negoce/edit/${d.id}`, { replace: true });
  };

  const onValidate = async () => {
    setSaving(true);
    await validate(withTotals(doc));
    setSaving(false);
  };

  const isQuote = doc.type === 'quote';
  const draftBlockers = saveBlockers(doc, false);
  const validateBlockers = saveBlockers(doc, true);
  const canSave = validateBlockers.length === 0;
  const hints = isQuote ? draftBlockers : validateBlockers;
  const sheet = <DocumentSheet doc={withTotals(doc)} org={org} relatedNumber={docs.find((d) => d.id === doc.relatedDocumentId)?.number} level={2} />;

  return (
    <>
      <PageHeader
        title={t(`negoce.doc.${doc.type}`) + (doc.number ? ` ${doc.number}` : ` — ${t('negoce.status.draft')}`)}
        actions={
          <>
            <Button onClick={() => navigate('/negoce')}>{t('common.cancel')}</Button>
            <Button
              icon={preview ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              aria-pressed={preview}
              onClick={() => setPreview((v) => !v)}
            >
              {t('negoce.preview')}
            </Button>
            <Button
              variant={isQuote ? 'primary' : 'secondary'}
              icon={<Save className="size-4" />}
              loading={saving}
              disabled={draftBlockers.length > 0}
              aria-describedby={hints.length ? 'save-hints' : undefined}
              onClick={onSave}
            >
              {t(isQuote ? 'negoce.saveQuote' : 'negoce.saveDraft')}
            </Button>
            {!isQuote && (
              <Button
                variant="primary"
                icon={<CheckCircle2 className="size-4" />}
                loading={saving}
                disabled={!canSave}
                aria-describedby={hints.length ? 'save-hints' : undefined}
                onClick={onValidate}
              >
                {t('negoce.validate')}
              </Button>
            )}
          </>
        }
      />

      {hints.length > 0 && (
        <div id="save-hints" role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-border bg-surface-2/60 px-4 py-2.5 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          <div>
            <span className="font-medium">{t(isQuote ? 'negoce.block.toSave' : 'negoce.block.toValidate')}</span>{' '}
            {hints.map((k) => t(k)).join(' · ')}
          </div>
        </div>
      )}
      {doc.offerId && !doc.number && <p className="mb-3 text-sm text-muted">{t('negoce.fromOffer')}</p>}
      {doc.relatedDocumentId && <p className="mb-3 text-sm text-muted">{t('negoce.relatedTo', { number: docs.find((d) => d.id === doc.relatedDocumentId)?.number || '—' })}</p>}

      <div className={preview && wide ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-6' : ''}>
      <div className="min-w-0">
      <div className={preview && wide ? 'grid gap-4' : 'grid gap-4 lg:grid-cols-3'}>
        <Card className={preview && wide ? 'space-y-3 p-4' : 'space-y-3 p-4 lg:col-span-2'}>
          <Field label={t('negoce.client')}>
            <PartnerPicker value={doc.partnerId} onChange={pickPartner} />
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label={t('common.site')} className="col-span-2 sm:col-span-1" hint={t('negoce.siteHint')}>
              <Select value={doc.siteId} onChange={(e) => patch({ siteId: e.target.value })}>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('common.date')}>
              <Input type="date" value={doc.date} onChange={(e) => patch({ date: e.target.value, dueDate: dueDateFor(e.target.value, doc.paymentTermsDays) })} />
            </Field>
            <Field label={t('negoce.paymentTerms')}>
              <NumberInput min={0} value={doc.paymentTermsDays} onChange={(v) => patch({ paymentTermsDays: v ?? 0, dueDate: dueDateFor(doc.date, v ?? 0) })} />
            </Field>
            {isQuote ? (
              <Field label={t('negoce.validUntil')}>
                <Input type="date" value={doc.validUntil ?? ''} onChange={(e) => patch({ validUntil: e.target.value })} />
              </Field>
            ) : (
              <Field label={t('negoce.dueDate')}>
                <Input type="date" value={doc.dueDate} onChange={(e) => patch({ dueDate: e.target.value })} />
              </Field>
            )}
          </div>
        </Card>
        <Card className="p-4">
          <div className="space-y-3">
            <Field label={t('negoce.shippingHT')}>
              <NumberInput min={0} step="any" value={doc.shippingHT} onChange={(v) => patch({ shippingHT: v ?? 0 })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('negoce.shippingVat')}>
                <NumberInput min={0} step="any" value={doc.shippingVatRate} onChange={(v) => patch({ shippingVatRate: v ?? 0 })} />
              </Field>
              <Field label={t('negoce.globalDiscount')}>
                <NumberInput min={0} max={100} step="any" value={doc.discountPct} onChange={(v) => patch({ discountPct: v ?? 0 })} />
              </Field>
            </div>
          </div>
        </Card>
      </div>

      {shortages.length > 0 && (
        <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            <div className="font-medium">{t('negoce.shortageAlert')}</div>
            <ul className="mt-1 text-xs">
              {shortages.map((s) => {
                const w = wines.find((x) => x.id === s.wineId);
                return (
                  <li key={s.wineId}>
                    {w ? wineLabel(w) : s.wineId} — {t('negoce.shortageLine', { requested: s.requested, available: s.available })}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <section className="mt-5 space-y-3" aria-label={t('negoce.lines')}>
        <h2 className="font-display text-lg font-semibold">{t('negoce.lines')}</h2>
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-60 flex-1">
            <WinePicker siteId={doc.siteId} onPick={addWine} />
          </div>
          <Button icon={<Truck className="size-4" />} onClick={() => addService(t('negoce.transport'))}>
            {t('negoce.addTransport')}
          </Button>
          <Button onClick={() => addService('')}>{t('negoce.addService')}</Button>
          {openConsignments.length > 0 && (
            <Select aria-label={t('negoce.fromConsignmentPick')} value="" onChange={(e) => addConsignment(e.target.value)} className="w-auto">
              <option value="">{t('negoce.fromConsignmentPick')}</option>
              {openConsignments.map((c) => {
                const w = wines.find((x) => x.id === c.wineId);
                return (
                  <option key={c.id} value={c.id}>
                    {w ? wineLabel(w) : c.wineId} × {c.qty}
                  </option>
                );
              })}
            </Select>
          )}
        </div>
        <LinesEditor lines={doc.lines} nets={totals.lineNets} shortWineIds={shortIds} onChange={setLines} insights={insights} showMargin={showMargin} />
      </section>

      <div className={preview && wide ? 'mt-5 grid gap-4' : 'mt-5 grid gap-4 md:grid-cols-2'}>
        <Field label={t('common.notes')}>
          <Textarea value={doc.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder={t('negoce.notesHint')} />
        </Field>
        <Card className="space-y-4 p-4">
          <TotalsBox totals={totals} />
          {showMargin && doc.type !== 'credit_note' && <MarginBox margin={margin} />}
        </Card>
      </div>
      </div>
      {preview && wide && (
        <aside aria-label={t('negoce.preview')} className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border border-border bg-surface-2/40 p-3">
          <div className="[zoom:0.78]">{sheet}</div>
        </aside>
      )}
      </div>
      <Modal open={preview && !wide} onClose={() => setPreview(false)} title={t('negoce.preview')} size="xl">
        {sheet}
      </Modal>
    </>
  );
}
