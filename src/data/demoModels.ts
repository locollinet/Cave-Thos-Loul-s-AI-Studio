import type { LegalInfo, OrgProfile, Role } from '@/types';

export interface DemoModel {
  profile: OrgProfile;
  name: string;
  location: string;
  headline: string;
  description: string;
  accounts: { role: Role; name: string; email: string }[];
}

const DEMO_LOGO_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">',
  '<rect width="64" height="64" rx="14" fill="#581525"/>',
  '<circle cx="32" cy="32" r="25" fill="none" stroke="#b8924a" stroke-width="1.2"/>',
  '<text x="32" y="39" text-anchor="middle" font-family="Georgia, serif" font-size="21" fill="#f7f4ef">L&amp;T</text>',
  '</svg>',
].join('');

export const DEMO_LOGO_DATA_URL = `data:image/svg+xml;base64,${btoa(DEMO_LOGO_SVG)}`;

export function demoLegalInfo(orgName: string): LegalInfo {
  return {
    legalName: `${orgName} SAS`,
    legalForm: 'SAS',
    address: '12 rue des Tonneliers',
    postalCode: '21200',
    city: 'Beaune',
    country: 'France',
    phone: '03 80 00 00 00',
    email: 'contact@demo-cepia.example',
    siret: '73282932000074',
    vatNumber: 'FR44732829320',
    exciseNumber: 'FR0123456789E',
    iban: 'FR76 3000 6000 0112 3456 7890 189',
    bic: 'AGRIFRPP821',
    legalMentions: 'SAS au capital de 50 000 € — RCS Dijon — L’abus d’alcool est dangereux pour la santé.',
    logoDataUrl: DEMO_LOGO_DATA_URL,
  };
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
