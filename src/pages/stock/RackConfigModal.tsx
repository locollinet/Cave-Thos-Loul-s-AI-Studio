import { useState } from 'react';
import { Layers } from 'lucide-react';
import type { CellarRack, RackGeometry, Site } from '@/types';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Button, Checkbox, Field, Input, Modal, NumberInput, useToast, cx } from '@/ui';
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

  const handleToggleStaggered = (checked: boolean) => {
    setStaggered(checked);
    if (geometry !== 'bulk') {
      setGeometry(checked ? 'staggered_shelf' : 'matrix');
    }
  };

  const draftRack: CellarRack = {
    id: initialRack?.id ?? 'preview',
    name: name || 'Nouveau meuble',
    geometry: geometry === 'bulk' ? 'bulk' : staggered ? 'staggered_shelf' : 'matrix',
    rows: Math.max(1, rows || 1),
    cols: Math.max(1, cols || 1),
    doubleDepth: geometry === 'bulk' ? false : doubleDepth,
    staggered: geometry === 'bulk' ? false : staggered,
    prefix: prefix || 'CAV',
  };

  const capacity = getRackCapacity(draftRack);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const currentRacks: CellarRack[] = site.layout?.racks ? [...site.layout.racks] : [];
      const finalGeometry: RackGeometry =
        geometry === 'bulk' ? 'bulk' : staggered ? 'staggered_shelf' : 'matrix';
      const newRack: CellarRack = {
        id: initialRack?.id ?? uid(),
        siteId: site.id,
        name: name.trim(),
        prefix: (prefix.trim() || name.slice(0, 3)).toUpperCase(),
        geometry: finalGeometry,
        rows: Math.max(1, rows),
        cols: Math.max(1, cols),
        doubleDepth: finalGeometry === 'bulk' ? false : doubleDepth,
        staggered: finalGeometry === 'staggered_shelf' ? staggered : false,
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
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-muted">
            Capacité totale calculée :{' '}
            <span className="font-semibold text-ink font-mono">{capacity} bouteilles</span>
            {draftRack.doubleDepth && (
              <span className="ml-2 text-[11px] text-brand font-medium">
                (Devant + Derrière)
              </span>
            )}
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
      <div className="grid gap-5 lg:grid-cols-12 items-start">
        {/* Colonne gauche : Modèles & Paramètres */}
        <div className="lg:col-span-7 space-y-4">
          {!initialRack && (
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted block mb-2">
                Architectures de cave Sommelier & Domaine (1 clic)
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                {RACK_PRESETS.map((p) => {
                  const isSelected = selectedPresetId === p.id;
                  const presetCap = getRackCapacity({
                    id: p.id,
                    name: p.name,
                    geometry: p.geometry,
                    rows: p.rows,
                    cols: p.cols,
                    doubleDepth: p.doubleDepth,
                    staggered: p.staggered,
                  });
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p.id)}
                      className={cx(
                        'text-left rounded-xl border p-2.5 transition cursor-pointer',
                        isSelected
                          ? 'border-brand bg-brand-soft/40 shadow-xs'
                          : 'border-border bg-surface hover:bg-surface-2/60',
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-ink leading-tight">{p.name}</span>
                        <span
                          className={cx(
                            'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-mono font-semibold',
                            isSelected ? 'bg-brand text-white' : 'bg-surface-2 text-muted',
                          )}
                        >
                          {presetCap} btl
                        </span>
                      </div>
                      <p className="text-[11px] text-muted mt-1 leading-snug line-clamp-2">{p.desc}</p>
                      <div className="mt-1.5 text-[10px] font-mono text-muted">
                        {p.rows} étages · {p.cols} col.
                        {p.staggered ? ' · Quinconce' : ''}
                        {p.doubleDepth ? ' · Devant/Derrière' : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Field label={t('stock.rackName')}>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Caveau Bourgogne — Grands Crus..."
                />
              </Field>
            </div>
            <Field label="Préfixe (ex: CAV, ARM)">
              <Input
                value={prefix}
                onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="CAV"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre d'étages / clayettes">
              <NumberInput
                value={rows}
                onChange={(v) => setRows(Math.max(1, Math.min(20, v ?? 1)))}
                min={1}
                max={20}
              />
            </Field>
            <Field label="Bouteilles de front par rangée">
              <NumberInput
                value={cols}
                onChange={(v) => setCols(Math.max(1, Math.min(20, v ?? 1)))}
                min={1}
                max={20}
              />
            </Field>
          </div>

          {geometry !== 'bulk' && (
            <div className="space-y-2.5 rounded-xl border border-border/80 bg-surface-2/30 p-3">
              <Checkbox
                checked={doubleDepth}
                onChange={setDoubleDepth}
                label={
                  <div>
                    <span className="font-medium text-xs text-ink">
                      Double profondeur (👁️ Devant / 📦 Derrière)
                    </span>
                    <p className="text-[11px] text-muted">
                      Deux rangées par étage : 1re rangée accessible devant et 2e rangée de garde au fond.
                    </p>
                  </div>
                }
              />
              <div className="pt-2 border-t border-border/60">
                <Checkbox
                  checked={staggered}
                  onChange={handleToggleStaggered}
                  label={
                    <div>
                      <span className="font-medium text-xs text-ink">
                        Disposition en Quinconce (imbrication Sommelier)
                      </span>
                      <p className="text-[11px] text-muted">
                        Ajoute un second lit de bouteilles imbriqué dans les creux ({Math.max(0, cols - 1)} btl suppl. par rangée).
                      </p>
                    </div>
                  }
                />
              </div>
            </div>
          )}
        </div>

        {/* Colonne droite : Aperçu Cave en Coupe (style Chêne & Laiton) */}
        <div className="lg:col-span-5 rounded-2xl border-2 border-[#3E2723] bg-gradient-to-b from-[#1A1311] via-[#120D0B] to-[#1A1311] p-3.5 text-[#FDFBF7] shadow-lg">
          <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-[#3E2723]/80">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#D4AF37] flex items-center gap-1.5">
              <Layers className="size-3.5" />
              Coupe du meuble ({draftRack.prefix})
            </span>
            <span className="text-[11px] font-mono text-[#D4AF37]/90">
              {draftRack.rows} étages · {capacity} btl
            </span>
          </div>

          {draftRack.doubleDepth && (
            <div className="grid grid-cols-2 gap-2 mb-2 px-2 text-[9px] font-bold uppercase tracking-wider text-stone-400">
              <span>👁️ Devant (1re rangée)</span>
              <span className="text-right">📦 Derrière (Fond)</span>
            </div>
          )}

          <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
            {Array.from({ length: Math.min(draftRack.rows, 8) }).map((_, rIdx) => {
              const r = rIdx + 1;
              const colsCount = Math.min(draftRack.cols, 8);
              const staggeredCount = draftRack.staggered && colsCount > 1 ? colsCount - 1 : 0;
              const perDepth = draftRack.geometry === 'bulk' ? colsCount * 6 : colsCount + staggeredCount;
              const shelfCap = perDepth * (draftRack.doubleDepth ? 2 : 1);

              const renderMiniDots = () => (
                <div className="space-y-1 py-0.5">
                  {staggeredCount > 0 && (
                    <div className="flex items-center justify-center gap-1 pl-2">
                      {Array.from({ length: staggeredCount }).map((__, cIdx) => (
                        <span
                          key={`q-${cIdx}`}
                          className="size-3 rounded-full border border-[#D4AF37]/60 bg-[#722F37]/80 shadow-xs"
                          title={`Quinconce ${cIdx + 1}`}
                        />
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-1">
                    {Array.from({ length: colsCount }).map((__, cIdx) => (
                      <span
                        key={`b-${cIdx}`}
                        className="size-3.5 rounded-full border border-stone-500/70 bg-[#2C1E1B] flex items-center justify-center text-[7px] font-mono text-stone-300"
                        title={`Place ${cIdx + 1}`}
                      >
                        {cIdx + 1}
                      </span>
                    ))}
                  </div>
                </div>
              );

              return (
                <div
                  key={r}
                  className="rounded-xl border border-[#3E2723] bg-[#221714]/90 px-2.5 py-2 relative overflow-hidden"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-stone-300 mb-1">
                    <span className="font-semibold text-[#FDFBF7]">Étage {r}</span>
                    <span className="text-[#D4AF37]">{shelfCap} places</span>
                  </div>

                  {draftRack.doubleDepth ? (
                    <div className="grid grid-cols-2 gap-2 items-center">
                      <div>{renderMiniDots()}</div>
                      <div className="border-l border-dashed border-amber-500/25 pl-2 opacity-85">
                        {renderMiniDots()}
                      </div>
                    </div>
                  ) : (
                    renderMiniDots()
                  )}

                  {/* Clayette en chêne */}
                  <div className="mt-1.5 h-1 w-full rounded-full bg-gradient-to-r from-[#5D3A1A] via-[#8B5A2B] to-[#5D3A1A]" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
