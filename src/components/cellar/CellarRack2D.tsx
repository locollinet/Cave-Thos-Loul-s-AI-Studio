import { useState } from 'react';
import { Eye, Plus, Sparkles, Wine as WineIcon } from 'lucide-react';
import type { CellarSlotCell } from '@/lib/cellar';
import { COLOR_DOT } from '@/pages/Wines';
import { Badge, Button, cx } from '@/ui';
import { eur } from '@/lib/utils';
import { formatLabel } from '@/lib/wine';
import type { Wine } from '@/types';

interface CellarRack2DProps {
  matrix: CellarSlotCell[][];
  highlightQuery: string;
  emptyOnly: boolean;
  onSelectWine: (wine: Wine) => void;
  onSlotClick?: (cell: CellarSlotCell) => void;
}

export function CellarRack2D({
  matrix,
  highlightQuery,
  emptyOnly,
  onSelectWine,
  onSlotClick,
}: CellarRack2DProps) {
  const [hoveredCell, setHoveredCell] = useState<CellarSlotCell | null>(null);

  const cols = matrix[0]?.length ?? 6;

  return (
    <div className="relative overflow-x-auto rounded-2xl border border-amber-950/40 bg-gradient-to-b from-[#181311] via-[#1f1815] to-[#161210] p-6 shadow-2xl text-amber-100">
      {/* Finition décorative en laiton et texture bois */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-amber-600/30 to-transparent" />

      {/* Grille des casiers */}
      <div className="inline-block min-w-full">
        {/* En-tête des colonnes */}
        <div className="mb-3 grid gap-3 pl-12" style={{ gridTemplateColumns: `repeat(${cols}, minmax(4.5rem, 1fr))` }}>
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="text-center font-mono text-xs uppercase tracking-widest text-amber-500/60">
              Col {c + 1}
            </div>
          ))}
        </div>

        {/* Rangées */}
        <div className="space-y-3">
          {matrix.map((row, r) => (
            <div key={r} className="flex items-center gap-3">
              {/* Libellé de rangée */}
              <div className="w-9 shrink-0 text-right font-mono text-xs font-semibold uppercase tracking-wider text-amber-500/70">
                R{r + 1}
              </div>

              {/* Alvéoles de la rangée */}
              <div className="grid flex-1 gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(4.5rem, 1fr))` }}>
                {row.map((cell) => {
                  const isMatch = highlightQuery.trim() !== '' && cell.isOccupied;
                  const isDimmed =
                    (emptyOnly && cell.isOccupied) ||
                    (highlightQuery.trim() !== '' && !isMatch);

                  const firstWine = cell.wines[0]?.wine;
                  const total = cell.totalQty;
                  const colorDot = firstWine ? COLOR_DOT[firstWine.color] ?? 'bg-amber-600' : '';

                  return (
                    <div
                      key={cell.binCode}
                      onMouseEnter={() => setHoveredCell(cell)}
                      onMouseLeave={() => setHoveredCell((prev) => (prev?.binCode === cell.binCode ? null : prev))}
                      onClick={() => {
                        if (firstWine) onSelectWine(firstWine);
                        else onSlotClick?.(cell);
                      }}
                      className={cx(
                        'group relative aspect-square cursor-pointer rounded-xl border p-2 transition-all duration-300',
                        'flex flex-col items-center justify-between',
                        cell.isOccupied
                          ? 'border-amber-800/40 bg-gradient-to-b from-[#251d18] to-[#1a1411] shadow-inner hover:border-amber-500/60 hover:shadow-[0_0_20px_rgba(217,119,6,0.25)]'
                          : 'border-dashed border-amber-900/30 bg-[#140f0d]/60 hover:border-amber-600/40 hover:bg-[#1a1411]',
                        isDimmed && 'opacity-25 grayscale-[60%]',
                        isMatch && 'ring-2 ring-amber-400 shadow-[0_0_25px_rgba(245,158,11,0.4)] scale-[1.03] z-10',
                      )}
                    >
                      {/* Code d'alvéole en filigrane */}
                      <span className="w-full text-left font-mono text-[10px] text-amber-500/40 group-hover:text-amber-400/80">
                        {cell.binCode}
                      </span>

                      {/* Représentation visuelle du culot de bouteille ou état vide */}
                      {cell.isOccupied && firstWine ? (
                        <div className="relative my-auto flex size-11 items-center justify-center rounded-full border border-amber-500/40 bg-gradient-to-tr from-black via-[#1f1916] to-[#3a2d24] shadow-md transition-transform group-hover:scale-110">
                          {/* Pastille de couleur de vin */}
                          <div className={cx('size-5 rounded-full shadow-inner ring-1 ring-white/20', colorDot)} />
                          {/* Reflet de verre */}
                          <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/10 to-transparent" />
                          {/* Flacon d'exception */}
                          {firstWine.isExceptional && (
                            <Sparkles className="absolute -right-1 -top-1 size-3.5 text-amber-300 animate-pulse" />
                          )}
                        </div>
                      ) : (
                        <div className="my-auto flex size-9 items-center justify-center rounded-full border border-dashed border-amber-900/40 text-amber-800 transition-colors group-hover:border-amber-500/50 group-hover:text-amber-500">
                          <Plus className="size-4" />
                        </div>
                      )}

                      {/* Pied de case : Quantité ou millésime */}
                      <div className="w-full text-center">
                        {cell.isOccupied ? (
                          <span className="truncate block font-mono text-[11px] font-medium text-amber-200">
                            {total > 1 ? `${total} btl` : firstWine?.vintage ?? '1 btl'}
                          </span>
                        ) : (
                          <span className="text-[10px] uppercase tracking-wider text-amber-900/70 group-hover:text-amber-600/70">
                            Libre
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip flottant au survol */}
      {hoveredCell && hoveredCell.isOccupied && hoveredCell.wines[0] && (
        <div className="pointer-events-none fixed bottom-8 right-8 z-50 w-80 rounded-2xl border border-amber-600/40 bg-[#161210]/95 p-4 shadow-2xl backdrop-blur-md">
          <div className="text-[10px] font-mono uppercase tracking-widest text-amber-400">
            Alvéole {hoveredCell.binCode} · {hoveredCell.label}
          </div>
          {hoveredCell.wines.map(({ wine, qty }, i) => (
            <div key={i} className="mt-2 border-t border-amber-950/60 pt-2 first:mt-0 first:border-0 first:pt-0">
              <div className="text-xs uppercase tracking-wider text-amber-400/80">{wine.producer}</div>
              <div className="font-display text-lg text-white leading-tight mt-0.5">{wine.name}</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-amber-200/80">
                <span className="font-semibold text-amber-300">{wine.vintage}</span>
                <span>·</span>
                <span>{formatLabel(wine.formatCl)}</span>
                <span>·</span>
                <span className="font-mono text-emerald-400 font-medium">{qty} en stock</span>
              </div>
              {wine.sellPriceHT && (
                <div className="mt-2 text-xs text-amber-500/90">
                  Prix de vente : <span className="font-semibold text-white">{eur(wine.sellPriceHT)} HT</span>
                </div>
              )}
            </div>
          ))}
          <div className="mt-3 text-[10px] text-amber-400/60 flex items-center gap-1">
            <Eye className="size-3" /> Cliquer pour ouvrir la fiche complète du vin
          </div>
        </div>
      )}
    </div>
  );
}
