import { useMemo, useState } from 'react';
import { ArrowUpFromLine, Check, Eye, MapPin, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import type { CellarRack, Site, StockLevel, Wine } from '@/types';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Badge, Button, Input, Modal, SearchInput, useToast, cx } from '@/ui';
import { stockId } from '@/data/stock';
import { uid } from '@/lib/utils';
import { wineLabel } from '@/lib/wine';
import {
  buildRackOccupancyMap,
  computeRackStats,
  findConsecutiveFreeSlots,
  formatBinSummary,
  generateRackSlots,
  normalizeBin,
  type CellarSlot,
  type SlotMatch,
} from '@/lib/cellar';
import { COLOR_DOT } from '../Wines';
import { MovementModal } from './MovementModal';
import { WineDrawer } from '../wines/WineDrawer';
import { RackConfigModal } from './RackConfigModal';

export function RackDetailModal({
  site,
  rack,
  onClose,
}: {
  site: Site;
  rack: CellarRack;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { toast, confirm } = useToast();
  const { wines, stock, commit, path } = useOrg();

  const [depth, setDepth] = useState<'front' | 'back'>('front');
  const [selectedSlot, setSelectedSlot] = useState<CellarSlot | null>(null);
  const [assigningSlot, setAssigningSlot] = useState<CellarSlot | null>(null);
  const [selectedWineToAssign, setSelectedWineToAssign] = useState<Wine | null>(null);
  const [assignCount, setAssignCount] = useState<number>(1);
  const [editingConfig, setEditingConfig] = useState(false);
  const [activeWineId, setActiveWineId] = useState<string | null>(null);
  const [outMoveWine, setOutMoveWine] = useState<Wine | null>(null);
  const [qAssign, setQAssign] = useState('');

  const winesById = useMemo(() => new Map(wines.map((w) => [w.id, w])), [wines]);
  const siteStock = useMemo(() => stock.filter((s) => s.siteId === site.id), [stock, site.id]);

  // Cartographie complète : 1 alvéole = 1 bouteille
  const occupancyMap = useMemo(
    () => buildRackOccupancyMap(rack, siteStock, winesById),
    [rack, siteStock, winesById],
  );
  const stats = useMemo(() => computeRackStats(rack, siteStock, winesById), [rack, siteStock, winesById]);
  const allSlots = useMemo(() => generateRackSlots(rack), [rack]);

  // Filtre les slots visibles selon la profondeur choisie (avant vs arrière)
  const visibleSlots = allSlots.filter((s) => !rack.doubleDepth || s.depth === depth);

  // Groupement par étage / clayette
  const rowsMap = useMemo(() => {
    const map = new Map<number, { layer1: CellarSlot[]; layer2: CellarSlot[] }>();
    for (let r = 1; r <= rack.rows; r++) {
      map.set(r, { layer1: [], layer2: [] });
    }
    for (const s of visibleSlots) {
      const entry = map.get(s.row);
      if (entry) {
        if (s.layer === 1) entry.layer1.push(s);
        else entry.layer2.push(s);
      }
    }
    return map;
  }, [rack.rows, visibleSlots]);

  // Bouteilles du site disponibles pour attribution
  const assignableWines = useMemo(() => {
    return wines.filter((w) => {
      if (w.isArchived) return false;
      const l = siteStock.find((s) => s.wineId === w.id);
      if (!l || l.qty <= 0) return false;
      if (!qAssign.trim()) return true;
      const needle = qAssign.toLowerCase();
      return (
        w.name.toLowerCase().includes(needle) ||
        w.producer.toLowerCase().includes(needle) ||
        w.vintage.toLowerCase().includes(needle)
      );
    });
  }, [wines, siteStock, qAssign]);

  // Attribution d'un vin sur N alvéoles (1 bouteille par place)
  const confirmAssign = async (wine: Wine, slot: CellarSlot, countToPlace: number) => {
    const existing = siteStock.find((s) => s.wineId === wine.id);
    if (!existing) return;

    const count = Math.max(1, countToPlace);
    let newBins: string[];

    if (rack.geometry === 'bulk') {
      newBins = [slot.code];
    } else {
      // Meuble unitaire : trouver les alvéoles libres consécutives à partir de ce slot
      const freeSlots = findConsecutiveFreeSlots(slot, rack, count, occupancyMap);
      const allocatedCodes = freeSlots.map((s) => s.code);
      if (allocatedCodes.length === 0) {
        toast("Aucun emplacement libre trouvé", "bad");
        return;
      }
      const prevBins = (existing.bins ?? (existing.bin ? [existing.bin] : [])).filter(
        (b) => !allocatedCodes.some((ac) => normalizeBin(ac) === normalizeBin(b)),
      );
      newBins = [...prevBins, ...allocatedCodes];
    }

    const sid = stockId(wine.id, site.id);
    await commit([
      {
        op: 'set',
        path: path('stock', sid),
        data: {
          id: sid,
          wineId: wine.id,
          siteId: site.id,
          qty: existing.qty,
          bin: formatBinSummary(newBins),
          bins: newBins,
          updatedAt: Date.now(),
        },
        merge: true,
      },
    ]);

    toast(`${newBins.length > 1 ? `${countToPlace} bouteilles rangées` : '1 bouteille rangée'} dans ${rack.name}`);
    setAssigningSlot(null);
    setSelectedWineToAssign(null);
  };

  // Libérer uniquement cette alvéole (la bouteille reste en stock sans casier)
  const freeSingleSlot = async (slot: CellarSlot, stockLevel: StockLevel) => {
    const norm = normalizeBin(slot.code);
    const prevBins = stockLevel.bins ?? (stockLevel.bin ? [stockLevel.bin] : []);
    const remainingBins = prevBins.filter((b) => normalizeBin(b) !== norm);

    await commit([
      {
        op: 'set',
        path: path('stock', stockLevel.id),
        data: {
          bin: formatBinSummary(remainingBins),
          bins: remainingBins,
          updatedAt: Date.now(),
        },
        merge: true,
      },
    ]);
    toast(`Alvéole ${slot.label} libérée`);
    setSelectedSlot(null);
  };

  // Libérer toutes les bouteilles de ce vin de ce meuble
  const freeAllFromRack = async (stockLevel: StockLevel) => {
    const rackSlotCodes = new Set(allSlots.map((s) => normalizeBin(s.code)));
    const prevBins = stockLevel.bins ?? (stockLevel.bin ? [stockLevel.bin] : []);
    const remainingBins = prevBins.filter((b) => !rackSlotCodes.has(normalizeBin(b)));

    await commit([
      {
        op: 'set',
        path: path('stock', stockLevel.id),
        data: {
          bin: formatBinSummary(remainingBins),
          bins: remainingBins.length > 0 ? remainingBins : undefined,
          updatedAt: Date.now(),
        },
        merge: true,
      },
    ]);
    toast(`Emplacements libérés pour ce meuble`);
    setSelectedSlot(null);
  };

  // Sortie d'une bouteille (consommation / service) : -1 au stock + libère l'alvéole
  const takeOneBottle = async (slot: CellarSlot, match: SlotMatch) => {
    const { wine, stockLevel } = match;
    const norm = normalizeBin(slot.code);
    const prevBins = stockLevel.bins ?? (stockLevel.bin ? [stockLevel.bin] : []);
    const remainingBins = prevBins.filter((b) => normalizeBin(b) !== norm);
    const newQty = Math.max(0, stockLevel.qty - 1);

    await commit([
      {
        op: 'set',
        path: path('stock', stockLevel.id),
        data: {
          qty: newQty,
          bin: formatBinSummary(remainingBins),
          bins: remainingBins,
          updatedAt: Date.now(),
        },
        merge: true,
      },
      {
        op: 'set',
        path: path('movements', uid()),
        data: {
          id: uid(),
          date: new Date().toISOString().slice(0, 10),
          wineId: wine.id,
          wineLabel: wineLabel(wine),
          siteId: site.id,
          type: 'out',
          qty: 1,
          reason: 'consommation',
          unitCostHT: wine.buyPriceHT,
          note: `Sortie de la cave : ${slot.label} [${slot.code}]`,
          userId: 'staff',
          userName: 'Sommelier',
          createdAt: Date.now(),
        },
      },
    ]);
    toast(`1 bouteille sortie de ${slot.label}`);
    setSelectedSlot(null);
  };

  const deleteRack = async () => {
    if (
      await confirm({
        title: t('stock.deleteRack'),
        message: `Voulez-vous supprimer le meuble « ${rack.name} » ? Les bouteilles ne seront pas effacées, elles deviendront sans emplacement.`,
        confirmLabel: t('common.delete'),
        danger: true,
      })
    ) {
      const remaining = (site.layout?.racks ?? []).filter((r) => r.id !== rack.id);
      await commit([
        {
          op: 'set',
          path: path('sites', site.id),
          data: { layout: { racks: remaining } },
          merge: true,
        },
      ]);
      toast("Meuble supprimé");
      onClose();
    }
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={
          <div className="flex items-center gap-2">
            <span className="font-display text-xl text-ink">{rack.name}</span>
            <Badge className="font-mono text-[10px]">{rack.prefix || 'RACK'}</Badge>
          </div>
        }
        size="xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <Button variant="ghost" size="sm" onClick={deleteRack} className="text-muted hover:text-bad">
              <Trash2 className="size-3.5 mr-1" />
              {t('stock.deleteRack')}
            </Button>
            <div className="flex items-center gap-2">
              <Button size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setEditingConfig(true)}>
                {t('stock.editRack')}
              </Button>
              <Button onClick={onClose}>{t('common.close')}</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Barre d'outils et statistiques du meuble */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/40 p-3">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div>
                <span className="text-muted">Occupation : </span>
                <span className="font-semibold text-ink font-mono tabular-nums">
                  {stats.occupiedSlots} / {stats.capacity} places ({stats.fillingRate}%)
                </span>
              </div>
              <span className="text-muted">·</span>
              <div>
                <span className="text-muted">Bouteilles stockées : </span>
                <span className="font-semibold text-ink font-mono tabular-nums">
                  {stats.totalBottles} bouteilles
                </span>
              </div>
            </div>

            {/* Sélecteur de profondeur si double rangée */}
            {rack.doubleDepth && (
              <div className="flex items-center gap-1 p-1 bg-surface rounded-lg border border-border shadow-xs">
                <button
                  type="button"
                  onClick={() => setDepth('front')}
                  className={cx(
                    'px-3 py-1 text-xs font-medium rounded-md transition cursor-pointer',
                    depth === 'front'
                      ? 'bg-brand text-brand-fg shadow-xs'
                      : 'text-muted hover:text-ink',
                  )}
                >
                  {t('stock.frontRow')}
                </button>
                <button
                  type="button"
                  onClick={() => setDepth('back')}
                  className={cx(
                    'px-3 py-1 text-xs font-medium rounded-md transition cursor-pointer',
                    depth === 'back'
                      ? 'bg-brand text-brand-fg shadow-xs'
                      : 'text-muted hover:text-ink',
                  )}
                >
                  {t('stock.backRow')}
                </button>
              </div>
            )}
          </div>

          {/* Rendu visuel des clayettes / casiers */}
          <div className="rounded-2xl border border-border bg-surface p-4 sm:p-6 space-y-4 max-h-[60vh] overflow-y-auto">
            {Array.from(rowsMap.entries()).map(([rowNum, { layer1, layer2 }]) => {
              const rowLabel = rack.geometry === 'staggered_shelf' ? `Clayette ${rowNum}` : `Niveau ${rowNum}`;
              return (
                <div
                  key={rowNum}
                  className="rounded-xl border border-border/80 bg-surface-2/40 p-3 sm:p-4 transition hover:border-brand/40"
                >
                  <div className="flex items-center justify-between mb-3 text-xs">
                    <span className="font-semibold text-ink font-display text-sm tracking-wide">
                      {rowLabel}
                    </span>
                    <span className="text-muted font-mono text-[11px]">
                      {rack.doubleDepth ? (depth === 'front' ? 'Rangée Avant' : 'Rangée Arrière') : ''}
                    </span>
                  </div>

                  {/* Rangée supérieure en quinconce (si active) */}
                  {layer2.length > 0 && (
                    <div className="flex justify-center gap-3 sm:gap-4 mb-2 pl-6 sm:pl-8">
                      {layer2.map((slot) => {
                        const match = occupancyMap.get(normalizeBin(slot.code));
                        return (
                          <SlotButton
                            key={slot.code}
                            slot={slot}
                            match={match}
                            onClick={() => (match ? setSelectedSlot(slot) : setAssigningSlot(slot))}
                          />
                        );
                      })}
                    </div>
                  )}

                  {/* Rangée inférieure (base de la clayette) */}
                  <div className="flex justify-center gap-3 sm:gap-4">
                    {layer1.map((slot) => {
                      const match = occupancyMap.get(normalizeBin(slot.code));
                      return (
                        <SlotButton
                          key={slot.code}
                          slot={slot}
                          match={match}
                          onClick={() => (match ? setSelectedSlot(slot) : setAssigningSlot(slot))}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Légende discrète */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted px-1">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded-full bg-rose-600 inline-block" /> Rouge
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded-full bg-amber-500 inline-block" /> Blanc
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded-full bg-pink-400 inline-block" /> Rosé
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded-full bg-yellow-500 inline-block" /> Bulles
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded-full border border-dashed border-border bg-surface inline-block" /> Libre
              </span>
            </div>
            <span className="text-[11px] text-muted font-medium">1 alvéole = 1 bouteille</span>
          </div>
        </div>
      </Modal>

      {/* Popin d'inspection d'une bouteille sélectionnée */}
      {selectedSlot && (() => {
        const match = occupancyMap.get(normalizeBin(selectedSlot.code));
        if (!match) return null;
        const { wine, stockLevel, totalInRack, slotBottleCount } = match;
        const isSingle = slotBottleCount === 1;

        return (
          <Modal
            open
            onClose={() => setSelectedSlot(null)}
            title={
              <div className="flex items-center gap-2">
                <span className={cx('block size-3 rounded-full', COLOR_DOT[wine.color])} />
                <span>{selectedSlot.label}</span>
                <span className="font-mono text-xs text-muted">[{selectedSlot.code}]</span>
              </div>
            }
            size="md"
            footer={
              <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => freeSingleSlot(selectedSlot, stockLevel)}
                    className="text-muted hover:text-bad"
                    title="Enlève la bouteille de cette place sans changer le stock total"
                  >
                    <X className="size-3.5 mr-1" />
                    Libérer cette place
                  </Button>
                  {(totalInRack ?? 0) > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => freeAllFromRack(stockLevel)}
                      className="text-muted hover:text-bad text-xs"
                      title="Libère toutes les alvéoles de ce meuble pour ce vin"
                    >
                      Tout libérer ({totalInRack} btl)
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    icon={<ArrowUpFromLine className="size-3.5" />}
                    onClick={() => takeOneBottle(selectedSlot, match)}
                    title="Sort 1 bouteille du stock (consommation ou vente)"
                  >
                    {t('stock.takeOne')}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Eye className="size-3.5" />}
                    onClick={() => {
                      setSelectedSlot(null);
                      setActiveWineId(wine.id);
                    }}
                  >
                    Fiche vin
                  </Button>
                </div>
              </div>
            }
          >
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-surface-2/40 p-4">
                <p className="text-xs uppercase tracking-wider text-muted font-mono">{wine.producer}</p>
                <h3 className="font-display text-xl text-ink font-semibold mt-0.5">{wine.name}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
                  <span className="font-display text-base text-ink font-medium">{wine.vintage}</span>
                  <span>·</span>
                  <span>{wine.appellation || wine.region || '—'}</span>
                  <span>·</span>
                  <span>{wine.formatCl} cl</span>
                </div>
                <div className="mt-3 pt-3 border-t border-border/80 flex flex-col gap-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Dans cet emplacement :</span>
                    <span className="font-semibold text-ink font-mono">
                      {isSingle ? '1 bouteille' : `${slotBottleCount} bouteilles (vrac)`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Total rangé dans ce meuble :</span>
                    <span className="font-semibold text-brand font-mono">
                      {totalInRack ?? 1} bouteille(s)
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Stock total sur le site :</span>
                    <span className="font-semibold text-ink font-mono">{stockLevel.qty} bouteilles</span>
                  </div>
                </div>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Popin d'assignation d'un vin sur un slot vide */}
      {assigningSlot && (
        <Modal
          open
          onClose={() => {
            setAssigningSlot(null);
            setSelectedWineToAssign(null);
          }}
          title={
            selectedWineToAssign
              ? `Ranger : ${wineLabel(selectedWineToAssign)}`
              : `Ranger un vin dans : ${assigningSlot.label}`
          }
          size="md"
          footer={
            selectedWineToAssign ? (
              <div className="flex items-center justify-between w-full">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedWineToAssign(null)}
                >
                  Choisir un autre vin
                </Button>
                <Button
                  variant="primary"
                  icon={<Check className="size-4" />}
                  onClick={() => confirmAssign(selectedWineToAssign, assigningSlot, assignCount)}
                >
                  Confirmer le rangement ({assignCount} btl)
                </Button>
              </div>
            ) : undefined
          }
        >
          <div className="space-y-4">
            {!selectedWineToAssign ? (
              <>
                <SearchInput
                  value={qAssign}
                  onChange={setQAssign}
                  placeholder="Rechercher un vin à ranger..."
                />
                <div className="max-h-72 overflow-y-auto space-y-1 rounded-xl border border-border p-2">
                  {assignableWines.length === 0 ? (
                    <p className="text-xs text-center text-muted py-6">
                      Aucun vin disponible pour ce site.
                    </p>
                  ) : (
                    assignableWines.map((w) => {
                      const l = siteStock.find((s) => s.wineId === w.id);
                      const placedCount = l?.bins?.length ?? (l?.bin ? 1 : 0);
                      const unplacedQty = Math.max(0, (l?.qty ?? 0) - placedCount);

                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => {
                            setSelectedWineToAssign(w);
                            const defaultCount = unplacedQty > 0 ? unplacedQty : (l?.qty ?? 1);
                            setAssignCount(Math.min(defaultCount, 12));
                          }}
                          className="w-full text-left rounded-lg p-2.5 transition hover:bg-surface-2 flex items-center justify-between gap-3 cursor-pointer"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={cx('block size-2.5 rounded-full shrink-0', COLOR_DOT[w.color])} />
                            <div className="truncate">
                              <p className="text-xs font-medium text-ink truncate">{wineLabel(w)}</p>
                              <p className="text-[11px] text-muted truncate">
                                {unplacedQty > 0 ? `${unplacedQty} btl sans casier` : 'Déjà rangé'}
                              </p>
                            </div>
                          </div>
                          <span className="font-mono text-xs font-semibold shrink-0 text-ink">
                            {l?.qty ?? 0} btl
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              // Configuration de la quantité à ranger (1 par 1)
              (() => {
                const l = siteStock.find((s) => s.wineId === selectedWineToAssign.id);
                const totalStock = l?.qty ?? 1;
                const freeConsecutive = findConsecutiveFreeSlots(
                  assigningSlot,
                  rack,
                  totalStock,
                  occupancyMap,
                );
                const maxAvailable = Math.max(1, Math.min(totalStock, freeConsecutive.length));

                return (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border bg-surface-2/40 p-3 text-xs space-y-1">
                      <p className="text-muted font-mono uppercase">{selectedWineToAssign.producer}</p>
                      <p className="font-semibold text-ink text-sm">{selectedWineToAssign.name} {selectedWineToAssign.vintage}</p>
                      <p className="text-muted">
                        Stock total : <span className="font-mono font-semibold text-ink">{totalStock} bouteilles</span>
                        {' · '}Alvéoles libres consécutives disponibles : <span className="font-mono font-semibold text-brand">{freeConsecutive.length}</span>
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-ink block">
                        Combien de bouteilles ranger à partir de cet emplacement ?
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setAssignCount(1)}
                          className={cx(
                            'p-2.5 rounded-xl border text-center transition cursor-pointer text-xs font-medium',
                            assignCount === 1
                              ? 'border-brand bg-brand-soft/30 text-ink font-semibold'
                              : 'border-border bg-surface hover:bg-surface-2 text-muted',
                          )}
                        >
                          1 bouteille
                          <span className="block text-[10px] text-muted font-normal mt-0.5">
                            Cette alvéole seule
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAssignCount(maxAvailable)}
                          className={cx(
                            'p-2.5 rounded-xl border text-center transition cursor-pointer text-xs font-medium',
                            assignCount === maxAvailable
                              ? 'border-brand bg-brand-soft/30 text-ink font-semibold'
                              : 'border-border bg-surface hover:bg-surface-2 text-muted',
                          )}
                        >
                          Tout le lot ({maxAvailable} btl)
                          <span className="block text-[10px] text-muted font-normal mt-0.5">
                            À la suite (1 par place)
                          </span>
                        </button>
                        <div className="p-1 rounded-xl border border-border bg-surface flex items-center justify-center">
                          <Input
                            type="number"
                            min={1}
                            max={maxAvailable}
                            value={assignCount}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val)) setAssignCount(Math.max(1, Math.min(val, maxAvailable)));
                            }}
                            className="text-center font-mono text-xs w-full h-8"
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-muted">
                        Règle : chaque bouteille est rangée dans sa propre alvéole individuelle.
                      </p>
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </Modal>
      )}

      {/* Fiche vin si ouverte */}
      {activeWineId && (
        <WineDrawer
          wineId={activeWineId}
          onClose={() => setActiveWineId(null)}
        />
      )}

      {/* Sortie directe d'une bouteille */}
      {outMoveWine && (
        <MovementModal
          initialType="out"
          initialWine={outMoveWine}
          initialSiteId={site.id}
          onClose={() => setOutMoveWine(null)}
        />
      )}

      {/* Modification de la configuration du meuble */}
      {editingConfig && (
        <RackConfigModal
          site={site}
          initialRack={rack}
          onClose={() => setEditingConfig(false)}
        />
      )}
    </>
  );
}

function SlotButton({
  slot,
  match,
  onClick,
}: {
  slot: CellarSlot;
  match?: SlotMatch;
  onClick: () => void;
}) {
  if (match) {
    const { wine, slotBottleCount } = match;
    const isSingle = slotBottleCount === 1;
    const shortVintage = wine.vintage
      ? wine.vintage.length === 4
        ? `'${wine.vintage.slice(2)}`
        : wine.vintage
      : '';

    return (
      <button
        type="button"
        onClick={onClick}
        className={cx(
          'group relative size-10 sm:size-12 rounded-full border shadow-xs transition flex flex-col items-center justify-center cursor-pointer',
          wine.color === 'rouge' && 'bg-rose-950/20 border-rose-800/70 hover:border-rose-500 hover:bg-rose-950/35',
          wine.color === 'blanc' && 'bg-amber-950/20 border-amber-700/70 hover:border-amber-500 hover:bg-amber-950/35',
          wine.color === 'rose' && 'bg-pink-950/20 border-pink-700/70 hover:border-pink-500 hover:bg-pink-950/35',
          wine.color === 'bulles' && 'bg-yellow-950/20 border-yellow-700/70 hover:border-yellow-500 hover:bg-yellow-950/35',
          !['rouge', 'blanc', 'rose', 'bulles'].includes(wine.color) && 'bg-surface-2 border-border hover:border-brand',
        )}
        title={`${wineLabel(wine)} · ${isSingle ? '1 bouteille' : `${slotBottleCount} btl`} — ${slot.label}`}
      >
        <span className={cx('size-2 rounded-full mb-0.5 shadow-xs', COLOR_DOT[wine.color])} />
        <span className="font-mono text-[9px] font-bold text-ink leading-none">
          {isSingle ? (shortVintage || '1') : slotBottleCount}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="size-10 sm:size-12 rounded-full border border-dashed border-border/80 bg-surface hover:border-brand/70 hover:bg-brand-soft/20 transition flex items-center justify-center text-muted hover:text-brand cursor-pointer"
      title={`${slot.label} (Libre) — Cliquer pour ranger une bouteille`}
    >
      <Plus className="size-3.5 opacity-60 group-hover:opacity-100" />
    </button>
  );
}
