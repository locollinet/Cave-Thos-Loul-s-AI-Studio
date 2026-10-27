import { useState } from 'react';
import { Layers, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { CellarRack, RackGeometry, Site } from '@/types';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Button, Card, Checkbox, Field, Input, Modal, NumberInput, Select, useToast, cx } from '@/ui';
import { uid } from '@/lib/utils';
import { RACK_PRESETS, getRackCapacity } from '@/lib/cellar';

export function RackConfigModal({
  site,
  initialRack,
  onClose,
}: {
  site: Site;
  initialRack?: CellarRack;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { commit, path } = useOrg();
  const [busy, setBusy] = useState(false);

  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    initialRack ? '' : RACK_PRESETS[0].id,
  );
  const [name, setName] = useState(initialRack?.name ?? RACK_PRESETS[0].name);
  const [prefix, setPrefix] = useState(initialRack?.prefix ?? RACK_PRESETS[0].defaultPrefix);
  const [geometry, setGeometry] = useState<RackGeometry>(
    initialRack?.geometry ?? RACK_PRESETS[0].geometry,
  );
  const [rows, setRows] = useState(initialRack?.rows ?? RACK_PRESETS[0].rows);
  const [cols, setCols] = useState(initialRack?.cols ?? RACK_PRESETS[0].cols);
  const [doubleDepth, setDoubleDepth] = useState(
    initialRack?.doubleDepth ?? RACK_PRESETS[0].doubleDepth,
  );
  const [staggered, setStaggered] = useState(
    initialRack?.staggered ?? RACK_PRESETS[0].staggered,
  );

  const applyPreset = (presetId: string) => {
    const p = RACK_PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    setSelectedPresetId(p.id);
    setName(p.name);
    setPrefix(p.defaultPrefix);
    setGeometry(p.geometry);
    setRows(p.rows);
    setCols(p.cols);
    setDoubleDepth(p.doubleDepth);
    setStaggered(p.staggered);
  };

  const draftRack: CellarRack = {
    id: initialRack?.id ?? 'preview',
    name: name || 'Nouveau meuble',
    geometry,
    rows: Math.max(1, rows || 1),
    cols: Math.max(1, cols || 1),
    doubleDepth,
    staggered,
    prefix: prefix || 'R',
  };

  const capacity = getRackCapacity(draftRack);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const currentRacks: CellarRack[] = site.layout?.racks ? [...site.layout.racks] : [];
      const newRack: CellarRack = {
        id: initialRack?.id ?? uid(),
        name: name.trim(),
        prefix: (prefix.trim() || name.slice(0, 3)).toUpperCase(),
        geometry,
        rows: Math.max(1, rows),
        cols: Math.max(1, cols),
        doubleDepth,
        staggered: geometry === 'staggered_shelf' ? staggered : false,
      };

      let updatedRacks: CellarRack[];
      if (initialRack) {
        updatedRacks = currentRacks.map((r) => (r.id === initialRack.id ? newRack : r));
      } else {
        updatedRacks = [...currentRacks, newRack];
      }

      await commit([
        {
          op: 'set',
          path: path('sites', site.id),
          data: {
            layout: { racks: updatedRacks },
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
      title={initialRack ? t('stock.editRack') : t('stock.addRack')}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-muted">
            Capacité calculée : <span className="font-semibold text-ink font-mono">{capacity} bouteilles</span>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={save} disabled={busy || !name.trim()} loading={busy}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {!initialRack && (
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted block mb-2">
              Modèles prêts à l'emploi (1 clic)
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {RACK_PRESETS.map((p) => {
                const isSelected = selectedPresetId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id)}
                    className={cx(
                      'text-left rounded-xl border p-3 transition cursor-pointer',
                      isSelected
                        ? 'border-brand bg-brand-soft/40 shadow-xs'
                        : 'border-border bg-surface hover:bg-surface-2/60',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-ink">{p.name}</span>
                      {isSelected && <span className="text-brand text-xs font-bold">✓ Actif</span>}
                    </div>
                    <p className="text-[11px] text-muted mt-1 leading-snug line-clamp-2">{p.desc}</p>
                    <div className="mt-2 text-[10px] font-mono text-muted">
                      {p.rows} niveaux · {p.cols} col. {p.staggered ? '· Quinconce' : ''}{p.doubleDepth ? ' · 2 profondeurs' : ''}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('stock.rackName')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Armoire EuroCave 1, Casier Bourgogne..." />
          </Field>
          <Field label="Préfixe d'emplacement (ex: ARM, A, B)">
            <Input value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} maxLength={6} placeholder="Ex: A, ARM..." />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('stock.rowsCount')}>
            <NumberInput value={rows} onChange={(v) => setRows(Math.max(1, Math.min(20, v ?? 1)))} min={1} max={20} />
          </Field>
          <Field label={t('stock.colsCount')}>
            <NumberInput value={cols} onChange={(v) => setCols(Math.max(1, Math.min(20, v ?? 1)))} min={1} max={20} />
          </Field>
        </div>

        <div className="space-y-2 rounded-xl border border-border/80 bg-surface-2/30 p-3">
          <Checkbox
            checked={doubleDepth}
            onChange={setDoubleDepth}
            label={
              <div>
                <span className="font-medium text-sm text-ink">{t('stock.doubleDepth')}</span>
                <p className="text-xs text-muted">{t('stock.doubleDepthHint')}</p>
              </div>
            }
          />
          {geometry === 'staggered_shelf' && (
            <div className="pt-2 border-t border-border/60">
              <Checkbox
                checked={staggered}
                onChange={setStaggered}
                label={
                  <div>
                    <span className="font-medium text-sm text-ink">{t('stock.staggered')}</span>
                    <p className="text-xs text-muted">{t('stock.staggeredHint')}</p>
                  </div>
                }
              />
            </div>
          )}
        </div>

        {/* Aperçu interactif en direct */}
        <div className="rounded-xl border border-border bg-surface-2/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
              <Layers className="size-3.5 text-brand" />
              Aperçu visuel du meuble
            </span>
            <span className="text-xs font-mono text-muted">
              {draftRack.rows} clayettes · {capacity} places
            </span>
          </div>

          <div className="max-h-52 overflow-y-auto rounded-lg border border-border bg-surface p-3 space-y-2.5">
            {Array.from({ length: Math.min(draftRack.rows, 6) }).map((_, rIdx) => {
              const r = rIdx + 1;
              const colsCount = Math.min(draftRack.cols, 10);
              const staggeredCount = draftRack.staggered && colsCount > 1 ? colsCount - 1 : 0;
              return (
                <div key={r} className="rounded-md border border-border/60 bg-surface-2/40 p-2">
                  <div className="flex items-center justify-between text-[11px] text-muted mb-1 font-mono">
                    <span>Niveau {r}</span>
                    {draftRack.doubleDepth && <span className="text-[10px]">Avant + Arrière</span>}
                  </div>
                  {/* Rangée 2 (quinconce en haut si activé) */}
                  {staggeredCount > 0 && (
                    <div className="flex justify-center gap-2 mb-1 pl-4">
                      {Array.from({ length: staggeredCount }).map((_, cIdx) => (
                        <div
                          key={`q-${cIdx}`}
                          className="size-5 rounded-full border border-dashed border-brand/50 bg-brand-soft/30 flex items-center justify-center text-[9px] text-brand font-mono"
                          title="Place quinconce"
                        >
                          Q
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Rangée 1 (base) */}
                  <div className="flex justify-center gap-2">
                    {Array.from({ length: colsCount }).map((_, cIdx) => (
                      <div
                        key={`b-${cIdx}`}
                        className="size-5 rounded-full border border-border bg-surface flex items-center justify-center text-[9px] text-muted font-mono"
                        title={`Place ${cIdx + 1}`}
                      >
                        {cIdx + 1}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {draftRack.rows > 6 && (
              <p className="text-center text-[10px] text-muted italic">
                + {draftRack.rows - 6} autres niveaux
              </p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
