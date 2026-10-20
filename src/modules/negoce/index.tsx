import { Navigate, Outlet, Route, Routes, useSearchParams } from 'react-router-dom';
import { useT } from '@/i18n';
import { NestedHeaders, PageHeader } from '@/ui';
import ConsignmentsPage from './ConsignmentsPage';
import DocumentEditor from './DocumentEditor';
import DocumentView from './DocumentView';
import DocumentsPage from './DocumentsPage';
import NegoceTabs from './NegoceTabs';
import PaymentsPage from './PaymentsPage';
import OfferEditor from './offers/OfferEditor';
import OffersPage from './offers/OffersPage';

/** Titre du module d'abord, puis les onglets ; les en-têtes des pages deviennent des titres de section. */
function SectionLayout() {
  const t = useT();
  return (
    <>
      <PageHeader title={t('nav.negoce')} subtitle={t('negoce.subtitle')} />
      <NegoceTabs />
      <NestedHeaders>
        <Outlet />
      </NestedHeaders>
    </>
  );
}

function Home() {
  const [sp] = useSearchParams();
  const wanted = sp.get('new');
  if (wanted === 'quote' || wanted === 'invoice') return <Navigate to={`/negoce/edit/new?type=${wanted}`} replace />;
  return <DocumentsPage />;
}

export default function NegoceModule() {
  return (
    <Routes>
      <Route element={<SectionLayout />}>
        <Route index element={<Home />} />
        <Route path="offres" element={<OffersPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="consignments" element={<ConsignmentsPage />} />
      </Route>
      <Route path="offres/:id" element={<OfferEditor />} />
      <Route path="edit/:id" element={<DocumentEditor />} />
      <Route path="view/:id" element={<DocumentView />} />
      <Route path="*" element={<Navigate to="/negoce" replace />} />
    </Routes>
  );
}
