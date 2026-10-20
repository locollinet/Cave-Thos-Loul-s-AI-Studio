import {
  BarChart3,
  BookOpen,
  Boxes,
  Calculator,
  ClipboardCheck,
  FileText,
  GlassWater,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  Wine as WineIcon,
  type LucideIcon,
} from 'lucide-react';
import type { ModuleId, OrgProfile, Role } from '@/types';
import { ROLE_RANK } from '@/types';

export interface NavItem {
  id: string;
  path: string;
  labelKey: string;
  icon: LucideIcon;
  module?: ModuleId; // si défini, requiert que le module soit activé
  roles?: Role[]; // si défini, rôles autorisés (sinon tous)
  keywords?: string; // pour la palette de commandes
  platformOnly?: boolean; // réservé au rôle plateforme
}

export const NAV: NavItem[] = [
  { id: 'dashboard', path: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { id: 'wines', path: '/vins', labelKey: 'nav.wines', icon: WineIcon, module: 'stock', keywords: 'référentiel catalogue produits cuvées' },
  { id: 'stock', path: '/stock', labelKey: 'nav.stock', icon: Boxes, module: 'stock', keywords: 'mouvements entrées sorties transferts casse' },
  { id: 'inventory', path: '/inventaire', labelKey: 'nav.inventory', icon: ClipboardCheck, module: 'stock', keywords: 'comptage mobile scan' },
  { id: 'carte', path: '/carte', labelKey: 'nav.carte', icon: BookOpen, module: 'carte', roles: ['owner', 'manager', 'sommelier'], keywords: 'carte des vins menu qr sommelier' },
  { id: 'service', path: '/service', labelKey: 'nav.service', icon: GlassWater, module: 'carte', keywords: 'service salle verre au verre bouteilles ouvertes tablette' },
  { id: 'achats', path: '/achats', labelKey: 'nav.achats', icon: Truck, module: 'achats', roles: ['owner', 'manager', 'sommelier', 'accountant'], keywords: 'factures fournisseurs réception import ia' },
  { id: 'negoce', path: '/negoce', labelKey: 'nav.negoce', icon: ShoppingCart, module: 'negoce', roles: ['owner', 'manager', 'accountant'], keywords: 'devis factures clients dépôt-vente' },
  { id: 'contacts', path: '/contacts', labelKey: 'nav.contacts', icon: Users, keywords: 'clients fournisseurs partenaires' },
  { id: 'compta', path: '/compta', labelKey: 'nav.compta', icon: Calculator, module: 'compta', roles: ['owner', 'manager', 'accountant'], keywords: 'tva drm douane charges immobilisations fec' },
  { id: 'pilotage', path: '/pilotage', labelKey: 'nav.pilotage', icon: BarChart3, module: 'pilotage', roles: ['owner', 'manager', 'accountant'], keywords: 'marges analyse stratégie' },
  { id: 'settings', path: '/reglages', labelKey: 'nav.settings', icon: Settings, roles: ['owner', 'manager'], keywords: 'organisation sites équipe paramètres' },
  { id: 'platform', path: '/plateforme', labelKey: 'nav.platform', icon: ShieldCheck, platformOnly: true, keywords: 'administration démos prospects console' },
];

export const MODULE_LIST: { id: ModuleId; labelKey: string; descKey: string; icon: LucideIcon }[] = [
  { id: 'stock', labelKey: 'mod.stock', descKey: 'mod.stock.desc', icon: Boxes },
  { id: 'carte', labelKey: 'mod.carte', descKey: 'mod.carte.desc', icon: BookOpen },
  { id: 'achats', labelKey: 'mod.achats', descKey: 'mod.achats.desc', icon: Truck },
  { id: 'negoce', labelKey: 'mod.negoce', descKey: 'mod.negoce.desc', icon: FileText },
  { id: 'compta', labelKey: 'mod.compta', descKey: 'mod.compta.desc', icon: Calculator },
  { id: 'pilotage', labelKey: 'mod.pilotage', descKey: 'mod.pilotage.desc', icon: BarChart3 },
];

/** Modules activés par défaut selon le profil d'entreprise. */
export const PROFILE_MODULES: Record<OrgProfile, ModuleId[]> = {
  negoce: ['stock', 'achats', 'negoce', 'compta', 'pilotage', 'carte'],
  independant: ['stock', 'achats', 'negoce', 'compta', 'pilotage'],
  restaurant: ['stock', 'carte', 'achats', 'pilotage'],
  chaine: ['stock', 'carte', 'achats', 'compta', 'pilotage'],
};

export const hasRole = (role: Role | undefined, allowed?: Role[]): boolean => !allowed || (!!role && allowed.includes(role));
export const atLeast = (role: Role | undefined, min: Role): boolean => !!role && ROLE_RANK[role] >= ROLE_RANK[min];

export const isNavVisible = (item: NavItem, modules: ModuleId[], role: Role | undefined, isPlatformAdmin = false): boolean => {
  if (item.platformOnly) return isPlatformAdmin;
  return (!item.module || modules.includes(item.module)) && hasRole(role, item.roles);
};
