import type { Locale } from '@/types';
import type { Op } from '@/data/store';
import { dateFr, eur } from '@/lib/utils';
import { daysBetween, unpaidInvoices } from './calc';
import { negoceMsgs } from './messages';
import { docPath } from './ops';
import type { AgingRow, Payment, SaleDocument } from './types';

/** Message négoce dans une langue donnée (indépendante de la langue de l'interface). */
export function msg(lang: Locale, key: string, vars: Record<string, string | number> = {}): string {
  const pair = negoceMsgs[key];
  const raw = pair ? pair[lang === 'en' ? 1 : 0] : key;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] !== undefined ? String(vars[k]) : ''));
}

export const intlOf = (lang: Locale): string => (lang === 'en' ? 'en-GB' : 'fr-FR');

/* ------------------------------------------------------------ à relancer */

export const QUOTE_FOLLOW_UP_DAYS = 7;

/** Factures validées, non soldées et échues (au moins un jour de retard), plus anciennes d'abord. */
export const overdueInvoices = (docs: SaleDocument[], payments: Payment[], asOf: string): AgingRow[] => unpaidInvoices(docs, payments, asOf).filter((r) => r.daysLate > 0);

export interface PendingQuote {
  doc: SaleDocument;
  daysPending: number;
}

/** Devis envoyés restés sans réponse depuis plus de `minDays` jours. */
export function pendingQuotes(docs: SaleDocument[], asOf: string, minDays = QUOTE_FOLLOW_UP_DAYS): PendingQuote[] {
  return docs
    .filter((d) => d.type === 'quote' && d.status === 'sent')
    .map((doc) => ({ doc, daysPending: daysBetween(doc.date, asOf) }))
    .filter((r) => r.daysPending > minDays)
    .sort((a, b) => b.daysPending - a.daysPending);
}

/* ------------------------------------------------------------ modèles d'e-mail */

export interface ReminderInput {
  kind: 'invoice' | 'quote';
  lang: Locale;
  number: string;
  /** Reste dû TTC (facture) ou total HT (devis). */
  amount: number;
  currency?: string;
  date: string;
  dueDate?: string;
  validUntil?: string;
  daysLate?: number;
  orgName: string;
  contactName?: string;
  iban?: string;
  bic?: string;
  reminderCount?: number;
}

export function reminderEmail(i: ReminderInput): { subject: string; body: string } {
  const intl = intlOf(i.lang);
  const amount = eur(i.amount, i.currency ?? 'EUR', intl);
  const greeting = msg(i.lang, 'negoce.mail.hello', { name: i.contactName ? ` ${i.contactName}` : '' });
  if (i.kind === 'quote') {
    return {
      subject: msg(i.lang, 'negoce.mail.quoteSubject', { number: i.number, org: i.orgName }),
      body: msg(i.lang, 'negoce.mail.quoteBody', {
        hello: greeting,
        number: i.number,
        date: dateFr(i.date, intl),
        amount,
        valid: i.validUntil ? msg(i.lang, 'negoce.mail.quoteValid', { date: dateFr(i.validUntil, intl) }) : '',
        org: i.orgName,
      }),
    };
  }
  const bank = i.iban ? msg(i.lang, 'negoce.mail.bank', { iban: i.iban, bic: i.bic ? `\nBIC : ${i.bic}` : '', number: i.number }) : '';
  return {
    subject: msg(i.lang, (i.reminderCount ?? 0) > 0 ? 'negoce.mail.invoiceSubjectAgain' : 'negoce.mail.invoiceSubject', { number: i.number, org: i.orgName }),
    body: msg(i.lang, 'negoce.mail.invoiceBody', {
      hello: greeting,
      number: i.number,
      amount,
      due: i.dueDate ? dateFr(i.dueDate, intl) : '',
      days: i.daysLate ?? 0,
      bank,
      org: i.orgName,
    }),
  };
}

export const mailtoHref = (to: string | undefined, subject: string, body: string): string =>
  `mailto:${(to ?? '').trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

/** Trace la relance sur le document (date + compteur incrémenté atomiquement). */
export const reminderOps = (orgId: string, docId: string, now = Date.now()): Op[] => [
  { op: 'inc', path: docPath(orgId, docId), field: 'reminderCount', by: 1, data: { lastReminderAt: now } },
];
