import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowUpFromLine,
  Check,
  Eye,
  Layers,
  MapPin,
  Move,
  PackagePlus,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { CellarRack, Site, StockLevel, Wine, WineColor } from '@/types';
import { useOrg } from '@/app/org';
import { useAuth } from '@/app/auth';
import { useI18n } from '@/i18n';
import { Badge, Button, Card, EmptyState, Input, Modal, SearchInput, Select, useToast, cx } from '@/ui';
import { buildMovementOps, stockId, withStockFields } from '@/data/stock';
import { DELETE_FIELD } from '@/data/sentinels';
import { wineLabel } from '@/lib/wine';
import { eur } from '@/lib/utils';
import {
  buildRackOccupancyMap,
  buildSlotCode,
  computeRackStats,
  findConsecutiveFreeSlots,
  formatBinSummary,
  formatSlotLabel,
  generateRackSlots,
  getShortWineNeckLabel,
  isWineAtApogee,
  normalizeBin,
  type CellarSlot,
  type SlotMatch,
} from '@/lib/cellar';
import { RackConfigModal } from './RackConfigModal';
import { QuickBinModal } from './QuickBinPopover';
import { WineDrawer } from '../wines/WineDrawer';
import { COLOR_DOT } from '../Wines';

const BOTTLE_GLASS_STYLE: Record<
  WineColor,
  {
    bg: string;
    ring: string;
    capsule: string;
    text: string;
    subtext: string;
    miniDot: string;
    label: string;
  }
> = {
  rouge: {
    bg: 'radial-gradient(circle at 32% 28%, #9e2a3b 0%, #58131d 60%, #2c080d 100%)',
    ring: 'border-rose-700/80 hover:border-amber-300',
    capsule: '#D4AF37',
    text: 'text-rose-50',
    subtext: 'text-rose-200/90',
    miniDot: 'bg-rose-600 border-rose-300/70',
    label: 'Rouge',
  },
  blanc: {
    bg: 'radial-gradient(circle at 32% 28%, #e2b857 0%, #99711b 62%, #4a3508 100%)',
    ring: 'border-amber-600/80 hover:border-amber-300',
    capsule: '#F3E5AB',
    text: 'text-amber-50',
    subtext: 'text-amber-100/90',
    miniDot: 'bg-amber-400 border-amber-200/80',
    label: 'Blanc',
  },
  bulles: {
    bg: 'radial-gradient(circle at 32% 28%, #d4af37 0%, #7d6212 60%, #382b05 100%)',
    ring: 'border-yellow-500/85 hover:border-yellow-200',
    capsule: '#FFF8DC',
    text: 'text-yellow-50',
    subtext: 'text-yellow-100/95',
    miniDot: 'bg-yellow-300 border-white',
    label: 'Bulles',
  },
  rose: {
    bg: 'radial-gradient(circle at 32% 28%, #e07a9b 0%, #8c3754 62%, #451626 100%)',
    ring: 'border-pink-500/80 hover:border-pink-200',
    capsule: '#F8BBD0',
    text: 'text-pink-50',
    subtext: 'text-pink-100/90',
    miniDot: 'bg-pink-400 border-pink-200/80',
    label: 'Rosé',
  },
  liquoreux: {
    bg: 'radial-gradient(circle at 32% 28%, #d97706 0%, #78350f 62%, #3b1704 100%)',
    ring: 'border-amber-500/85 hover:border-amber-200',
    capsule: '#FDE68A',
    text: 'text-amber-50',
    subtext: 'text-amber-100/90',
    miniDot: 'bg-orange-400 border-amber-200/80',
    label: 'Liquoreux',
  },
  autre: {
    bg: 'radial-gradient(circle at 32% 28%, #57534e 0%, #292524 65%, #1c1917 100%)',
    ring: 'border-stone-500/80 hover:border-stone-300',
    capsule: '#D6D3D1',
    text: 'text-stone-100',
    subtext: 'text-stone-300',
    miniDot: 'bg-stone-400 border-stone-200',
    label: 'Autre',
  },
};

export function CellarPlan({
  targetSiteId,
  onSelectSite,
  onOpenWine,
}: {
  targetSiteId?: string;
  onSelectSite?: (siteId: string) => void;
  onOpenWine?: (wineId: string) => void;
}) {
  const { t } = useI18n();
  const { toast, confirm } = useToast();
  const { user } = useAuth();
  const { sites, wines, stock, activeSiteId, can, commit, path, orgId } = useOrg();

  // Site sélectionné
  const [selectedSiteId, setSelectedSiteId] = useState<string>(() => {
    if (targetSiteId && targetSiteId !== 'all') return targetSiteId;
    if (activeSiteId !== 'all') return activeSiteId;
    return sites[0]?.id ?? '';
  });

  useEffect(() => {
    if (activeSiteId !== 'all' && activeSiteId !== selectedSiteId) {
      setSelectedSiteId(activeSiteId);
    }
  }, [activeSiteId]);

  const currentSite: Site | undefined = sites.find((s) => s.id === selectedSiteId) ?? sites[0];
  const racks: CellarRack[] = currentSite?.layout?.racks ?? [];

  // Meuble actif dans la vue
  const [selectedRackId, setSelectedRackId] = useState<string>(() => racks[0]?.id ?? '');
  useEffect(() => {
    if (!racks.some((r) => r.id === selectedRackId)) {
      setSelectedRackId(racks[0]?.id ?? '');
    }
  }, [racks, selectedRackId]);

  const activeRack: CellarRack | undefined = racks.find((r) => r.id === selectedRackId) ?? racks[0];

  // Étage ciblé ('all' ou numéro d'étage 1..rows)
  const [selectedRow, setSelectedRow] = useState<number | 'all'>(1);
  useEffect(() => {
    if (activeRack && typeof selectedRow === 'number' && selectedRow > activeRack.rows) {
      setSelectedRow(1);
    }
  }, [activeRack, selectedRow]);

  // Filtre de profondeur : 'both' (Devant + Derrière côte à côte), 'front', 'back'
  const [depthFilter, setDepthFilter] = useState<'both' | 'front' | 'back'>('both');

  // Filtres visuels sur le plan
  const [search, setSearch] = useState('');
  const [colorFilter, setColorFilter] = useState<WineColor | 'all'>('all');
  const [onlyApogee, setOnlyApogee] = useState(false);
  const [onlyFreeSlots, setOnlyFreeSlots] = useState(false);

  // Modales & actions directes
  const [creatingRack, setCreatingRack] = useState(false);
  const [editingRack, setEditingRack] = useState<CellarRack | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<CellarSlot | null>(null);
  const [assigningSlot, setAssigningSlot] = useState<CellarSlot | null>(null);
  const [selectedWineToAssign, setSelectedWineToAssign] = useState<Wine | null>(null);
  const [assignMode, setAssignMode] = useState<'single' | 'lot'>('single');
  const [assignCount, setAssignCount] = useState<number>(6);
  const [qAssign, setQAssign] = useState('');
  const [movingSlot, setMovingSlot] = useState<{ slot: CellarSlot; match: SlotMatch } | null>(null);
  const [quickBinWine, setQuickBinWine] = useState<{ wine: Wine; level?: StockLevel } | null>(null);
  const [activeWineId, setActiveWineId] = useState<string | null>(null);
  const [autoPlacing, setAutoPlacing] = useState(false);

  const winesById = useMemo(() => new Map(wines.map((w) => [w.id, w])), [wines]);
  const siteStock = useMemo(
    () => stock.filter((s) => s.siteId === currentSite?.id),
    [stock, currentSite?.id],
  );

  // Statistiques globales du site
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

  // Cartographie du meuble actif
  const occupancyMap = useMemo(
    () => (activeRack ? buildRackOccupancyMap(activeRack, siteStock, winesById) : new Map<string, SlotMatch>()),
    [activeRack, siteStock, winesById],
  );
  const activeRackStats = useMemo(
    () =>
      activeRack
        ? computeRackStats(activeRack, siteStock, winesById)
        : { capacity: 0, occupiedSlots: 0, totalBottles: 0, fillingRate: 0 },
    [activeRack, siteStock, winesById],
  );
  const allRackSlots = useMemo(
    () => (activeRack ? generateRackSlots(activeRack) : []),
    [activeRack],
  );

  // Vins du site ayant encore des bouteilles non placées
  const unplacedWines = useMemo(() => {
    // Calculer combien de bouteilles de chaque vin sont déjà placées dans tous les meubles du site
    const placedCountByWine = new Map<string, number>();
    for (const r of racks) {
      const map = buildRackOccupancyMap(r, siteStock, winesById);
      for (const m of map.values()) {
        placedCountByWine.set(m.wine.id, (placedCountByWine.get(m.wine.id) ?? 0) + m.slotBottleCount);
      }
    }

    return siteStock
      .filter((s) => s.qty > 0 && winesById.has(s.wineId))
      .map((s) => {
        const wine = winesById.get(s.wineId)!;
        const placed = placedCountByWine.get(s.wineId) ?? 0;
        const unplacedQty = Math.max(0, s.qty - placed);
        return { level: s, wine, unplacedQty };
      })
      .filter((item) => !item.wine.isArchived && item.unplacedQty > 0);
  }, [racks, siteStock, winesById]);

  // Vérifie si un slot occupé correspond aux filtres de recherche / couleur / apogée
  const matchesBottleFilters = (match?: SlotMatch): boolean => {
    if (onlyFreeSlots) return !match;
    if (!match) {
      return !search.trim() && colorFilter === 'all' && !onlyApogee;
    }
    const { wine } = match;
    if (colorFilter !== 'all' && wine.color !== colorFilter) return false;
    if (onlyApogee && !isWineAtApogee(wine)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        wine.name.toLowerCase().includes(q) ||
        wine.producer.toLowerCase().includes(q) ||
        wine.vintage.toLowerCase().includes(q) ||
        (wine.appellation ?? '').toLowerCase().includes(q) ||
        (wine.region ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  };

  // --- ACTIONS SOMMELIER (1 CLIC) ---

  // 1. Déplacer ou permuter une bouteille d'un slot A vers un slot B
  const handleMoveOrSwapSlot = async (source: { slot: CellarSlot; match: SlotMatch }, targetSlot: CellarSlot) => {
    if (!activeRack || !currentSite) return;
    const sourceNorm = normalizeBin(source.slot.code);
    const targetNorm = normalizeBin(targetSlot.code);
    if (sourceNorm === targetNorm) {
      setMovingSlot(null);
      return;
    }

    const targetMatch = occupancyMap.get(targetNorm);
    const sourceLevel = source.match.stockLevel;

    // Matérialiser les bins explicites du stock source à partir de occupancyMap
    const getExplicitBins = (lvl: StockLevel): string[] => {
      if (Array.isArray(lvl.bins) && lvl.bins.length > 0) return [...lvl.bins];
      // Si placé via `bin` de départ, extraire toutes les alvéoles occupées par ce stock
      const codes: string[] = [];
      for (const [normKey, m] of occupancyMap.entries()) {
        if (m.stockLevel.id === lvl.id) {
          const sl = allRackSlots.find((s) => normalizeBin(s.code) === normKey);
          codes.push(sl ? sl.code : normKey);
        }
      }
      return codes.length > 0 ? codes : lvl.bin ? [lvl.bin] : [];
    };

    if (!targetMatch) {
      // Déplacement simple vers une alvéole libre
      const nextBins = getExplicitBins(sourceLevel).map((b) =>
        normalizeBin(b) === sourceNorm ? targetSlot.code : b,
      );
      if (!nextBins.some((b) => normalizeBin(b) === targetNorm)) {
        nextBins.push(targetSlot.code);
      }
      await commit([
        {
          op: 'set',
          path: path('stock', sourceLevel.id),
          data: {
            bin: formatBinSummary(nextBins),
            bins: nextBins,
            updatedAt: Date.now(),
          },
          merge: true,
        },
      ]);
      toast(`Bouteille déplacée vers ${targetSlot.label}`);
    } else if (targetMatch.stockLevel.id === sourceLevel.id) {
      toast('Même cuvée déjà présente sur cet emplacement');
    } else {
      // Permutation entre 2 cuvées différentes
      const targetLevel = targetMatch.stockLevel;
      const sourceBins = getExplicitBins(sourceLevel).map((b) =>
        normalizeBin(b) === sourceNorm ? targetSlot.code : b,
      );
      const targetBins = getExplicitBins(targetLevel).map((b) =>
        normalizeBin(b) === targetNorm ? source.slot.code : b,
      );

      await commit([
        {
          op: 'set',
          path: path('stock', sourceLevel.id),
          data: {
            bin: formatBinSummary(sourceBins),
            bins: sourceBins,
            updatedAt: Date.now(),
          },
          merge: true,
        },
        {
          op: 'set',
          path: path('stock', targetLevel.id),
          data: {
            bin: formatBinSummary(targetBins),
            bins: targetBins,
            updatedAt: Date.now(),
          },
          merge: true,
        },
      ]);
      toast(`Permutation effectuée (${source.slot.label} ↔ ${targetSlot.label})`);
    }

    setMovingSlot(null);
    setSelectedSlot(null);
  };

  // 2. Permuter ou avancer Devant ↔ Derrière en 1 clic
  const handleSwapDepthTwin = async (slot: CellarSlot, match: SlotMatch) => {
    if (!activeRack || !activeRack.doubleDepth) return;
    const twinDepth: 'front' | 'back' = slot.depth === 'front' ? 'back' : 'front';
    const twinCode = buildSlotCode(activeRack, slot.row, slot.col, twinDepth, slot.layer);
    const twinSlot: CellarSlot = {
      code: twinCode,
      rackId: activeRack.id,
      row: slot.row,
      col: slot.col,
      layer: slot.layer,
      depth: twinDepth,
      label: formatSlotLabel(activeRack, slot.row, slot.col, twinDepth, slot.layer),
    };
    await handleMoveOrSwapSlot({ slot, match }, twinSlot);
  };

  // 3. Ranger un flacon unitaire ou un lot/carton dans un slot libre
  const confirmAssign = async (wine: Wine, slot: CellarSlot, countToPlace: number) => {
    if (!activeRack || !currentSite) return;
    const existing = siteStock.find((s) => s.wineId === wine.id);
    if (!existing) return;

    const count = Math.max(1, countToPlace);
    let newBins: string[];

    if (activeRack.geometry === 'bulk') {
      newBins = [slot.code];
    } else {
      const freeSlots = findConsecutiveFreeSlots(slot, activeRack, count, occupancyMap);
      const allocatedCodes = freeSlots.map((s) => s.code);
      if (allocatedCodes.length === 0) {
        toast('Aucun emplacement libre trouvé', 'bad');
        return;
      }
      const prevBins = (existing.bins ?? (existing.bin ? [existing.bin] : [])).filter(
        (b) => !allocatedCodes.some((ac) => normalizeBin(ac) === normalizeBin(b)),
      );
      newBins = [...prevBins, ...allocatedCodes];
    }

    const sid = stockId(wine.id, currentSite.id);
    await commit([
      {
        op: 'set',
        path: path('stock', sid),
        data: {
          bin: formatBinSummary(newBins),
          bins: newBins,
          updatedAt: Date.now(),
        },
        merge: true,
      },
    ]);

    toast(
      `${count > 1 ? `${count} bouteilles rangées` : '1 bouteille rangée'} dans ${slot.label}`,
    );
    setAssigningSlot(null);
    setSelectedWineToAssign(null);
  };

  // 4. Rangement automatique 1-clic des bouteilles sans casier dans le meuble actif
  const handleAutoPlaceUnplaced = async () => {
    if (!activeRack || !currentSite || unplacedWines.length === 0) return;
    setAutoPlacing(true);
    try {
      const freeSlots = allRackSlots.filter((sl) => !occupancyMap.has(normalizeBin(sl.code)));
      if (freeSlots.length === 0) {
        toast('Ce meuble est déjà complet (aucune alvéole libre)', 'warn');
        return;
      }

      let cursor = 0;
      let totalPlacedNow = 0;
      const ops: Parameters<typeof commit>[0] = [];

      for (const item of unplacedWines) {
        if (cursor >= freeSlots.length) break;
        const qtyToPlace = Math.min(item.unplacedQty, freeSlots.length - cursor);
        if (qtyToPlace <= 0) continue;

        const allocated = freeSlots.slice(cursor, cursor + qtyToPlace).map((s) => s.code);
        cursor += qtyToPlace;
        totalPlacedNow += qtyToPlace;

        const prevBins = item.level.bins ?? (item.level.bin ? [item.level.bin] : []);
        const nextBins = [...prevBins, ...allocated];

        ops.push({
          op: 'set',
          path: path('stock', item.level.id),
          data: {
            bin: formatBinSummary(nextBins),
            bins: nextBins,
            updatedAt: Date.now(),
          },
          merge: true,
        });
      }

      if (ops.length > 0) {
        await commit(ops);
        toast(`${totalPlacedNow} bouteilles rangées automatiquement dans ${activeRack.name}`);
      }
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setAutoPlacing(false);
    }
  };

  // 5. Libérer une alvéole ou tout le meuble pour un vin
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

  const freeAllFromRack = async (stockLevel: StockLevel) => {
    const rackSlotCodes = new Set(allRackSlots.map((s) => normalizeBin(s.code)));
    const prevBins = stockLevel.bins ?? (stockLevel.bin ? [stockLevel.bin] : []);
    const remainingBins = prevBins.filter((b) => !rackSlotCodes.has(normalizeBin(b)));

    await commit([
      {
        op: 'set',
        path: path('stock', stockLevel.id),
        data: {
          bin: formatBinSummary(remainingBins),
          bins: remainingBins.length > 0 ? remainingBins : DELETE_FIELD,
          updatedAt: Date.now(),
        },
        merge: true,
      },
    ]);
    toast('Emplacements libérés pour cette cuvée');
    setSelectedSlot(null);
  };

  // 6. Sortir 1 bouteille pour le service (Mouvement signé + libération alvéole)
  const takeOneBottle = async (slot: CellarSlot, match: SlotMatch) => {
    if (!currentSite || !user) return;
    const { wine, stockLevel } = match;
    const norm = normalizeBin(slot.code);
    const prevBins = stockLevel.bins ?? (stockLevel.bin ? [stockLevel.bin] : []);
    const remainingBins = prevBins.filter((b) => normalizeBin(b) !== norm);
    try {
      const ops = buildMovementOps(
        orgId,
        [
          {
            wine,
            siteId: currentSite.id,
            type: 'out',
            qty: 1,
            reason: 'consommation',
            unitCostHT: wine.buyPriceHT,
            note: `Sortie service depuis ${activeRack?.name ?? 'Cave'} · ${slot.label} [${slot.code}]`,
          },
        ],
        { userId: user.uid, userName: user.name },
        Date.now(),
        stock,
      );
      await commit(
        withStockFields(ops, orgId, wine.id, currentSite.id, {
          bin: formatBinSummary(remainingBins),
          bins: remainingBins,
        }),
      );
      toast(`1 btl sortie pour le service (${wineLabel(wine)})`);
      setSelectedSlot(null);
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  };

  // 7. Supprimer le meuble actif
  const deleteActiveRack = async () => {
    if (!activeRack || !currentSite) return;
    if (
      await confirm({
        title: t('stock.deleteRack'),
        message: `Voulez-vous supprimer « ${activeRack.name} » ? Les bouteilles restent en stock mais sans emplacement affecté.`,
        confirmLabel: t('common.delete'),
        danger: true,
      })
    ) {
      const remaining = racks.filter((r) => r.id !== activeRack.id);
      await commit([
        {
          op: 'set',
          path: path('sites', currentSite.id),
          data: { layout: { racks: remaining } },
          merge: true,
        },
      ]);
      toast('Meuble supprimé');
    }
  };

  // 8. Initialisation 1-clic d'une cave complète (2 meubles + rangement auto des bouteilles du site)
  const handleInitDefaultSiteCellar = async () => {
    if (!currentSite) return;
    setAutoPlacing(true);
    try {
      const rackMain: CellarRack = {
        id: `rack-somm-${currentSite.id}`,
        siteId: currentSite.id,
        name:
          currentSite.kind === 'bar'
            ? 'Armoire Sommelier & Vins au Verre (Quinconce)'
            : 'Caveau Grands Crus & Service (Quinconce)',
        prefix: 'CAV',
        geometry: 'staggered_shelf',
        rows: 5,
        cols: 6,
        doubleDepth: true,
        staggered: true,
      };
      const rackSec: CellarRack = {
        id: `rack-trv-${currentSite.id}`,
        siteId: currentSite.id,
        name: 'Travée Gastronomique — Réserve',
        prefix: 'TRV',
        geometry: 'matrix',
        rows: 4,
        cols: 6,
        doubleDepth: true,
        staggered: false,
      };

      const slots = generateRackSlots(rackMain);
      let cursor = 0;
      const ops: Parameters<typeof commit>[0] = [
        {
          op: 'set',
          path: path('sites', currentSite.id),
          data: { layout: { racks: [rackMain, rackSec] } },
          merge: true,
        },
      ];

      for (const s of siteStock) {
        if (s.qty <= 0 || cursor >= Math.floor(slots.length * 0.8)) continue;
        const count = Math.min(s.qty, 6, slots.length - cursor);
        if (count <= 0) continue;
        const assigned = slots.slice(cursor, cursor + count).map((sl) => sl.code);
        cursor += assigned.length;
        ops.push({
          op: 'set',
          path: path('stock', s.id),
          data: {
            bin: formatBinSummary(assigned),
            bins: assigned,
            updatedAt: Date.now(),
          },
          merge: true,
        });
      }

      await commit(ops);
      setSelectedRackId(rackMain.id);
      setSelectedRow(1);
      toast(`Cave configurée avec 2 meubles et ${cursor} bouteilles rangées`);
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setAutoPlacing(false);
    }
  };

  if (!currentSite) {
    return (
      <EmptyState
        title="Aucun site de stockage"
        hint="Créez d'abord un site (cave, restaurant, boutique) dans les réglages."
      />
    );
  }

  // Construction des étages du meuble actif pour la coupe et la vue détaillée
  const rowsList = activeRack ? Array.from({ length: activeRack.rows }, (_, i) => i + 1) : [];
  const displayedRows =
    selectedRow === 'all' ? rowsList : rowsList.filter((r) => r === selectedRow);

  return (
    <div className="space-y-4">
      {/* 1. BARRE SUPÉRIEURE : Sélecteur de site, Onglets des meubles & KPIs */}
      <div className="rounded-2xl border border-border bg-surface p-3.5 sm:p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wider">
              <MapPin className="size-4 text-brand" />
              <span>Cave / Site :</span>
            </div>
            <Select
              value={currentSite.id}
              onChange={(e) => {
                setSelectedSiteId(e.target.value);
                onSelectSite?.(e.target.value);
              }}
              className="w-56 font-semibold text-sm"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.layout?.racks?.length ?? 0} meubles)
                </option>
              ))}
            </Select>

            {/* Sélecteur rapide des meubles de la cave */}
            <div className="flex flex-wrap items-center gap-1.5 pl-1">
              {racks.map((r) => {
                const rStats = computeRackStats(r, siteStock, winesById);
                const isSelected = activeRack?.id === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setSelectedRackId(r.id);
                      setSelectedRow(1);
                    }}
                    className={cx(
                      'flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium transition cursor-pointer',
                      isSelected
                        ? 'border-brand bg-brand text-brand-fg shadow-xs'
                        : 'border-border bg-surface-2/50 text-ink hover:border-brand/50 hover:bg-surface-2',
                    )}
                  >
                    <span className="font-semibold truncate max-w-[180px]">{r.name}</span>
                    <span
                      className={cx(
                        'rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold',
                        isSelected ? 'bg-black/25 text-amber-200' : 'bg-surface text-muted',
                      )}
                    >
                      {rStats.occupiedSlots}/{rStats.capacity}
                    </span>
                  </button>
                );
              })}
              {can('manager') && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Plus className="size-3.5" />}
                  onClick={() => setCreatingRack(true)}
                >
                  Ajouter un meuble
                </Button>
              )}
            </div>
          </div>

          {/* KPIs synthétiques & Actions meuble */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/40 px-3 py-1.5">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-muted block">Occupation cave</span>
                <span className="font-mono font-bold text-ink">
                  {siteStats.placedSlots} / {siteStats.totalCap} pl. ({siteStats.fillingRate}%)
                </span>
              </div>
              <span className="h-5 w-px bg-border" />
              <div>
                <span className="text-[10px] uppercase tracking-wider text-muted block">À ranger</span>
                <span
                  className={cx(
                    'font-mono font-bold',
                    siteStats.unplacedBottles > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-ok',
                  )}
                >
                  {siteStats.unplacedBottles} btl
                </span>
              </div>
            </div>

            {activeRack && siteStats.unplacedBottles > 0 && can('staff') && (
              <Button
                size="sm"
                variant="primary"
                icon={<PackagePlus className="size-3.5" />}
                onClick={handleAutoPlaceUnplaced}
                loading={autoPlacing}
                title="Range automatiquement les bouteilles sans emplacement dans les alvéoles libres de ce meuble"
              >
                Ranger auto ({siteStats.unplacedBottles} btl)
              </Button>
            )}

            {activeRack && can('manager') && (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Pencil className="size-3.5" />}
                  onClick={() => setEditingRack(activeRack)}
                  title="Configurer les dimensions, la double profondeur ou le quinconce"
                >
                  Configurer
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted hover:text-bad"
                  icon={<Trash2 className="size-3.5" />}
                  onClick={deleteActiveRack}
                  title="Supprimer ce meuble"
                />
              </div>
            )}
          </div>
        </div>

        {/* Barre de filtres Sommelier (Recherche, Couleur, Apogée, Places libres) */}
        {activeRack && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2.5 border-t border-border/60">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
              <div className="w-full sm:w-64">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Chercher cuvée, millésime (ex: Commaraine, 2019)..."
                />
              </div>

              <div className="flex flex-wrap items-center gap-1">
                {(['all', 'rouge', 'blanc', 'bulles', 'rose'] as const).map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setColorFilter(col)}
                    className={cx(
                      'px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 border',
                      colorFilter === col
                        ? 'border-brand bg-brand-soft/50 text-ink font-semibold'
                        : 'border-transparent bg-surface-2/60 text-muted hover:text-ink',
                    )}
                  >
                    {col !== 'all' && <span className={cx('size-2 rounded-full', COLOR_DOT[col])} />}
                    {col === 'all' ? 'Toutes couleurs' : BOTTLE_GLASS_STYLE[col].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setOnlyApogee((v) => !v);
                  if (!onlyApogee) setOnlyFreeSlots(false);
                }}
                className={cx(
                  'px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5',
                  onlyApogee
                    ? 'border-emerald-500/70 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'border-border bg-surface text-muted hover:text-ink',
                )}
              >
                <Sparkles className="size-3.5 text-emerald-500" />
                À l'apogée
              </button>

              <button
                type="button"
                onClick={() => {
                  setOnlyFreeSlots((v) => !v);
                  if (!onlyFreeSlots) setOnlyApogee(false);
                }}
                className={cx(
                  'px-2.5 py-1 rounded-lg text-xs font-medium border transition cursor-pointer',
                  onlyFreeSlots
                    ? 'border-brand bg-brand-soft/40 text-ink font-semibold'
                    : 'border-border bg-surface text-muted hover:text-ink',
                )}
              >
                Places libres uniquement
              </button>
            </div>
          </div>
        )}
      </div>

      {/* BANNIÈRE DE DÉPLACEMENT / PERMUTATION EN 1 CLIC */}
      {movingSlot && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-[#D4AF37] bg-[#1E1315] px-4 py-3 text-[#FDF8F0] shadow-lg">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-xl bg-[#D4AF37]/20 text-[#D4AF37]">
              <Move className="size-4" />
            </span>
            <div className="text-xs sm:text-sm">
              <span className="font-semibold text-[#D4AF37]">Mode déplacement actif :</span>{' '}
              cliquez sur n'importe quelle alvéole (libre ou occupée) pour y déplacer ou permuter{' '}
              <span className="font-semibold underline decoration-[#D4AF37]/60">
                {wineLabel(movingSlot.match.wine)}
              </span>{' '}
              <span className="font-mono text-xs text-stone-300">({movingSlot.slot.label})</span>.
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setMovingSlot(null)}
            icon={<X className="size-3.5" />}
          >
            Annuler
          </Button>
        </div>
      )}

      {/* 2. VUE PRINCIPALE : CAVE EN COUPE (GAUCHE) + ÉTAGE CIBLÉ EN GRAND AVEC GOULOTS ÉTIQUETÉS (DROITE) */}
      {!activeRack ? (
        <Card className="p-8 sm:p-12 text-center border-dashed">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-soft/40 text-brand mb-4">
            <Layers className="size-7" />
          </div>
          <h3 className="font-display text-2xl text-ink font-semibold">
            Aucun meuble configuré pour {currentSite.name}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Ajoutez un caveau Grands Crus en quinconce, une travée gastronomique ou une armoire sommelier de salle pour visualiser et piloter vos flacons.
          </p>
          {can('manager') && (
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button
                variant="primary"
                icon={<Sparkles className="size-4" />}
                onClick={handleInitDefaultSiteCellar}
                loading={autoPlacing}
              >
                Générer la cave Sommelier & ranger le stock (1 clic)
              </Button>
              <Button
                variant="secondary"
                icon={<Plus className="size-4" />}
                onClick={() => setCreatingRack(true)}
              >
                Configurer un meuble sur-mesure
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* COLONNE GAUCHE (5 col) : 🍷 CAVE EN COUPE (SÉLECTION D'ÉTAGE) */}
          <div className="lg:col-span-5 rounded-3xl border-4 border-[#2C1E1B] bg-gradient-to-b from-[#1A1311] via-[#120D0B] to-[#1A1311] p-4 shadow-xl text-[#FDFBF7]">
            {/* En-tête du meuble en chêne */}
            <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-[#3E2723]">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#D4AF37] block">
                  🍷 Cave en coupe · {activeRack.prefix}
                </span>
                <h3 className="font-display text-lg font-semibold text-[#FDFBF7] leading-tight">
                  {activeRack.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRow(selectedRow === 'all' ? 1 : 'all')}
                className={cx(
                  'px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer',
                  selectedRow === 'all'
                    ? 'bg-[#D4AF37] text-[#1A1311] border-[#D4AF37]'
                    : 'bg-[#261B18] text-stone-300 border-[#4A322C] hover:border-[#D4AF37]/60',
                )}
              >
                {selectedRow === 'all' ? '✓ Tous les étages' : 'Voir tous les étages'}
              </button>
            </div>

            {activeRack.doubleDepth && (
              <div className="grid grid-cols-2 gap-2 mb-2 px-3 text-[9px] font-bold uppercase tracking-wider text-stone-400">
                <span>👁️ Devant (1re rangée)</span>
                <span className="text-right">📦 Derrière (2e rangée)</span>
              </div>
            )}

            {/* Empilement des clayettes du meuble */}
            <div className="space-y-2.5">
              {rowsList.map((rowNum) => {
                const isSelected = selectedRow === 'all' || selectedRow === rowNum;
                const rowSlots = allRackSlots.filter((s) => s.row === rowNum);
                const rowOccupied = rowSlots.filter((s) => occupancyMap.has(normalizeBin(s.code))).length;

                const frontL1 = rowSlots.filter((s) => s.depth === 'front' && s.layer === 1);
                const frontL2 = rowSlots.filter((s) => s.depth === 'front' && s.layer === 2);
                const backL1 = rowSlots.filter((s) => s.depth === 'back' && s.layer === 1);
                const backL2 = rowSlots.filter((s) => s.depth === 'back' && s.layer === 2);

                const renderMiniShelfSide = (l1: CellarSlot[], l2: CellarSlot[]) => (
                  <div className="space-y-1 py-0.5">
                    {l2.length > 0 && (
                      <div className="flex items-center justify-center gap-1 pl-2.5">
                        {l2.map((sl) => {
                          const m = occupancyMap.get(normalizeBin(sl.code));
                          const visible = matchesBottleFilters(m);
                          return (
                            <span
                              key={sl.code}
                              className={cx(
                                'size-3 rounded-full border transition-transform',
                                m
                                  ? BOTTLE_GLASS_STYLE[m.wine.color].miniDot
                                  : 'border-stone-700/80 bg-[#1B1311]',
                                !visible && 'opacity-20',
                              )}
                            />
                          );
                        })}
                      </div>
                    )}
                    <div className="flex items-center justify-center gap-1">
                      {l1.map((sl) => {
                        const m = occupancyMap.get(normalizeBin(sl.code));
                        const visible = matchesBottleFilters(m);
                        return (
                          <span
                            key={sl.code}
                            className={cx(
                              'size-3.5 rounded-full border transition-transform',
                              m
                                ? BOTTLE_GLASS_STYLE[m.wine.color].miniDot
                                : 'border-stone-700/80 bg-[#1B1311]',
                              !visible && 'opacity-20',
                            )}
                          />
                        );
                      })}
                    </div>
                  </div>
                );

                return (
                  <button
                    key={rowNum}
                    type="button"
                    onClick={() => setSelectedRow(rowNum)}
                    className={cx(
                      'w-full text-left rounded-2xl border p-2.5 transition cursor-pointer relative overflow-hidden',
                      selectedRow === rowNum
                        ? 'border-[#D4AF37] bg-[#2B1D19] ring-2 ring-[#D4AF37]/35 shadow-md'
                        : isSelected
                          ? 'border-[#4E352F] bg-[#221714]/90 hover:border-[#D4AF37]/60'
                          : 'border-[#33221E] bg-[#18100E]/80 opacity-75 hover:opacity-100',
                    )}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-[#FDFBF7]">
                        <span className="inline-block size-2 rounded-full bg-[#D4AF37]" />
                        Étage {rowNum}
                        {activeRack.staggered && (
                          <span className="text-[9px] font-normal text-amber-200/80 bg-amber-500/15 px-1.5 py-0.2 rounded">
                            Quinconce
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-[10px] font-semibold text-[#D4AF37]">
                        {rowOccupied} / {rowSlots.length} btl
                      </span>
                    </div>

                    {activeRack.doubleDepth ? (
                      <div className="grid grid-cols-2 gap-2 items-center">
                        <div>{renderMiniShelfSide(frontL1, frontL2)}</div>
                        <div className="border-l border-dashed border-amber-500/25 pl-2">
                          {renderMiniShelfSide(backL1, backL2)}
                        </div>
                      </div>
                    ) : (
                      renderMiniShelfSide(frontL1, frontL2)
                    )}

                    {/* Clayette bois massif */}
                    <div className="mt-2 h-1.5 w-full rounded-full bg-gradient-to-r from-[#5D3A1A] via-[#A06B35] to-[#5D3A1A] shadow-inner" />
                  </button>
                );
              })}
            </div>

            {/* Pied du meuble : Bilan & Légende */}
            <div className="mt-4 pt-3 border-t border-[#3E2723] flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-300">
              <div className="flex flex-wrap items-center gap-2.5">
                {(['rouge', 'blanc', 'bulles', 'rose'] as const).map((c) => (
                  <span key={c} className="flex items-center gap-1">
                    <span className={cx('size-2.5 rounded-full border', BOTTLE_GLASS_STYLE[c].miniDot)} />
                    <span>{BOTTLE_GLASS_STYLE[c].label}</span>
                  </span>
                ))}
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-emerald-400" />
                  <span>Apogée</span>
                </span>
              </div>
              <span className="font-mono text-[#D4AF37] font-semibold">
                {activeRackStats.occupiedSlots}/{activeRackStats.capacity} ({activeRackStats.fillingRate}%)
              </span>
            </div>
          </div>

          {/* COLONNE DROITE (7 col) : ZOOM INTERACTIF DE L'ÉTAGE CIBLÉ (GOULOTS ÉTIQUETÉS MILLÉSIME + CUVÉE) */}
          <div className="lg:col-span-7 rounded-3xl border border-border bg-surface p-4 sm:p-5 shadow-xs space-y-4">
            {/* Barre de navigation d'étage et de profondeur */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
              <div className="flex flex-wrap items-center gap-1.5">
                {rowsList.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setSelectedRow(r)}
                    className={cx(
                      'px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer',
                      selectedRow === r
                        ? 'bg-brand text-brand-fg shadow-xs'
                        : 'bg-surface-2 text-muted hover:text-ink',
                    )}
                  >
                    Étage {r}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSelectedRow('all')}
                  className={cx(
                    'px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer',
                    selectedRow === 'all'
                      ? 'bg-brand text-brand-fg shadow-xs'
                      : 'bg-surface-2 text-muted hover:text-ink',
                  )}
                >
                  Tous ({activeRack.rows})
                </button>
              </div>

              {activeRack.doubleDepth && (
                <div className="flex items-center gap-1 rounded-xl border border-border bg-surface-2/60 p-1">
                  {(
                    [
                      { id: 'both', label: 'Devant + Derrière' },
                      { id: 'front', label: '👁️ Devant' },
                      { id: 'back', label: '📦 Derrière' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDepthFilter(opt.id)}
                      className={cx(
                        'px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer',
                        depthFilter === opt.id
                          ? 'bg-surface text-ink shadow-xs'
                          : 'text-muted hover:text-ink',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Rendu des étages ciblés avec goulots 3D étiquetés */}
            <div className="space-y-4 max-h-[620px] overflow-y-auto pr-1">
              {displayedRows.map((rowNum) => {
                const rowSlots = allRackSlots.filter((s) => s.row === rowNum);
                const frontL1 = rowSlots.filter((s) => s.depth === 'front' && s.layer === 1);
                const frontL2 = rowSlots.filter((s) => s.depth === 'front' && s.layer === 2);
                const backL1 = rowSlots.filter((s) => s.depth === 'back' && s.layer === 1);
                const backL2 = rowSlots.filter((s) => s.depth === 'back' && s.layer === 2);

                const showFront = !activeRack.doubleDepth || depthFilter !== 'back';
                const showBack = activeRack.doubleDepth && depthFilter !== 'front';

                const renderDetailedDepthZone = (
                  depthTitle: string,
                  depthBadge: string,
                  l1: CellarSlot[],
                  l2: CellarSlot[],
                  isBackZone: boolean,
                ) => (
                  <div
                    className={cx(
                      'rounded-2xl border p-3.5 transition',
                      isBackZone
                        ? 'border-[#3E2723]/80 bg-[#17110F] text-[#FDFBF7]'
                        : 'border-[#4A322C] bg-[#211714] text-[#FDFBF7]',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-white/10">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#D4AF37]">
                        {depthTitle}
                      </span>
                      <span className="text-[10px] font-mono text-stone-400">{depthBadge}</span>
                    </div>

                    {/* Lit supérieur en quinconce (si actif) */}
                    {l2.length > 0 && (
                      <div className="mb-2.5">
                        <div className="text-[9px] font-mono uppercase tracking-wider text-amber-300/70 mb-1.5 text-center">
                          Lit supérieur en quinconce ({l2.length} pl.)
                        </div>
                        <div className="flex flex-wrap justify-center gap-2 sm:gap-2.5 pl-4">
                          {l2.map((slot) => {
                            const match = occupancyMap.get(normalizeBin(slot.code));
                            return (
                              <BottleNeckButton
                                key={slot.code}
                                slot={slot}
                                match={match}
                                dimmed={!matchesBottleFilters(match)}
                                isMovingSource={
                                  movingSlot
                                    ? normalizeBin(movingSlot.slot.code) === normalizeBin(slot.code)
                                    : false
                                }
                                isMovingTarget={Boolean(movingSlot)}
                                onClick={() => {
                                  if (movingSlot) {
                                    handleMoveOrSwapSlot(movingSlot, slot);
                                  } else if (match) {
                                    setSelectedSlot(slot);
                                  } else {
                                    setAssigningSlot(slot);
                                    setSelectedWineToAssign(null);
                                  }
                                }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Lit principal sur clayette */}
                    <div>
                      {l2.length > 0 && (
                        <div className="text-[9px] font-mono uppercase tracking-wider text-stone-400 mb-1.5 text-center">
                          Lit principal sur clayette ({l1.length} pl.)
                        </div>
                      )}
                      <div className="flex flex-wrap justify-center gap-2 sm:gap-2.5">
                        {l1.map((slot) => {
                          const match = occupancyMap.get(normalizeBin(slot.code));
                          return (
                            <BottleNeckButton
                              key={slot.code}
                              slot={slot}
                              match={match}
                              dimmed={!matchesBottleFilters(match)}
                              isMovingSource={
                                movingSlot
                                  ? normalizeBin(movingSlot.slot.code) === normalizeBin(slot.code)
                                  : false
                              }
                              isMovingTarget={Boolean(movingSlot)}
                              onClick={() => {
                                if (movingSlot) {
                                  handleMoveOrSwapSlot(movingSlot, slot);
                                } else if (match) {
                                  setSelectedSlot(slot);
                                } else {
                                  setAssigningSlot(slot);
                                  setSelectedWineToAssign(null);
                                }
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Barre de clayette en chêne */}
                    <div className="mt-3 h-2 w-full rounded-full bg-gradient-to-r from-[#5D3A1A] via-[#9C6631] to-[#5D3A1A] shadow-inner" />
                  </div>
                );

                return (
                  <div
                    key={rowNum}
                    className="rounded-2xl border border-border/80 bg-surface-2/30 p-3.5 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-base font-bold text-ink">
                          Étage {rowNum}
                        </span>
                        {activeRack.staggered && (
                          <Badge tone="brand">Quinconce ({frontL1.length} + {frontL2.length})</Badge>
                        )}
                      </div>
                      <span className="text-xs font-mono text-muted">
                        Cliquer sur un goulot pour inspecter/permuter · « + » pour ranger
                      </span>
                    </div>

                    <div
                      className={cx(
                        'grid gap-3',
                        showFront && showBack ? 'xl:grid-cols-2' : 'grid-cols-1',
                      )}
                    >
                      {showFront &&
                        renderDetailedDepthZone(
                          '👁️ Devant (1re rangée)',
                          'Accès direct service',
                          frontL1,
                          frontL2,
                          false,
                        )}
                      {showBack &&
                        renderDetailedDepthZone(
                          '📦 Derrière (2e rangée)',
                          'Fond de clayette / Garde',
                          backL1,
                          backL2,
                          true,
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 3. TIROIR DES BOUTEILLES SANS CASIER (SI RESTANTES) */}
      {siteStats.unplacedBottles > 0 && (
        <Card className="p-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h4 className="font-display text-sm font-semibold text-ink flex items-center gap-2">
                <span className="size-2 rounded-full bg-amber-500" />
                Flacons en stock restant à placer ({siteStats.unplacedBottles} btl sur {currentSite.name})
              </h4>
              <p className="text-xs text-muted">
                Cliquez sur « Ranger auto » en haut pour les répartir en 1 clic dans le meuble actif, ou affectez-les cuvée par cuvée.
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-48 overflow-y-auto pr-1">
            {unplacedWines.map(({ wine, level, unplacedQty }) => (
              <div
                key={wine.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface p-2.5 transition hover:border-brand/40"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cx('size-2.5 rounded-full shrink-0', COLOR_DOT[wine.color])} />
                  <div className="truncate">
                    <p className="text-xs font-semibold text-ink truncate">{wineLabel(wine)}</p>
                    <p className="text-[10px] text-muted font-mono truncate">{wine.producer}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                    {unplacedQty} btl
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

      {/* MODALE D'INSPECTION D'UNE BOUTEILLE OCCUPÉE (AVEC PERMUTATION DEVANT ↔ DERRIÈRE & DÉPLACEMENT 1-CLIC) */}
      {selectedSlot &&
        activeRack &&
        (() => {
          const match = occupancyMap.get(normalizeBin(selectedSlot.code));
          if (!match) return null;
          const { wine, stockLevel, totalInRack } = match;
          const apogee = isWineAtApogee(wine);

          // Recherche de l'alvéole jumelle (Devant <-> Derrière) si double profondeur
          const twinDepth: 'front' | 'back' = selectedSlot.depth === 'front' ? 'back' : 'front';
          const twinCode = activeRack.doubleDepth
            ? buildSlotCode(activeRack, selectedSlot.row, selectedSlot.col, twinDepth, selectedSlot.layer)
            : null;
          const twinMatch = twinCode ? occupancyMap.get(normalizeBin(twinCode)) : undefined;

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
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => freeSingleSlot(selectedSlot, stockLevel)}
                      className="text-muted hover:text-bad"
                    >
                      <X className="size-3.5 mr-1" />
                      Libérer la place
                    </Button>
                    {(totalInRack ?? 0) > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => freeAllFromRack(stockLevel)}
                        className="text-muted hover:text-bad text-xs"
                      >
                        Tout libérer ({totalInRack})
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Move className="size-3.5" />}
                      onClick={() => {
                        setMovingSlot({ slot: selectedSlot, match });
                        setSelectedSlot(null);
                      }}
                    >
                      Déplacer sur le plan
                    </Button>
                    <Button
                      size="sm"
                      icon={<ArrowUpFromLine className="size-3.5" />}
                      onClick={() => takeOneBottle(selectedSlot, match)}
                    >
                      Sortir 1 btl (Service)
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<Eye className="size-3.5" />}
                      onClick={() => {
                        const id = wine.id;
                        setSelectedSlot(null);
                        if (onOpenWine) onOpenWine(id);
                        else setActiveWineId(id);
                      }}
                    >
                      Fiche vin
                    </Button>
                  </div>
                </div>
              }
            >
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-surface-2/40 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted font-mono">
                        {wine.producer}
                      </p>
                      <h3 className="font-display text-xl text-ink font-semibold mt-0.5">
                        {wine.name} {wine.vintage}
                      </h3>
                    </div>
                    {apogee ? (
                      <Badge tone="ok">✨ À l'apogée</Badge>
                    ) : (
                      <Badge tone="neutral">⏳ En garde</Badge>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
                    <span>{wine.appellation || wine.region || '—'}</span>
                    <span>·</span>
                    <span>{wine.formatCl} cl</span>
                    {wine.buyPriceHT ? (
                      <>
                        <span>·</span>
                        <span className="font-mono">PA {eur(wine.buyPriceHT)} HT</span>
                      </>
                    ) : null}
                    {wine.menuPriceTTC ? (
                      <>
                        <span>·</span>
                        <span className="font-mono text-ink font-semibold">
                          Carte {eur(wine.menuPriceTTC)} TTC
                        </span>
                      </>
                    ) : null}
                  </div>

                  <div className="mt-3 pt-3 border-t border-border/80 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-surface p-2.5 border border-border/60">
                      <span className="text-muted block text-[10px] uppercase">Dans ce meuble</span>
                      <span className="font-mono font-bold text-sm text-brand">
                        {totalInRack ?? 1} bouteille(s)
                      </span>
                    </div>
                    <div className="rounded-xl bg-surface p-2.5 border border-border/60">
                      <span className="text-muted block text-[10px] uppercase">Stock total site</span>
                      <span className="font-mono font-bold text-sm text-ink">
                        {stockLevel.qty} bouteilles
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action rapide Devant <-> Derrière si double profondeur */}
                {activeRack.doubleDepth && twinCode && (
                  <div className="rounded-2xl border border-brand/30 bg-brand-soft/15 p-3.5 flex items-center justify-between gap-3">
                    <div className="text-xs">
                      <span className="font-semibold text-ink block">
                        Position jumelle ({twinDepth === 'front' ? '👁️ Devant' : '📦 Derrière'}) :
                      </span>
                      {twinMatch ? (
                        <span className="text-muted">
                          Occupée par <strong className="text-ink">{wineLabel(twinMatch.wine)}</strong>
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          Emplacement libre ({twinCode})
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<ArrowLeftRight className="size-3.5" />}
                      onClick={() => handleSwapDepthTwin(selectedSlot, match)}
                    >
                      {twinMatch
                        ? 'Permuter Devant ↔ Derrière'
                        : twinDepth === 'front'
                          ? 'Avancer Devant'
                          : 'Passer Derrière'}
                    </Button>
                  </div>
                )}
              </div>
            </Modal>
          );
        })()}

      {/* MODALE D'AFFECTATION RAPIDE SUR UN SLOT VIDE (FLACON UNITAIRE OU LOT / CARTON) */}
      {assigningSlot && activeRack && (
        <Modal
          open
          onClose={() => {
            setAssigningSlot(null);
            setSelectedWineToAssign(null);
          }}
          title={
            selectedWineToAssign
              ? `Ranger : ${wineLabel(selectedWineToAssign)}`
              : `Ranger dans : ${assigningSlot.label} [${assigningSlot.code}]`
          }
          size="md"
          footer={
            selectedWineToAssign ? (
              <div className="flex items-center justify-between w-full">
                <Button variant="ghost" size="sm" onClick={() => setSelectedWineToAssign(null)}>
                  ← Changer de cuvée
                </Button>
                <Button
                  variant="primary"
                  icon={<Check className="size-4" />}
                  onClick={() =>
                    confirmAssign(
                      selectedWineToAssign,
                      assigningSlot,
                      assignMode === 'single' ? 1 : assignCount,
                    )
                  }
                >
                  Confirmer ({assignMode === 'single' ? '1 btl' : `${assignCount} btl`})
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
                  placeholder="Rechercher un vin en stock sur ce site..."
                />
                <div className="max-h-72 overflow-y-auto space-y-1 rounded-xl border border-border p-2">
                  {wines
                    .filter((w) => {
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
                    })
                    .map((w) => {
                      const l = siteStock.find((s) => s.wineId === w.id);
                      const unplacedItem = unplacedWines.find((u) => u.wine.id === w.id);
                      const unplacedQty = unplacedItem?.unplacedQty ?? 0;

                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => {
                            setSelectedWineToAssign(w);
                            const suggested = unplacedQty > 0 ? unplacedQty : (l?.qty ?? 1);
                            setAssignMode(suggested > 1 ? 'lot' : 'single');
                            setAssignCount(Math.min(suggested, 6));
                          }}
                          className="w-full text-left rounded-lg p-2.5 transition hover:bg-surface-2 flex items-center justify-between gap-3 cursor-pointer"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={cx('block size-2.5 rounded-full shrink-0', COLOR_DOT[w.color])}
                            />
                            <div className="truncate">
                              <p className="text-xs font-semibold text-ink truncate">{wineLabel(w)}</p>
                              <p className="text-[11px] text-muted truncate">
                                {w.producer} ·{' '}
                                {unplacedQty > 0 ? (
                                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                                    {unplacedQty} btl à ranger
                                  </span>
                                ) : (
                                  'Déjà placé'
                                )}
                              </p>
                            </div>
                          </div>
                          <span className="font-mono text-xs font-semibold shrink-0 text-ink">
                            {l?.qty ?? 0} btl
                          </span>
                        </button>
                      );
                    })}
                </div>
              </>
            ) : (
              (() => {
                const l = siteStock.find((s) => s.wineId === selectedWineToAssign.id);
                const totalStock = l?.qty ?? 1;
                const freeConsecutive = findConsecutiveFreeSlots(
                  assigningSlot,
                  activeRack,
                  totalStock,
                  occupancyMap,
                );
                const maxAvailable = Math.max(1, Math.min(totalStock, freeConsecutive.length));

                return (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border bg-surface-2/40 p-3 text-xs space-y-1">
                      <p className="text-muted font-mono uppercase">{selectedWineToAssign.producer}</p>
                      <p className="font-semibold text-ink text-sm">
                        {selectedWineToAssign.name} {selectedWineToAssign.vintage}
                      </p>
                      <p className="text-muted">
                        Stock sur site :{' '}
                        <span className="font-mono font-semibold text-ink">{totalStock} btl</span> · Places libres consécutives :{' '}
                        <span className="font-mono font-semibold text-brand">
                          {freeConsecutive.length}
                        </span>
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAssignMode('single');
                          setAssignCount(1);
                        }}
                        className={cx(
                          'p-3 rounded-xl border text-left transition cursor-pointer',
                          assignMode === 'single'
                            ? 'border-brand bg-brand-soft/30 text-ink'
                            : 'border-border bg-surface text-muted hover:text-ink',
                        )}
                      >
                        <div className="text-xs font-bold">🍾 Flacon unitaire (1 btl)</div>
                        <div className="text-[11px] text-muted mt-0.5">
                          Uniquement dans {assigningSlot.label}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setAssignMode('lot');
                          setAssignCount(Math.min(6, maxAvailable));
                        }}
                        className={cx(
                          'p-3 rounded-xl border text-left transition cursor-pointer',
                          assignMode === 'lot'
                            ? 'border-brand bg-brand-soft/30 text-ink'
                            : 'border-border bg-surface text-muted hover:text-ink',
                        )}
                      >
                        <div className="text-xs font-bold">📦 Placer un lot / carton</div>
                        <div className="text-[11px] text-muted mt-0.5">
                          Répartit dans les alvéoles libres suivantes
                        </div>
                      </button>
                    </div>

                    {assignMode === 'lot' && (
                      <div className="space-y-2 rounded-xl border border-border bg-surface-2/30 p-3">
                        <label className="text-xs font-semibold text-ink block">
                          Quantité du lot à ranger (1 bouteille par alvéole) :
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                          {[2, 3, 6, 12, maxAvailable]
                            .filter((v, idx, arr) => v <= maxAvailable && arr.indexOf(v) === idx)
                            .map((presetQty) => (
                              <button
                                key={presetQty}
                                type="button"
                                onClick={() => setAssignCount(presetQty)}
                                className={cx(
                                  'px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold transition cursor-pointer',
                                  assignCount === presetQty
                                    ? 'border-brand bg-brand text-brand-fg'
                                    : 'border-border bg-surface text-ink hover:bg-surface-2',
                                )}
                              >
                                {presetQty === maxAvailable ? `Max (${presetQty} btl)` : `${presetQty} btl`}
                              </button>
                            ))}
                          <Input
                            type="number"
                            min={1}
                            max={maxAvailable}
                            value={assignCount}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val)) setAssignCount(Math.max(1, Math.min(val, maxAvailable)));
                            }}
                            className="w-20 text-center font-mono text-xs h-8"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        </Modal>
      )}

      {/* Modales de création et modification de meuble */}
      {creatingRack && (
        <RackConfigModal site={currentSite} onClose={() => setCreatingRack(false)} />
      )}
      {editingRack && (
        <RackConfigModal
          site={currentSite}
          initialRack={editingRack}
          onClose={() => setEditingRack(null)}
        />
      )}

      {/* Popin d'assignation rapide depuis la barre des bouteilles sans casier */}
      {quickBinWine && (
        <QuickBinModal
          wine={quickBinWine.wine}
          site={currentSite}
          level={quickBinWine.level}
          onClose={() => setQuickBinWine(null)}
        />
      )}

      {/* Fiche vin complète */}
      {activeWineId && (
        <WineDrawer wineId={activeWineId} onClose={() => setActiveWineId(null)} />
      )}
    </div>
  );
}

/**
 * Goulot de bouteille 3D interactif (inspiré de l'application Thosti de Pierre & Florent)
 * Affiche simultanément le Millésime (ex: 2020) ET le nom court de la Cuvée/Domaine (ex: Commaraine, Leflaive)
 */
function BottleNeckButton({
  slot,
  match,
  dimmed,
  isMovingSource,
  isMovingTarget,
  onClick,
}: {
  slot: CellarSlot;
  match?: SlotMatch;
  dimmed?: boolean;
  isMovingSource?: boolean;
  isMovingTarget?: boolean;
  onClick: () => void;
}) {
  if (match) {
    const { wine } = match;
    const style = BOTTLE_GLASS_STYLE[wine.color] ?? BOTTLE_GLASS_STYLE.rouge;
    const shortName = getShortWineNeckLabel(wine);
    const vintageLabel = wine.vintage || 'NM';
    const apogee = isWineAtApogee(wine);
    const isPrestige =
      (wine.buyPriceHT ?? 0) >= 95 || /grand cru|1er cru|premier cru|clos/i.test(wine.name);

    return (
      <button
        type="button"
        onClick={onClick}
        style={{ background: style.bg }}
        className={cx(
          'group relative size-13 sm:size-14 rounded-full border-2 shadow-md transition-all flex flex-col items-center justify-center p-1 cursor-pointer select-none',
          style.ring,
          dimmed && 'opacity-25 scale-95',
          isMovingSource && 'ring-4 ring-[#D4AF37] scale-105 animate-pulse',
          isMovingTarget && !isMovingSource && 'hover:ring-2 hover:ring-[#D4AF37]',
          !dimmed && 'hover:scale-105 hover:shadow-lg',
        )}
        title={`${wine.producer} · ${wine.name} ${wine.vintage} — ${slot.label} [${slot.code}]`}
      >
        {/* Reflet de verre supérieur */}
        <span
          className="pointer-events-none absolute top-1 left-2.5 h-2 w-4 rounded-full bg-white/20 blur-[0.5px] -rotate-12"
          aria-hidden="true"
        />

        {/* Capsule centrale métallisée (Millésime + Nom court) */}
        <span
          className={cx(
            'font-mono text-[10px] font-extrabold leading-none tracking-tight drop-shadow-xs',
            style.text,
          )}
        >
          {vintageLabel}
        </span>
        <span
          className={cx(
            'mt-0.5 max-w-[46px] truncate text-[8.5px] font-semibold leading-tight tracking-tight',
            style.subtext,
          )}
        >
          {shortName}
        </span>

        {/* Pastille Émeraude si à l'apogée */}
        {apogee && (
          <span
            className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-400 border-2 border-[#1A1311] shadow-xs"
            title="À l'apogée"
          />
        )}

        {/* Étoile Or si Grand Cru / Prestige */}
        {isPrestige && (
          <span
            className="absolute -top-1 -right-0.5 text-[10px] text-[#FFD700] drop-shadow"
            title="Grand Cru / Cuvée Prestige"
          >
            ★
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'group size-13 sm:size-14 rounded-full border border-dashed transition flex flex-col items-center justify-center cursor-pointer',
        isMovingTarget
          ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#D4AF37] hover:bg-[#D4AF37]/30 scale-105'
          : 'border-stone-600/70 bg-black/25 text-stone-500 hover:border-[#D4AF37]/80 hover:text-[#D4AF37] hover:bg-black/40',
        dimmed && 'opacity-25',
      )}
      title={`${slot.label} [${slot.code}] — Place libre (Cliquer pour ranger)`}
    >
      <Plus className="size-3.5" />
      <span className="text-[8px] font-mono mt-0.5 opacity-75">
        {slot.layer === 2 ? `Q${slot.col}` : `P${slot.col}`}
      </span>
    </button>
  );
}
