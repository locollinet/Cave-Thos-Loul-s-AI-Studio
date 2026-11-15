import type { OrgProfile, Role } from '@/types';

export interface DemoModel {
  profile: OrgProfile;
  name: string;
  location: string;
  headline: string;
  description: string;
  accounts: { role: Role; name: string; email: string }[];
}

export const DEMO_MODELS: Record<OrgProfile, DemoModel> = {
  negoce: {
    profile: 'negoce',
    name: 'Maison Bertrand & Fils',
    location: 'Beaune',
    headline: 'Maison de négoce (catalogue large, achats, factures, relances, compta)',
    description: '12 mois d’achats et ventes, offres publiées, relances d’impayés, TVA & douane.',
    accounts: [
      { role: 'owner', name: 'Pierre Bertrand', email: 'pierre.bertrand@bertrand-vins.example' },
      { role: 'manager', name: 'Sophie Dubois', email: 'sophie.dubois@bertrand-vins.example' },
      { role: 'accountant', name: 'Luc Martin', email: 'luc.martin@bertrand-vins.example' },
      { role: 'staff', name: 'Julien Faure', email: 'julien.faure@bertrand-vins.example' },
    ],
  },
  independant: {
    profile: 'independant',
    name: 'Cave Itinérante — Claire Martin',
    location: 'Bordeaux & itinérant',
    headline: 'Négociant indépendant sans boutique (mobile, devis rapides, dépôt-vente)',
    description: 'Devis rapides sur mobile, sélection de vins d’artisans, offres partagées par lien.',
    accounts: [
      { role: 'owner', name: 'Claire Martin', email: 'claire.martin@cave-itinerante.example' },
      { role: 'staff', name: 'Thomas Morel', email: 'thomas.morel@cave-itinerante.example' },
    ],
  },
  restaurant: {
    profile: 'restaurant',
    name: 'Le Grand Palais',
    location: 'Paris & Pommard',
    headline: 'Palace, Hôtel 5★ & Domaine (3 sites, verticales prestige, carte QR, vins au verre)',
    description: 'Cave voûtée, Table Gastronomique & Bistrot : verticales Bourgogne, flacons numérotés et service en salle.',
    accounts: [
      { role: 'owner', name: 'Antoine de Saint-Germain', email: 'direction@legrandpalais.example' },
      { role: 'sommelier', name: 'Marc Sommelier', email: 'sommelier@legrandpalais.example' },
      { role: 'staff', name: 'Camille Service', email: 'service@legrandpalais.example' },
    ],
  },
  chaine: {
    profile: 'chaine',
    name: 'Groupe Riviera Hôtels',
    location: 'Paris & Annecy',
    headline: 'Chaîne & groupe (multi-établissements, transferts, consolidation)',
    description: '3 établissements (Palais Paris, Hôtel du Lac, Bar), transferts de bouteilles, gestion centralisée.',
    accounts: [
      { role: 'owner', name: 'Hélène Riviera', email: 'direction@riviera-hotels.example' },
      { role: 'manager', name: 'Alexandre Achats', email: 'achats@riviera-hotels.example' },
      { role: 'accountant', name: 'Valérie Finance', email: 'finance@riviera-hotels.example' },
    ],
  },
};
