import type { Locale, ModuleId, Role } from '@/types';
import { NAV, isNavVisible } from '@/registry';
import { norm } from '@/lib/wine';

export interface HelpArticle {
  id: string;
  route: string;
  module?: ModuleId;
  roles?: Role[];
  keywords: string;
  title: Record<Locale, string>;
  summary: Record<Locale, string>;
  steps: Record<Locale, string[]>;
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'stock-movement',
    route: '/stock',
    module: 'stock',
    keywords: 'sortir entrer bouteille mouvement stock vente casse bouchonne transfert service deboucher',
    title: {
      fr: 'Sortir ou entrer une bouteille du stock',
      en: 'Record a bottle stock in or out movement',
    },
    summary: {
      fr: 'Enregistrez une entrée (achat, retour), une sortie (vente, service, casse, bouchonné) ou un transfert entre lieux.',
      en: 'Record a stock entry (purchase, return), exit (sale, service, breakage, corked) or transfer between sites.',
    },
    steps: {
      fr: [
        'Ouvrez le menu « Stock & mouvements » (/stock) ou utilisez le bouton « + ».',
        'Cliquez sur « Nouveau mouvement » et choisissez Entrée, Sortie, Transfert ou Ajustement.',
        'Sélectionnez le vin, le lieu, la quantité et le motif, puis cliquez sur « Enregistrer ».',
      ],
      en: [
        'Open "Stock & movements" (/stock) or use the "+" quick action button.',
        'Click "New movement" and choose In, Out, Transfer or Adjust.',
        'Select the wine, site, quantity and reason, then click "Save".',
      ],
    },
  },
  {
    id: 'wines-create',
    route: '/vins',
    module: 'stock',
    roles: ['owner', 'manager', 'sommelier', 'accountant'],
    keywords: 'ajouter creer nouveau vin cuvee photo etiquette scanner fiche technique catalogue doublon',
    title: {
      fr: 'Ajouter un vin ou scanner une étiquette',
      en: 'Add a wine or scan a bottle label',
    },
    summary: {
      fr: 'Créez une référence manuellement, par photo d’étiquette IA, ou générez sa fiche technique sommellerie.',
      en: 'Create a wine reference manually, via AI label scan, or generate its sommelier technical sheet.',
    },
    steps: {
      fr: [
        'Dans « Vins & catalogue » (/vins), cliquez sur « Nouveau vin ».',
        'Prenez en photo l’étiquette pour pré-remplir domaine, cuvée et millésime, ou saisissez-les.',
        'Vérifiez le prix et le seuil d’alerte, puis enregistrez.',
      ],
      en: [
        'In "Wines & catalog" (/vins), click "New wine".',
        'Snap a photo of the label to auto-fill producer, cuvée and vintage, or type them in.',
        'Check pricing and alert threshold, then save.',
      ],
    },
  },
  {
    id: 'cellar-plan',
    route: '/plan-de-cave',
    module: 'stock',
    keywords: 'plan de cave casier alveole etagere rangement emplacement bin 2d 3d temperature',
    title: {
      fr: 'Ranger des bouteilles dans le plan de cave',
      en: 'Place bottles in the cellar plan and racks',
    },
    summary: {
      fr: 'Visualisez vos meubles et casiers en 2D/3D et affectez une coordonnée précise (ex: A3, ARM-R2) à chaque bouteille.',
      en: 'Visualize your racks in 2D/3D and assign exact bin coordinates (e.g., A3, ARM-R2) to each bottle.',
    },
    steps: {
      fr: [
        'Ouvrez « Plan de cave » (/plan-de-cave) et sélectionnez le lieu souhaité.',
        'Cliquez sur un casier pour voir ses alvéoles occupées et libres, ou créez un meuble avec « Configurer ».',
        'Depuis la liste du stock, cliquez sur l’étiquette d’emplacement d’un vin pour modifier son casier.',
      ],
      en: [
        'Open "Cellar plan" (/plan-de-cave) and select the target site.',
        'Click any rack to inspect occupied and free slots, or configure racks.',
        'From the stock list, click a wine’s bin badge to assign or update its rack location.',
      ],
    },
  },
  {
    id: 'stock-inventory',
    route: '/stock?tab=inventory',
    module: 'stock',
    keywords: 'inventaire comptage ecart recollement stock',
    title: {
      fr: 'Réaliser un inventaire de cave',
      en: 'Run a cellar inventory count',
    },
    summary: {
      fr: 'Comptez les bouteilles lieu par lieu et générez automatiquement les écritures d’ajustement sur les écarts.',
      en: 'Count bottles by site and automatically generate stock adjustment movements for discrepancies.',
    },
    steps: {
      fr: [
        'Allez dans « Stock & mouvements » puis ouvrez l’onglet « Inventaire » (/stock?tab=inventory).',
        'Démarrez une session sur le lieu choisi et saisissez les quantités comptées.',
        'Clôturez l’inventaire pour valider les écarts d’un coup.',
      ],
      en: [
        'Go to "Stock & movements" and open the "Inventory" tab (/stock?tab=inventory).',
        'Start a session for the chosen site and enter counted quantities.',
        'Close the inventory to commit adjustments atomically.',
      ],
    },
  },
  {
    id: 'carte-publish',
    route: '/carte',
    module: 'carte',
    roles: ['owner', 'manager', 'sommelier'],
    keywords: 'carte des vins menu qr code publier imprimer pdf traduction anglais',
    title: {
      fr: 'Créer et publier une carte des vins (papier & QR code)',
      en: 'Create and publish a wine list (print & QR code)',
    },
    summary: {
      fr: 'Composez vos sections, personnalisez la charte graphique, traduisez la carte et publiez-la avec QR code.',
      en: 'Build sections, customize typography and colors, translate, and publish with a live QR code.',
    },
    steps: {
      fr: [
        'Ouvrez « Carte des vins » (/carte) et créez ou sélectionnez une carte.',
        'Ajoutez des vins depuis votre stock, ajustez le style dans l’onglet « Design » et les langues.',
        'Cliquez sur « Publier » pour mettre à jour le lien QR code ou imprimer le PDF.',
      ],
      en: [
        'Open "Wine list" (/carte) and create or select a list.',
        'Add wines from stock, customize the look in "Design" and languages.',
        'Click "Publish" to update the QR link or print the PDF.',
      ],
    },
  },
  {
    id: 'service-pos',
    route: '/service',
    module: 'carte',
    keywords: 'service salle verre au verre bouteille ouverte coravin ticket z caisse pos',
    title: {
      fr: 'Gérer le service au verre et le Ticket Z de caisse',
      en: 'Manage by-the-glass service and POS Z-ticket reconciliation',
    },
    summary: {
      fr: 'Suivez la fraîcheur des bouteilles ouvertes au verre et déstockez les ventes du soir via le Ticket Z.',
      en: 'Track open by-the-glass bottles and reconcile evening sales via POS Z-ticket import.',
    },
    steps: {
      fr: [
        'Ouvrez « Service » (/service) sur tablette ou mobile.',
        'Dans « Au verre », déclarez l’ouverture d’une bouteille pour suivre sa date d’ouverture.',
        'En fin de service, cliquez sur « Ticket Z / Caisse » pour rapprocher et déstocker les ventes.',
      ],
      en: [
        'Open "Service" (/service) on tablet or mobile.',
        'In "By the glass", mark a bottle as opened to track freshness.',
        'At the end of service, click "POS Z-Ticket" to reconcile and deduct sold bottles.',
      ],
    },
  },
  {
    id: 'achats-invoice',
    route: '/achats',
    module: 'achats',
    roles: ['owner', 'manager', 'sommelier', 'accountant'],
    keywords: 'facture achat fournisseur pdf ocr ia receptionner livraison cmp prix achat',
    title: {
      fr: 'Importer et réceptionner une facture fournisseur par IA',
      en: 'Import and receive a supplier invoice with AI',
    },
    summary: {
      fr: 'Déposez un PDF ou une photo de facture : l’IA extrait les lignes, rapproche les vins et calcule le coût moyen pondéré.',
      en: 'Upload a PDF or photo invoice: AI extracts lines, matches wines, and updates weighted average cost.',
    },
    steps: {
      fr: [
        'Allez dans « Achats » (/achats) puis cliquez sur « Nouvelle facture ».',
        'Importez le PDF ou la photo de la facture fournisseur.',
        'Vérifiez le rapprochement des cuvées, choisissez le lieu de réception et validez l’entrée en stock.',
      ],
      en: [
        'Go to "Purchases" (/achats) and click "New invoice".',
        'Upload the supplier invoice PDF or photo.',
        'Review matched wines, choose the receiving site, and confirm stock reception.',
      ],
    },
  },
  {
    id: 'pilotage-margins',
    route: '/pilotage',
    module: 'pilotage',
    roles: ['owner', 'manager', 'sommelier', 'accountant'],
    keywords: 'pilotage marge rentabilite rotation abc dormant reapprovisionnement millesime apogee',
    title: {
      fr: 'Analyser les marges, la rotation et les réapprovisionnements',
      en: 'Analyze margins, turnover and replenishment',
    },
    summary: {
      fr: 'Consultez votre taux de marque, le classement ABC, les vins dormants et les suggestions de commande.',
      en: 'Inspect gross margin, ABC Pareto ranking, dormant stock, and purchase order suggestions.',
    },
    steps: {
      fr: [
        'Ouvrez « Pilotage » (/pilotage) et choisissez la période et le lieu.',
        'Consultez les onglets Vue d’ensemble, Répartition, Vins (ABC & dormants) et Réapprovisionnement.',
      ],
      en: [
        'Open "Analytics" (/pilotage) and select the period and site.',
        'Explore Overview, Breakdown, Wines (ABC & dormant) and Replenishment tabs.',
      ],
    },
  },
  {
    id: 'negoce-drm',
    route: '/negoce',
    module: 'negoce',
    roles: ['owner', 'manager', 'accountant'],
    keywords: 'devis facture client offre commerciale depot vente compta drm douane tva fec',
    title: {
      fr: 'Créer un devis client, une offre ou préparer la DRM Douanes',
      en: 'Create a client quote, commercial offer or Customs DRM',
    },
    summary: {
      fr: 'Éditez vos devis et factures B2B dans Négoce, et exportez votre DRM mensuelle et le FEC dans Comptabilité.',
      en: 'Create B2B quotes and invoices in Trading, and export your monthly Customs DRM and accounting journal.',
    },
    steps: {
      fr: [
        'Dans « Négoce » (/negoce), cliquez sur « Nouveau devis » ou « Nouvelle facture ».',
        'Pour la douane et la TVA, ouvrez « Comptabilité » (/compta) puis l’onglet « DRM Douanes ».',
      ],
      en: [
        'In "Trading" (/negoce), click "New quote" or "New invoice".',
        'For customs and VAT, open "Accounting" (/compta) and select the "Customs DRM" tab.',
      ],
    },
  },
  {
    id: 'settings-team',
    route: '/reglages',
    keywords: 'langue francais anglais theme sombre clair lieu site equipe inviter membre role',
    title: {
      fr: 'Changer la langue, le thème, le lieu ou gérer l’équipe',
      en: 'Change language, theme, active site or manage team members',
    },
    summary: {
      fr: 'Basculez FR/EN et le mode clair/sombre en haut à droite ; gérez les lieux et invitations dans Réglages.',
      en: 'Toggle FR/EN and light/dark mode in the top bar; manage sites and team invites in Settings.',
    },
    steps: {
      fr: [
        'Pour changer de langue (FR/EN) ou de thème (clair/sombre), utilisez les boutons en haut à droite de l’écran.',
        'Pour filtrer par lieu (Cave, Restaurant, Bar…), utilisez le sélecteur de lieu dans la barre supérieure.',
        'Pour ajouter un lieu ou inviter un collaborateur, ouvrez « Réglages » (/reglages).',
      ],
      en: [
        'To switch language (FR/EN) or theme (light/dark), use the buttons in the top-right header.',
        'To filter by site (Cellar, Restaurant, Bar…), use the site selector in the top header.',
        'To add a site or invite a team member, open "Settings" (/reglages).',
      ],
    },
  },
];

export interface HelpMatch {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  route?: string;
}

export function searchHelpArticles(
  query: string,
  locale: Locale,
  modules: ModuleId[],
  role: Role | undefined,
  limit = 3,
): HelpMatch[] {
  const terms = norm(query)
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  const scored = HELP_ARTICLES.map((art) => {
    const hay = norm(`${art.keywords} ${art.title.fr} ${art.title.en} ${art.summary.fr} ${art.summary.en}`);
    let score = 0;
    for (const t of terms) {
      if (hay.includes(t)) score += 10;
    }
    const navItem = NAV.find((n) => art.route === n.path || art.route.startsWith(`${n.path}?`));
    const canOpenRoute = !navItem || isNavVisible(navItem, modules, role);
    if (canOpenRoute) score += 2;
    return { art, score, canOpenRoute };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const picks = (scored.length > 0 ? scored : HELP_ARTICLES.slice(0, limit).map((art) => ({ art, score: 1, canOpenRoute: true }))).slice(
    0,
    limit,
  );

  return picks.map(({ art, canOpenRoute }) => ({
    id: art.id,
    title: art.title[locale] ?? art.title.fr,
    summary: art.summary[locale] ?? art.summary.fr,
    steps: art.steps[locale] ?? art.steps.fr,
    route: canOpenRoute ? art.route : undefined,
  }));
}

export function getContextualSuggestions(
  pathname: string,
  role: Role,
  canSeeCosts: boolean,
  hasPilotage: boolean,
  locale: Locale,
): string[] {
  const isStaff = role === 'staff';
  if (locale === 'en') {
    if (pathname.startsWith('/vins')) {
      return isStaff
        ? [
            'Which Burgundy reds have more than 6 bottles in stock?',
            'Which wines are currently in their peak drinking window?',
            'How do I take a bottle out of stock?',
          ]
        : [
            'Which wine sheets are incomplete before printing the wine list?',
            'Are there any potential duplicate wines in the catalog?',
            'Add 6 magnums of Chablis Les Clos 2020 bought at €95 HT',
          ];
    }
    if (pathname.startsWith('/stock') || pathname.startsWith('/plan-de-cave')) {
      return [
        'Which wines are below their alert threshold or out of stock?',
        'Which wines have been dormant for more than 6 months?',
        'Which bottles in stock are missing a rack location?',
      ];
    }
    if (pathname.startsWith('/pilotage') && canSeeCosts && hasPilotage) {
      return [
        'Where are my lowest margins in stock?',
        'Which wines are underpriced compared to our target multiplier?',
        'Compare stock turnover across our sites',
      ];
    }
    if (pathname.startsWith('/carte')) {
      return [
        'Which Grand Cru wines should we push by the glass this month?',
        'Which wines are at risk of passing their peak drinking window?',
        'How do I publish and print the QR code wine list?',
      ];
    }
    return isStaff
      ? [
          'How many bottles of Meursault do we have left?',
          'Which by-the-glass bottles have been open for more than 3 days?',
          'How do I record a bottle taken out for service?',
        ]
      : [
          'What is the total value of my cellar today by site?',
          'Which wines risk passing their peak window before being sold?',
          ...(canSeeCosts && hasPilotage ? ['Where are my lowest margins?'] : ['Which wines are below their alert threshold?']),
        ];
  }

  if (pathname.startsWith('/vins')) {
    return isStaff
      ? [
          'Quels rouges de Bourgogne ont plus de 6 bouteilles en stock ?',
          'Quels vins sont actuellement à leur apogée ?',
          'Comment je sors une bouteille du stock ?',
        ]
      : [
          'Quelles fiches sont incomplètes avant d’imprimer la carte ?',
          'Y a-t-il des doublons potentiels dans le catalogue ?',
          'Ajoute 6 magnums de Chablis Les Clos 2020 achetés 95 € HT',
        ];
  }
  if (pathname.startsWith('/stock') || pathname.startsWith('/plan-de-cave')) {
    return isStaff
      ? [
          'Quelles ruptures sont à prévoir sous le seuil d’alerte ?',
          'Quels vins dorment depuis plus de 6 mois ?',
          'Comment je sors une bouteille du stock ?',
        ]
      : [
          'Quelles ruptures sont à prévoir sous le seuil d’alerte ?',
          'Quels vins dorment depuis plus de 6 mois ?',
          'Quelles bouteilles en stock n’ont pas d’emplacement ?',
        ];
  }
  if (pathname.startsWith('/pilotage') && canSeeCosts && hasPilotage) {
    return [
      'Où sont mes marges les plus faibles ?',
      'Quels vins sont sous-valorisés par rapport au coefficient cible ?',
      'Compare la rotation entre les lieux',
    ];
  }
  if (pathname.startsWith('/carte')) {
    return [
      'Quels grands crus pousser au verre ce mois-ci ?',
      'Quels vins risquent de passer leur apogée avant qu’on les vende ?',
      'Comment créer et publier une carte QR code ?',
    ];
  }
  return isStaff
    ? [
        'Combien il reste de Meursault en stock ?',
        'Quels vins au verre sont ouverts depuis plus de 3 jours ?',
        'Comment je sors une bouteille en service ?',
      ]
    : [
        'Combien vaut ma cave aujourd’hui, par lieu ?',
        'Qu’est-ce qui risque de se perdre cette année (apogée vs rotation) ?',
        ...(canSeeCosts && hasPilotage ? ['Où sont mes marges les plus faibles ?'] : ['Quelles ruptures sont sous le seuil d’alerte ?']),
      ];
}
