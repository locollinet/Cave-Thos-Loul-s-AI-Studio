import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { ToastProvider, Spinner } from '@/ui';
import { AuthProvider, useAuth } from '@/app/auth';
import { OrgProvider, useOrg } from '@/app/org';
import { Layout } from '@/app/Layout';
import { LoginPage, OnboardingPage } from '@/pages/Auth';
import { hasRole } from '@/registry';
import { NAV } from '@/registry';
import type { ReactNode } from 'react';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Wines = lazy(() => import('@/pages/Wines'));
const Stock = lazy(() => import('@/pages/Stock'));
const Inventory = lazy(() => import('@/pages/Inventory'));
const Contacts = lazy(() => import('@/pages/Contacts'));
const Settings = lazy(() => import('@/pages/Settings'));
const PlatformAdmin = lazy(() => import('@/pages/PlatformAdmin'));

// Modules métier : chacun gère ses propres sous-routes.
const Carte = lazy(() => import('@/modules/carte'));
const Achats = lazy(() => import('@/modules/achats'));
const Negoce = lazy(() => import('@/modules/negoce'));
const Compta = lazy(() => import('@/modules/compta'));
const Pilotage = lazy(() => import('@/modules/pilotage'));
const PublicList = lazy(() => import('@/modules/carte/PublicList'));
const PublicOffer = lazy(() => import('@/modules/negoce/offers/PublicOffer'));
const Service = lazy(() => import('@/modules/service'));

const Loading = () => (
  <div className="grid min-h-[40dvh] place-items-center">
    <Spinner className="size-7" />
  </div>
);

/** Garde d'accès : module activé + rôle autorisé. */
function Guard({ id, children }: { id: string; children: ReactNode }) {
  const { org, role } = useOrg();
  const item = NAV.find((n) => n.id === id);
  if (!item) return <>{children}</>;
  const ok = (!item.module || org.modules.includes(item.module)) && hasRole(role, item.roles);
  return ok ? <>{children}</> : <Navigate to="/" replace />;
}

function AppRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="vins" element={<Guard id="wines"><Wines /></Guard>} />
          <Route path="stock" element={<Guard id="stock"><Stock /></Guard>} />
          <Route path="inventaire" element={<Guard id="inventory"><Inventory /></Guard>} />
          <Route path="contacts" element={<Contacts />} />
          <Route path="carte/*" element={<Guard id="carte"><Carte /></Guard>} />
          <Route path="service/*" element={<Guard id="service"><Service /></Guard>} />
          <Route path="achats/*" element={<Guard id="achats"><Achats /></Guard>} />
          <Route path="negoce/*" element={<Guard id="negoce"><Negoce /></Guard>} />
          <Route path="compta/*" element={<Guard id="compta"><Compta /></Guard>} />
          <Route path="pilotage/*" element={<Guard id="pilotage"><Pilotage /></Guard>} />
          <Route path="reglages" element={<Guard id="settings"><Settings /></Guard>} />
          <Route path="plateforme" element={<PlatformAdmin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <LoginPage />;
  return (
    <OrgProvider key={user.uid} fallback={(g) => (g.status === 'none' ? <OnboardingPage /> : g.status === 'error' ? <div className="p-8 text-bad">{g.error}</div> : <Loading />)}>
      <AppRoutes />
    </OrgProvider>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/p/:publicId" element={<PublicList />} />
                <Route path="/o/:publicId" element={<PublicOffer />} />
                <Route path="*" element={<Gate />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </I18nProvider>
  );
}
