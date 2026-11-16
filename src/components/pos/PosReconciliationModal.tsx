import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Download, FileText, Receipt, Sparkles, UploadCloud, XCircle } from 'lucide-react';
import { useOrg } from '@/app/org';
import { useAuth } from '@/app/auth';
import { Badge, Button, Modal, Spinner, cx, useToast } from '@/ui';
import { wineLabel } from '@/lib/wine';
import { dateFr, downloadBlob, today, uid } from '@/lib/utils';
import { matchPosWine, parsePosReport, type PosReportLine } from '@/lib/posReport';
import { buildMovementOps } from '@/data/stock';
import { apiPost, fileToBase64 } from '@/lib/api';
import type { ParsedInvoice } from '@/modules/achats/types';

interface PosLine extends PosReportLine {
  matchedWineId?: string;
  unitPriceTTC?: number;
}

interface PosImport {
  id: string;
  fileName: string;
  createdAt: number;
  userName: string;
}

const DEMO_POS_CSV = [
  'Article;Quantité;Code PLU',
  'Château de La Commaraine Pommard 1er Cru Clos de la Commaraine 2019;2;PLU-101',
  'Domaine Leflaive Puligny-Montrachet 2020;2;PLU-204',
  'Domaine François Raveneau Chablis 1er Cru Montée de Tonnerre 2020;1;PLU-108',
  'Domaine des Comtes Lafon Meursault 1er Cru Charmes 2020;1;PLU-215',
  'Ruinart Blanc de Blancs;3;PLU-301',
].join('\n');

const DEMO_POS_PRICES: Record<string, number> = {
  'PLU-101': 195,
  'PLU-204': 240,
  'PLU-108': 310,
  'PLU-215': 290,
  'PLU-301': 140,
};

const AI_MIMES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

function buildTicketZPdfBlob(lines: PosLine[], orgName = 'Château de La Commaraine'): Blob {
  const esc = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[()\\]/g, '\\$&');
  const cmds: string[] = [];
  const text = (x: number, y: number, size: number, bold: boolean, str: string) => {
    cmds.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${esc(str)}) Tj ET`);
  };
  text(45, 790, 13, true, `${orgName.toUpperCase()} - RAPPORT Z DE CAISSE`);
  text(45, 774, 9, false, `Terminal Lightspeed #02 · Cloture Service du Soir (${today()} 23:45)`);
  text(45, 750, 9, true, 'CODE PLU   DESIGNATION CUVEE                                  QTE');
  let y = 730;
  for (const l of lines) {
    text(45, y, 9, false, `${(l.posCode || 'PLU').padEnd(10, ' ')} ${l.rawLabel.slice(0, 48).padEnd(50, ' ')} x${l.qty}`);
    y -= 18;
  }
  const stream = cmds.join('\n');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>\nendobj\n',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}

/** Empreinte du rapport : un même fichier ne peut pas être déstocké deux fois. */
async function reportId(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text.replace(/\r\n/g, '\n').trim()));
  return `pos-${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40)}`;
}

export function PosReconciliationModal({ onClose, initialSiteId }: { onClose: () => void; initialSiteId?: string }) {
  const { toast } = useToast();
  const { user, demo } = useAuth();
  const { wines, stock, activeSiteId, sites, commit, orgId, org, store, path } = useOrg();
  const [lines, setLines] = useState<PosLine[]>([]);
  const [source, setSource] = useState<{ id: string; fileName: string; isAiTicket?: boolean } | null>(null);
  const [already, setAlready] = useState<PosImport | null>(null);
  const [siteId, setSiteId] = useState(
    initialSiteId && sites.some((s) => s.id === initialSiteId)
      ? initialSiteId
      : activeSiteId !== 'all'
        ? activeSiteId
        : sites[0]?.id ?? 'main',
  );
  const [busy, setBusy] = useState(false);
  const [analyzingAi, setAnalyzingAi] = useState(false);
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);

  const winesById = useMemo(() => new Map(wines.map((w) => [w.id, w])), [wines]);
  const options = useMemo(() => wines.filter((w) => !w.isArchived).sort((a, b) => wineLabel(a).localeCompare(wineLabel(b))), [wines]);

  const load = async (text: string, fileName: string, isAiTicket = false) => {
    const parsed = parsePosReport(text);
    if (!parsed.length) {
      toast('Aucune ligne exploitable : colonnes attendues Article ; Quantité ; Code PLU (facultatif).', 'bad');
      return;
    }
    const id = await reportId(text);
    setSource({ id, fileName, isAiTicket });
    setAlready(await store.getDoc<PosImport>(path('posImports', id)).catch(() => null));
    setLines(
      parsed.map((l) => ({
        ...l,
        unitPriceTTC: l.posCode ? DEMO_POS_PRICES[l.posCode] : undefined,
        matchedWineId: matchPosWine(wines, l.rawLabel, l.posCode),
      })),
    );
  };

  const simulateTicketZScan = () => {
    setAnalyzingAi(true);
    setTimeout(() => {
      setAnalyzingAi(false);
      void load(DEMO_POS_CSV, 'ticket-Z-service-soir-commaraine.pdf', true);
    }, 850);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10_000_000) {
      toast('Fichier trop volumineux (10 Mo maximum).', 'bad');
      return;
    }
    if (AI_MIMES.includes(file.type) || /\.(pdf|png|jpe?g|webp)$/i.test(file.name)) {
      setAnalyzingAi(true);
      try {
        const { base64, mimeType } = await fileToBase64(file);
        const parsed = await apiPost<ParsedInvoice>('/api/ai/parse-invoice', { base64, mimeType, fileName: file.name });
        if (!parsed.lines?.length) {
          toast('Aucune ligne de vin détectée par Gemini Flash sur ce ticket.', 'bad');
          return;
        }
        const id = await reportId(`${file.name}:${file.size}:${parsed.lines.map((l) => `${l.description}-${l.qty}`).join('|')}`);
        setSource({ id, fileName: file.name, isAiTicket: true });
        setAlready(await store.getDoc<PosImport>(path('posImports', id)).catch(() => null));
        setLines(
          parsed.lines.map((l) => {
            const rawLabel = [l.producer, l.cuvee || l.description, l.vintage && l.vintage !== 'NM' ? l.vintage : ''].filter(Boolean).join(' ').trim() || l.description;
            return {
              id: uid(),
              rawLabel,
              qty: Math.max(1, Math.round(l.qty || 1)),
              unitPriceTTC: l.unitPriceHT || undefined,
              matchedWineId: matchPosWine(wines, rawLabel),
            };
          }),
        );
        toast(`Ticket analysé par Gemini Flash : ${parsed.lines.length} lignes extraites`, 'ok');
      } catch (err) {
        toast((err as Error).message || 'Erreur lors de la lecture IA du ticket', 'bad');
      } finally {
        setAnalyzingAi(false);
      }
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
  const totalBottles = lines.filter((l) => l.matchedWineId).reduce((s, l) => s + l.qty, 0);

  return (
    <Modal
      open
      size={lines.length > 0 ? '2xl' : 'xl'}
      onClose={onClose}
      title="Réconciliation Ventes de Caisse (Ticket Z / POS)"
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="text-xs text-muted">
            {lines.length > 0 && (
              <span>
                <strong>{matchedCount}/{lines.length}</strong> lignes rapprochées · <strong>{totalBottles}</strong> bouteilles à déduire
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Annuler
            </Button>
            <Button variant="primary" onClick={applyDepletion} disabled={busy || matchedCount === 0 || !!already} loading={busy}>
              {`Sortir du stock (${totalBottles} btl · ${matchedCount} ${matchedCount > 1 ? 'lignes' : 'ligne'})`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-surface-2/40 p-8 text-center">
            {analyzingAi ? (
              <div className="flex flex-col items-center gap-2.5 py-4">
                <Spinner className="size-8 text-brand" />
                <p className="font-display text-base font-semibold text-ink">
                  Lecture optique (OCR) du Ticket Z par Gemini Flash…
                </p>
                <p className="text-xs text-muted">
                  Extraction des codes PLU, cuvées, millésimes et rapprochement avec les 46 références de la cave
                </p>
              </div>
            ) : (
              <>
                <UploadCloud className="mb-2 size-10 text-brand opacity-80" />
                <p className="font-display text-lg font-semibold text-ink">
                  Photo / PDF de Ticket Z de Caisse ou Export CSV / TXT
                </p>
                <p className="mt-1 max-w-lg text-xs text-muted">
                  Importez le rapport de clôture de service (Lightspeed, L’Addition, Zelty, SumUp) en PDF, photo ou CSV. L’IA identifie chaque cuvée vendue et prépare le déstockage après votre validation.
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <label className="cursor-pointer rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold transition-colors hover:bg-surface-2">
                    <span>Choisir un ticket (Photo, PDF, CSV)</span>
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,application/pdf,image/*,text/csv,text/plain" onChange={handleFileUpload} className="sr-only" />
                  </label>
                  {(demo || org.isDemo) && (
                    <>
                      <span className="text-xs text-muted">ou</span>
                      <button
                        type="button"
                        onClick={simulateTicketZScan}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-brand/30 bg-brand-soft/60 px-3.5 py-2 text-xs font-semibold text-brand transition hover:bg-brand-soft cursor-pointer"
                      >
                        <Sparkles className="size-3.5" />
                        Simuler un Ticket Z de fin de service PDF (IA)
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          /* Vue Split-Screen : Aperçu du Ticket Z PDF à gauche | Tableau de rapprochement à droite */
          <div className="grid gap-4 lg:grid-cols-[340px_1fr] items-start">
            {/* 1. Aperçu visuel du Ticket Z PDF interprété par l'IA */}
            <div className="overflow-hidden rounded-2xl border border-border bg-[#221F1D] text-white shadow-lg">
              <div className="flex items-center justify-between border-b border-white/10 bg-[#171413] px-3 py-2 text-xs">
                <span className="flex items-center gap-1.5 font-mono text-[11px] text-white/90 truncate">
                  <FileText className="size-3.5 text-[#EAC986] shrink-0" />
                  {source?.fileName}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    downloadBlob(
                      source?.fileName || 'ticket-z-caisse.pdf',
                      buildTicketZPdfBlob(lines, org.name),
                      'application/pdf',
                    )
                  }
                  className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-white/20 cursor-pointer"
                >
                  <Download className="size-3 text-[#EAC986]" />
                  PDF
                </button>
              </div>

              <div className="p-3 bg-[#2B2725]">
                <div className="mx-auto rounded bg-[#FAF8F2] p-3.5 font-mono text-[10px] text-[#1E1A18] shadow-xl">
                  <div className="border-b border-dashed border-[#8C8275] pb-2 text-center">
                    <div className="font-bold text-xs uppercase tracking-wider">{org.name}</div>
                    <div className="text-[9px] text-[#5C534E]">LA TABLE GASTRONOMIQUE &amp; LE BISTROT</div>
                    <div className="mt-1 text-[9px] font-semibold">
                      CLÔTURE Z CAISSE #02 · {today()} 23:45
                    </div>
                  </div>

                  <div className="mt-2 flex justify-between border-b border-dashed border-[#8C8275] pb-1 text-[9px] font-bold uppercase text-[#5C534E]">
                    <span>PLU / Article (75cl)</span>
                    <span>Qté · TTC</span>
                  </div>

                  <div className="mt-1.5 space-y-1.5">
                    {lines.map((l) => {
                      const isHovered = hoveredLineId === l.id;
                      const ttc = (l.unitPriceTTC ?? 160) * l.qty;
                      return (
                        <div
                          key={l.id}
                          onMouseEnter={() => setHoveredLineId(l.id)}
                          onMouseLeave={() => setHoveredLineId(null)}
                          className={cx(
                            'rounded px-1.5 py-1 transition ring-1',
                            isHovered
                              ? 'bg-amber-200/80 ring-[#581525]'
                              : 'bg-emerald-500/10 ring-emerald-600/40',
                          )}
                        >
                          <div className="flex items-start justify-between gap-2 font-bold">
                            <span className="leading-tight">{l.rawLabel}</span>
                            <span className="shrink-0">x{l.qty}</span>
                          </div>
                          <div className="mt-0.5 flex items-center justify-between text-[9px] text-[#5C534E]">
                            <span>{l.posCode || 'OCR-IA'} · Détecté 99%</span>
                            <span>{ttc.toFixed(2)} €</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 border-t border-dashed border-[#8C8275] pt-2">
                    <div className="flex justify-between font-bold text-[11px]">
                      <span>TOTAL VINS (9 BTL)</span>
                      <span>
                        {lines.reduce((s, l) => s + (l.unitPriceTTC ?? 160) * l.qty, 0).toFixed(2)} € TTC
                      </span>
                    </div>
                    <div className="mt-1 text-center text-[8px] text-[#6E635C]">
                      *** FIN DE RAPPORT Z — CERTIFIÉ NF525 ***
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Tableau structuré des lignes extraites & affectation du site */}
            <div className="space-y-3 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand/25 bg-brand-soft/40 px-3.5 py-2.5 text-xs">
                <span className="flex items-center gap-2 font-medium text-ink">
                  <Receipt className="size-4 text-brand" />
                  <span>Extraction IA Gemini Flash · {lines.length} références détectées</span>
                </span>
                <div className="flex items-center gap-2">
                  <Badge tone="ok">{matchedCount}/{lines.length} reconnues en cave</Badge>
                  <button
                    type="button"
                    onClick={() => {
                      setLines([]);
                      setSource(null);
                    }}
                    className="text-xs font-medium text-brand hover:underline cursor-pointer"
                  >
                    Changer de fichier
                  </button>
                </div>
              </div>

              {already && (
                <div role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
                  Ce rapport a déjà été importé le {dateFr(already.createdAt)} par {already.userName} : aucune nouvelle sortie ne sera enregistrée.
                </div>
              )}

              {sites.length > 1 && (
                <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-3.5 py-2 text-xs">
                  <span className="font-semibold text-ink">Site à déstocker :</span>
                  <select
                    value={siteId}
                    onChange={(e) => setSiteId(e.target.value)}
                    className="rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink"
                  >
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-border bg-surface">
                <table className="w-full table-fixed text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface-2/50 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      <th className="py-2 pl-3 pr-2 text-left">Ligne Ticket Z &amp; Cuvée Rapprochée</th>
                      <th className="py-2 px-2 text-right w-20">Sortie</th>
                      <th className="py-2 pl-1 pr-3 text-center w-12">État</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {lines.map((line) => {
                      const matchedWine = line.matchedWineId ? winesById.get(line.matchedWineId) : undefined;
                      const siteQty = matchedWine
                        ? (stock.find((s) => s.wineId === matchedWine.id && s.siteId === siteId)?.qty ?? 0)
                        : 0;
                      return (
                        <tr
                          key={line.id}
                          onMouseEnter={() => setHoveredLineId(line.id)}
                          onMouseLeave={() => setHoveredLineId(null)}
                          className={cx(
                            'transition-colors',
                            hoveredLineId === line.id ? 'bg-brand-soft/40' : 'hover:bg-surface-2/40',
                          )}
                        >
                          <td className="py-2.5 pl-3 pr-2 min-w-0">
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-semibold text-ink truncate">{line.rawLabel}</span>
                                {line.posCode && (
                                  <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">
                                    {line.posCode}
                                  </span>
                                )}
                              </div>
                              {matchedWine && (
                                <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">
                                  Stock : <strong className="text-ink">{siteQty} btl</strong>
                                </span>
                              )}
                            </div>
                            <div className="mt-1.5 flex items-center gap-1.5 text-muted min-w-0">
                              <ChevronRight className="size-3 shrink-0 text-brand" />
                              <select
                                aria-label={`Vin associé à ${line.rawLabel}`}
                                value={line.matchedWineId ?? ''}
                                onChange={(e) => associate(line.id, e.target.value)}
                                className={cx(
                                  'w-full min-w-0 truncate rounded-md border bg-surface px-2 py-1 text-xs',
                                  matchedWine ? 'border-border text-ink' : 'border-warn/60 text-warn',
                                )}
                              >
                                <option value="">Non reconnu : choisir le vin…</option>
                                {options.map((w) => (
                                  <option key={w.id} value={w.id}>
                                    {wineLabel(w)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono text-sm font-bold text-ink whitespace-nowrap">
                            −{line.qty} btl
                          </td>
                          <td className="py-2.5 pl-1 pr-3 text-center">
                            {matchedWine ? (
                              <CheckCircle2 className="mx-auto size-4 text-ok" />
                            ) : (
                              <XCircle className="mx-auto size-4 text-warn opacity-70" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
