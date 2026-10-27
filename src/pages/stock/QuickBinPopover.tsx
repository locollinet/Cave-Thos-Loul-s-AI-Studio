import { useState } from 'react';
import { Check, MapPin, X } from 'lucide-react';
import type { CellarRack, Site, StockLevel, Wine } from '@/types';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Button, Input, Modal, Select, useToast } from '@/ui';
import { stockId } from '@/data/stock';
import { generateRackSlots, matchSlotToStock } from '@/lib/cellar';
import { wineLabel } from '@/lib/wine';

export function QuickBinModal({
  wine,
  site,
  level,
  onClose,
}: {
  wine: Wine;
  site: Site;
  level?: StockLevel;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { wines, stock, commit, path } = useOrg();
  const [busy, setBusy] = useState(false);
  const [customBin, setCustomBin] = useState(level?.bin ?? '');
  const [selectedSlot, setSelectedSlot] = useState(level?.bin ?? '');

  const racks: CellarRack[] = site.layout?.racks ?? [];
  const winesById = new Map(wines.map((w) => [w.id, w]));
  const siteStock = stock.filter((s) => s.siteId === site.id);

  // Calcule les slots libres par meuble
  const rackOptions = racks.map((rack) => {
    const slots = generateRackSlots(rack);
    const available = slots.map((s) => {
      const match = matchSlotToStock(s, rack, siteStock, winesById);
      const isCurrent = level?.bin && s.code === level.bin;
      return {
        ...s,
        occupiedBy: match ? wineLabel(match.wine) : null,
        isCurrent,
      };
    });
    return { rack, slots: available };
  });

  const save = async (binToSave: string) => {
    setBusy(true);
    try {
      const sid = stockId(wine.id, site.id);
      const cleanBin = binToSave.trim();
      await commit([
        {
          op: 'set',
          path: path('stock', sid),
          data: {
            id: sid,
            wineId: wine.id,
            siteId: site.id,
            qty: level?.qty ?? 0,
            bin: cleanBin || undefined,
            updatedAt: Date.now(),
          },
          merge: true,
        },
      ]);
      toast(t('common.saved'));
      onClose();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <MapPin className="size-4 text-brand" />
          <span>{t('stock.quickBinTitle')}</span>
        </div>
      }
      size="md"
      footer={
        <div className="flex items-center justify-between w-full">
          {level?.bin ? (
            <Button variant="ghost" size="sm" onClick={() => save('')} disabled={busy} className="text-muted hover:text-bad">
              <X className="size-3.5 mr-1" />
              Retirer l'emplacement
            </Button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={() => save(selectedSlot || customBin)} disabled={busy} loading={busy}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-surface-2/40 p-3">
          <p className="text-xs text-muted">{site.name}</p>
          <p className="font-medium text-ink">{wineLabel(wine)}</p>
          <p className="text-xs text-muted mt-0.5">
            Stock disponible : <span className="font-semibold text-ink">{level?.qty ?? 0} bouteilles</span>
            {level?.bin && (
              <> · Emplacement actuel : <span className="font-mono text-brand font-medium">{level.bin}</span></>
            )}
          </p>
        </div>

        {racks.length > 0 ? (
          <div>
            <label className="text-xs font-semibold text-ink block mb-2">Choisir une alvéole ou clayette configurée</label>
            <Select
              value={selectedSlot}
              onChange={(e) => {
                setSelectedSlot(e.target.value);
                setCustomBin(e.target.value);
              }}
            >
              <option value="">-- Sélectionner un casier / clayette libre --</option>
              {rackOptions.map(({ rack, slots }) => (
                <optgroup key={rack.id} label={`${rack.name} (${rack.prefix ?? 'Rack'})`}>
                  {slots.map((s) => (
                    <option
                      key={s.code}
                      value={s.code}
                      disabled={Boolean(s.occupiedBy && !s.isCurrent)}
                    >
                      {s.label} [{s.code}]
                      {s.isCurrent ? ' ✓ (Actuel)' : s.occupiedBy ? ` ⚠️ Occupé (${s.occupiedBy})` : ' — Libre'}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
        ) : null}

        <div>
          <label className="text-xs font-semibold text-ink block mb-1">
            Ou saisie libre / code personnalisé
          </label>
          <Input
            value={customBin}
            onChange={(e) => {
              setCustomBin(e.target.value);
              setSelectedSlot(e.target.value);
            }}
            placeholder="Ex: Armoire 1 · Clayette 3 (Av), Casier A12, Étagère haute..."
          />
          <p className="text-[11px] text-muted mt-1">
            Astuce : vous pouvez entrer n'importe quel repère personnalisé ou sélectionner une alvéole dans le plan de cave.
          </p>
        </div>
      </div>
    </Modal>
  );
}
