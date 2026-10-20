import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, Check, Copy, FileText, Globe, GlobeLock, Mail, Printer, Save, Trash2, X } from 'lucide-react';
import type { Locale, Partner, Wine } from '@/types';
import { useOrg } from '@/app/org';
import type { Op } from '@/data/store';
import { qtyAt } from '@/data/stock';
import { useI18n } from '@/i18n';
import { eur, today } from '@/lib/utils';
import { wineLabel } from '@/lib/wine';
import { Button, Card, EmptyState, Field, Input, NumberInput, PageHeader, Segmented, Spinner, Textarea, cx, useToast } from '@/ui';
import { nextSeq } from '../ops';
import PartnerPicker from '../PartnerPicker';
import { intlOf, mailtoHref, msg } from '../reminders';
import WinePicker from '../WinePicker';
import { MAX_OFFER_ITEMS, effectiveStatus, formatOfferNumber, itemsFromWineIds, newOffer, offerCounterKey, offerPrice, publicOfferUrl, repriceItems, toPublicOffer } from './calc';
import OfferSheet, { OFFER_PRINT_CSS } from './OfferSheet';
import OfferStatusBadge from './OfferStatusBadge';
import { counterOp, publishOfferOps, saveOfferOps, unpublishOfferOps } from './ops';
import type { Offer, OfferItem, OfferStatus } from './types';
import { useOffers } from './useOffers';

export default function OfferEditor() {
  const { id = 'new' } = useParams();
  const [sp] = useSearchParams();
  const { t } = useI18n();
  const { org, member, partners, wines } = useOrg();
  const { offers, loading } = useOffers();
  const existing = id === 'new' ? undefined : offers.find((o) => o.id === id);
  const winesParam = sp.get('wines') ?? '';
  const clientParam = sp.get('client') ?? '';

  const initial = useMemo(() => {
    if (existing) return existing;
    const partner = partners.find((p) => p.id === clientParam && p.kind === 'client');
    const o = newOffer({ date: today(), lang: org.locale ?? 'fr', userId: member?.uid, partner });
    return { ...o, items: itemsFromWineIds(winesParam.split(',').filter(Boolean), wines, partner) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, id]);

  if (id !== 'new' && loading) return <Spinner className="mx-auto mt-20" />;
  if (id !== 'new' && !existing) return <EmptyState title={t('offer.notFound')} action={<Link to="/negoce/offres" className="text-brand underline">{t('common.back')}</Link>} />;
  return <OfferForm key={initial.id} initial={initial} isNew={!existing} />;
}

function OfferForm({ initial, isNew }: { initial: Offer; isNew: boolean }) {
  const { t, intl } = useI18n();
  const { org, orgId, partners, wines, stock, activeSiteId, commit, store, can, role } = useOrg();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [offer, setOffer] = useState<Offer>(initial);
  const [saved, setSaved] = useState(!isNew);
  const [dirty, setDirty] = useState(isNew && initial.items.length > 0);
  const [busy, setBusy] = useState(false);
  const [pane, setPane] = useState<'edit' | 'preview'>('edit');
  const showMargin = can('manager') || role === 'accountant';
  const asOf = today();
  const status = effectiveStatus(offer, asOf);
  const partner = partners.find((p) => p.id === offer.partnerId);
  const wineById = useMemo(() => new Map(wines.map((w) => [w.id, w])), [wines]);
  const preview = useMemo(() => toPublicOffer(offer, org, orgId, wines, offer.publicId ?? 'preview'), [offer, org, orgId, wines]);
  const url = offer.publicId ? publicOfferUrl(offer.publicId) : '';
  const lang: Locale = offer.language ?? org.locale ?? 'fr';

  const patch = (p: Partial<Offer>) => {
    setOffer((o) => ({ ...o, ...p }));
    setDirty(true);
  };
  const setItem = (i: number, p: Partial<OfferItem>) => patch({ items: offer.items.map((it, j) => (j === i ? { ...it, ...p } : it)) });
  const move = (i: number, d: -1 | 1) => {
    const items = [...offer.items];
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    patch({ items });
  };

  const pickPartner = (p: Partner) => patch({ partnerId: p.id, partnerName: p.name, items: repriceItems(offer.items, wines, partner, p) });
  const clearPartner = () => patch({ partnerId: undefined, partnerName: undefined, items: repriceItems(offer.items, wines, partner, undefined) });

  const addWine = (w: Wine) => {
    if (offer.items.some((i) => i.wineId === w.id)) {
      toast(t('offer.already'), 'info');
      return;
    }
    if (offer.items.length >= MAX_OFFER_ITEMS) {
      toast(t('offer.tooMany', { n: MAX_OFFER_ITEMS }), 'bad');
      return;
    }
    patch({ items: [...offer.items, { wineId: w.id, priceHT: offerPrice(w, partner) }] });
  };

  /** Enregistre (numérote au premier enregistrement) et renvoie l'offre à jour. */
  const persist = async (next: Offer = offer): Promise<Offer | null> => {
    setBusy(true);
    try {
      let o = next;
      if (!o.number) {
        const year = asOf.slice(0, 4);
        const seq = await store.getNextSequence(orgId, offerCounterKey(year));
        o = { ...o, number: formatOfferNumber(year, seq) };
      }
      const now = Date.now();
      await commit(saveOfferOps(orgId, o, org, wines, now));
      o = { ...o, updatedAt: now };
      setOffer(o);
      setDirty(false);
      if (!saved) {
        setSaved(true);
        navigate(`/negoce/offres/${o.id}`, { replace: true });
      }
      return o;
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error'), 'bad');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    if (await persist()) toast(t('common.saved'));
  };

  const setStatus = async (s: OfferStatus) => {
    const o = await persist({ ...offer, status: s });
    if (o) toast(t('offer.statusSet', { status: t(`offer.status.${s}`) }));
  };

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast(t('offer.copied'));
    } catch {
      toast(link, 'info');
    }
  };

  const publish = async () => {
    const o = dirty || !offer.number ? await persist() : offer;
    if (!o) return;
    setBusy(true);
    try {
      const r = publishOfferOps(orgId, o, org, wines);
      await commit(r.ops);
      setOffer(r.offer);
      const link = publicOfferUrl(r.offer.publicId!);
      toast(t('offer.published'), 'ok', { label: t('offer.copyLink'), onClick: () => copy(link) });
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error'), 'bad');
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async () => {
    setBusy(true);
    try {
      await commit(unpublishOfferOps(orgId, offer));
      setOffer((o) => ({ ...o, published: false }));
      toast(t('offer.unpublished'));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error'), 'bad');
    } finally {
      setBusy(false);
    }
  };

  const mail = useMemo(() => {
    if (!url) return '';
    const vars = {
      title: offer.title || msg(lang, 'offer.untitled'),
      org: org.name,
      url,
      date: new Date(`${offer.validUntil}T12:00:00`).toLocaleDateString(intlOf(lang), { day: 'numeric', month: 'long', year: 'numeric' }),
      hello: msg(lang, 'negoce.mail.hello', { name: partner?.contactName ? ` ${partner.contactName}` : '' }),
    };
    return mailtoHref(partner?.email, msg(lang, 'offer.mail.subject', vars), msg(lang, 'offer.mail.body', vars));
  }, [url, offer.title, offer.validUntil, lang, org.name, partner]);

  const blockers = [offer.title.trim() ? '' : 'offer.block.title', offer.items.length ? '' : 'offer.block.items'].filter(Boolean);
  const f = (n: number) => eur(n, org.currency, intl);
  const accepted = offer.status === 'accepted';

  const sheet = (
    <div className={cx('offer-print overflow-hidden rounded-xl border border-border shadow-sm', pane === 'edit' ? 'hidden xl:block' : 'block')}>
      <OfferSheet doc={preview} level={2} />
    </div>
  );

  return (
    <>
      <style>{OFFER_PRINT_CSS}</style>
      <div className="no-print">
        <PageHeader
          title={offer.title || t('offer.newTitle')}
          subtitle={[offer.number, offer.partnerName].filter(Boolean).join(' · ') || t('offer.subtitle')}
          actions={
            <>
              <Link to="/negoce/offres" className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm text-muted hover:bg-surface-2">
                <ArrowLeft className="size-4" />
                {t('common.back')}
              </Link>
              <OfferStatusBadge status={status} />
              <Button icon={<Printer className="size-4" />} onClick={() => window.print()} disabled={!offer.items.length}>
                {t('negoce.printPdf')}
              </Button>
              <Button variant="primary" icon={<Save className="size-4" />} loading={busy} disabled={!dirty && saved} onClick={onSave}>
                {t('common.save')}
              </Button>
            </>
          }
        />

        <Card className="mb-4 flex flex-wrap items-center gap-2 p-3" aria-label={t('offer.share')}>
          {offer.published && url ? (
            <>
              <Globe className="size-4 shrink-0 text-ok" aria-hidden />
              <a href={url} target="_blank" rel="noreferrer" className="min-w-0 max-w-full truncate text-sm text-brand underline" data-testid="offer-public-link">
                {url}
              </a>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button size="sm" icon={<Copy className="size-3.5" />} onClick={() => copy(url)}>
                  {t('offer.copyLink')}
                </Button>
                <a
                  href={mail}
                  data-testid="offer-mailto"
                  onClick={() => offer.status === 'draft' && setStatus('sent')}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[13px] font-medium hover:bg-surface-2"
                >
                  <Mail className="size-3.5" />
                  {t('offer.sendEmail')}
                </a>
                {dirty && (
                  <Button size="sm" icon={<Globe className="size-3.5" />} loading={busy} onClick={publish}>
                    {t('offer.republish')}
                  </Button>
                )}
                <Button size="sm" variant="ghost" icon={<GlobeLock className="size-3.5" />} onClick={unpublish}>
                  {t('offer.unpublish')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">{blockers.length ? `${t('offer.block.toPublish')} ${blockers.map((k) => t(k)).join(' · ')}` : t('offer.publishHint')}</p>
              <Button size="sm" className="ml-auto" variant="primary" icon={<Globe className="size-3.5" />} loading={busy} disabled={blockers.length > 0} onClick={publish}>
                {t('offer.publish')}
              </Button>
            </>
          )}
        </Card>

        {saved && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm" role="group" aria-label={t('common.status')}>
            <span className="text-muted">{t('offer.followUp')}</span>
            {offer.status === 'draft' && (
              <Button size="sm" onClick={() => setStatus('sent')}>
                {t('offer.markSent')}
              </Button>
            )}
            {!accepted && (
              <Button size="sm" icon={<Check className="size-3.5" />} onClick={() => setStatus('accepted')}>
                {t('offer.markAccepted')}
              </Button>
            )}
            {offer.status !== 'declined' && !accepted && (
              <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => setStatus('declined')}>
                {t('offer.markDeclined')}
              </Button>
            )}
            {accepted &&
              (offer.quoteId ? (
                <Link to={`/negoce/view/${offer.quoteId}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[13px] font-medium text-brand hover:bg-surface-2">
                  <FileText className="size-3.5" />
                  {t('offer.viewQuote')}
                </Link>
              ) : (
                <Button size="sm" variant="primary" icon={<FileText className="size-3.5" />} disabled={dirty} title={dirty ? t('offer.saveFirst') : undefined} onClick={() => navigate(`/negoce/edit/new?offer=${offer.id}`)}>
                  {t('offer.toQuote')}
                </Button>
              ))}
          </div>
        )}

        <Segmented<'edit' | 'preview'>
          className="mb-4 xl:hidden"
          value={pane}
          onChange={setPane}
          options={[
            { value: 'edit', label: t('offer.pane.edit') },
            { value: 'preview', label: t('negoce.preview') },
          ]}
        />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={cx('no-print min-w-0 space-y-4', pane === 'preview' && 'hidden xl:block')}>
          <Card className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label={t('offer.titleField')} className="sm:col-span-2">
              <Input value={offer.title} onChange={(e) => patch({ title: e.target.value })} placeholder={t('offer.titlePh')} maxLength={140} />
            </Field>
            <Field label={t('negoce.client')} className="sm:col-span-2" hint={partner?.discountPct ? t('offer.discountHint', { n: partner.discountPct }) : t('offer.clientHint')}>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <PartnerPicker value={offer.partnerId ?? ''} onChange={pickPartner} />
                </div>
                {offer.partnerId && (
                  <Button variant="ghost" aria-label={t('offer.clearClient')} icon={<X className="size-4" />} onClick={clearPartner} />
                )}
              </div>
            </Field>
            <Field label={t('negoce.validUntil')}>
              <Input type="date" value={offer.validUntil} onChange={(e) => patch({ validUntil: e.target.value })} />
            </Field>
            <Field label={t('offer.language')}>
              <Segmented<Locale>
                value={lang}
                onChange={(v) => patch({ language: v })}
                options={[
                  { value: 'fr', label: 'Français' },
                  { value: 'en', label: 'English' },
                ]}
              />
            </Field>
            <Field label={t('offer.intro')} className="sm:col-span-2">
              <Textarea rows={4} value={offer.intro} onChange={(e) => patch({ intro: e.target.value })} placeholder={t('offer.introPh')} maxLength={2000} />
            </Field>
          </Card>

          <section aria-labelledby="offer-wines" className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 id="offer-wines" className="font-display text-lg font-semibold">
                {t('offer.wines')} <span className="text-sm font-normal text-muted">({offer.items.length})</span>
              </h2>
            </div>
            <WinePicker siteId={activeSiteId} onPick={addWine} />
            {offer.items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">{t('offer.noWines')}</p>
            ) : (
              <ul className="space-y-2">
                {offer.items.map((it, i) => {
                  const w = wineById.get(it.wineId);
                  const base = w ? offerPrice(w, partner) : 0;
                  const qty = w ? qtyAt(stock, w.id, activeSiteId) : 0;
                  const marginHT = w?.buyPriceHT !== undefined ? it.priceHT - w.buyPriceHT : undefined;
                  return (
                    <li key={it.wineId} className="rounded-xl border border-border bg-surface p-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{w ? wineLabel(w) : t('offer.unknownWine')}</div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                            {w && <span>{t('offer.listPrice', { price: f(w.sellPriceHT ?? 0) })}</span>}
                            <span className={qty <= 0 ? 'text-bad' : undefined}>{t('negoce.stockAvail', { n: qty })}</span>
                            {showMargin && marginHT !== undefined && (
                              <span className={marginHT < 0 ? 'text-bad' : 'text-ok'}>
                                {t('negoce.margin')} {f(marginHT)}
                                {it.priceHT > 0 && ` · ${((marginHT / it.priceHT) * 100).toLocaleString(intl, { maximumFractionDigits: 1 })} %`}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0">
                          <button type="button" aria-label={t('offer.moveUp')} disabled={i === 0} onClick={() => move(i, -1)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 disabled:opacity-30">
                            <ArrowUp className="size-4" />
                          </button>
                          <button type="button" aria-label={t('offer.moveDown')} disabled={i === offer.items.length - 1} onClick={() => move(i, 1)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 disabled:opacity-30">
                            <ArrowDown className="size-4" />
                          </button>
                          <button type="button" aria-label={t('common.delete')} onClick={() => patch({ items: offer.items.filter((_, j) => j !== i) })} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-bad">
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[8rem_7rem_minmax(0,1fr)]">
                        <Field label={t('offer.priceHT')} hint={Math.abs(base - it.priceHT) > 0.004 ? t('offer.defaultPrice', { price: f(base) }) : undefined}>
                          <NumberInput min={0} step="any" value={it.priceHT} onChange={(v) => setItem(i, { priceHT: v ?? 0 })} />
                        </Field>
                        <Field label={t('offer.minQty')}>
                          <NumberInput min={1} step={1} value={it.minQty} onChange={(v) => setItem(i, { minQty: v && v > 1 ? Math.round(v) : undefined })} placeholder="1" />
                        </Field>
                        <Field label={t('offer.note')} className="col-span-2 sm:col-span-1">
                          <Input value={it.note ?? ''} onChange={(e) => setItem(i, { note: e.target.value })} placeholder={t('offer.notePh')} maxLength={240} />
                        </Field>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
        <div className="min-w-0 xl:sticky xl:top-4">{sheet}</div>
      </div>
    </>
  );
}
