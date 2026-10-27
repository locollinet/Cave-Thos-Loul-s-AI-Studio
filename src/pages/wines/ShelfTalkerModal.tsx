import { useState } from 'react';
import { Check, Layers, Printer, Tag, Wine as WineIcon } from 'lucide-react';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Badge, Button, Modal, cx } from '@/ui';
import { eur, round2 } from '@/lib/utils';
import { formatLabel, wineLabel } from '@/lib/wine';
import type { Wine } from '@/types';

export interface ShelfTalkerModalProps {
  open: boolean;
  onClose: () => void;
  wines: Wine[];
  initialWine?: Wine;
}

const PRINT_SHELF_CSS = `
@media print {
  @page { size: A4 portrait; margin: 10mm; }
  body * { visibility: hidden; }
  .shelf-print-container, .shelf-print-container * { visibility: visible; }
  .shelf-print-container {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    margin: 0;
    padding: 0;
  }
  .shelf-grid {
    display: grid !important;
    grid-template-columns: repeat(2, 1fr) !important;
    gap: 12mm !important;
  }
  .shelf-card {
    page-break-inside: avoid !important;
    border: 1px dashed #999 !important;
    box-shadow: none !important;
  }
}
`;

export function ShelfTalkerModal({ open, onClose, wines, initialWine }: ShelfTalkerModalProps) {
  const { org } = useOrg();
  const { intl } = useI18n();

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    initialWine ? [initialWine.id] : wines.slice(0, 6).map((w) => w.id),
  );

  const selectedWines = wines.filter((w) => selectedIds.includes(w.id));
  const defaultVatRate = org.defaultVatRate || 20;

  const toggleWine = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter((x) => x !== id) : prev) : [...prev, id],
    );
  };

  const selectAll = () => setSelectedIds(wines.slice(0, 12).map((w) => w.id));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Tag className="size-5 text-brand" />
          <span>Générateur d’Étiquettes de Rayon &amp; Stop-Rayons</span>
        </span>
      }
      size="xl"
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-xs text-muted">
            {selectedWines.length} étiquette{selectedWines.length > 1 ? 's' : ''} sélectionnée{selectedWines.length > 1 ? 's' : ''} (4 par page A4)
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Fermer
            </Button>
            <Button variant="primary" icon={<Printer className="size-4" />} onClick={() => window.print()}>
              Imprimer les étiquettes
            </Button>
          </div>
        </div>
      }
    >
      <style>{PRINT_SHELF_CSS}</style>

      <div className="space-y-5">
        {/* Barre d'outils et sélection */}
        <div className="no-print rounded-xl border border-border bg-surface-2/40 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-ink">Sélection des références à imprimer :</div>
              <p className="text-[11px] text-muted">Cliquez pour ajouter ou retirer des flacons de la planche d’impression.</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={selectAll}>
                Sélectionner les 12 premiers
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pt-1">
            {wines.map((w) => {
              const isSelected = selectedIds.includes(w.id);
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => toggleWine(w.id)}
                  className={cx(
                    'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition cursor-pointer',
                    isSelected
                      ? 'bg-brand text-brand-fg font-medium shadow-xs'
                      : 'border border-border bg-surface text-muted hover:border-brand/40 hover:text-ink',
                  )}
                >
                  <span>{w.producer} — {w.name} {w.vintage}</span>
                  {isSelected && <Check className="size-3" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Aperçu de la planche d'étiquettes A4 (2 colonnes) */}
        <div className="shelf-print-container">
          <div className="shelf-grid grid gap-4 sm:grid-cols-2">
            {selectedWines.map((w) => {
              const priceHT = w.sellPriceHT || round2((w.buyPriceHT || 10) * (org.defaultCoefficient || 1.6));
              const priceTTC = round2(priceHT * (1 + defaultVatRate / 100));

              return (
                <article
                  key={w.id}
                  className="shelf-card relative flex flex-col justify-between rounded-xl border-2 border-border/80 bg-surface p-5 text-ink shadow-xs"
                >
                  {/* En-tête stop-rayon */}
                  <div>
                    <div className="flex items-start justify-between gap-2 border-b border-border/60 pb-2">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand">
                          {w.producer}
                        </div>
                        <h3 className="font-display text-xl font-bold leading-tight mt-0.5">
                          {w.name}
                        </h3>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="rounded-md bg-brand-soft px-2 py-0.5 font-display text-lg font-bold text-brand">
                          {w.vintage}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <span className="font-semibold text-ink">{w.region || w.appellation || 'Vignoble de France'}</span>
                      {w.appellation && w.region && <span>· {w.appellation}</span>}
                      <span>· {formatLabel(w.formatCl)}</span>
                    </div>

                    {w.grapes && (
                      <p className="mt-1 text-xs italic text-muted">
                        Cépages : {w.grapes}
                      </p>
                    )}

                    {/* Accords & dégustation */}
                    <div className="mt-3 rounded-lg bg-surface-2/60 p-2.5 text-xs text-neutral-700 dark:text-neutral-300">
                      <div className="font-semibold text-[11px] uppercase tracking-wider text-muted">Profil &amp; Dégustation</div>
                      <p className="mt-0.5 line-clamp-2 text-xs">
                        {w.technicalSheet?.bouche || w.technicalSheet?.nez || w.notes || 'Arômes expressifs, bel équilibre et matière soyeuse en bouche.'}
                      </p>
                      {w.technicalSheet?.accords && (
                        <p className="mt-1 text-[11px] text-muted">
                          <strong>Accords :</strong> {w.technicalSheet.accords}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Bas de stop-rayon : Prix TTC & Fiche */}
                  <div className="mt-4 flex items-end justify-between border-t border-border/60 pt-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted">Prix unitaire TTC</div>
                      <div className="font-display text-2xl font-extrabold text-brand">
                        {eur(priceTTC, org.currency, intl)}
                      </div>
                      <div className="text-[10px] text-muted">
                        {eur(priceHT, org.currency, intl)} HT · TVA {defaultVatRate}%
                      </div>
                    </div>

                    {/* QR Code simulé & Branding */}
                    <div className="text-right flex flex-col items-end">
                      <div className="grid size-11 place-items-center rounded border border-border bg-white text-black p-1">
                        <div className="grid grid-cols-3 gap-0.5 size-full">
                          <div className="bg-black" /><div className="bg-black" /><div className="bg-black" />
                          <div className="bg-black" /><div className="bg-transparent" /><div className="bg-black" />
                          <div className="bg-black" /><div className="bg-black" /><div className="bg-black" />
                        </div>
                      </div>
                      <span className="text-[9px] uppercase tracking-wider text-muted mt-0.5">
                        Fiche cuvée
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
