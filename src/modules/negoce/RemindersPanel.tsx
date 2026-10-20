import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, Mail } from 'lucide-react';
import type { Locale } from '@/types';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { dateFr, eur, today } from '@/lib/utils';
import { Badge, EmptyState, Segmented } from '@/ui';
import { QUOTE_FOLLOW_UP_DAYS, overdueInvoices, pendingQuotes } from './reminders';
import type { Payment, SaleDocument } from './types';
import { useReminders } from './useReminders';

export function reminderCount(docs: SaleDocument[], payments: Payment[], asOf: string): number {
  return overdueInvoices(docs, payments, asOf).length + pendingQuotes(docs, asOf).length;
}

const linkBtn = 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[13px] font-medium hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

/** Vue « À relancer » : factures échues impayées et devis envoyés sans réponse. */
export default function RemindersPanel({ docs, payments }: { docs: SaleDocument[]; payments: Payment[] }) {
  const { t, intl } = useI18n();
  const { org } = useOrg();
  const { mail, record, defaultLang } = useReminders();
  const [lang, setLang] = useState<Locale>(defaultLang);
  const asOf = today();
  const f = (n: number) => eur(n, org.currency, intl);
  const invoices = useMemo(() => overdueInvoices(docs, payments, asOf), [docs, payments, asOf]);
  const quotes = useMemo(() => pendingQuotes(docs, asOf), [docs, asOf]);

  const last = (d: SaleDocument) =>
    d.lastReminderAt ? <span className="block text-xs text-muted">{t('negoce.remind.last', { date: dateFr(d.lastReminderAt, intl), n: d.reminderCount ?? 1 })}</span> : null;

  const action = (d: SaleDocument, amount: number, daysLate?: number) => {
    const m = mail(d, amount, lang, daysLate);
    return (
      <a href={m.href} onClick={() => record(d)} className={linkBtn} title={m.email ? undefined : t('negoce.remind.noEmail')} data-testid={`remind-${d.id}`}>
        <Mail className="size-3.5" />
        {t('negoce.remind')}
      </a>
    );
  };

  if (!invoices.length && !quotes.length) {
    return <EmptyState icon={<BellRing className="size-8" />} title={t('negoce.remind.none')} hint={t('negoce.remind.noneHint')} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{t('negoce.remind.intro')}</p>
        <div className="flex items-center gap-2 text-sm" role="group" aria-labelledby="remind-lang">
          <span className="text-muted" id="remind-lang">
            {t('negoce.remind.lang')}
          </span>
          <Segmented<Locale>
            value={lang}
            onChange={setLang}
            options={[
              { value: 'fr', label: 'FR' },
              { value: 'en', label: 'EN' },
            ]}
          />
        </div>
      </div>

      {invoices.length > 0 && (
        <section aria-labelledby="remind-inv">
          <h2 id="remind-inv" className="mb-2 font-display text-lg font-semibold">
            {t('negoce.remind.invoices')} <span className="text-sm font-normal text-muted">({invoices.length})</span>
          </h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {invoices.map((r) => (
              <Row
                key={r.doc.id}
                doc={r.doc}
                when={
                  <>
                    <span className="mr-2">{dateFr(r.doc.dueDate, intl)}</span>
                    <Badge tone={r.daysLate > 30 ? 'bad' : 'warn'}>{t('negoce.daysLate', { n: r.daysLate })}</Badge>
                  </>
                }
                amount={f(r.balance)}
                amountLabel={t('negoce.balance')}
                last={last(r.doc)}
                action={action(r.doc, r.balance, r.daysLate)}
              />
            ))}
          </ul>
        </section>
      )}

      {quotes.length > 0 && (
        <section aria-labelledby="remind-quotes">
          <h2 id="remind-quotes" className="mb-2 font-display text-lg font-semibold">
            {t('negoce.remind.quotes', { n: QUOTE_FOLLOW_UP_DAYS })} <span className="text-sm font-normal text-muted">({quotes.length})</span>
          </h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {quotes.map((r) => (
              <Row
                key={r.doc.id}
                doc={r.doc}
                when={
                  <>
                    <span className="mr-2">{dateFr(r.doc.date, intl)}</span>
                    <Badge tone="info">{t('negoce.remind.pendingDays', { n: r.daysPending })}</Badge>
                  </>
                }
                amount={f(r.doc.totalHT)}
                amountLabel={t('negoce.totalHT')}
                last={last(r.doc)}
                action={action(r.doc, r.doc.totalHT)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Row({ doc, when, amount, amountLabel, last, action }: { doc: SaleDocument; when: ReactNode; amount: string; amountLabel: string; last: ReactNode; action: ReactNode }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1.3fr)_8rem_auto]" data-testid="remind-row">
      <div className="min-w-0 max-sm:col-start-1 max-sm:row-start-2">
        <Link to={`/negoce/view/${doc.id}`} className="font-medium text-brand hover:underline">
          {doc.number}
        </Link>
        {last}
      </div>
      <div className="min-w-0 truncate max-sm:col-span-2 max-sm:row-start-1 max-sm:font-medium">{doc.partnerName}</div>
      <div className="max-sm:col-start-1 max-sm:row-start-3">{when}</div>
      <div className="tabular text-right font-medium max-sm:col-start-2 max-sm:row-start-2">
        <span className="sr-only">{amountLabel} </span>
        {amount}
      </div>
      <div className="max-sm:col-start-2 max-sm:row-start-3 max-sm:justify-self-end">{action}</div>
    </li>
  );
}
