import { useMemo, useState } from 'react';
import { Check, AlertCircle, ChevronDown, ChevronUp, Loader2, RefreshCw, ShieldCheck, Sparkles, Wine as WineIcon } from 'lucide-react';
import type { TechnicalSheet, Wine } from '@/types';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Badge, Button, Checkbox, Modal, useToast } from '@/ui';
import { wineLabel } from '@/lib/wine';
import { generateBatchTechSheets, generateTechSheet, type BatchItemProgress } from '@/modules/carte/aiClient';

interface BatchTechSheetModalProps {
  wines: Wine[];
  onClose: () => void;
  onDone?: () => void;
}

export function BatchTechSheetModal({ wines, onClose, onDone }: BatchTechSheetModalProps) {
  const { t, locale } = useI18n();
  const { commit, path } = useOrg();
  const { toast } = useToast();

  const [onlyMissing, setOnlyMissing] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedToSave, setSelectedToSave] = useState<Set<string>>(new Set());
  const [progressState, setProgressState] = useState<Map<string, BatchItemProgress>>(new Map());

  const targetWines = useMemo(() => {
    if (onlyMissing) {
      return wines.filter((w) => {
        const ts = w.technicalSheet;
        if (!ts) return true;
        const hasData = Object.values(ts).some((v) => typeof v === 'string' && v.trim().length > 0);
        return !hasData;
      });
    }
    return wines;
  }, [wines, onlyMissing]);

  const missingCount = useMemo(() => {
    return wines.filter((w) => {
      const ts = w.technicalSheet;
      if (!ts) return true;
      return !Object.values(ts).some((v) => typeof v === 'string' && v.trim().length > 0);
    }).length;
  }, [wines]);

  const startBatch = async () => {
    if (targetWines.length === 0) return;
    setBusy(true);

    // Initialiser les vins sélectionnés pour enregistrement
    setSelectedToSave(new Set(targetWines.map((w) => w.id)));

    try {
      await generateBatchTechSheets(
        targetWines,
        locale,
        (progress) => {
          setProgressState(new Map(progress));
        },
        2, // 2 requêtes simultanées pour fluidité et respect des quotas
      );
      toast('Génération du lot terminée ! Relisez les fiches avant de les enregistrer.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erreur durant la génération du lot', 'bad');
    } finally {
      setBusy(false);
    }
  };

  const retrySingle = async (wine: Wine) => {
    const nextState = new Map(progressState);
    nextState.set(wine.id, { wine, status: 'processing' });
    setProgressState(nextState);

    try {
      const sheet = await generateTechSheet(wine, locale);
      nextState.set(wine.id, { wine, status: 'done', sheet });
      setSelectedToSave((prev) => new Set(prev).add(wine.id));
      setProgressState(new Map(nextState));
    } catch (e) {
      nextState.set(wine.id, { wine, status: 'error', error: e instanceof Error ? e.message : 'Erreur' });
      setProgressState(new Map(nextState));
    }
  };

  const doneCount = Array.from(progressState.values()).filter((p) => p.status === 'done').length;
  const totalTarget = targetWines.length;
  const pct = totalTarget > 0 ? Math.round((doneCount / totalTarget) * 100) : 0;

  const saveAll = async () => {
    const toCommit: { op: 'set'; path: string; data: Record<string, unknown>; merge: true }[] = [];
    for (const [wineId, item] of progressState.entries()) {
      if (item.status === 'done' && item.sheet && selectedToSave.has(wineId)) {
        // Filtrer les chaînes vides
        const cleanSheet = Object.fromEntries(
          Object.entries(item.sheet).filter(([, v]) => v !== undefined && v !== ''),
        );
        toCommit.push({
          op: 'set',
          path: path('wines', wineId),
          data: {
            technicalSheet: cleanSheet,
            updatedAt: Date.now(),
          },
          merge: true,
        });
      }
    }

    if (toCommit.length === 0) {
      toast('Aucune fiche prête à être enregistrée', 'bad');
      return;
    }

    setSaving(true);
    try {
      await commit(toCommit);
      toast(`${toCommit.length} fiches techniques enregistrées avec succès !`);
      onDone?.();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error'), 'bad');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-accent" />
          <span>Fiches techniques IA par lot</span>
        </div>
      }
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>{t('common.close')}</Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={busy || doneCount === 0 || selectedToSave.size === 0}
            onClick={saveAll}
          >
            Enregistrer {Array.from(progressState.values()).filter((p) => p.status === 'done' && selectedToSave.has(p.wine.id)).length} fiches
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Encart explicatif du modèle léger & des gardes-fous */}
        <div className="rounded-xl border border-border bg-surface-2/60 p-3.5 text-xs text-muted space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-ink font-medium">
            <span className="flex items-center gap-1.5 text-brand">
              <ShieldCheck className="size-4 text-brand" />
              Gardes-fous stricts & Sources officielles
            </span>
            <Badge tone="ok">Modèle léger & sobre</Badge>
            <Badge tone="brand">Zéro hallucination imposée</Badge>
          </div>
          <p className="leading-relaxed">
            L’IA s’appuie exclusivement sur les décrets officiels d’AOP/AOC (INAO), la géologie vérifiée des appellations et les repères viticoles reconnus.
            Si une donnée précise (parcelle exacte, âge des vignes, élevage) n’est pas publiquement documentée pour la cuvée, l’IA ne l’invente pas et indique <strong className="text-ink">« Non documenté »</strong> ou <strong className="text-ink">« Typique de l’appellation »</strong>.
          </p>
        </div>

        {/* Options de périmètre */}
        {progressState.size === 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <Checkbox
                  checked={onlyMissing}
                  onChange={(v) => setOnlyMissing(v)}
                />
                <span>Uniquement les vins sans fiche technique ({missingCount} / {wines.length})</span>
              </label>
              {!onlyMissing && (
                <label className="flex items-center gap-2 text-xs text-muted cursor-pointer ml-6">
                  <Checkbox
                    checked={overwrite}
                    onChange={(v) => setOverwrite(v)}
                  />
                  <span>Remplacer les fiches déjà existantes</span>
                </label>
              )}
            </div>

            <Button
              variant="accent"
              icon={<Sparkles className="size-4" />}
              loading={busy}
              disabled={targetWines.length === 0}
              onClick={startBatch}
            >
              Lancer la génération ({targetWines.length} vins)
            </Button>
          </div>
        )}

        {/* Barre de progression pendant l'exécution ou après */}
        {progressState.size > 0 && (
          <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin text-accent" />
                    <span className="font-medium text-ink">Génération en cours… ({doneCount} / {totalTarget})</span>
                  </>
                ) : (
                  <>
                    <Check className="size-4 text-ok" />
                    <span className="font-medium text-ink">Génération terminée : {doneCount} sur {totalTarget} fiches créées</span>
                  </>
                )}
              </div>
              <span className="font-semibold tabular text-brand">{pct}%</span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {/* Liste des vins du lot */}
        <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
          {(progressState.size > 0 ? Array.from(progressState.values()) : targetWines.map((w): BatchItemProgress => ({ wine: w, status: 'pending' }))).map((item) => {
            const w = item.wine;
            const status = item.status;
            const sheet = item.sheet ?? w.technicalSheet;
            const isDone = status === 'done';
            const isError = status === 'error';
            const isProcessing = status === 'processing';
            const isExpanded = expandedId === w.id;
            const isSelected = selectedToSave.has(w.id);

            return (
              <div
                key={w.id}
                className="rounded-xl border border-border bg-surface p-3 transition-colors hover:border-border/80"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {progressState.size > 0 && isDone && (
                      <Checkbox
                        checked={isSelected}
                        onChange={(val) => {
                          setSelectedToSave((prev) => {
                            const next = new Set(prev);
                            if (val) next.add(w.id);
                            else next.delete(w.id);
                            return next;
                          });
                        }}
                      />
                    )}

                    <WineIcon className="size-4 shrink-0 text-muted" />

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{wineLabel(w)}</span>
                        <span className="text-xs text-muted">{w.vintage}</span>
                      </div>
                      <div className="text-[11px] text-muted truncate">
                        {[w.producer, w.region, w.appellation].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </div>

                  {/* Statut de génération */}
                  <div className="flex items-center gap-2 shrink-0">
                    {status === 'pending' && (
                      <span className="text-xs text-muted">En attente</span>
                    )}

                    {isProcessing && (
                      <div className="flex items-center gap-1.5 text-xs text-accent">
                        <Loader2 className="size-3.5 animate-spin" />
                        <span>Recherche AOP…</span>
                      </div>
                    )}

                    {isDone && sheet && (
                      <div className="flex items-center gap-1.5">
                        <Badge tone={sheet.confidence === 'high' ? 'ok' : sheet.confidence === 'medium' ? 'brand' : 'warn'}>
                          {sheet.confidence === 'high'
                            ? 'AOP vérifiée'
                            : sheet.confidence === 'medium'
                              ? 'Repères domaine'
                              : 'Données partielles'}
                        </Badge>

                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : w.id)}
                          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2"
                        >
                          <span>Aperçu</span>
                          {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                        </button>
                      </div>
                    )}

                    {isError && (
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-xs text-bad">
                          <AlertCircle className="size-3.5" />
                          <span>Échec</span>
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<RefreshCw className="size-3" />}
                          onClick={() => retrySingle(w)}
                        >
                          Réessayer
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Détails dépliables de la fiche générée */}
                {isExpanded && sheet && (
                  <div className="mt-3 space-y-2 rounded-lg border border-border/60 bg-surface-2/40 p-3 text-xs animate-in">
                    {sheet.sources && (
                      <p className="text-muted">
                        <span className="font-semibold text-ink">Sources : </span>{sheet.sources}
                      </p>
                    )}

                    {sheet.missingInfo && sheet.missingInfo !== 'Aucune information manquante majeure' && (
                      <p className="text-warn">
                        <span className="font-semibold">Non documenté (non inventé) : </span>{sheet.missingInfo}
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40">
                      {sheet.sol && <div><span className="text-muted">Sol :</span> {sheet.sol}</div>}
                      {sheet.cepage && <div><span className="text-muted">Cépages :</span> {sheet.cepage}</div>}
                      {sheet.garde && <div><span className="text-muted">Garde :</span> {sheet.garde}</div>}
                      {sheet.temperatureService && <div><span className="text-muted">Service :</span> {sheet.temperatureService}</div>}
                      {sheet.nez && <div className="col-span-2"><span className="text-muted">Nez :</span> {sheet.nez}</div>}
                      {sheet.bouche && <div className="col-span-2"><span className="text-muted">Bouche :</span> {sheet.bouche}</div>}
                      {sheet.accords && <div className="col-span-2"><span className="text-muted">Accords :</span> {sheet.accords}</div>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
