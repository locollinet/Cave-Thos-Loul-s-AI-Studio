import { useOrg } from '@/app/org';
import type { Locale } from '@/types';
import { useT } from '@/i18n';
import { useToast } from '@/ui';
import { mailtoHref, reminderEmail, reminderOps } from './reminders';
import type { SaleDocument } from './types';

/** Construit le lien `mailto:` d'une relance et trace son envoi sur le document. */
export function useReminders() {
  const { org, orgId, partners, commit } = useOrg();
  const { toast } = useToast();
  const t = useT();

  const mail = (doc: SaleDocument, amount: number, lang: Locale, daysLate?: number): { href: string; email?: string } => {
    const p = partners.find((x) => x.id === doc.partnerId);
    const { subject, body } = reminderEmail({
      kind: doc.type === 'quote' ? 'quote' : 'invoice',
      lang,
      number: doc.number,
      amount,
      currency: org.currency,
      date: doc.date,
      dueDate: doc.dueDate,
      validUntil: doc.validUntil,
      daysLate,
      orgName: org.name,
      contactName: p?.contactName,
      iban: org.legal?.iban || undefined,
      bic: org.legal?.bic || undefined,
      reminderCount: doc.reminderCount,
    });
    return { href: mailtoHref(p?.email, subject, body), email: p?.email || undefined };
  };

  const record = async (doc: SaleDocument) => {
    try {
      await commit(reminderOps(orgId, doc.id));
      toast(t('negoce.remind.recorded', { number: doc.number }));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error'), 'bad');
    }
  };

  return { mail, record, defaultLang: (org.locale ?? 'fr') as Locale };
}
