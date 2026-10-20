import type { Wine } from '@/types';
import { norm } from '@/lib/wine';

/** Grandes régions viticoles françaises : centre approximatif (lon, lat) et alias reconnus (normalisés). */
export interface TerroirRegion {
  name: string;
  lon: number;
  lat: number;
  label: 'left' | 'right' | 'top' | 'bottom';
  aliases: string[];
}

export const FRENCH_REGIONS: TerroirRegion[] = [
  { name: 'Champagne', lon: 4.0, lat: 49.15, label: 'right', aliases: ['champagne'] },
  { name: 'Alsace', lon: 7.35, lat: 48.25, label: 'left', aliases: ['alsace'] },
  { name: 'Bourgogne', lon: 4.75, lat: 47.15, label: 'left', aliases: ['bourgogne', 'burgundy', 'chablis', 'cote de nuits', 'cote de beaune', 'cote d or', 'maconnais', 'macon', 'cote chalonnaise'] },
  { name: 'Beaujolais', lon: 4.6, lat: 46.1, label: 'left', aliases: ['beaujolais'] },
  { name: 'Jura', lon: 5.75, lat: 46.75, label: 'right', aliases: ['jura'] },
  { name: 'Savoie', lon: 6.2, lat: 45.6, label: 'right', aliases: ['savoie', 'savoy', 'bugey'] },
  {
    name: 'Loire',
    lon: 0.6,
    lat: 47.3,
    label: 'top',
    aliases: ['loire', 'val de loire', 'vallee de la loire', 'loire valley', 'centre loire', 'pays nantais', 'touraine', 'anjou', 'saumur', 'muscadet', 'sancerre', 'pouilly fume', 'vouvray', 'chinon'],
  },
  {
    name: 'Bordeaux',
    lon: -0.55,
    lat: 44.85,
    label: 'left',
    aliases: ['bordeaux', 'bordelais', 'medoc', 'haut medoc', 'graves', 'saint emilion', 'st emilion', 'pomerol', 'pessac leognan', 'sauternes', 'entre deux mers', 'margaux', 'pauillac', 'saint julien', 'saint estephe'],
  },
  {
    name: 'Sud-Ouest',
    lon: 0.9,
    lat: 43.95,
    label: 'bottom',
    aliases: ['sud ouest', 'south west', 'southwest', 'south west france', 'cahors', 'madiran', 'jurancon', 'gaillac', 'bergerac', 'gascogne', 'irouleguy', 'fronton', 'marcillac'],
  },
  {
    name: 'Vallée du Rhône',
    lon: 4.8,
    lat: 44.75,
    label: 'right',
    aliases: ['vallee du rhone', 'rhone', 'rhone valley', 'cotes du rhone', 'cote rotie', 'chateauneuf du pape', 'hermitage', 'crozes hermitage', 'condrieu', 'cornas', 'saint joseph', 'gigondas', 'vacqueyras'],
  },
  { name: 'Provence', lon: 6.1, lat: 43.5, label: 'bottom', aliases: ['provence', 'cotes de provence', 'bandol', 'cassis', 'bellet', 'palette'] },
  {
    name: 'Languedoc',
    lon: 3.4,
    lat: 43.62,
    label: 'top',
    aliases: ['languedoc', 'languedoc roussillon', 'pic saint loup', 'minervois', 'corbieres', 'faugeres', 'saint chinian', 'terrasses du larzac', 'pays d oc'],
  },
  { name: 'Roussillon', lon: 2.65, lat: 42.65, label: 'left', aliases: ['roussillon', 'cotes du roussillon', 'collioure', 'banyuls', 'maury', 'rivesaltes'] },
  { name: 'Corse', lon: 9.1, lat: 42.15, label: 'left', aliases: ['corse', 'corsica', 'patrimonio', 'ajaccio', 'vin de corse'] },
];

const NORMALIZED = FRENCH_REGIONS.map((r) => ({ name: r.name, aliases: [norm(r.name), ...r.aliases] }));

/**
 * Rattache un libellé de région libre (« Rhône », « Côtes-du-Rhône », « BOURGOGNE », « Saint-Émilion »…)
 * à une grande région viticole française. Renvoie le nom canonique ou null.
 */
export function matchRegion(raw: string | null | undefined): string | null {
  const n = norm(raw);
  if (!n) return null;
  for (const r of NORMALIZED) if (r.aliases.includes(n)) return r.name;
  const padded = ` ${n} `;
  for (const r of NORMALIZED) if (r.aliases.some((a) => padded.includes(` ${a} `))) return r.name;
  return null;
}

const FRANCE = new Set(['france', 'fr', 'fra']);
const isFrenchOrUnknown = (country: string | undefined) => !country || !norm(country) || FRANCE.has(norm(country));

/** Région française d'un vin (région, à défaut sous-région ou appellation) ; null si étrangère ou inconnue. */
export function wineTerroir(w: Pick<Wine, 'region' | 'subRegion' | 'appellation' | 'country'>): string | null {
  if (!isFrenchOrUnknown(w.country)) return null;
  return matchRegion(w.region) ?? (w.region?.trim() ? null : (matchRegion(w.subRegion) ?? matchRegion(w.appellation)));
}

export interface TerroirStat {
  region: string; // nom canonique
  value: string; // valeur transmise au filtre (libellé brut le plus fréquent)
  refs: number;
  bottles: number;
}

export interface OtherTerroir {
  value: string; // libellé brut de la région
  country?: string;
  refs: number;
  bottles: number;
}

/** Agrège références et bouteilles par région française, et liste les autres régions (étranger ou hors carte). */
export function terroirStats(wines: Wine[], qty: Map<string, number>): { french: Map<string, TerroirStat>; others: OtherTerroir[] } {
  const french = new Map<string, TerroirStat & { raw: Map<string, number> }>();
  const others = new Map<string, OtherTerroir & { countries: Map<string, number> }>();
  for (const w of wines) {
    if (w.isArchived) continue;
    const n = Math.max(0, qty.get(w.id) ?? 0);
    const region = wineTerroir(w);
    const raw = w.region?.trim() ?? '';
    if (region) {
      const s = french.get(region) ?? { region, value: region, refs: 0, bottles: 0, raw: new Map<string, number>() };
      s.refs += 1;
      s.bottles += n;
      if (raw) s.raw.set(raw, (s.raw.get(raw) ?? 0) + 1);
      french.set(region, s);
    } else if (raw) {
      const key = norm(raw);
      const o = others.get(key) ?? { value: raw, refs: 0, bottles: 0, countries: new Map<string, number>() };
      o.refs += 1;
      o.bottles += n;
      if (w.country?.trim()) o.countries.set(w.country.trim(), (o.countries.get(w.country.trim()) ?? 0) + 1);
      others.set(key, o);
    }
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  return {
    french: new Map(
      [...french.entries()].map(([k, { raw, ...s }]) => {
        const canonical = [...raw.keys()].find((r) => norm(r) === norm(k));
        return [k, { ...s, value: canonical ?? top(raw) ?? k }];
      }),
    ),
    others: [...others.values()]
      .map(({ countries, ...o }) => ({ ...o, country: top(countries) }))
      .sort((a, b) => b.bottles - a.bottles || b.refs - a.refs || a.value.localeCompare(b.value)),
  };
}

/** La sélection courante (libellé brut ou canonique) désigne-t-elle cette région ? */
export const isRegionSelected = (stat: Pick<TerroirStat, 'region' | 'value'>, selected: string): boolean =>
  !!selected && (selected === stat.value || matchRegion(selected) === stat.region);

/* ------------------------------------------------------------ géographie */

// Contour simplifié de la France métropolitaine (lon, lat), sens horaire depuis Dunkerque.
const MAINLAND: [number, number][] = [
  [2.37, 51.05], [2.55, 51.09], [3.15, 50.78], [3.7, 50.32], [4.23, 49.96], [4.85, 50.15], [4.86, 49.8], [5.47, 49.5], [5.82, 49.55], [6.36, 49.47],
  [6.73, 49.16], [7.1, 49.12], [7.63, 49.05], [8.2, 48.97], [7.8, 48.6], [7.58, 48.12], [7.58, 47.58], [7.0, 47.48], [6.95, 47.25], [6.45, 46.95],
  [6.1, 46.6], [6.15, 46.27], [6.8, 46.4], [6.85, 46.1], [7.04, 45.92], [6.8, 45.72], [7.15, 45.25], [6.62, 45.1], [7.05, 44.7], [6.88, 44.4],
  [7.4, 44.12], [7.53, 43.78], [7.27, 43.7], [7.0, 43.55], [6.65, 43.27], [6.2, 43.1], [5.93, 43.1], [5.37, 43.3], [4.85, 43.35], [4.4, 43.45],
  [3.7, 43.4], [3.2, 43.25], [3.05, 42.9], [3.05, 42.6], [3.17, 42.45], [2.7, 42.4], [1.75, 42.5], [1.45, 42.6], [0.7, 42.85], [0.0, 42.7],
  [-0.75, 42.95], [-1.4, 43.05], [-1.78, 43.37], [-1.56, 43.48], [-1.35, 44.0], [-1.25, 44.65], [-1.15, 45.45], [-1.05, 45.6], [-1.2, 46.0], [-1.15, 46.15],
  [-1.78, 46.5], [-2.15, 46.85], [-2.25, 47.05], [-2.2, 47.27], [-2.75, 47.5], [-3.1, 47.5], [-3.4, 47.7], [-3.9, 47.85], [-4.37, 47.8], [-4.7, 48.05],
  [-4.4, 48.25], [-4.78, 48.35], [-4.6, 48.6], [-4.0, 48.72], [-3.5, 48.85], [-3.0, 48.8], [-2.5, 48.6], [-2.0, 48.65], [-1.6, 48.65], [-1.6, 49.2],
  [-1.85, 49.7], [-1.6, 49.65], [-1.25, 49.7], [-1.1, 49.35], [-0.5, 49.35], [0.1, 49.45], [0.2, 49.7], [1.1, 49.95], [1.6, 50.25], [1.6, 50.7],
  [1.85, 50.95],
];

const CORSICA: [number, number][] = [
  [9.4, 43.0], [9.55, 42.6], [9.55, 42.1], [9.4, 41.7], [9.25, 41.4], [9.1, 41.38], [8.8, 41.55], [8.6, 41.9], [8.58, 42.3], [8.7, 42.55], [9.15, 42.75], [9.33, 42.95],
];

const LON0 = -5.2;
const LAT0 = 51.3;
const KX = Math.cos((46.5 * Math.PI) / 180);
const SCALE = 52;
const PAD = 10;

/** Projection équirectangulaire (corrigée de la latitude moyenne) vers le repère du SVG. */
export const project = (lon: number, lat: number): [number, number] => [Math.round(((lon - LON0) * KX * SCALE + PAD) * 10) / 10, Math.round(((LAT0 - lat) * SCALE + PAD) * 10) / 10];

export const MAP_WIDTH = Math.ceil(project(9.8, 0)[0] + PAD);
export const MAP_HEIGHT = Math.ceil(project(0, 41.25)[1] + PAD);

const toPath = (pts: [number, number][]) => `M${pts.map(([lon, lat]) => project(lon, lat).join(',')).join('L')}Z`;
export const FRANCE_PATH = toPath(MAINLAND);
export const CORSICA_PATH = toPath(CORSICA);
