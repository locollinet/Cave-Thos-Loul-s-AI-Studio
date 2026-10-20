import type { JournalLine } from './types';

export const FEC_HEADER = [
  'JournalCode',
  'JournalLib',
  'EcritureNum',
  'EcritureDate',
  'CompteNum',
  'CompteLib',
  'CompAuxNum',
  'CompAuxLib',
  'PieceRef',
  'PieceDate',
  'EcritureLib',
  'Debit',
  'Credit',
  'EcritureLet',
  'DateLet',
  'ValidDate',
  'Montantdevise',
  'Idevise',
] as const;

const fecDate = (iso: string): string => iso.replace(/-/g, '');
const fecAmount = (n: number): string => n.toFixed(2).replace('.', ',');
const fecText = (s: string): string => s.replace(/[\t\r\n]+/g, ' ').trim();

export const sirenFromSiret = (siret: string): string => siret.replace(/\D/g, '').slice(0, 9);

export const fecFilename = (siret: string, year: number): string => `${sirenFromSiret(siret) || '000000000'}FEC${year}1231.txt`;

export function fecContent(lines: JournalLine[]): string {
  const rows = lines.map((l) =>
    [
      l.journal,
      fecText(l.journalLib),
      String(l.num),
      fecDate(l.date),
      l.account,
      fecText(l.accountLib),
      l.auxAccount,
      fecText(l.auxLib),
      fecText(l.pieceRef) || String(l.num),
      fecDate(l.pieceDate),
      fecText(l.label),
      fecAmount(l.debit),
      fecAmount(l.credit),
      '',
      '',
      fecDate(l.pieceDate),
      '',
      '',
    ].join('\t'),
  );
  return [FEC_HEADER.join('\t'), ...rows].join('\r\n') + '\r\n';
}

export const journalCsvRows = (lines: JournalLine[], header: string[]): (string | number)[][] => [
  header,
  ...lines.map((l) => [l.journal, l.num, l.date, l.account, l.accountLib, l.auxAccount, l.pieceRef, l.label, l.debit, l.credit]),
];
