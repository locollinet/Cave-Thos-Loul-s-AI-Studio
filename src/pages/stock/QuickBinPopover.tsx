import { useState } from 'react';
import { EyeOff, MapPin, SlidersHorizontal, X } from 'lucide-react';
import type { CellarRack, Site, StockLevel, Wine } from '@/types';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Button, Field, Input, Modal, Select, useToast } from '@/ui';
import { stockId } from '@/data/stock';
import { DELETE_FIELD } from '@/data/sentinels';
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
  const { wines, stock, commit, path, can } = useOrg();
  const [busy, setBusy] = useState(false);
  const [customBin, setCustomBin] = useState(level?.bin ?? '');
  const [selectedSlot, setSelectedSlot] = useState(level?.bin ?? '');
  const [siteAlertThreshold, setSiteAlertThreshold] = useState<string>(
    level?.alertThreshold !== undefined ? String(level.alertThreshold) : '',
  );
  const [siteMenuPriceTTC, setSiteMenuPriceTTC] = useState<string>(
    level?.menuPriceTTC !== undefined ? String(level.menuPriceTTC) : '',
  );
  const [siteByGlass, setSiteByGlass] = useState<'inherit' | 'yes' | 'no'>(
    level?.byGlass === true ? 'yes' : level?.byGlass === false ? 'no' : 'inherit',
  );
  const [hiddenOnSite, setHiddenOnSite] = useState<boolean>(!!level?.hiddenOnSite);

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
      const parsedThreshold = siteAlertThreshold.trim() !== '' ? Math.max(0, Number(siteAlertThreshold)) : undefined;
      const parsedMenuPrice = siteMenuPriceTTC.trim() !== '' ? Math.max(0, Number(siteMenuPriceTTC)) : undefined;
      const parsedByGlass = siteByGlass === 'yes' ? true : siteByGlass === 'no' ? false : undefined;

      // Ne touche jamais à la quantité d'une ligne existante (un mouvement concurrent l'aurait écrasée).
      const overrides = {
        alertThreshold: parsedThreshold !== undefined && !Number.isNaN(parsedThreshold) ? parsedThreshold : level?.alertThreshold !== undefined ? DELETE_FIELD : undefined,
        menuPriceTTC: parsedMenuPrice !== undefined && !Number.isNaN(parsedMenuPrice) ? parsedMenuPrice : level?.menuPriceTTC !== undefined ? DELETE_FIELD : undefined,
        byGlass: parsedByGlass !== undefined ? parsedByGlass : level?.byGlass !== undefined ? DELETE_FIELD : undefined,
        hiddenOnSite: hiddenOnSite ? true : level?.hiddenOnSite ? DELETE_FIELD : undefined,
      };
      const cleanOverrides = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined));

      const data = level
        ? { bin: cleanBin || DELETE_FIELD, ...cleanOverrides, updatedAt: Date.now() }
        : {
            id: sid,
            wineId: wine.id,
            siteId: site.id,
            qty: 0,
            ...(cleanBin ? { bin: cleanBin } : {}),
            ...(parsedThreshold !== undefined && !Number.isNaN(parsedThreshold) ? { alertThreshold: parsedThreshold } : {}),
            ...(parsedMenuPrice !== undefined && !Number.isNaN(parsedMenuPrice) ? { menuPriceTTC: parsedMenuPrice } : {}),
            ...(parsedByGlass !== undefined ? { byGlass: parsedByGlass } : {}),
            ...(hiddenOnSite ? { hiddenOnSite: true } : {}),
            updatedAt: Date.now(),
          };
      await commit([{ op: 'set', path: path('stock', sid), data, merge: true }]);
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

        {can('sommelier') && (
          <div className="rounded-xl border border-border bg-surface-2/30 p-3.5 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
              <SlidersHorizontal className="size-3.5 text-brand" />
              <span>Règles & tarifs spécifiques à « {site.name} » (optionnel)</span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Prix carte TTC sur ce site (€)">
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  value={siteMenuPriceTTC}
                  onChange={(e) => setSiteMenuPriceTTC(e.target.value)}
                  placeholder={wine.menuPriceTTC !== undefined ? `Défaut : ${wine.menuPriceTTC} €` : 'Ex: 95'}
                />
              </Field>
              <Field label="Seuil d'alerte sur ce site (btl)">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={siteAlertThreshold}
                  onChange={(e) => setSiteAlertThreshold(e.target.value)}
                  placeholder={`Défaut : ${wine.alertThreshold ?? 0} btl`}
                />
              </Field>
            </div>

            <Field label="Service au verre sur ce site">
              <Select
                value={siteByGlass}
                onChange={(e) => setSiteByGlass(e.target.value as 'inherit' | 'yes' | 'no')}
              >
                <option value="inherit">
                  Par défaut ({wine.byGlass?.enabled ? 'Activé sur la fiche vin' : 'Non servi au verre'})
                </option>
                <option value="yes">🥂 Servi au verre sur ce site (ex: Bar / Bistrot)</option>
                <option value="no">🍾 Bouteille uniquement sur ce site (ex: Table Gastro)</option>
              </Select>
            </Field>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/70 bg-surface p-2.5 text-xs">
              <input
                type="checkbox"
                checked={hiddenOnSite}
                onChange={(e) => setHiddenOnSite(e.target.checked)}
                className="mt-0.5 size-4 accent-brand"
              />
              <span>
                <span className="flex items-center gap-1 font-medium text-ink">
                  <EyeOff className="size-3.5 text-muted" />
                  Cave de garde (masquer du mode Service en salle sur ce site)
                </span>
                <span className="mt-0.5 block text-[11px] text-muted">
                  Empêche les serveurs de déstocker ce flacon par erreur depuis l'écran Service de ce site.
                </span>
              </span>
            </label>
          </div>
        )}
      </div>
    </Modal>
  );
}
