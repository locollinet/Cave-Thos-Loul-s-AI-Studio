import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, FileSpreadsheet, Sparkles, UploadCloud, XCircle } from 'lucide-react';
import { useOrg } from '@/app/org';
import { useAuth } from '@/app/auth';
import { Button, Modal, useToast } from '@/ui';
import { norm } from '@/lib/wine';
import { buildMovementOps } from '@/data/stock';
import type { Wine } from '@/types';

interface PosLine {
  id: string;
  rawLabel: string;
  posCode?: string;
  qty: number;
  matchedWineId?: string;
}

const DEMO_POS_SALES = [
  { rawLabel: 'Chablis 1er Cru Montée de Tonnerre 2020', posCode: 'PLU-104', qty: 2 },
  { rawLabel: 'Meursault Domaine des Comtes Lafon 2019', posCode: 'PLU-208', qty: 1 },
  { rawLabel: 'Champagne Grand Brut 75cl', posCode: 'PLU-301', qty: 3 },
  { rawLabel: 'Gevrey-Chambertin 2018', posCode: 'PLU-402', qty: 2 },
];

export function PosReconciliationModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { wines, stock, activeSiteId, sites, commit, orgId } = useOrg();
  const [lines, setLines] = useState<PosLine[]>([]);
  const [siteId, setSiteId] = useState(
    activeSiteId !== 'all' ? activeSiteId : sites[0]?.id ?? 'main',
  );
  const [busy, setBusy] = useState(false);

  // Dictionnaire des vins par id
  const winesById = useMemo(() => new Map(wines.map((w) => [w.id, w])), [wines]);

  // Fonction de rapprochement automatique
  const matchWine = (rawLabel: string, posCode?: string): string | undefined => {
    if (posCode) {
      const byCode = wines.find((w) => w.posCode === posCode);
      if (byCode) return byCode.id;
    }
    const cleanLabel = norm(rawLabel);
    let bestMatch: Wine | undefined;
    let bestScore = 0;

    for (const w of wines) {
      const target = norm(`${w.producer} ${w.name} ${w.vintage}`);
      const words = cleanLabel.split(' ').filter((x) => x.length > 2);
      let matchCount = 0;
      for (const word of words) {
        if (target.includes(word)) matchCount++;
      }
      if (matchCount > bestScore && matchCount >= 2) {
        bestScore = matchCount;
        bestMatch = w;
      }
    }
    return bestMatch?.id;
  };

  const loadDemoData = () => {
    const matched = DEMO_POS_SALES.map((item, idx) => ({
      id: `pos_${idx}`,
      rawLabel: item.rawLabel,
      posCode: item.posCode,
      qty: item.qty,
      matchedWineId: matchWine(item.rawLabel, item.posCode),
    }));
    setLines(matched);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const rows = text.split(/\r?\n/).filter((r) => r.trim());
      const parsed: PosLine[] = [];

      // Parcours des lignes CSV (skip header)
      for (let i = 1; i < rows.length; i++) {
        const parts = rows[i].split(/[,;\t]/).map((s) => s.replace(/^"|"$/g, '').trim());
        if (parts.length >= 2) {
          const rawLabel = parts[0];
          const qty = parseInt(parts[1], 10) || 1;
          const posCode = parts[2] || undefined;
          parsed.push({
            id: `line_${i}`,
            rawLabel,
            posCode,
            qty,
            matchedWineId: matchWine(rawLabel, posCode),
          });
        }
      }
      setLines(parsed);
    };
    reader.readAsText(file);
  };

  const applyDepletion = async () => {
    const matchedLines = lines.filter((l) => l.matchedWineId && l.qty > 0);
    if (!matchedLines.length || !user) return;
    setBusy(true);

    try {
      const todayDate = new Date().toISOString().slice(0, 10);
      const inputs = matchedLines.map((line) => {
        const wine = winesById.get(line.matchedWineId!)!;
        return {
          wine,
          siteId,
          type: 'out' as const,
          qty: line.qty,
          reason: 'vente' as const,
          date: todayDate,
          note: `Z de Caisse POS (${line.posCode ?? 'Ticket'})`,
        };
      });

      const ops = buildMovementOps(orgId, inputs, { userId: user.uid, userName: user.name }, Date.now(), stock);
      await commit(ops);
      toast(`${matchedLines.length} articles de caisse déstockés avec succès !`);
      onClose();
    } catch {
      toast('Erreur lors du déstockage de la caisse', 'bad');
    } finally {
      setBusy(false);
    }
  };

  const matchedCount = lines.filter((l) => l.matchedWineId).length;

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="Rapprochement des Ventes de Caisse (Z de Caisse)"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={applyDepletion}
            disabled={busy || matchedCount === 0}
          >
            {busy ? 'Déstockage en cours...' : `Valider et déstocker (${matchedCount} articles)`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Importez l'export de ventes de votre caisse (Micros Simphony, Lightspeed, SumUp, Zelty) en fin de service. Les sorties de cave sont déduites en un clic sans double saisie.
        </p>

        {/* Zone de chargement de fichier */}
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-surface-2/40 p-6 text-center">
          <UploadCloud className="size-10 text-brand mb-2 opacity-80" />
          <p className="text-sm font-medium text-ink">Glissez votre rapport Z de caisse (CSV ou TXT)</p>
          <p className="text-xs text-muted mt-1">Colonnes attendues : Article, Quantité, Code PLU (optionnel)</p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold hover:bg-surface-2 transition-colors">
              <span>Choisir un fichier CSV</span>
              <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="sr-only" />
            </label>
            <span className="text-xs text-muted">ou</span>
            <button
              type="button"
              onClick={loadDemoData}
              className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
            >
              <Sparkles className="size-3.5" />
              Charger un exemple de service (Palace)
            </button>
          </div>
        </div>

        {/* Tableau de prévisualisation et de rapprochement */}
        {lines.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted">
              <span>Articles détectés ({lines.length})</span>
              <span className="text-emerald-500">{matchedCount} rapprochés automatiquement</span>
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-border/60 rounded-xl border border-border bg-surface">
              {lines.map((line) => {
                const matchedWine = line.matchedWineId ? winesById.get(line.matchedWineId) : undefined;
                return (
                  <div key={line.id} className="flex items-center justify-between gap-3 p-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink">{line.rawLabel}</span>
                        {line.posCode && (
                          <span className="font-mono text-[10px] bg-surface-2 px-1.5 py-0.5 rounded text-muted">
                            {line.posCode}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-muted">
                        <ChevronRight className="size-3 text-brand shrink-0" />
                        {matchedWine ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            {matchedWine.producer} — {matchedWine.name} ({matchedWine.vintage})
                          </span>
                        ) : (
                          <span className="text-amber-500 font-medium">Vin non reconnu — associer manuellement</span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <span className="font-mono text-sm font-bold text-ink">-{line.qty} btl</span>
                    </div>

                    <div className="shrink-0">
                      {matchedWine ? (
                        <CheckCircle2 className="size-5 text-emerald-500" />
                      ) : (
                        <XCircle className="size-5 text-amber-500 opacity-60" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
