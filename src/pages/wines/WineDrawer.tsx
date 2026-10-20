import { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Archive, ArchiveRestore, Pencil, Grape, MapPin, Utensils } from 'lucide-react';
import type { Movement, Wine } from '@/types';
import { useCollection, useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Badge, Button, Modal, Tabs, useToast } from '@/ui';
import { formatLabel } from '@/lib/wine';
import { dateFr, eur, pct } from '@/lib/utils';
import { MovementModal } from '../stock/MovementModal';
import { WineFormModal } from './WineForm';
import { TechSheetModal } from '@/modules/carte/TechSheetModal';
import { WinePhoto } from '@/components/WinePhoto';

function Row({ k, v }: { k: string; v?: string | number | null }) {
  if (v === undefined || v === null || v === '') return null;
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 py-1.5 text-sm">
      <span className="text-muted">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}

export function WineDrawer({ wine, onClose }: { wine: Wine; onClose: () => void }) {
  const { t, intl } = useI18n();
  const { toast, confirm } = useToast();
  const { stock, sites, commit, path, can } = useOrg();
  const { rows: movements } = useCollection<Movement>('movements', { orderBy: ['createdAt', 'desc'], limit: 500 });
  const [edit, setEdit] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [tab, setTab] = useState<'wine' | 'management'>('wine');
  const [move, setMove] = useState<'in' | 'out' | null>(null);

  const levels = useMemo(() => stock.filter((l) => l.wineId === wine.id), [stock, wine.id]);
  const total = levels.reduce((a, l) => a + l.qty, 0);
  const history = useMemo(() => movements.filter((m) => m.wineId === wine.id).slice(0, 8), [movements, wine.id]);
  const margin = wine.buyPriceHT && wine.sellPriceHT ? ((wine.sellPriceHT - wine.buyPriceHT) / wine.sellPriceHT) * 100 : undefined;
  const ts = wine.technicalSheet;

  const toggleArchive = async () => {
    if (!wine.isArchived && total > 0) {
      const ok = await confirm({ title: t('wines.archiveTitle'), message: t('wines.archiveWithStock', { n: total }), confirmLabel: t('common.archive') });
      if (!ok) return;
    }
    await commit([{ op: 'set', path: path('wines', wine.id), data: { isArchived: !wine.isArchived, updatedAt: Date.now() }, merge: true }]);
    toast(t('common.saved'));
    if (!wine.isArchived) onClose();
  };

  return (
    <>
      <Modal
        open
        side
        size="lg"
        onClose={onClose}
        title={
          <div>
            <div className="text-xs font-sans font-normal text-muted">{wine.producer}</div>
            <div>{wine.name}</div>
          </div>
        }
        footer={
          can('manager') ? (
            <>
              <Button size="sm" icon={wine.isArchived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />} onClick={toggleArchive}>
                {wine.isArchived ? t('common.restore') : t('common.archive')}
              </Button>
              <Button size="sm" icon={<Pencil className="size-4" />} onClick={() => setEdit(true)}>
                {t('common.edit')}
              </Button>
            </>
          ) : undefined
        }
      >
        <div className="space-y-5">
          <div className="relative grid gap-2 rounded-xl border border-border bg-surface-2/50 p-2 sm:has-[>figure]:grid-cols-[minmax(0,12.5rem)_minmax(0,1fr)]">
            <WinePhoto wine={wine} className="mx-auto w-full max-w-xs sm:max-w-none" />
            <div className="flex flex-col justify-center rounded-lg border border-accent/50 px-6 py-9 text-center sm:px-8">
              <p className="text-[10px] uppercase tracking-[0.32em] text-muted">{[wine.country, wine.region, wine.subRegion].filter(Boolean).join(' · ') || t('discover.unknown')}</p>
              <p className="mt-6 font-display text-xl italic text-brand">{wine.producer}</p>
              <h2 className="mx-auto mt-2 max-w-md font-display text-4xl leading-tight sm:text-[2.6rem]">{wine.name}</h2>
              <div className="mx-auto mt-5 flex w-28 items-center gap-2" aria-hidden>
                <span className="h-px flex-1 bg-accent/60" />
                <span className="size-1.5 rotate-45 bg-accent" />
                <span className="h-px flex-1 bg-accent/60" />
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-xs uppercase tracking-[0.16em] text-muted">
                <span className="tabular font-display text-3xl normal-case tracking-normal text-ink">{wine.vintage}</span>
                <span>{t(`color.${wine.color}`)}</span>
                <span>{formatLabel(wine.formatCl)}</span>
                {wine.isArchived && <Badge tone="bad">{t('wines.archived')}</Badge>}
              </div>
            </div>
          </div>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'wine', label: t('discover.identity') }, { value: 'management', label: t('discover.management') }]} />
          {tab === 'wine' ? <div className="space-y-7">
            <section>
              <h3 className="mb-4 flex items-center gap-2 font-display text-xl"><MapPin className="size-4 text-brand" />{t('discover.terroirTitle')}</h3>
              <Row k="Appellation" v={wine.appellation || ts?.aop} />
              <Row k={t('carte.tech.lieuDit')} v={ts?.lieuDit} />
              <Row k={t('wines.grapes')} v={wine.grapes || ts?.cepage} />
              <Row k={t('carte.tech.sol')} v={ts?.sol} />
              <Row k={t('carte.tech.ageVignes')} v={ts?.ageVignes} />
            </section>
            {ts?.generatedByAI && <p className="rounded-xl bg-warn/10 p-3 text-xs text-warn">{t('ai.disclaimer')}</p>}
            {(ts?.oeil || ts?.nez || ts?.bouche) && <section className="rounded-2xl border border-border bg-surface-2/40 p-5">
              <h3 className="mb-4 flex items-center gap-2 font-display text-xl"><Grape className="size-4 text-brand" />{t('discover.tasting')}</h3>
              {[['oeil', ts.oeil], ['nez', ts.nez], ['bouche', ts.bouche]].map(([key, text]) => text && <div key={key} className="mt-4"><h4 className="text-[10px] uppercase tracking-[0.18em] text-muted">{t(`carte.tech.${key}`)}</h4><p className="mt-1 text-sm leading-relaxed">{text}</p></div>)}
            </section>}
            {ts?.accords && <section><h3 className="mb-3 flex items-center gap-2 font-display text-xl"><Utensils className="size-4 text-brand" />{t('discover.pairings')}</h3><p className="border-l-2 border-brand/30 pl-4 font-display text-lg italic leading-relaxed">{ts.accords}</p></section>}
            <section>
              <h3 className="mb-3 font-display text-xl">{t('discover.service')}</h3>
              <Row k={t('wines.tech.service')} v={ts?.temperatureService} />
              <Row k={t('carte.tech.garde')} v={ts?.garde} />
              <Row k={t('wines.apogee')} v={wine.apogeeFrom && wine.apogeeTo ? `${wine.apogeeFrom} – ${wine.apogeeTo}` : undefined} />
              <Row k={t('carte.tech.vinification')} v={ts?.vinification} />
              <Row k={t('carte.tech.elevage')} v={ts?.elevage} />
            </section>
            {wine.notes && <p className="text-sm leading-relaxed text-muted">{wine.notes}</p>}
            {!Object.values(ts ?? {}).some((v) => typeof v === 'string' && v.trim()) && <p className="text-sm leading-relaxed text-muted">{t('discover.emptySheet')}</p>}
            {can('manager') && <Button onClick={() => setSheet(true)} icon={<Pencil className="size-4" />}>{t('discover.editSheet')}</Button>}
            <div className="flex items-center justify-between gap-4 border-t border-border pt-5">
              <div><p className="text-[10px] uppercase tracking-[0.18em] text-muted">{t('discover.cellar')}</p><p className="mt-1"><span className="font-display text-3xl">{total}</span> <span className="text-xs text-muted">{t('discover.bottles')}</span></p></div>
              {wine.menuPriceTTC !== undefined && <div className="text-right"><p className="text-xs text-muted">{t('wines.menuPrice')}</p><p className="mt-1 font-display text-2xl">{eur(wine.menuPriceTTC, 'EUR', intl)}</p></div>}
            </div>
          </div> : <>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="tabular font-display text-2xl font-semibold">{total}</div>
              <div className="text-xs text-muted">{t('common.bottles')}</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="tabular font-display text-2xl font-semibold">{eur(wine.sellPriceHT, 'EUR', intl)}</div>
              <div className="text-xs text-muted">{t('wines.sellPrice')}</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="tabular font-display text-2xl font-semibold">{margin !== undefined ? pct(margin, 0) : '—'}</div>
              <div className="text-xs text-muted">{t('wines.margin')}</div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" icon={<ArrowDownToLine className="size-4" />} onClick={() => setMove('in')}>
              {t('stock.type.in')}
            </Button>
            <Button className="flex-1" icon={<ArrowUpFromLine className="size-4" />} onClick={() => setMove('out')} disabled={total <= 0}>
              {t('stock.type.out')}
            </Button>
          </div>

          <section>
            <h3 className="mb-1 text-sm font-semibold">{t('wines.stockBySite')}</h3>
            {sites.map((s) => {
              const l = levels.find((x) => x.siteId === s.id);
              return <Row key={s.id} k={s.name} v={`${l?.qty ?? 0}${l?.bin ? ` · ${l.bin}` : ''}`} />;
            })}
          </section>

          <section>
            <h3 className="mb-1 text-sm font-semibold">{t('wines.details')}</h3>
            <Row k={t('wines.grapes')} v={wine.grapes} />
            <Row k={t('wines.country')} v={wine.country} />
            <Row k={t('wines.buyPrice')} v={wine.buyPriceHT ? eur(wine.buyPriceHT, 'EUR', intl) : undefined} />
            <Row k={t('wines.menuPrice')} v={wine.menuPriceTTC ? eur(wine.menuPriceTTC, 'EUR', intl) : undefined} />
            <Row k={t('wines.alertThreshold')} v={wine.alertThreshold} />
            <Row k={t('wines.apogee')} v={wine.apogeeFrom && wine.apogeeTo ? `${wine.apogeeFrom} – ${wine.apogeeTo}` : undefined} />
            <Row k={t('wines.ean')} v={wine.ean} />
            {wine.notes && <p className="mt-2 text-sm text-muted">{wine.notes}</p>}
          </section>

          {ts && (ts.nez || ts.bouche || ts.accords || ts.cepage) && (
            <section>
              <h3 className="mb-1 text-sm font-semibold">
                {t('wines.techSheet')} {ts.generatedByAI && <Badge tone="info">IA</Badge>}
              </h3>
              <Row k="AOP" v={ts.aop} />
              <Row k={t('wines.grapes')} v={ts.cepage} />
              <Row k={t('wines.tech.eye')} v={ts.oeil} />
              <Row k={t('wines.tech.nose')} v={ts.nez} />
              <Row k={t('wines.tech.palate')} v={ts.bouche} />
              <Row k={t('wines.tech.service')} v={ts.temperatureService} />
              <Row k={t('wines.tech.pairings')} v={ts.accords} />
            </section>
          )}

          <section>
            <h3 className="mb-1 text-sm font-semibold">{t('wines.history')}</h3>
            {history.length === 0 && <p className="text-sm text-muted">—</p>}
            {history.map((m) => (
              <div key={m.id} className="flex items-center justify-between border-b border-border/50 py-1.5 text-sm">
                <span className="text-muted">{dateFr(m.date, intl)}</span>
                <span>{t(`reason.${m.reason}`)}</span>
                <span className="tabular font-semibold">{m.type === 'out' ? `−${m.qty}` : m.qty > 0 ? `+${m.qty}` : m.qty}</span>
              </div>
            ))}
          </section>
          </>}
        </div>
      </Modal>
      {edit && <WineFormModal wine={wine} onClose={() => setEdit(false)} />}
      {sheet && <TechSheetModal wine={wine} onClose={() => setSheet(false)} />}
      {move && <MovementModal initialType={move} initialWine={wine} onClose={() => setMove(null)} />}
    </>
  );
}
