import { useMemo, useState } from 'react';
import { Box, Check, Droplets, Grid, Plus, Search, Sparkles, Thermometer, Wine as WineIcon } from 'lucide-react';
import type { CellarRack, RareBottle, StockLevel, Wine } from '@/types';
import { useCollection, useOrg } from '@/app/org';
import {
  buildRackMatrix,
  calculateRackStats,
  inferDefaultRacks,
  type CellarSlotCell,
} from '@/lib/cellar';
import { Badge, Button, cx } from '@/ui';
import { CellarRack2D } from './CellarRack2D';
import { CellarScene3D } from './CellarScene3D';
import { RackFormModal } from './RackFormModal';

interface CellarMapProps {
  onOpenWine: (wineId: string) => void;
}

export function CellarMap({ onOpenWine }: CellarMapProps) {
  const { stock, wines, activeSiteId, sites } = useOrg();
  const { rows: customRacks } = useCollection<CellarRack>('racks');
  const { rows: rareBottles } = useCollection<RareBottle>('bottles');

  const [mode, setMode] = useState<'2d' | '3d'>('2d');
  const [selectedRackId, setSelectedRackId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [emptyOnly, setEmptyOnly] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Casiers disponibles : custom ou déduits du stock existant
  const racks = useMemo(() => {
    if (customRacks.length > 0) {
      return activeSiteId === 'all'
        ? customRacks
        : customRacks.filter((r) => r.siteId === activeSiteId || r.siteId === 'all');
    }
    return inferDefaultRacks(stock, activeSiteId);
  }, [customRacks, stock, activeSiteId]);

  const activeRack = useMemo(() => {
    return racks.find((r) => r.id === selectedRackId) ?? racks[0];
  }, [racks, selectedRackId]);

  // Matrice des alvéoles pour le casier actif
  const matrix = useMemo(() => {
    if (!activeRack) return [];
    return buildRackMatrix(activeRack, stock, wines, rareBottles, activeSiteId);
  }, [activeRack, stock, wines, rareBottles, activeSiteId]);

  const stats = useMemo(() => calculateRackStats(matrix), [matrix]);

  return (
    <div className="space-y-4">
      {/* Barre de commande et sélection de casier */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        {/* Sélecteur de casier / meuble */}
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="rack-select" className="text-xs font-medium uppercase tracking-wider text-muted">
            Meuble :
          </label>
          <select
            id="rack-select"
            value={activeRack?.id ?? ''}
            onChange={(e) => setSelectedRackId(e.target.value)}
            className="rounded-xl border border-border bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink focus:border-brand focus:outline-none"
          >
            {racks.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.rows}×{r.cols})
              </option>
            ))}
          </select>

          {/* Indicateurs d'ambiance cave (température et hygrométrie) */}
          {activeRack?.temperatureC && (
            <div className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted">
              <Thermometer className="size-3.5 text-amber-500" />
              <span>{activeRack.temperatureC}°C</span>
            </div>
          )}
          {activeRack?.humidityPct && (
            <div className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted">
              <Droplets className="size-3.5 text-blue-400" />
              <span>{activeRack.humidityPct}% HR</span>
            </div>
          )}

          <Button
            size="sm"
            variant="ghost"
            icon={<Plus className="size-3.5" />}
            onClick={() => setModalOpen(true)}
          >
            Nouveau casier
          </Button>
        </div>

        {/* Contrôles de vue (2D / 3D) et recherche */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Recherche visuelle */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Chercher cuvée ou alvéole (ex: A4)..."
              className="h-9 w-52 rounded-xl border border-border bg-surface-2 pl-9 pr-3 text-xs placeholder:text-muted focus:border-brand focus:outline-none focus:w-64 transition-all"
            />
          </div>

          {/* Filtre alvéoles libres */}
          <button
            type="button"
            onClick={() => setEmptyOnly(!emptyOnly)}
            className={cx(
              'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors',
              emptyOnly
                ? 'border-emerald-600 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-border bg-surface-2 text-muted hover:text-ink',
            )}
          >
            <span>Places libres</span>
            {emptyOnly && <Check className="size-3.5" />}
          </button>

          {/* Bascule 2D / 3D */}
          <div className="flex rounded-xl border border-border bg-surface-2 p-0.5">
            <button
              type="button"
              onClick={() => setMode('2d')}
              className={cx(
                'flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all',
                mode === '2d'
                  ? 'bg-brand text-brand-fg shadow-sm'
                  : 'text-muted hover:text-ink',
              )}
            >
              <Grid className="size-3.5" />
              <span>Casiers 2D</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('3d')}
              className={cx(
                'flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all',
                mode === '3d'
                  ? 'bg-brand text-brand-fg shadow-sm'
                  : 'text-muted hover:text-ink',
              )}
            >
              <Box className="size-3.5" />
              <span>Immersion 3D</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bandeau statistique de remplissage du casier */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/60 bg-surface/50 px-4 py-2 text-xs text-muted">
        <div className="flex items-center gap-4">
          <div>
            Capacité : <span className="font-semibold text-ink">{stats.totalSlots} alvéoles</span>
          </div>
          <div>
            Occupées : <span className="font-semibold text-amber-500">{stats.occupiedSlots}</span>
          </div>
          <div>
            Disponibles : <span className="font-semibold text-emerald-500">{stats.emptySlots}</span>
          </div>
          <div>
            Total stocké : <span className="font-semibold text-ink">{stats.totalBottles} bouteilles</span>
          </div>
        </div>

        {/* Barre de progression du taux d'occupation */}
        <div className="flex items-center gap-2">
          <span>Remplissage : {stats.fillPct}%</span>
          <div className="h-2 w-28 overflow-hidden rounded-full bg-surface-2 border border-border">
            <div
              className="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-500"
              style={{ width: `${stats.fillPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Rendu visuel 2D ou 3D */}
      {activeRack && matrix.length > 0 ? (
        mode === '2d' ? (
          <CellarRack2D
            matrix={matrix}
            highlightQuery={search}
            emptyOnly={emptyOnly}
            onSelectWine={(w) => onOpenWine(w.id)}
          />
        ) : (
          <CellarScene3D
            matrix={matrix}
            highlightQuery={search}
            emptyOnly={emptyOnly}
            onSelectWine={(w) => onOpenWine(w.id)}
          />
        )
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted">
          <WineIcon className="mx-auto size-8 opacity-40 mb-2" />
          <p>Aucun casier configuré pour cet emplacement.</p>
        </div>
      )}

      {/* Modal de création de casier */}
      {modalOpen && <RackFormModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}
