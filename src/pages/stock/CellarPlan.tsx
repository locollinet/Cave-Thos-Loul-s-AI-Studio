import { useMemo, useState } from 'react';
import { Layers, MapPin, Plus, SlidersHorizontal, Sparkles } from 'lucide-react';
import type { CellarRack, Site, StockLevel, Wine } from '@/types';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Badge, Button, Card, EmptyState, SearchInput, Select, cx } from '@/ui';
import { wineLabel } from '@/lib/wine';
import { computeRackStats, getRackCapacity } from '@/lib/cellar';
import { RackConfigModal } from './RackConfigModal';
import { RackDetailModal } from './RackDetailModal';
import { QuickBinModal } from './QuickBinPopover';
import { WineDrawer } from '../wines/WineDrawer';
import { COLOR_DOT } from '../Wines';

export function CellarPlan({
  targetSiteId,
  onSelectSite,
}: {
  targetSiteId?: string;
  onSelectSite?: (siteId: string) => void;
}) {
  const { t } = useI18n();
  const { sites, wines, stock, activeSiteId, can } = useOrg();

  // Site sélectionné (si 'all', on prend le premier site ou le site ciblé)
  const [selectedSiteId, setSelectedSiteId] = useState<string>(() => {
    if (targetSiteId && targetSiteId !== 'all') return targetSiteId;
    if (activeSiteId !== 'all') return activeSiteId;
    return sites[0]?.id ?? '';
  });

  const [activeRack, setActiveRack] = useState<CellarRack | null>(null);
  const [creatingRack, setCreatingRack] = useState(false);
  const [editingRack, setEditingRack] = useState<CellarRack | null>(null);
  const [quickBinWine, setQuickBinWine] = useState<{ wine: Wine; level?: StockLevel } | null>(null);
  const [activeWineId, setActiveWineId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const currentSite = sites.find((s) => s.id === selectedSiteId) ?? sites[0];
  const racks: CellarRack[] = currentSite?.layout?.racks ?? [];

  const winesById = useMemo(() => new Map(wines.map((w) => [w.id, w])), [wines]);
  const siteStock = useMemo(() => stock.filter((s) => s.siteId === currentSite?.id), [stock, currentSite]);

  // Calcul des statistiques globales du site
  const siteStats = useMemo(() => {
    let totalCap = 0;
    let placedSlots = 0;
    let placedBottles = 0;

    for (const r of racks) {
      const stats = computeRackStats(r, siteStock, winesById);
      totalCap += stats.capacity;
      placedSlots += stats.occupiedSlots;
      placedBottles += stats.totalBottles;
    }

    const totalSiteBottles = siteStock.reduce((acc, s) => acc + (s.qty > 0 ? s.qty : 0), 0);
    const unplacedBottles = Math.max(0, totalSiteBottles - placedBottles);
    const fillingRate = totalCap > 0 ? Math.min(100, Math.round((placedSlots / totalCap) * 100)) : 0;

    return { totalCap, placedSlots, placedBottles, unplacedBottles, totalSiteBottles, fillingRate };
  }, [racks, siteStock, winesById]);

  // Vins du site sans emplacement ou avec recherche
  const unplacedWines = useMemo(() => {
    return siteStock
      .filter((s) => s.qty > 0 && !s.bin)
      .map((s) => ({ level: s, wine: winesById.get(s.wineId)! }))
      .filter((item) => Boolean(item.wine && !item.wine.isArchived))
      .filter((item) => {
        if (!search.trim()) return true;
        const needle = search.toLowerCase();
        return (
          item.wine.name.toLowerCase().includes(needle) ||
          item.wine.producer.toLowerCase().includes(needle) ||
          item.wine.vintage.toLowerCase().includes(needle)
        );
      });
  }, [siteStock, winesById, search]);

  if (!currentSite) {
    return (
      <EmptyState
        title="Aucun site de stockage"
        hint="Créez d'abord un site (cave, restaurant, boutique) dans les réglages."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Barre supérieure : Sélecteur de site & KPIs de capacité */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-2xl border border-border bg-surface-2/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <MapPin className="size-5 text-brand" />
            <span className="font-semibold text-ink text-sm">Site :</span>
          </div>
          <Select
            value={currentSite.id}
            onChange={(e) => {
              setSelectedSiteId(e.target.value);
              onSelectSite?.(e.target.value);
            }}
            className="w-56 font-medium"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.layout?.racks?.length ?? 0} meubles)
              </option>
            ))}
          </Select>
        </div>

        {/* Statistiques d'occupation de la cave */}
        <div className="flex flex-wrap items-center gap-5 text-xs">
          <div>
            <span className="text-muted block text-[10px] uppercase tracking-wider">Capacité totale</span>
            <span className="font-mono text-base font-semibold text-ink tabular-nums">
              {siteStats.totalCap} places
            </span>
          </div>
          <span className="h-6 w-px bg-border" />
          <div>
            <span className="text-muted block text-[10px] uppercase tracking-wider">Taux d'occupation</span>
            <span className="font-mono text-base font-semibold text-ink tabular-nums">
              {siteStats.fillingRate}%
            </span>
          </div>
          <span className="h-6 w-px bg-border" />
          <div>
            <span className="text-muted block text-[10px] uppercase tracking-wider">Sans casier</span>
            <span className={cx('font-mono text-base font-semibold tabular-nums', siteStats.unplacedBottles > 0 ? 'text-amber-500' : 'text-muted')}>
              {siteStats.unplacedBottles} btl
            </span>
          </div>
          {can('manager') && (
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="size-4" />}
              onClick={() => setCreatingRack(true)}
              className="ml-auto"
            >
              {t('stock.addRack')}
            </Button>
          )}
        </div>
      </div>

      {/* Grille des meubles configurés */}
      {racks.length === 0 ? (
        <Card className="p-8 sm:p-12 text-center border-dashed">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-soft/40 text-brand mb-4">
            <Layers className="size-7" />
          </div>
          <h3 className="font-display text-2xl text-ink font-semibold">Aucun meuble de rangement configuré</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Structurez simplement votre cave ({currentSite.name}) en ajoutant des armoires à vin, des casiers matriciels ou des étagères pour repérer vos bouteilles en quelques secondes.
          </p>
          {can('manager') && (
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreatingRack(true)}>
                Configurer mon premier meuble
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {racks.map((rack) => {
            const stats = computeRackStats(rack, siteStock, winesById);
            return (
              <Card
                key={rack.id}
                className="group relative flex flex-col justify-between p-4 transition hover:border-brand/60 hover:shadow-xs cursor-pointer"
                onClick={() => setActiveRack(rack)}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-display text-lg text-ink font-semibold group-hover:text-brand transition">
                          {rack.name}
                        </h4>
                        <Badge className="font-mono text-[10px]">{rack.prefix || 'RACK'}</Badge>
                      </div>
                      <p className="text-xs text-muted mt-0.5">
                        {rack.geometry === 'staggered_shelf' && 'Armoire clayettes quinconce'}
                        {rack.geometry === 'matrix' && 'Casier matriciel régulier'}
                        {rack.geometry === 'bulk' && 'Zone caisses & vrac'}
                        {rack.doubleDepth && ' · 2 profondeurs (Av/Ar)'}
                      </p>
                    </div>
                  </div>

                  {/* Jauge de remplissage */}
                  <div className="mt-4 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-muted">Remplissage</span>
                      <span className="font-semibold text-ink tabular-nums">
                        {stats.occupiedSlots} / {stats.capacity} places ({stats.fillingRate}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                      <div
                        className={cx(
                          'h-full rounded-full transition-all',
                          stats.fillingRate > 85 ? 'bg-amber-500' : 'bg-brand',
                        )}
                        style={{ width: `${stats.fillingRate}%` }}
                      />
                    </div>
                  </div>

                  {/* Mini-vue schématique des clayettes */}
                  <div className="mt-4 flex flex-col gap-1 rounded-lg border border-border/60 bg-surface-2/40 p-2.5">
                    {Array.from({ length: Math.min(rack.rows, 4) }).map((_, rIdx) => (
                      <div key={rIdx} className="flex items-center justify-between text-[10px] font-mono text-muted">
                        <span>{rack.geometry === 'staggered_shelf' ? `Clayette ${rIdx + 1}` : `Niveau ${rIdx + 1}`}</span>
                        <span>{rack.cols} places {rack.staggered ? `(+${Math.max(0, rack.cols - 1)} Q)` : ''}</span>
                      </div>
                    ))}
                    {rack.rows > 4 && (
                      <span className="text-center text-[9px] text-muted italic">
                        + {rack.rows - 4} autres niveaux
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-brand font-medium">Ouvrir le meuble →</span>
                  <span className="font-mono text-xs text-muted tabular-nums">
                    {stats.totalBottles} bouteilles
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Section des bouteilles sans emplacement attribué */}
      {siteStats.unplacedBottles > 0 && (
        <Card className="p-4 sm:p-5 border-amber-500/30 bg-amber-500/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h4 className="font-display text-base font-semibold text-ink flex items-center gap-2">
                <span className="size-2 rounded-full bg-amber-500" />
                Bouteilles à ranger ({siteStats.unplacedBottles} bouteilles sur ce site)
              </h4>
              <p className="text-xs text-muted mt-0.5">
                Ces vins sont physiquement en stock dans {currentSite.name} mais n'ont pas encore d'alvéole ou de clayette définie.
              </p>
            </div>
            <div className="w-full sm:w-64">
              <SearchInput value={search} onChange={setSearch} placeholder="Filtrer ces bouteilles..." />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-64 overflow-y-auto pr-1">
            {unplacedWines.map(({ wine, level }) => (
              <div
                key={wine.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface p-2.5 transition hover:border-brand/40"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cx('size-2.5 rounded-full shrink-0', COLOR_DOT[wine.color])} />
                  <div className="truncate">
                    <p className="text-xs font-semibold text-ink truncate">{wineLabel(wine)}</p>
                    <p className="text-[10px] text-muted font-mono">{wine.producer}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-xs font-semibold tabular-nums text-ink">
                    {level.qty} btl
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setQuickBinWine({ wine, level })}
                    className="text-xs py-1 px-2.5"
                  >
                    Ranger
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Modale d'exploration détaillée d'un meuble */}
      {activeRack && (
        <RackDetailModal
          site={currentSite}
          rack={activeRack}
          onClose={() => setActiveRack(null)}
        />
      )}

      {/* Modale de création de meuble */}
      {creatingRack && (
        <RackConfigModal
          site={currentSite}
          onClose={() => setCreatingRack(false)}
        />
      )}

      {/* Modale d'édition de structure de meuble */}
      {editingRack && (
        <RackConfigModal
          site={currentSite}
          initialRack={editingRack}
          onClose={() => setEditingRack(null)}
        />
      )}

      {/* Popin d'assignation rapide d'emplacement */}
      {quickBinWine && (
        <QuickBinModal
          wine={quickBinWine.wine}
          site={currentSite}
          level={quickBinWine.level}
          onClose={() => setQuickBinWine(null)}
        />
      )}

      {/* Tiroir de détails vin */}
      {activeWineId && (
        <WineDrawer
          wineId={activeWineId}
          onClose={() => setActiveWineId(null)}
        />
      )}
    </div>
  );
}
