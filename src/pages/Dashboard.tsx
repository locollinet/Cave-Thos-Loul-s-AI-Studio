import { useOrg } from '@/app/org';
import CellarDashboard from './dashboard/CellarDashboard';
import ChainDashboard from './dashboard/ChainDashboard';
import { dashboardKind } from './dashboard/compute';
import NegoceDashboard from './dashboard/NegoceDashboard';
import StaffDashboard from './dashboard/StaffDashboard';

const VIEWS = { negoce: NegoceDashboard, cellar: CellarDashboard, chain: ChainDashboard, staff: StaffDashboard } as const;

/** Accueil : tableau de bord adapté au profil de l'établissement et au rôle de l'utilisateur. */
export default function Dashboard() {
  const { org, role } = useOrg();
  const View = VIEWS[dashboardKind(org.profile, role)];
  return <View />;
}
