import { useState } from 'react';
import { CheckCircle2, Download, Eye, FileText, Sparkles, ZoomIn, ZoomOut } from 'lucide-react';
import { Badge, Button, cx } from '@/ui';
import { downloadBlob, eur, round2 } from '@/lib/utils';
import type { InvoiceDraft } from './types';
import { draftTotals } from './receive';

/**
 * Génère un vrai fichier PDF valide (norme PDF 1.4, police Helvetica intégrée)
 * pour permettre le téléchargement ou le glisser-déposer d'une vraie facture PDF.
 */
export function buildRealInvoicePdfBlob(draft: InvoiceDraft, orgName = 'Château de La Commaraine', defaultVat = 20): Blob {
  const esc = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[()\\]/g, '\\$&');

  const totals = draftTotals(draft, defaultVat);
  const cmds: string[] = [];
  const text = (x: number, y: number, size: number, bold: boolean, str: string) => {
    cmds.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${esc(str)}) Tj ET`);
  };
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    cmds.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  };

  cmds.push('0.2 0.08 0.11 RG 0.8 w');
  text(45, 790, 15, true, (draft.supplierName || 'GRANDS TERROIRS DE BOURGOGNE').toUpperCase());
  text(45, 774, 9, false, '14 Place Carnot - 21200 BEAUNE · SIRET 412 890 331 00018 · Accises FR021004829E');
  text(400, 790, 14, true, `FACTURE N° ${draft.number || 'FAC-2026-0842'}`);
  text(400, 774, 9, false, `Date : ${draft.date}   Echeance : ${draft.dueDate || draft.date}`);

  line(45, 758, 550, 758);
  text(45, 740, 10, true, `DESTINATAIRE : ${orgName}`);
  text(45, 726, 9, false, 'Cave Centrale & Sommellerie - 21630 POMMARD (Bourgogne)');
  line(45, 712, 550, 712);

  text(45, 694, 9, true, 'DESIGNATION CUVEE & MILLESIME');
  text(350, 694, 9, true, 'QTE');
  text(400, 694, 9, true, 'PU HT');
  text(465, 694, 9, true, 'TVA');
  text(505, 694, 9, true, 'TOTAL HT');
  line(45, 686, 550, 686);

  let y = 668;
  for (const l of draft.lines) {
    const label = (l.description || `${l.producer} - ${l.name} ${l.vintage}`).slice(0, 58);
    const totalLine = round2(l.qty * l.unitPriceHT);
    text(45, y, 9, false, label);
    text(355, y, 9, false, `${l.qty}`);
    text(400, y, 9, false, `${l.unitPriceHT.toFixed(2)} EUR`);
    text(465, y, 9, false, `${l.vatRate}%`);
    text(505, y, 9, true, `${totalLine.toFixed(2)} EUR`);
    y -= 20;
  }

  line(45, y + 6, 550, y + 6);
  y -= 16;
  if (draft.shippingHT > 0) {
    text(370, y, 9, false, 'Frais de port & assurance HT :');
    text(505, y, 9, false, `${draft.shippingHT.toFixed(2)} EUR`);
    y -= 16;
  }
  text(370, y, 10, true, 'TOTAL HT :');
  text(505, y, 10, true, `${totals.ht.toFixed(2)} EUR`);
  y -= 16;
  text(370, y, 9, false, 'TOTAL TVA (20%) :');
  text(505, y, 9, false, `${totals.vat.toFixed(2)} EUR`);
  y -= 18;
  text(370, y, 11, true, 'NET A PAYER TTC :');
  text(500, y, 11, true, `${totals.ttc.toFixed(2)} EUR`);

  y -= 35;
  text(45, y, 8, false, 'Capsules Représentatives de Droits (CRD) acquittees - Document simplifie d accompagnement (DSA).');

  const stream = cmds.join('\n');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
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

interface InvoicePdfPreviewProps {
  draft: InvoiceDraft;
  orgName?: string;
  defaultVat?: number;
  intl?: string;
  filePreviewUrl?: string;
  fileMimeType?: string;
  scanning?: boolean;
  highlightedLineKey?: string | null;
  onHoverLine?: (key: string | null) => void;
}

export function InvoicePdfPreview({
  draft,
  orgName = 'Château de La Commaraine',
  defaultVat = 20,
  intl = 'fr-FR',
  filePreviewUrl,
  fileMimeType,
  scanning = false,
  highlightedLineKey,
  onHoverLine,
}: InvoicePdfPreviewProps) {
  const [showAiBoxes, setShowAiBoxes] = useState(true);
  const [zoom, setZoom] = useState<number>(100);
  const totals = draftTotals(draft, defaultVat);

  const handleDownloadPdf = () => {
    const blob = buildRealInvoicePdfBlob(draft, orgName, defaultVat);
    const filename = draft.fileName || `facture-${(draft.number || 'domaine').toLowerCase()}.pdf`;
    downloadBlob(filename.endsWith('.pdf') ? filename : `${filename}.pdf`, blob, 'application/pdf');
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-[#221F1D] text-white shadow-xl">
      {/* Barre supérieure type lecteur PDF professionnel */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#171413] px-3.5 py-2.5 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="size-4 text-[#EAC986] shrink-0" />
          <span className="truncate font-mono text-[11px] font-medium text-white/90">
            {draft.fileName || `${(draft.number || 'facture-fournisseur').toLowerCase()}.pdf`}
          </span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/70">1 / 1</span>
        </div>

        <div className="flex items-center gap-1.5">
          {!filePreviewUrl && (
            <button
              type="button"
              onClick={() => setShowAiBoxes((v) => !v)}
              className={cx(
                'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition cursor-pointer',
                showAiBoxes
                  ? 'border-[#EAC986]/50 bg-[#EAC986]/15 text-[#EAC986]'
                  : 'border-white/15 bg-white/5 text-white/70 hover:text-white',
              )}
              title="Afficher / masquer les zones détectées par Gemini Flash OCR"
            >
              <Sparkles className="size-3" />
              <span>Calques IA</span>
            </button>
          )}
          <div className="hidden sm:flex items-center rounded-lg border border-white/10 bg-white/5 px-1">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(85, z - 10))}
              className="p-1 text-white/70 hover:text-white cursor-pointer"
              title="Réduire"
            >
              <ZoomOut className="size-3.5" />
            </button>
            <span className="px-1.5 font-mono text-[10px] text-white/80">{zoom}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(115, z + 10))}
              className="p-1 text-white/70 hover:text-white cursor-pointer"
              title="Agrandir"
            >
              <ZoomIn className="size-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-white/20 transition cursor-pointer"
            title="Télécharger le vrai fichier PDF sur votre ordinateur"
          >
            <Download className="size-3.5 text-[#EAC986]" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* Corps du lecteur PDF : Feuille A4 réaliste ou fichier importé */}
      <div className="relative flex-1 overflow-auto bg-[#2B2725] p-3 sm:p-5">
        {scanning && (
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/55 backdrop-blur-[2px]">
            <div className="w-4/5 max-w-sm rounded-2xl border border-[#EAC986]/50 bg-[#1B1214]/95 p-4 text-center shadow-2xl">
              <Sparkles className="mx-auto size-6 text-[#EAC986] animate-pulse" />
              <p className="mt-2 font-display text-base font-semibold text-white">
                Analyse OCR &amp; IA Gemini Flash en cours…
              </p>
              <p className="mt-1 text-xs text-[#EAC986]">
                Extraction des cuvées, millésimes, quantités, PU HT et calcul du Coût Moyen Pondéré (CMP)
              </p>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-3/4 animate-pulse rounded-full bg-gradient-to-r from-[#8C2438] via-[#EAC986] to-emerald-400" />
              </div>
            </div>
          </div>
        )}

        {filePreviewUrl && fileMimeType === 'application/pdf' ? (
          <iframe
            src={filePreviewUrl}
            title="Aperçu PDF"
            className="h-[580px] w-full rounded-lg border border-white/15 bg-white shadow-2xl"
          />
        ) : filePreviewUrl && fileMimeType?.startsWith('image/') ? (
          <img
            src={filePreviewUrl}
            alt="Facture importée"
            className="mx-auto max-h-[580px] rounded-lg border border-white/15 bg-white object-contain shadow-2xl"
          />
        ) : (
          /* Feuille A4 de facture fournisseur haute fidélité */
          <div
            className="mx-auto max-w-[640px] rounded-sm bg-[#FCFBF8] p-5 sm:p-7 text-[#1E1A18] shadow-[0_14px_40px_rgba(0,0,0,0.65)] transition-transform origin-top"
            style={{ fontSize: `${zoom}%` }}
          >
            {/* En-tête Fournisseur + Numéro de Facture */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#581525] pb-4">
              <div
                className={cx(
                  'rounded-md p-1.5 transition',
                  showAiBoxes && 'ring-1 ring-emerald-600/60 bg-emerald-500/5',
                )}
              >
                {showAiBoxes && (
                  <span className="mb-0.5 inline-flex items-center gap-1 rounded bg-emerald-700 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-white">
                    ✓ Fournisseur détecté (99.8%)
                  </span>
                )}
                <div className="font-display text-lg font-bold tracking-wide text-[#581525] uppercase">
                  {draft.supplierName || 'Grands Terroirs de Bourgogne'}
                </div>
                <div className="text-[10px] text-[#5C534E] leading-snug mt-0.5">
                  14 Place Carnot · 21200 BEAUNE — Côte-d&apos;Or
                  <br />
                  SIRET 412 890 331 00018 · TVA FR 49 412890331 · Accises FR021004829E
                </div>
              </div>

              <div
                className={cx(
                  'text-right rounded-md p-1.5 transition',
                  showAiBoxes && 'ring-1 ring-emerald-600/60 bg-emerald-500/5',
                )}
              >
                {showAiBoxes && (
                  <span className="mb-0.5 inline-flex items-center gap-1 rounded bg-emerald-700 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-white">
                    ✓ Réf &amp; Dates (99.9%)
                  </span>
                )}
                <div className="font-mono text-xs font-bold uppercase tracking-wider text-[#1E1A18]">
                  FACTURE N° {draft.number || 'FAC-2026-0842'}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-[#5C534E]">
                  Date : {draft.date}
                  <br />
                  Échéance : {draft.dueDate || draft.date}
                </div>
              </div>
            </div>

            {/* Encart Destinataire & Conditions */}
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-md border border-[#E6DFD3] bg-[#F6F3EC] p-3 text-[11px]">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-[#7A6F68]">Facturé &amp; Livré à</div>
                <div className="font-semibold text-[#1E1A18] mt-0.5">{orgName}</div>
                <div className="text-[10px] text-[#5C534E]">Cave Centrale &amp; Sommellerie · 21630 Pommard</div>
              </div>
              <div className="text-right">
                <div className="text-[9px] font-bold uppercase tracking-wider text-[#7A6F68]">Régime Douanier &amp; Transport</div>
                <div className="font-medium text-[#1E1A18] mt-0.5">Droits Acquittés (CRD) · Franc de casse</div>
                <div className="text-[10px] text-[#5C534E]">Livraison cave tempérée sur palette</div>
              </div>
            </div>

            {/* Tableau des lignes de la facture PDF */}
            <div className="mt-4">
              {showAiBoxes && (
                <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-emerald-800">
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="size-3 text-emerald-700" />
                    {draft.lines.length} lignes de vins extraites et structurées
                  </span>
                  <span className="font-mono text-[9px] text-[#7A6F68]">Survolez une ligne pour la cibler</span>
                </div>
              )}
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="border-b-2 border-[#1E1A18] bg-[#EFECE4] text-[9px] font-bold uppercase tracking-wider text-[#4A423D]">
                    <th className="py-1.5 pl-2 text-left">Réf / Désignation Cuvée &amp; Millésime</th>
                    <th className="py-1.5 px-1.5 text-center">Format</th>
                    <th className="py-1.5 px-1.5 text-right">Qté</th>
                    <th className="py-1.5 px-1.5 text-right">PU HT</th>
                    <th className="py-1.5 px-1.5 text-right">TVA</th>
                    <th className="py-1.5 pr-2 text-right">Total HT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5DEC9]">
                  {draft.lines.map((l, idx) => {
                    const isHighlighted = highlightedLineKey === l.key;
                    const lineTotal = round2(l.qty * l.unitPriceHT);
                    return (
                      <tr
                        key={l.key}
                        onMouseEnter={() => onHoverLine?.(l.key)}
                        onMouseLeave={() => onHoverLine?.(null)}
                        className={cx(
                          'transition-colors',
                          isHighlighted
                            ? 'bg-amber-200/70 ring-1 ring-[#581525]'
                            : showAiBoxes
                              ? 'bg-emerald-500/[0.04] hover:bg-amber-100/60'
                              : 'hover:bg-black/5',
                        )}
                      >
                        <td className="py-2 pl-2 pr-1">
                          <div className="font-semibold text-[#1E1A18]">
                            {l.description || `${l.producer} — ${l.name} ${l.vintage}`}
                          </div>
                          <div className="font-mono text-[9px] text-[#6E635C]">
                            LOT-2026-0{idx + 1} · {l.producer || 'Domaine'} · Millésime {l.vintage || 'NM'}
                          </div>
                        </td>
                        <td className="py-2 px-1.5 text-center font-mono text-[10px] text-[#5C534E]">
                          {l.formatCl} cl
                        </td>
                        <td className="py-2 px-1.5 text-right font-mono font-bold text-[#1E1A18]">
                          {l.qty}
                        </td>
                        <td className="py-2 px-1.5 text-right font-mono text-[#1E1A18]">
                          {eur(l.unitPriceHT, 'EUR', intl)}
                        </td>
                        <td className="py-2 px-1.5 text-right font-mono text-[10px] text-[#5C534E]">
                          {l.vatRate}%
                        </td>
                        <td className="py-2 pr-2 text-right font-mono font-semibold text-[#1E1A18]">
                          {eur(lineTotal, 'EUR', intl)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pied de facture : Frais de port, Totaux HT / TVA / TTC & Cachet */}
            <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t-2 border-[#1E1A18] pt-3">
              <div className="space-y-1 text-[9px] text-[#6E635C] max-w-[260px]">
                <div className="inline-block rounded border border-[#581525]/40 px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-[#581525] -rotate-2">
                  CERTIFIÉ CONFORME · ALLOCATION DOMAINE
                </div>
                <p>
                  Règlement par virement bancaire IBAN FR76 3000 4001 8200 0104 8291 044.
                  Réserve de propriété loi n° 80-335 du 12 mai 1980.
                </p>
              </div>

              <div
                className={cx(
                  'w-56 space-y-1 rounded-md p-2 text-xs',
                  showAiBoxes ? 'ring-1 ring-emerald-600/60 bg-emerald-500/5' : 'bg-[#F6F3EC]',
                )}
              >
                {draft.shippingHT > 0 && (
                  <div className="flex justify-between text-[11px] text-[#5C534E]">
                    <span>Port &amp; emballage HT</span>
                    <span className="font-mono">{eur(draft.shippingHT, 'EUR', intl)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[11px] font-semibold text-[#1E1A18]">
                  <span>Total HT</span>
                  <span className="font-mono">{eur(totals.ht, 'EUR', intl)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-[#5C534E]">
                  <span>TVA (20%)</span>
                  <span className="font-mono">{eur(totals.vat, 'EUR', intl)}</span>
                </div>
                <div className="flex justify-between border-t border-[#D5CBB8] pt-1 text-sm font-bold text-[#581525]">
                  <span>Net à payer TTC</span>
                  <span className="font-mono">{eur(totals.ttc, 'EUR', intl)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
