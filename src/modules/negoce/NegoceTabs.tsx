import { NavLink } from 'react-router-dom';
import { useT } from '@/i18n';
import { cx } from '@/ui';

const TABS = [
  { to: '/negoce', end: true, key: 'negoce.tab.documents' },
  { to: '/negoce/offres', end: false, key: 'negoce.tab.offers' },
  { to: '/negoce/payments', end: false, key: 'negoce.tab.payments' },
  { to: '/negoce/consignments', end: false, key: 'negoce.tab.consignments' },
];

/** Onglets de section du module, placés sous l'en-tête de page (comme Stock / Vins). */
export default function NegoceTabs() {
  const t = useT();
  return (
    <nav className="no-print mb-6 flex gap-1 overflow-x-auto border-b border-border" aria-label={t('nav.negoce')}>
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            cx(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
              isActive ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink',
            )
          }
        >
          {t(tab.key)}
        </NavLink>
      ))}
    </nav>
  );
}
