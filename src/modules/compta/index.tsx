import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useT } from '@/i18n';
import { NestedHeaders, PageHeader, cx } from '@/ui';
import AssetsPage from './AssetsPage';
import DrmPage from './DrmPage';
import ExpensesPage from './ExpensesPage';
import JournalPage from './JournalPage';
import OverviewPage from './OverviewPage';
import VatPage from './VatPage';

const TABS = [
  { to: '/compta', end: true, key: 'compta.tab.overview' },
  { to: '/compta/tva', end: false, key: 'compta.tab.vat' },
  { to: '/compta/drm', end: false, key: 'compta.tab.drm' },
  { to: '/compta/charges', end: false, key: 'compta.tab.expenses' },
  { to: '/compta/immobilisations', end: false, key: 'compta.tab.assets' },
  { to: '/compta/journal', end: false, key: 'compta.tab.journal' },
];

export default function ComptaModule() {
  const t = useT();
  return (
    <>
      <PageHeader title={t('nav.compta')} subtitle={t('mod.compta.desc')} />
      <nav className="no-print mb-6 flex gap-1 overflow-x-auto border-b border-border" aria-label={t('nav.compta')}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cx('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition', isActive ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink')
            }
          >
            {t(tab.key)}
          </NavLink>
        ))}
      </nav>
      <NestedHeaders>
        <Routes>
          <Route index element={<OverviewPage />} />
          <Route path="tva" element={<VatPage />} />
          <Route path="drm" element={<DrmPage />} />
          <Route path="charges" element={<ExpensesPage />} />
          <Route path="immobilisations" element={<AssetsPage />} />
          <Route path="journal" element={<JournalPage />} />
          <Route path="*" element={<Navigate to="/compta" replace />} />
        </Routes>
      </NestedHeaders>
    </>
  );
}
