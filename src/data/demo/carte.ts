import type { BrandTheme, Org, StockLevel, Wine } from '@/types';
import type { Op } from '../store';
import { PRESETS } from '@/lib/brand';
import { uid } from '@/lib/utils';
import { buildListSections, defaultWineList } from '@/modules/carte/build';
import { publishOps } from '@/modules/carte/publish';
import type { WineList } from '@/modules/carte/types';

export const DEMO_BRAND: BrandTheme = {
  ...PRESETS.palace,
  tagline: 'Grands vins & sommellerie',
  footer: 'Prix nets en euros, service compris. L’abus d’alcool est dangereux pour la santé, à consommer avec modération.',
};

const PINNED = ['leflaive-puligny', 'jamet-cote-rotie', 'peters-reserve'];

/** Charte « palace » de l'établissement et carte publiée qui la suit (instantané public inclus, comme `publishOps`). */
export function buildCarte(
  orgId: string,
  orgName: string,
  wines: Wine[],
  wineByKey: Map<string, Wine>,
  stock: StockLevel[],
  now: number,
): { ops: Op[]; list: WineList } {
  const org: Pick<Org, 'id' | 'name' | 'brand' | 'defaultVatRate'> = { id: orgId, name: orgName, brand: DEMO_BRAND, defaultVatRate: 20 };
  const draft: WineList = {
    ...defaultWineList('fr', 'Carte des vins', org),
    id: uid(),
    template: 'palace',
    useBrand: true,
    groupBy: 'region',
    showDescription: true,
    pinnedWineIds: PINNED.map((k) => wineByKey.get(k)?.id).filter((x): x is string => !!x),
  };
  const sections = buildListSections(draft, wines, stock, org);
  const { ops, list } = publishOps(orgId, org, draft, sections, now);
  return { ops: [{ op: 'set', path: `orgs/${orgId}`, data: { brand: DEMO_BRAND }, merge: true }, ...ops], list };
}
