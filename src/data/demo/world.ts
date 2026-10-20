import type { OrgProfile, Partner, Site, Wine } from '@/types';
import type { Actor } from '../stock';
import type { Clock, Ledger, Rng } from './ledger';
import type { ClientKey, SupplierSeed, WineSeed } from './catalog';

/** État partagé par les générateurs de la démo. */
export interface DemoWorld {
  orgId: string;
  profile: OrgProfile;
  clock: Clock;
  rng: Rng;
  actor: Actor;
  mainSiteId: string;
  sites: Site[];
  wines: Wine[];
  wineByKey: Map<string, Wine>;
  seedById: Map<string, WineSeed>;
  suppliers: { partner: Partner; seed: SupplierSeed }[];
  clients: Map<ClientKey, Partner>;
  ledger: Ledger;
}

export const DEMO_ACTOR: Actor = { userId: 'demo', userName: 'Équipe démo' };
