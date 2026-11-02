import { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Archive, ArchiveRestore, Pencil, Grape, MapPin, Plus, ShieldCheck, Sparkles, Utensils } from 'lucide-react';
import type { Movement, RareBottle, Wine } from '@/types';
import { useCollection, useOrg } from '@/app/org';
import { useAuth } from '@/app/auth';
import { useI18n } from '@/i18n';
import { Badge, Button, Modal, Tabs, cx, useToast } from '@/ui';
import { formatLabel } from '@/lib/wine';
import { dateFr, eur, pct } from '@/lib/utils';
import { MovementModal } from '../stock/MovementModal';
import { QuickBinModal } from '../stock/QuickBinPopover';
import { WineFormModal } from './WineForm';
import { TechSheetModal } from '@/modules/carte/TechSheetModal';
import { WinePhoto } from '@/components/WinePhoto';
import { RareBottleModal } from '@/components/bottles/RareBottleModal';
import { buildMovementOps } from '@/data/stock';
import type { Site } from '@/types';

function Row({ k, v }: { k: string; v?: React.ReactNode }) {
  if (v === undefined || v === null || v === '') return null;
  return (
    <div className="flex justify-between items-center gap-4 border-b border-border/50 py-1.5 text-sm">
      <span className="text-muted">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}

export function WineDrawer({ wine: wineProp, wineId, onClose }: { wine?: Wine; wineId?: string; onClose: () => void }) {
  const { t, intl } = useI18n();
  const { toast, confirm } = useToast();
  const { user } = useAuth();
  const { wines, stock, sites, commit, path, can, orgId, canSeeCosts } = useOrg();
  const wine = wineProp ?? wines.find((w) => w.id === wineId);
  const { rows: movements } = useCollection<Movement>('movements', { orderBy: ['createdAt', 'desc'], limit: 500 });
  const { rows: allBottles } = useCollection<RareBottle>('bottles');
  const [edit, setEdit] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [addBottle, setAddBottle] = useState(false);
  const [tab, setTab] = useState<'wine' | 'management' | 'bottles'>(wine?.isExceptional ? 'bottles' : 'wine');
  const [move, setMove] = useState<'in' | 'out' | null>(null);
  const [quickBinSite, setQuickBinSite] = useState<Site | null>(null);

  if (!wine) return null;

  const levels = useMemo(() => stock.filter((l) => l.wineId === wine.id), [stock, wine.id]);
  const bottles = useMemo(() => allBottles.filter((b) => b.wineId === wine.id), [allBottles, wine.id]);
  const total = levels.reduce((a, l) => a + l.qty, 0);
  const history = useMemo(() => movements.filter((m) => m.wineId === wine.id).slice(0, 8), [movements, wine.id]);
  const margin = wine.buyPriceHT && wine.sellPriceHT ? ((wine.sellPriceHT - wine.buyPriceHT) / wine.sellPriceHT) * 100 : undefined;
  const ts = wine.technicalSheet;

  const serveBottle = async (bottle: RareBottle) => {
    if (!user) return;
    const ok = await confirm({
      title: 'Servir ce flacon',
      message: `Confirmer le service du flacon n°${bottle.bottleNumber} ? La bouteille sera marquée comme servie et déstockée.`,
      confirmLabel: 'Confirmer le service',
    });
    if (!ok) return;

    const todayDate = new Date().toISOString().slice(0, 10);
    const movOps = buildMovementOps(
      orgId,
      [
        {
          wine,
          siteId: bottle.siteId,
          type: 'out',
          qty: 1,
          reason: 'vente',
          date: todayDate,
          note: `Flacon d'exception n°${bottle.bottleNumber}`,
        },
      ],
      { userId: user.uid, userName: user.name },
      Date.now(),
      stock,
    );

    const bottleOp = {
      op: 'set' as const,
      path: path('bottles', bottle.id),
      data: {
        ...bottle,
        status: 'served',
        servedAt: Date.now(),
        servedBy: user.name,
      },
    };

    try {
      await commit([...movOps, bottleOp]);
      toast(`Flacon n°${bottle.bottleNumber} servi avec succès`);
    } catch {
      toast('Erreur lors du déstockage du flacon', 'bad');
    }
  };

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
          <Tabs<'wine' | 'management' | 'bottles'>
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'wine', label: t('discover.identity') },
              { value: 'management', label: t('discover.management') },
              ...(wine.isExceptional || bottles.length > 0
                ? [{ value: 'bottles' as const, label: 'Flacons d\'exception', count: bottles.length }]
                : []),
            ]}
          />
          {tab === 'bottles' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm flex items-center gap-1.5 text-amber-500">
                    <Sparkles className="size-4" />
                    Traçabilité des flacons numérotés
                  </h3>
                  <p className="text-xs text-muted">Bouteilles suivies individuellement avec état de conservation</p>
                </div>
                <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setAddBottle(true)}>
                  Nouveau flacon
                </Button>
              </div>

              {bottles.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted">
                  <ShieldCheck className="mx-auto size-8 text-amber-500/60 mb-2" />
                  <p className="text-sm font-medium text-ink">Aucun flacon individuel enregistré</p>
                  <p className="text-xs mt-1">Enregistrez chaque bouteille avec son numéro unique et son niveau de liquide.</p>
                  <Button size="sm" className="mt-4" icon={<Plus className="size-4" />} onClick={() => setAddBottle(true)}>
                    Enregistrer une bouteille
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {bottles.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-xl border border-amber-900/30 bg-surface-2/40 p-4 shadow-sm space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-600/30">
                            N° {b.bottleNumber}
                          </span>
                          {b.cbo && <Badge tone="brand">CBO Scellée</Badge>}
                          {b.bin && <Badge tone="info">Alvéole {b.bin}</Badge>}
                        </div>
                        <Badge tone={b.status === 'in_cellar' ? 'ok' : b.status === 'served' ? 'neutral' : 'bad'}>
                          {b.status === 'in_cellar' ? 'En cave' : b.status === 'served' ? 'Servi' : 'Perte/Bouchon'}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-xs border-y border-border/40 py-2">
                        <div>
                          <span className="text-muted block text-[10px] uppercase">Niveau</span>
                          <span className="font-medium text-ink capitalize">{b.conditionLevel.replace('_', ' ')}</span>
                        </div>
                        <div>
                          <span className="text-muted block text-[10px] uppercase">Étiquette</span>
                          <span className="font-medium text-ink capitalize">{b.conditionLabel}</span>
                        </div>
                        <div>
                          <span className="text-muted block text-[10px] uppercase">Capsule</span>
                          <span className="font-medium text-ink capitalize">{b.conditionCapsule}</span>
                        </div>
                      </div>

                      {b.provenance && (
                        <p className="text-xs text-muted">
                          <span className="font-semibold text-ink">Provenance : </span>{b.provenance}
                        </p>
                      )}

                      {b.status === 'in_cellar' && (
                        <div className="pt-1 flex justify-end">
                          <Button size="sm" variant="secondary" onClick={() => serveBottle(b)}>
                            Servir ce flacon
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : tab === 'wine' ? <div className="space-y-7">
            <section>
              <h3 className="mb-4 flex items-center gap-2 font-display text-xl"><MapPin className="size-4 text-brand" />{t('discover.terroirTitle')}</h3>
              <Row k="Appellation" v={wine.appellation || ts?.aop} />
              <Row k={t('carte.tech.lieuDit')} v={ts?.lieuDit} />
              <Row k={t('wines.grapes')} v={wine.grapes || ts?.cepage} />
              <Row k={t('carte.tech.sol')} v={ts?.sol} />
              <Row k={t('carte.tech.ageVignes')} v={ts?.ageVignes} />
            </section>
            {ts?.generatedByAI && (
              <div className="rounded-xl border border-border/80 bg-surface-2/60 p-3 text-xs space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={ts.confidence === 'high' ? 'ok' : ts.confidence === 'medium' ? 'brand' : 'warn'}>
                    {ts.confidence === 'high'
                      ? 'Fiabilité Haute · Données AOP vérifiées'
                      : ts.confidence === 'medium'
                        ? 'Fiabilité Moyenne · Repères d’appellation'
                        : 'Données partielles · Repères généraux'}
                  </Badge>
                  <span className="text-muted">Modèle sobre & rapide · Garde-fous actifs</span>
                </div>
                {ts.sources && (
                  <p className="text-muted">
                    <span className="font-medium text-ink">Sources : </span>{ts.sources}
                  </p>
                )}
                {ts.missingInfo && ts.missingInfo !== 'Aucune information manquante majeure' && (
                  <p className="text-warn">
                    <span className="font-medium">Éléments non inventés (non documentés) : </span>{ts.missingInfo}
                  </p>
                )}
                <p className="text-[11px] text-muted">{t('ai.disclaimer')}</p>
              </div>
            )}
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

          <div className={cx('grid gap-2 text-center', canSeeCosts ? 'grid-cols-3' : 'grid-cols-2')}>
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="tabular font-display text-2xl font-semibold">{total}</div>
              <div className="text-xs text-muted">{t('common.bottles')}</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="tabular font-display text-2xl font-semibold">{eur(wine.sellPriceHT, 'EUR', intl)}</div>
              <div className="text-xs text-muted">{t('wines.sellPrice')}</div>
            </div>
            {canSeeCosts && (
              <div className="rounded-xl bg-surface-2 p-3">
                <div className="tabular font-display text-2xl font-semibold">{margin !== undefined ? pct(margin, 0) : '—'}</div>
                <div className="text-xs text-muted">{t('wines.margin')}</div>
              </div>
            )}
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
              return (
                <Row
                  key={s.id}
                  k={s.name}
                  v={
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{l?.qty ?? 0}</span>
                      <button
                        type="button"
                        onClick={() => setQuickBinSite(s)}
                        className="text-xs font-mono text-muted hover:text-brand px-1.5 py-0.5 rounded hover:bg-surface-2 transition cursor-pointer"
                        title="Modifier l'emplacement dans ce site"
                      >
                        {l?.bin ? (
                          <span className="text-ink font-semibold">📍 {l.bin}</span>
                        ) : (
                          <span className="italic text-muted/60">+ Emplacement</span>
                        )}
                      </button>
                    </div>
                  }
                />
              );
            })}
          </section>

          <section>
            <h3 className="mb-1 text-sm font-semibold">{t('wines.details')}</h3>
            <Row k={t('wines.grapes')} v={wine.grapes} />
            <Row k={t('wines.country')} v={wine.country} />
            {canSeeCosts && <Row k={t('wines.buyPrice')} v={wine.buyPriceHT ? eur(wine.buyPriceHT, 'EUR', intl) : undefined} />}
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
      {addBottle && <RareBottleModal wine={wine} onClose={() => setAddBottle(false)} />}
      {quickBinSite && (
        <QuickBinModal
          wine={wine}
          site={quickBinSite}
          level={levels.find((x) => x.siteId === quickBinSite.id)}
          onClose={() => setQuickBinSite(null)}
        />
      )}
    </>
  );
}
