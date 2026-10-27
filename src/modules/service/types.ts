import type { WineColor } from '@/types';

export type OpenBottleStatus = 'open' | 'finished' | 'discarded';

/** Clé de compteur journalier de verres servis : `served_YYYYMMDD` (jour local). */
export type ServedDayField = `served_${string}`;

/** Bouteille ouverte au verre — Firestore : orgs/{orgId}/openBottles/{id}. */
export interface OpenBottle {
  id: string;
  wineId: string;
  wineLabel: string;
  color?: WineColor; // pour l'alerte de fraîcheur
  siteId: string;
  openedAt: number;
  openedBy: string; // nom de l'utilisateur
  openedByUid?: string;
  movementId?: string; // mouvement de sortie « verre » associé
  glassCl: number;
  glassesTotal: number; // floor(formatCl / glassCl)
  glassesServed: number;
  priceTTC?: number; // prix du verre à l'ouverture
  status: OpenBottleStatus;
  preservation?: 'standard' | 'coravin'; // flacon classique ou sous gaz inerte / Coravin / azote
  closedAt?: number;
  lostGlasses?: number;
  updatedAt?: number;
  [day: ServedDayField]: number | undefined;
}

export type FreshnessGroup = 'sparkling' | 'still' | 'sweet';
export type FreshnessLevel = 'fresh' | 'soon' | 'expired';
