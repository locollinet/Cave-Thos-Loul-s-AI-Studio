import { useMemo, useState } from 'react';
import type { Producer, Wine, WineColor } from '@/types';
import { WINE_COLORS } from '@/types';
import { useOrg } from '@/app/org';
import { useT } from '@/i18n';
import { Button, Checkbox, Field, Input, Modal, NumberInput, Select, Textarea, useToast } from '@/ui';
import { canonicalKey, formatLabel } from '@/lib/wine';
import { round2, uid, ttcFromHt } from '@/lib/utils';
import { wineImageSetOps } from '@/lib/image';
import type { Op } from '@/data/store';
import { LabelScan, type LabelFormField, type PendingPhoto } from '@/components/WinePhotoLabel';

const FORMATS = [37.5, 75, 150, 300, 600];

export function effectiveCoefficient(wine: Pick<Wine, 'coefficient'>, producer: Producer | undefined, orgDefault: number): number {
  return wine.coefficient ?? producer?.coefficient ?? orgDefault;
}

export function WineFormModal({ wine, onClose, onSaved }: { wine?: Wine; onClose: () => void; onSaved?: (w: Wine) => void }) {
  const t = useT();
  const { toast } = useToast();
  const { org, producers, wines, commit, path, can, member } = useOrg();
  const [f, setF] = useState<Wine>(
    () =>
      wine ?? {
        id: uid(),
        producer: '',
        name: '',
        vintage: String(new Date().getFullYear() - 3),
        color: 'rouge',
        formatCl: 75,
        alertThreshold: 3,
        canonicalKey: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
  );
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState<Set<keyof Wine>>(() => new Set());
  const [photo, setPhoto] = useState<PendingPhoto | null>(null);
  const [preparing, setPreparing] = useState(false);
  const set = <K extends keyof Wine>(k: K, v: Wine[K]) => {
    setTouched((s) => (s.has(k) ? s : new Set(s).add(k)));
    setF((p) => ({ ...p, [k]: v }));
  };
  // Sur un nouveau vin, millésime / couleur / format pré-remplis par défaut comptent comme vides tant qu'on n'y a pas touché.
  const isEmpty = (k: LabelFormField): boolean => {
    const v = f[k];
    if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) return true;
    return !wine && !touched.has(k) && (k === 'vintage' || k === 'color' || k === 'formatCl');
  };
  const applyLabel = (patch: Partial<Wine>) => {
    const next = { ...patch };
    if (typeof next.producer === 'string') {
      const known = producers.find((p) => p.name.trim().toLowerCase() === next.producer!.trim().toLowerCase());
      if (known) next.producer = known.name;
    }
    setTouched((s) => new Set([...s, ...(Object.keys(next) as (keyof Wine)[])]));
    setF((p) => ({ ...p, ...next }));
  };
  const canPhoto = can('sommelier');

  const producer = producers.find((p) => p.name.toLowerCase() === f.producer.trim().toLowerCase());
  const coef = effectiveCoefficient(f, producer, org.defaultCoefficient);
  const suggestedSell = f.buyPriceHT ? round2(f.buyPriceHT * coef) : undefined;
  const key = useMemo(() => canonicalKey(f), [f]);
  const duplicate = wines.find((w) => w.id !== f.id && !w.isArchived && w.canonicalKey === key);
  const valid = f.producer.trim() && f.name.trim() && !duplicate;

  const save = async () => {
    setBusy(true);
    const keepPhoto = !!photo?.keep && canPhoto;
    const ops: Op[] = [];
    let producerId = producer?.id;
    if (!producerId) {
      producerId = uid();
      const p: Producer = { id: producerId, name: f.producer.trim(), region: f.region, country: f.country, createdAt: Date.now() };
      ops.push({ op: 'set', path: path('producers', producerId), data: JSON.parse(JSON.stringify(p)) });
    }
    // La photo peut avoir été ajoutée depuis le tiroir pendant l'édition : on ne l'écrase pas.
    const hasImage = keepPhoto || !!(wines.find((w) => w.id === f.id)?.hasImage ?? f.hasImage);
    const saved: Wine = { ...f, producer: f.producer.trim(), name: f.name.trim(), producerId, canonicalKey: key, hasImage, updatedAt: Date.now() };
    ops.push({ op: 'set', path: path('wines', saved.id), data: JSON.parse(JSON.stringify(saved)) });
    if (keepPhoto && photo) {
      const { dataUrl, mimeType, width, height, source } = photo;
      ops.push(...wineImageSetOps(path, saved.id, { dataUrl, mimeType, width, height, source, updatedBy: member?.uid }, saved.updatedAt));
    }
    try {
      await commit(ops);
    } catch {
      setBusy(false);
      toast(t(keepPhoto ? 'photos.saveError' : 'common.error'), 'bad');
      return;
    }
    setBusy(false);
    onSaved?.(saved);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      side
      size="lg"
      title={wine ? t('wines.edit') : t('wines.new')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={save} disabled={!valid || preparing} loading={busy}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <LabelScan form={f} isEmpty={isEmpty} onApply={applyLabel} photo={photo} onPhoto={setPhoto} canKeepPhoto={canPhoto} hasExistingImage={!!wine?.hasImage} onPreparing={setPreparing} />
        </div>
        <Field label={t('wines.producer')} className="sm:col-span-2">
          <Input list="producers-list" value={f.producer} onChange={(e) => set('producer', e.target.value)} autoFocus />
          <datalist id="producers-list">
            {producers.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        </Field>
        <Field label={t('wines.cuvee')} className="sm:col-span-2" error={duplicate ? t('wines.duplicateExists') : undefined}>
          <Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Puligny-Montrachet 1er Cru Les Pucelles" />
        </Field>
        <Field label={t('wines.vintage')} hint={t('wines.vintageHint')}>
          <Input value={f.vintage} onChange={(e) => set('vintage', e.target.value)} />
        </Field>
        <Field label={t('wines.color')}>
          <Select value={f.color} onChange={(e) => set('color', e.target.value as WineColor)}>
            {WINE_COLORS.map((c) => (
              <option key={c} value={c}>
                {t(`color.${c}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('wines.format')}>
          <Select value={f.formatCl} onChange={(e) => set('formatCl', Number(e.target.value))}>
            {[...new Set([...FORMATS, f.formatCl])].sort((a, b) => a - b).map((c) => (
              <option key={c} value={c}>
                {formatLabel(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('wines.region')}>
          <Input value={f.region ?? ''} onChange={(e) => set('region', e.target.value)} />
        </Field>
        <Field label={t('wines.country')}>
          <Input value={f.country ?? ''} onChange={(e) => set('country', e.target.value)} placeholder="France" />
        </Field>
        <Field label={t('discover.subRegion')}>
          <Input value={f.subRegion ?? ''} onChange={(e) => set('subRegion', e.target.value)} />
        </Field>
        <Field label="Appellation">
          <Input value={f.appellation ?? ''} onChange={(e) => set('appellation', e.target.value)} />
        </Field>
        <Field label={t('wines.grapes')}>
          <Input value={f.grapes ?? ''} onChange={(e) => set('grapes', e.target.value)} />
        </Field>
        <Field label={t('photos.abv')}>
          <NumberInput value={f.abv} onChange={(v) => set('abv', v)} step="0.1" min={0} max={80} />
        </Field>

        <div className="sm:col-span-2 mt-1 border-t border-border pt-4 text-sm font-semibold">{t('wines.pricing')}</div>
        <Field label={t('wines.buyPrice')}>
          <NumberInput value={f.buyPriceHT} onChange={(v) => set('buyPriceHT', v)} step="0.01" min={0} />
        </Field>
        <Field label={t('wines.coefficient')} hint={t('wines.coefficientHint', { n: coef })}>
          <NumberInput value={f.coefficient} onChange={(v) => set('coefficient', v)} step="0.05" min={0} placeholder={String(coef)} />
        </Field>
        <Field label={t('wines.sellPrice')} hint={suggestedSell ? t('wines.suggested', { n: suggestedSell }) : undefined}>
          <NumberInput value={f.sellPriceHT} onChange={(v) => set('sellPriceHT', v)} step="0.01" min={0} placeholder={suggestedSell ? String(suggestedSell) : ''} />
        </Field>
        <Field label={t('wines.menuPrice')} hint={f.sellPriceHT ? t('wines.menuPriceHint', { n: round2(ttcFromHt(f.sellPriceHT, org.defaultVatRate)) }) : undefined}>
          <NumberInput value={f.menuPriceTTC} onChange={(v) => set('menuPriceTTC', v)} step="0.5" min={0} />
        </Field>

        <div className="sm:col-span-2 mt-1 border-t border-border pt-4 text-sm font-semibold">{t('wines.management')}</div>
        <Field label={t('wines.alertThreshold')}>
          <NumberInput value={f.alertThreshold} onChange={(v) => set('alertThreshold', v ?? 0)} min={0} />
        </Field>
        <Field label="Code Caisse / POS (PLU)" hint="Pour déstockage automatique caisse">
          <Input value={f.posCode ?? ''} onChange={(e) => set('posCode', e.target.value)} placeholder="Ex: PLU-104" />
        </Field>
        <Field label={t('wines.ean')}>
          <Input value={f.ean ?? ''} onChange={(e) => set('ean', e.target.value)} />
        </Field>
        <Field label={t('wines.apogeeFrom')}>
          <NumberInput value={f.apogeeFrom} onChange={(v) => set('apogeeFrom', v)} placeholder="2026" />
        </Field>
        <Field label={t('wines.apogeeTo')}>
          <NumberInput value={f.apogeeTo} onChange={(v) => set('apogeeTo', v)} placeholder="2040" />
        </Field>
        <Field label={t('common.notes')} className="sm:col-span-2">
          <Textarea value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <div className="sm:col-span-2 flex flex-wrap gap-6">
          <Checkbox checked={!!f.isExceptional} onChange={(v) => set('isExceptional', v)} label="Flacon d'exception / Grand Cru (traçabilité unitaire)" />
          <Checkbox checked={!!f.hideFromMenu} onChange={(v) => set('hideFromMenu', v)} label={t('wines.hideFromMenu')} />
          <Checkbox checked={!!f.isPreSale} onChange={(v) => set('isPreSale', v)} label={t('wines.preSale')} />
          <Checkbox
            checked={!!f.allergens?.includes('oeuf')}
            onChange={(v) => set('allergens', v ? [...new Set([...(f.allergens ?? []), 'oeuf' as const])] : (f.allergens ?? []).filter((a) => a !== 'oeuf'))}
            label="Collage à l’œuf (allergène signalé sur la carte)"
          />
          <Checkbox
            checked={!!f.allergens?.includes('lait')}
            onChange={(v) => set('allergens', v ? [...new Set([...(f.allergens ?? []), 'lait' as const])] : (f.allergens ?? []).filter((a) => a !== 'lait'))}
            label="Collage au lait / caséine (allergène signalé sur la carte)"
          />
          <Checkbox checked={!!f.byGlass?.enabled} onChange={(v) => set('byGlass', { glassCl: 12.5, ...f.byGlass, enabled: v })} label={t('wines.byGlass')} />
        </div>
        {f.byGlass?.enabled && (
          <>
            <Field label={t('wines.glassCl')} hint={t('wines.glassesPerBottle', { n: Math.floor(f.formatCl / (f.byGlass.glassCl || 12.5)) })}>
              <NumberInput value={f.byGlass.glassCl} onChange={(v) => set('byGlass', { ...f.byGlass!, glassCl: v && v > 0 ? v : 12.5 })} step="0.5" min={2} />
            </Field>
            <Field label={t('wines.glassPrice')}>
              <NumberInput value={f.byGlass.priceTTC} onChange={(v) => set('byGlass', { ...f.byGlass!, priceTTC: v })} step="0.5" min={0} />
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}
