import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Sparkles, UploadCloud, XCircle } from 'lucide-react';
import { useOrg } from '@/app/org';
import { useAuth } from '@/app/auth';
import { Button, Modal, useToast } from '@/ui';
import { wineLabel } from '@/lib/wine';
import { dateFr } from '@/lib/utils';
import { matchPosWine, parsePosReport, type PosReportLine } from '@/lib/posReport';
import { buildMovementOps } from '@/data/stock';

interface PosLine extends PosReportLine {
  matchedWineId?: string;
}

interface PosImport {
  id: string;
  fileName: string;
  createdAt: number;
  userName: string;
}

const DEMO_POS_CSV = [
  'Article;Quantité;Code PLU',
  'Chablis 1er Cru Montée de Tonnerre 2020;2;PLU-104',
  'Meursault Domaine des Comtes Lafon 2019;1;PLU-208',
  'Champagne Grand Brut 75cl;3;PLU-301',
  'Gevrey-Chambertin 2018;2;PLU-402',
].join('\n');

/** Empreinte du rapport : un même fichier ne peut pas être déstocké deux fois. */
async function reportId(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text.replace(/\r\n/g, '\n').trim()));
  return `pos-${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40)}`;
}

export function PosReconciliationModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const { user, demo } = useAuth();
  const { wines, stock, activeSiteId, sites, commit, orgId, org, store, path } = useOrg();
  const [lines, setLines] = useState<PosLine[]>([]);
  const [source, setSource] = useState<{ id: string; fileName: string } | null>(null);
  const [already, setAlready] = useState<PosImport | null>(null);
  const [siteId, setSiteId] = useState(activeSiteId !== 'all' ? activeSiteId : sites[0]?.id ?? 'main');
  const [busy, setBusy] = useState(false);

  const winesById = useMemo(() => new Map(wines.map((w) => [w.id, w])), [wines]);
  const options = useMemo(() => wines.filter((w) => !w.isArchived).sort((a, b) => wineLabel(a).localeCompare(wineLabel(b))), [wines]);

  const load = async (text: string, fileName: string) => {
    const parsed = parsePosReport(text);
    if (!parsed.length) {
      toast('Aucune ligne exploitable : colonnes attendues Article ; Quantité ; Code PLU (facultatif).', 'bad');
      return;
    }
    const id = await reportId(text);
    setSource({ id, fileName });
    setAlready(await store.getDoc<PosImport>(path('posImports', id)).catch(() => null));
    setLines(parsed.map((l) => ({ ...l, matchedWineId: matchPosWine(wines, l.rawLabel, l.posCode) })));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2_000_000) {
      toast('Fichier trop volumineux (2 Mo maximum).', 'bad');
      return;
    }
    file.text().then((text) => load(text, file.name));
  };

  const associate = (lineId: string, wineId: string) => setLines((cur) => cur.map((l) => (l.id === lineId ? { ...l, matchedWineId: wineId || undefined } : l)));

  const applyDepletion = async () => {
    const matchedLines = lines.filter((l) => l.matchedWineId && l.qty > 0);
    if (!matchedLines.length || !user || !source || already) return;
    setBusy(true);
    try {
      const todayDate = new Date().toISOString().slice(0, 10);
      const inputs = matchedLines.map((line) => ({
        wine: winesById.get(line.matchedWineId!)!,
        siteId,
        type: 'out' as const,
        qty: line.qty,
        reason: 'vente' as const,
        date: todayDate,
        note: `Ventes caisse ${source.fileName}${line.posCode ? ` (${line.posCode})` : ''}`,
      }));
      const ops = buildMovementOps(orgId, inputs, { userId: user.uid, userName: user.name }, Date.now(), stock);
      const record: PosImport = { id: source.id, fileName: source.fileName, createdAt: Date.now(), userName: user.name };
      await commit([...ops, { op: 'set', path: path('posImports', source.id), data: { ...record, lines: matchedLines.length } }]);
      toast(`${matchedLines.reduce((n, l) => n + l.qty, 0)} bouteilles sorties du stock (${matchedLines.length} lignes).`);
      onClose();
    } catch (e) {
      toast((e as Error).message || 'Erreur lors du déstockage', 'bad');
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
      title="Ventes de caisse : import du rapport"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button variant="primary" onClick={applyDepletion} disabled={busy || matchedCount === 0 || !!already} loading={busy}>
            {`Sortir du stock (${matchedCount} ${matchedCount > 1 ? 'lignes' : 'ligne'})`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Importez le rapport de ventes de fin de service exporté par votre caisse (CSV ou TXT). Chaque ligne reconnue devient une sortie de stock tracée ; les autres
          s’associent à la main. Une connexion directe à votre caisse se met en place au cas par cas.
        </p>

        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-surface-2/40 p-6 text-center">
          <UploadCloud className="mb-2 size-10 text-brand opacity-80" />
          <p className="text-sm font-medium text-ink">Rapport de ventes (CSV ou TXT)</p>
          <p className="mt-1 text-xs text-muted">Colonnes : Article ; Quantité ; Code PLU (facultatif). Séparateur point-virgule, virgule ou tabulation.</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <label className="cursor-pointer rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold transition-colors hover:bg-surface-2">
              <span>Choisir un fichier</span>
              <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={handleFileUpload} className="sr-only" />
            </label>
            {(demo || org.isDemo) && (
              <>
                <span className="text-xs text-muted">ou</span>
                <button type="button" onClick={() => load(DEMO_POS_CSV, 'exemple-service.csv')} className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
                  <Sparkles className="size-3.5" />
                  Charger un exemple de service
                </button>
              </>
            )}
          </div>
        </div>

        {lines.length > 0 && (
          <div className="space-y-3">
            {already && (
              <div role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
                Ce rapport a déjà été importé le {dateFr(already.createdAt)} par {already.userName} : aucune nouvelle sortie ne sera enregistrée.
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
              <span>
                {source?.fileName} · {lines.length} {lines.length > 1 ? 'lignes' : 'ligne'}
              </span>
              <span className="text-ok">{matchedCount} associées</span>
            </div>
            {sites.length > 1 && (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted">Site de sortie</span>
                <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="rounded-lg border border-border bg-surface px-2 py-1 text-sm">
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="max-h-72 divide-y divide-border/60 overflow-y-auto rounded-xl border border-border bg-surface">
              {lines.map((line) => {
                const matchedWine = line.matchedWineId ? winesById.get(line.matchedWineId) : undefined;
                return (
                  <div key={line.id} className="flex items-center justify-between gap-3 p-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink">{line.rawLabel}</span>
                        {line.posCode && <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">{line.posCode}</span>}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-muted">
                        <ChevronRight className="size-3 shrink-0 text-brand" />
                        <select
                          aria-label={`Vin associé à ${line.rawLabel}`}
                          value={line.matchedWineId ?? ''}
                          onChange={(e) => associate(line.id, e.target.value)}
                          className={`min-w-0 flex-1 rounded-md border bg-surface px-1.5 py-1 text-xs ${matchedWine ? 'border-border text-ink' : 'border-warn/60 text-warn'}`}
                        >
                          <option value="">Non reconnu : choisir le vin…</option>
                          {options.map((w) => (
                            <option key={w.id} value={w.id}>
                              {wineLabel(w)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="font-mono text-sm font-bold text-ink">-{line.qty} btl</span>
                    </div>
                    <div className="shrink-0">{matchedWine ? <CheckCircle2 className="size-5 text-ok" /> : <XCircle className="size-5 text-warn opacity-60" />}</div>
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
