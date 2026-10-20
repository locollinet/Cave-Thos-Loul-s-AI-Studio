import type { Partner, TechnicalSheet, WineColor } from '@/types';

/** Référence de démonstration. Prix d'achat HT indicatifs (prix 75 cl ; ×2,1 pour un magnum). */
export interface WineSeed {
  key: string;
  producer: string;
  name: string;
  vintage: string;
  color: WineColor;
  region: string;
  subRegion: string;
  appellation: string;
  country: string;
  grapes: string;
  buy: number;
  qty: number; // stock final visé (cave principale)
  apogee?: [number, number];
  format?: number;
  glass?: number; // prix TTC du verre (restauration)
  sheet?: Omit<TechnicalSheet, 'generatedByAI'>;
}

const FR = 'France';

export const WINE_SEEDS: WineSeed[] = [
  {
    key: 'leflaive-puligny', producer: 'Domaine Leflaive', name: 'Puligny-Montrachet', vintage: '2020', color: 'blanc',
    region: 'Bourgogne', subRegion: 'Côte de Beaune', appellation: 'Puligny-Montrachet', country: FR, grapes: 'Chardonnay', buy: 78, qty: 18, apogee: [2024, 2034],
    sheet: {
      aop: 'Puligny-Montrachet', sol: 'Marnes et calcaires de la Côte de Beaune', cepage: '100 % Chardonnay',
      vinification: 'Pressurage doux, fermentation en fûts de chêne', elevage: 'Sous bois puis en cuve, sur lies fines',
      oeil: 'Or pâle aux reflets verts', nez: 'Fleurs blanches, agrumes, noisette fraîche', bouche: 'Ample et tendue, finale saline et ciselée',
      temperatureService: '11–13 °C', garde: "Jusqu'en 2034", accords: 'Bar de ligne au beurre blanc, volaille à la crème',
    },
  },
  { key: 'roulot-luchets', producer: 'Domaine Jean-Marc Roulot', name: 'Meursault Les Luchets', vintage: '2019', color: 'blanc', region: 'Bourgogne', subRegion: 'Côte de Beaune', appellation: 'Meursault', country: FR, grapes: 'Chardonnay', buy: 92, qty: 9, apogee: [2023, 2033] },
  { key: 'dujac-gevrey', producer: 'Domaine Dujac', name: 'Gevrey-Chambertin', vintage: '2018', color: 'rouge', region: 'Bourgogne', subRegion: 'Côte de Nuits', appellation: 'Gevrey-Chambertin', country: FR, grapes: 'Pinot noir', buy: 85, qty: 14, apogee: [2024, 2036] },
  { key: 'rousseau-chambertin', producer: 'Domaine Armand Rousseau', name: 'Chambertin Grand Cru', vintage: '2017', color: 'rouge', region: 'Bourgogne', subRegion: 'Côte de Nuits', appellation: 'Chambertin', country: FR, grapes: 'Pinot noir', buy: 420, qty: 0, apogee: [2027, 2045] },
  { key: 'drc-tache', producer: 'Domaine de la Romanée-Conti', name: 'La Tâche', vintage: '2016', color: 'rouge', region: 'Bourgogne', subRegion: 'Côte de Nuits', appellation: 'La Tâche', country: FR, grapes: 'Pinot noir', buy: 1900, qty: 1, apogee: [2030, 2060] },
  {
    key: 'lascases', producer: 'Château Léoville-Las Cases', name: 'Saint-Julien 2ème Cru Classé', vintage: '2015', color: 'rouge',
    region: 'Bordeaux', subRegion: 'Médoc', appellation: 'Saint-Julien', country: FR, grapes: 'Cabernet sauvignon, Merlot, Cabernet franc', buy: 135, qty: 12, apogee: [2023, 2045],
    sheet: {
      aop: 'Saint-Julien', sol: 'Graves garonnaises sur sous-sol argileux', cepage: 'Cabernet sauvignon, Merlot, Cabernet franc',
      vinification: 'En cuves, extraction mesurée', elevage: 'Fûts de chêne français',
      oeil: 'Grenat profond', nez: 'Cassis, cèdre, graphite, tabac blond', bouche: 'Classique et structurée, tanins serrés, grande longueur',
      temperatureService: '17–18 °C', garde: "Jusqu'en 2045", accords: 'Carré d’agneau, entrecôte bordelaise',
    },
  },
  { key: 'pichon-comtesse', producer: 'Château Pichon Longueville Comtesse de Lalande', name: 'Pauillac', vintage: '2016', color: 'rouge', region: 'Bordeaux', subRegion: 'Médoc', appellation: 'Pauillac', country: FR, grapes: 'Cabernet sauvignon, Merlot', buy: 110, qty: 6, apogee: [2026, 2048] },
  {
    key: 'yquem', producer: "Château d'Yquem", name: 'Sauternes', vintage: '2014', color: 'doux',
    region: 'Bordeaux', subRegion: 'Sauternais', appellation: 'Sauternes', country: FR, grapes: 'Sémillon, Sauvignon blanc', buy: 210, qty: 4, apogee: [2025, 2070],
    sheet: {
      aop: 'Sauternes', sol: 'Graves et argiles', cepage: 'Sémillon, Sauvignon blanc',
      vinification: 'Vendanges par tries successives de raisins botrytisés', elevage: 'Long élevage en barriques',
      oeil: 'Or lumineux', nez: 'Abricot, agrumes confits, miel, safran', bouche: 'Liquoreuse et vibrante, d’un équilibre remarquable',
      temperatureService: '10–12 °C', garde: 'Plusieurs décennies', accords: 'Foie gras, roquefort, desserts aux agrumes',
    },
  },
  { key: 'rayas', producer: 'Château Rayas', name: 'Châteauneuf-du-Pape', vintage: '2012', color: 'rouge', region: 'Vallée du Rhône', subRegion: 'Rhône méridional', appellation: 'Châteauneuf-du-Pape', country: FR, grapes: 'Grenache', buy: 280, qty: 2, apogee: [2020, 2040] },
  {
    key: 'jamet-cote-rotie', producer: 'Domaine Jamet', name: 'Côte-Rôtie', vintage: '2019', color: 'rouge',
    region: 'Vallée du Rhône', subRegion: 'Rhône septentrional', appellation: 'Côte-Rôtie', country: FR, grapes: 'Syrah', buy: 62, qty: 20, apogee: [2024, 2038],
    sheet: {
      aop: 'Côte-Rôtie', sol: 'Coteaux de schistes et micaschistes en terrasses', cepage: 'Syrah',
      vinification: 'Vinification traditionnelle, extraction douce', elevage: 'En fûts, majoritairement de plusieurs vins',
      oeil: 'Pourpre profond', nez: 'Violette, olive noire, poivre, fruits noirs', bouche: 'Dense et fraîche, tanins fins, finale fumée',
      temperatureService: '16–17 °C', garde: "Jusqu'en 2038", accords: 'Pigeon rôti, côte de bœuf, fromages affinés',
    },
  },
  { key: 'prieure-roch-nsg', producer: 'Domaine du Prieuré-Roch', name: 'Nuits-Saint-Georges 1er Cru', vintage: '2018', color: 'rouge', region: 'Bourgogne', subRegion: 'Côte de Nuits', appellation: 'Nuits-Saint-Georges Premier Cru', country: FR, grapes: 'Pinot noir', buy: 140, qty: 7, apogee: [2025, 2040] },
  {
    key: 'zind-windsbuhl', producer: 'Domaine Zind-Humbrecht', name: 'Riesling Clos Windsbuhl', vintage: '2019', color: 'blanc',
    region: 'Alsace', subRegion: 'Haut-Rhin', appellation: 'Alsace', country: FR, grapes: 'Riesling', buy: 45, qty: 24, apogee: [2023, 2040],
    sheet: {
      aop: 'Alsace', sol: 'Calcaires et marnes', cepage: 'Riesling',
      vinification: 'Pressurage lent, fermentation spontanée', elevage: 'En foudres anciens',
      oeil: 'Jaune paille', nez: 'Agrumes, fleurs blanches, notes fumées', bouche: 'Tendue et précise, belle minéralité',
      temperatureService: '10–12 °C', garde: "Jusqu'en 2040", accords: 'Choucroute de la mer, poissons de rivière',
    },
  },
  {
    key: 'huet-haut-lieu', producer: 'Domaine Huet', name: 'Vouvray Le Haut-Lieu Sec', vintage: '2020', color: 'blanc',
    region: 'Loire', subRegion: 'Touraine', appellation: 'Vouvray', country: FR, grapes: 'Chenin blanc', buy: 32, qty: 30, apogee: [2023, 2050], glass: 13,
    sheet: {
      aop: 'Vouvray', sol: 'Argiles et calcaires sur tuffeau', cepage: 'Chenin blanc',
      vinification: 'Fermentation lente en fûts et demi-muids', elevage: 'Sur lies fines',
      oeil: 'Jaune doré', nez: 'Coing, pomme, cire d’abeille, fleurs', bouche: 'Droite et minérale, belle acidité',
      temperatureService: '10–12 °C', garde: 'Très longue garde', accords: 'Rillons, sandre au beurre blanc, chèvre de Touraine',
    },
  },
  { key: 'dagueneau-pur-sang', producer: 'Domaine Didier Dagueneau', name: 'Pur Sang', vintage: '2020', color: 'blanc', region: 'Loire', subRegion: 'Centre-Loire', appellation: 'Pouilly-Fumé', country: FR, grapes: 'Sauvignon blanc', buy: 95, qty: 10, apogee: [2022, 2035] },
  {
    key: 'tempier-rose', producer: 'Domaine Tempier', name: 'Bandol rosé', vintage: '2023', color: 'rose',
    region: 'Provence', subRegion: 'Var', appellation: 'Bandol', country: FR, grapes: 'Mourvèdre, Grenache, Cinsault', buy: 24, qty: 36, apogee: [2024, 2026], glass: 14,
    sheet: {
      aop: 'Bandol', sol: 'Restanques argilo-calcaires', cepage: 'Mourvèdre, Grenache, Cinsault',
      vinification: 'Pressurage direct', elevage: 'En cuve',
      oeil: 'Rose saumoné pâle', nez: 'Agrumes, pêche de vigne, garrigue', bouche: 'Vineuse et saline, d’une belle tenue',
      temperatureService: '10–12 °C', garde: 'À boire jeune, peut attendre quelques années', accords: 'Bouillabaisse, aïoli, cuisine méditerranéenne',
    },
  },
  { key: 'ott-selle', producer: 'Domaine Ott', name: 'Château de Selle Rosé', vintage: '2023', color: 'rose', region: 'Provence', subRegion: 'Var', appellation: 'Côtes de Provence', country: FR, grapes: 'Grenache, Cinsault', buy: 28, qty: 18, apogee: [2024, 2026] },
  { key: 'selosse-initial', producer: 'Champagne Jacques Selosse', name: 'Initial Blanc de Blancs', vintage: 'NM', color: 'bulles', region: 'Champagne', subRegion: 'Côte des Blancs', appellation: 'Champagne', country: FR, grapes: 'Chardonnay', buy: 145, qty: 8 },
  { key: 'krug-gc', producer: 'Champagne Krug', name: 'Grande Cuvée 171ème Édition', vintage: 'NM', color: 'bulles', region: 'Champagne', subRegion: 'Montagne de Reims', appellation: 'Champagne', country: FR, grapes: 'Pinot noir, Chardonnay, Meunier', buy: 165, qty: 12 },
  { key: 'cristal', producer: 'Champagne Louis Roederer', name: 'Cristal', vintage: '2013', color: 'bulles', region: 'Champagne', subRegion: 'Montagne de Reims', appellation: 'Champagne', country: FR, grapes: 'Pinot noir, Chardonnay', buy: 230, qty: 5, apogee: [2024, 2040] },
  {
    key: 'ruinart-bdb', producer: 'Champagne Ruinart', name: 'Blanc de Blancs', vintage: 'NM', color: 'bulles',
    region: 'Champagne', subRegion: 'Montagne de Reims', appellation: 'Champagne', country: FR, grapes: 'Chardonnay', buy: 48, qty: 40, glass: 22,
    sheet: {
      aop: 'Champagne', sol: 'Craie', cepage: '100 % Chardonnay',
      vinification: 'Assemblage de plusieurs années avec vins de réserve', elevage: 'Vieillissement sur lattes en caves crayeuses',
      oeil: 'Or pâle, bulles fines', nez: 'Agrumes, fleurs blanches, brioche légère', bouche: 'Fraîche et crémeuse, finale citronnée',
      temperatureService: '8–10 °C', garde: 'À boire', accords: 'Huîtres, carpaccio de Saint-Jacques, apéritif',
    },
  },
  { key: 'ostertag-muenchberg', producer: 'Domaine Ostertag', name: 'Pinot Gris Muenchberg', vintage: '2019', color: 'blanc', region: 'Alsace', subRegion: 'Bas-Rhin', appellation: 'Alsace Grand Cru Muenchberg', country: FR, grapes: 'Pinot gris', buy: 38, qty: 10, apogee: [2022, 2032] },
  { key: 'gaja-barbaresco', producer: 'Gaja', name: 'Barbaresco', vintage: '2018', color: 'rouge', region: 'Piémont', subRegion: 'Langhe', appellation: 'Barbaresco', country: 'Italie', grapes: 'Nebbiolo', buy: 240, qty: 3, apogee: [2026, 2050] },
  { key: 'muller-scharzhofberger', producer: 'Egon Müller', name: 'Scharzhofberger Riesling Kabinett', vintage: '2021', color: 'blanc', region: 'Mosel', subRegion: 'Saar', appellation: 'Mosel', country: 'Allemagne', grapes: 'Riesling', buy: 70, qty: 6, apogee: [2024, 2045] },
  { key: 'pichon-comtesse-mag', producer: 'Château Pichon Longueville Comtesse de Lalande', name: 'Pauillac', vintage: '2016', color: 'rouge', region: 'Bordeaux', subRegion: 'Médoc', appellation: 'Pauillac', country: FR, grapes: 'Cabernet sauvignon, Merlot', buy: 120, qty: 2, apogee: [2026, 2048], format: 150 },
  { key: 'trevallon', producer: 'Domaine de Trévallon', name: 'Rouge', vintage: '2017', color: 'rouge', region: 'Provence', subRegion: 'Alpilles', appellation: 'IGP Alpilles', country: FR, grapes: 'Cabernet sauvignon, Syrah', buy: 58, qty: 0, apogee: [2023, 2038] },
  // ——— références complémentaires
  {
    key: 'macle-chateau-chalon', producer: 'Domaine Jean Macle', name: 'Château-Chalon', vintage: '2015', color: 'blanc',
    region: 'Jura', subRegion: 'Revermont', appellation: 'Château-Chalon', country: FR, grapes: 'Savagnin', buy: 55, qty: 6, apogee: [2025, 2060], format: 62,
    sheet: {
      aop: 'Château-Chalon', sol: 'Marnes grises et bleues', cepage: 'Savagnin',
      vinification: 'Fermentation traditionnelle', elevage: 'Sous voile, en fûts non ouillés, pendant plus de six ans',
      oeil: 'Or ambré', nez: 'Noix, curry, épices douces, pomme', bouche: 'Puissante et saline, d’une grande longueur',
      temperatureService: '14–16 °C', garde: 'Très longue garde', accords: 'Comté vieux, volaille au vin jaune et aux morilles',
    },
  },
  {
    key: 'mas-jullien', producer: 'Mas Jullien', name: 'Terrasses du Larzac', vintage: '2019', color: 'rouge',
    region: 'Languedoc', subRegion: 'Terrasses du Larzac', appellation: 'Terrasses du Larzac', country: FR, grapes: 'Syrah, Grenache, Mourvèdre, Carignan', buy: 38, qty: 18, apogee: [2023, 2032],
    sheet: {
      aop: 'Terrasses du Larzac', sol: 'Schistes, calcaires et galets', cepage: 'Syrah, Grenache, Mourvèdre, Carignan',
      vinification: 'Vinification par parcelle', elevage: 'En foudres et fûts',
      oeil: 'Grenat sombre', nez: 'Garrigue, fruits noirs, réglisse', bouche: 'Profonde et fraîche, tanins fins',
      temperatureService: '16–17 °C', garde: "Jusqu'en 2032", accords: 'Agneau aux herbes, daube provençale',
    },
  },
  { key: 'grange-des-peres', producer: 'Domaine de la Grange des Pères', name: 'Rouge', vintage: '2018', color: 'rouge', region: 'Languedoc', subRegion: 'Hérault', appellation: "IGP Pays d'Hérault", country: FR, grapes: 'Syrah, Mourvèdre, Cabernet sauvignon', buy: 95, qty: 6, apogee: [2025, 2040] },
  {
    key: 'lapierre-morgon', producer: 'Domaine Marcel Lapierre', name: 'Morgon', vintage: '2022', color: 'rouge',
    region: 'Beaujolais', subRegion: 'Crus du Beaujolais', appellation: 'Morgon', country: FR, grapes: 'Gamay', buy: 18, qty: 48, apogee: [2023, 2028], glass: 12,
    sheet: {
      aop: 'Morgon', sol: 'Granites décomposés', cepage: 'Gamay noir à jus blanc',
      vinification: 'Macération carbonique, levures indigènes', elevage: 'En foudres et fûts anciens',
      oeil: 'Rubis brillant', nez: 'Cerise, framboise, pivoine', bouche: 'Gourmande et digeste, tanins soyeux',
      temperatureService: '14–15 °C', garde: "À boire jusqu'en 2028", accords: 'Charcuteries, volaille rôtie, cuisine de bistrot',
    },
  },
  { key: 'foillard-cote-du-py', producer: 'Domaine Jean Foillard', name: 'Morgon Côte du Py', vintage: '2021', color: 'rouge', region: 'Beaujolais', subRegion: 'Crus du Beaujolais', appellation: 'Morgon', country: FR, grapes: 'Gamay', buy: 26, qty: 24, apogee: [2023, 2031] },
  {
    key: 'peters-reserve', producer: 'Champagne Pierre Péters', name: 'Cuvée de Réserve Blanc de Blancs Grand Cru', vintage: 'NM', color: 'bulles',
    region: 'Champagne', subRegion: 'Côte des Blancs', appellation: 'Champagne Grand Cru', country: FR, grapes: 'Chardonnay', buy: 42, qty: 30, glass: 19,
    sheet: {
      aop: 'Champagne Grand Cru', sol: 'Craie de la Côte des Blancs', cepage: '100 % Chardonnay',
      vinification: 'Assemblage incluant des vins de réserve', elevage: 'Vieillissement sur lattes',
      oeil: 'Or pâle', nez: 'Citron, craie, fleur d’aubépine', bouche: 'Tendue, ciselée, très minérale',
      temperatureService: '8–10 °C', garde: 'À boire ou à garder quelques années', accords: 'Huîtres, sushis, langoustines',
    },
  },
  { key: 'larmandier-latitude', producer: 'Champagne Larmandier-Bernier', name: 'Latitude Extra-Brut', vintage: 'NM', color: 'bulles', region: 'Champagne', subRegion: 'Côte des Blancs', appellation: 'Champagne', country: FR, grapes: 'Chardonnay', buy: 38, qty: 18 },
  { key: 'billecart-mag', producer: 'Champagne Billecart-Salmon', name: 'Brut Réserve', vintage: 'NM', color: 'bulles', region: 'Champagne', subRegion: 'Vallée de la Marne', appellation: 'Champagne', country: FR, grapes: 'Meunier, Chardonnay, Pinot noir', buy: 32, qty: 6, format: 150 },
  { key: 'beaucastel-mag', producer: 'Château de Beaucastel', name: 'Châteauneuf-du-Pape', vintage: '2017', color: 'rouge', region: 'Vallée du Rhône', subRegion: 'Rhône méridional', appellation: 'Châteauneuf-du-Pape', country: FR, grapes: 'Mourvèdre, Grenache, Syrah, Counoise', buy: 70, qty: 3, apogee: [2025, 2040], format: 150 },
  {
    key: 'fevre-montmains', producer: 'Domaine William Fèvre', name: 'Chablis 1er Cru Montmains', vintage: '2021', color: 'blanc',
    region: 'Bourgogne', subRegion: 'Chablis', appellation: 'Chablis Premier Cru', country: FR, grapes: 'Chardonnay', buy: 34, qty: 24, apogee: [2024, 2030], glass: 15,
    sheet: {
      aop: 'Chablis Premier Cru', sol: 'Marnes kimméridgiennes', cepage: 'Chardonnay',
      vinification: 'Fermentation en cuve et en fût', elevage: 'Sur lies',
      oeil: 'Or vert', nez: 'Citron, silex, fleurs blanches', bouche: 'Vive et saline, finale iodée',
      temperatureService: '10–12 °C', garde: "Jusqu'en 2030", accords: 'Huîtres, escargots, poissons grillés',
    },
  },
  { key: 'joguet-chinon', producer: 'Domaine Charles Joguet', name: 'Chinon Les Petites Roches', vintage: '2021', color: 'rouge', region: 'Loire', subRegion: 'Touraine', appellation: 'Chinon', country: FR, grapes: 'Cabernet franc', buy: 22, qty: 30, apogee: [2023, 2029] },
  { key: 'vega-valbuena', producer: 'Vega Sicilia', name: 'Valbuena 5°', vintage: '2018', color: 'rouge', region: 'Castille-et-León', subRegion: 'Ribera del Duero', appellation: 'Ribera del Duero', country: 'Espagne', grapes: 'Tinto Fino, Merlot', buy: 110, qty: 6, apogee: [2024, 2038] },
  { key: 'radikon-oslavje', producer: 'Radikon', name: 'Oslavje', vintage: '2018', color: 'orange', region: 'Frioul', subRegion: 'Collio', appellation: 'IGT Venezia Giulia', country: 'Italie', grapes: 'Chardonnay, Sauvignon blanc, Pinot grigio', buy: 48, qty: 10, apogee: [2023, 2035] },
];

/** Fournisseurs fictifs et régions qu'ils couvrent (répartition des réassorts). */
export interface SupplierSeed extends Pick<Partner, 'name' | 'city' | 'email' | 'paymentTermsDays' | 'address' | 'postalCode' | 'contactName' | 'phone'> {
  key: string;
  regions: string[];
  numberPrefix: string;
}

export const SUPPLIERS: SupplierSeed[] = [
  {
    key: 'bertrand', name: 'Maison Bertrand Négoce', contactName: 'Service commandes', address: '8 rue des Tonneliers', postalCode: '21200', city: 'Beaune',
    email: 'commandes@bertrand-negoce.example', phone: '03 00 00 00 01', paymentTermsDays: 30, numberPrefix: 'BN-',
    regions: ['Bourgogne', 'Beaujolais', 'Jura', 'Alsace', 'Loire'],
  },
  {
    key: 'gcb', name: 'Les Grands Crus de Bordeaux', contactName: 'Service grands comptes', address: '42 quai des Chartrons', postalCode: '33000', city: 'Bordeaux',
    email: 'ventes@gcb.example', phone: '05 00 00 00 02', paymentTermsDays: 45, numberPrefix: 'GCB-',
    regions: ['Bordeaux', 'Vallée du Rhône', 'Provence', 'Languedoc', 'Piémont', 'Mosel', 'Castille-et-León', 'Frioul'],
  },
  {
    key: 'champdist', name: 'Champagne Distribution', contactName: 'Accueil professionnels', address: '3 allée des Crayères', postalCode: '51100', city: 'Reims',
    email: 'pro@champdist.example', phone: '03 00 00 00 03', paymentTermsDays: 30, numberPrefix: 'CD-',
    regions: ['Champagne'],
  },
];

export type ClientKey = 'comptoir' | 'lumieres' | 'abbaye' | 'verdier' | 'club' | 'dubois' | 'morel';

export type ClientSeed = Pick<Partner, 'name' | 'city' | 'customerType' | 'email' | 'paymentTermsDays' | 'address' | 'postalCode' | 'contactName' | 'discountPct'> & { key: ClientKey };

export const CLIENTS: ClientSeed[] = [
  { key: 'comptoir', name: 'Restaurant Le Comptoir', contactName: 'Chef sommelier', address: '15 rue du Marché', postalCode: '75011', city: 'Paris', customerType: 'pro', email: 'achats@lecomptoir.example', paymentTermsDays: 30, discountPct: 5 },
  { key: 'lumieres', name: 'Hôtel des Lumières', contactName: 'Direction F&B', address: '2 place des Célestins', postalCode: '69002', city: 'Lyon', customerType: 'pro', email: 'cave@hotel-lumieres.example', paymentTermsDays: 30 },
  { key: 'abbaye', name: "Cave de l'Abbaye", contactName: 'Gérance', address: '27 rue Monge', postalCode: '21000', city: 'Dijon', customerType: 'pro', email: 'contact@cave-abbaye.example', paymentTermsDays: 15, discountPct: 8 },
  { key: 'verdier', name: 'Maison Verdier Traiteur', contactName: 'Service achats', address: '110 cours de la Marne', postalCode: '33800', city: 'Bordeaux', customerType: 'pro', email: 'achats@verdier-traiteur.example', paymentTermsDays: 45 },
  { key: 'club', name: 'Cercle Œnophile du Nord', contactName: 'Trésorerie', address: '5 rue des Arts', postalCode: '59000', city: 'Lille', customerType: 'pro', email: 'tresorier@cercle-oenophile.example', paymentTermsDays: 30 },
  { key: 'dubois', name: 'Mme Claire Dubois', address: '9 allée des Tilleuls', postalCode: '44000', city: 'Nantes', customerType: 'particulier', email: 'claire.dubois@example.com', paymentTermsDays: 0 },
  { key: 'morel', name: 'M. Antoine Morel', address: '21 chemin du Lac', postalCode: '74000', city: 'Annecy', customerType: 'particulier', email: 'antoine.morel@example.com', paymentTermsDays: 0 },
];

/** Catégories de charges par défaut (libellés FR identiques au jeu proposé par le module Compta). */
export const EXPENSE_CATEGORY_NAMES: Record<string, string> = {
  rent: 'Loyer et charges locatives',
  energy: 'Énergie, eau',
  insurance: 'Assurances',
  fees: 'Honoraires',
  transport: 'Transports',
  advertising: 'Publicité, communication',
  travel: 'Déplacements, repas',
  supplies: 'Fournitures, emballages',
  telecom: 'Télécoms, internet',
  bank: 'Frais bancaires',
  maintenance: 'Entretien, réparations',
  misc: 'Charges diverses',
};
