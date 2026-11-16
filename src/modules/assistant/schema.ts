import { Type, type FunctionDeclaration, type Schema } from '@google/genai';
import { ASSISTANT_TOOL_NAMES, isAssistantToolName, type AssistantToolName } from './types';

export { ASSISTANT_TOOL_NAMES, isAssistantToolName, type AssistantToolName };

const S: Schema = { type: Type.STRING };
const N: Schema = { type: Type.NUMBER };
const B: Schema = { type: Type.BOOLEAN };

export const TOOL_DECLARATIONS: Record<AssistantToolName, FunctionDeclaration> = {
  find_wines: {
    name: 'find_wines',
    description:
      'Recherche des vins dans le catalogue et le stock (avec filtres par région, sous-région, domaine, couleur, millésime, format, disponibilité, quantité, prix, apogée, lieu) et calcule les totaux exacts (bouteilles, références, valorisation). Utilise aussi candidateName/candidateProducer pour vérifier les doublons avant une création.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { ...S, description: 'Texte libre (nom de cuvée, appellation, domaine, cépage).' },
        region: { ...S, description: 'Région viticole exacte (ex: Bourgogne, Bordeaux, Champagne, Vallée du Rhône, Loire).' },
        subRegion: { ...S, description: 'Sous-région (ex: Côte de Beaune, Côte de Nuits, Chablis).' },
        producer: { ...S, description: 'Nom du producteur ou domaine.' },
        color: {
          type: Type.STRING,
          enum: ['rouge', 'blanc', 'rose', 'bulles', 'orange', 'doux', 'spiritueux', 'autre'],
          description: 'Couleur ou type de vin.',
        },
        vintage: { ...S, description: 'Millésime (ex: "2020" ou "NM").' },
        grapes: { ...S, description: 'Cépage (ex: Chardonnay, Pinot Noir, Syrah).' },
        formatCl: { ...N, description: 'Format en cl (75 = bouteille, 150 = magnum, 37.5 = demi, 300 = jéroboam).' },
        stockStatus: {
          type: Type.STRING,
          enum: ['in', 'low', 'out', 'normal', 'all'],
          description: 'Statut de stock : in (>0), low (sous seuil), out (0), normal (> seuil), all.',
        },
        minQty: { ...N, description: 'Quantité minimale en bouteilles.' },
        maxQty: { ...N, description: 'Quantité maximale en bouteilles.' },
        priceField: {
          type: Type.STRING,
          enum: ['menuPriceTTC', 'sellPriceHT', 'buyPriceHT'],
          description: 'Champ de prix à filtrer ou trier.',
        },
        minPrice: { ...N, description: 'Prix minimum en euros.' },
        maxPrice: { ...N, description: 'Prix maximum en euros.' },
        apogeeOnly: { ...B, description: "Vrai pour ne garder que les vins actuellement dans leur fenêtre d'apogée." },
        siteId: { ...S, description: 'Identifiant du lieu (ou nom du lieu, ou "all" pour tous les lieux).' },
        sortBy: {
          type: Type.STRING,
          enum: ['qty', 'price', 'vintage', 'producer'],
          description: 'Critère de tri principal.',
        },
        sortDesc: { ...B, description: 'Vrai pour trier par ordre décroissant.' },
        limit: { ...N, description: 'Nombre maximum de vins renvoyés (max 20).' },
      },
    },
  },

  stock_alerts: {
    name: 'stock_alerts',
    description:
      "Détecte les alertes sur le stock : ruptures (out), seuils bas (low), vins à leur apogée (apogee), vins ayant dépassé leur apogée (past), vins risquant de se perdre avant d'être vendus (maturity_risk), et bouteilles au verre ouvertes depuis plusieurs jours (open_bottles).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        kinds: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
            enum: ['out', 'low', 'apogee', 'past', 'maturity_risk', 'open_bottles'],
          },
          description: "Types d'alertes à vérifier (par défaut tous).",
        },
        siteId: { ...S, description: 'Identifiant ou nom du lieu ("all" pour tous).' },
        openDaysThreshold: { ...N, description: 'Seuil en jours pour les bouteilles ouvertes au verre (défaut 3).' },
        limit: { ...N, description: "Nombre maximum d'éléments renvoyés (max 20)." },
      },
    },
  },

  rotation: {
    name: 'rotation',
    description:
      'Analyse la rotation du stock à partir des mouvements : vins dormants sans sortie (dormant), meilleures sorties/ventes (top_out), pertes/casse/bouchonnés (shrinkage), ou comparaison de rotation entre les lieux (compare_sites).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        metric: {
          type: Type.STRING,
          enum: ['dormant', 'top_out', 'shrinkage', 'compare_sites'],
          description: 'Type de mesure de rotation à calculer.',
        },
        days: { ...N, description: 'Période en jours (de 7 à 365, défaut 180 pour dormant, 90 sinon).' },
        siteId: { ...S, description: 'Identifiant ou nom du lieu ("all" pour tous).' },
        limit: { ...N, description: "Nombre maximum d'éléments renvoyés (max 20)." },
      },
      required: ['metric'],
    },
  },

  margins: {
    name: 'margins',
    description:
      "Analyse les marges, la rentabilité et les prix des vins (réservé au back-office avec accès aux coûts et au module pilotage) : marges les plus faibles (low_margins), meilleures marges (top_margins), vins sous-valorisés sous le coefficient cible (underpriced), ou synthèse globale (summary).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        focus: {
          type: Type.STRING,
          enum: ['low_margins', 'top_margins', 'underpriced', 'summary'],
          description: "Angle d'analyse des marges.",
        },
        siteId: { ...S, description: 'Identifiant ou nom du lieu ("all" pour tous).' },
        maxMarginRatePct: { ...N, description: 'Seuil de taux de marque en % en dessous duquel alerter (ex: 50).' },
        days: { ...N, description: 'Période de vente analysée en jours (défaut 90).' },
        limit: { ...N, description: "Nombre maximum d'éléments renvoyés (max 20)." },
      },
    },
  },

  data_quality: {
    name: 'data_quality',
    description:
      "Audite la qualité et la complétude des données de la cave : fiches sans prix de vente (missing_price), bouteilles en stock sans emplacement/casier (missing_bin), sans fiche technique (missing_tech_sheet), sans apogée (missing_apogee), sans allergènes (missing_allergens), ou doublons potentiels (duplicates).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        checks: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
            enum: ['missing_price', 'missing_bin', 'missing_tech_sheet', 'missing_apogee', 'missing_allergens', 'duplicates'],
          },
          description: 'Contrôles à exécuter (par défaut tous).',
        },
        siteId: { ...S, description: 'Identifiant ou nom du lieu ("all" pour tous).' },
        limit: { ...N, description: "Nombre maximum d'anomalies renvoyées (max 20)." },
      },
    },
  },

  help: {
    name: 'help',
    description:
      "Cherche dans le guide d'utilisation intégré comment réaliser une action dans l'application (ex: sortir une bouteille, scanner une facture, créer une carte QR, faire un inventaire, gérer les casiers, changer la langue).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { ...S, description: "Mots-clés ou question sur le fonctionnement de l'application." },
      },
      required: ['query'],
    },
  },

  navigate: {
    name: 'navigate',
    description:
      "Propose à l'utilisateur un bouton pour ouvrir un écran autorisé de l'application, avec optionnellement des filtres ou un formulaire pré-rempli (création d'un vin ou saisie d'un mouvement d'entrée/sortie de stock). Important : appelle toujours find_wines avant de proposer la création d'un vin pour vérifier s'il existe déjà.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        route: {
          type: Type.STRING,
          enum: ['/', '/service', '/carte', '/vins', '/plan-de-cave', '/stock', '/achats', '/negoce', '/contacts', '/pilotage', '/compta', '/reglages'],
          description: "Chemin de l'écran cible.",
        },
        label: { ...S, description: "Libellé clair du bouton d'action proposé à l'utilisateur." },
        actionKind: {
          type: Type.STRING,
          enum: ['open_page', 'prefill_new_wine', 'prefill_movement', 'filter_wines'],
          description: "Type d'ouverture : simple navigation, création de vin pré-remplie, mouvement de stock pré-rempli, ou liste filtrée.",
        },
        winePrefill: {
          type: Type.OBJECT,
          description: 'Champs pré-remplis pour la création d’un nouveau vin (si actionKind = prefill_new_wine).',
          properties: {
            producer: S,
            name: S,
            appellation: S,
            cuvee: S,
            vintage: S,
            color: { type: Type.STRING, enum: ['rouge', 'blanc', 'rose', 'bulles', 'orange', 'doux', 'spiritueux', 'autre'] },
            formatCl: N,
            region: S,
            subRegion: S,
            country: S,
            grapes: S,
            buyPriceHT: N,
            sellPriceHT: N,
            menuPriceTTC: N,
            initialQty: { ...N, description: 'Quantité initiale à entrer en stock à la création.' },
            initialSiteId: { ...S, description: 'Lieu où entrer la quantité initiale.' },
          },
        },
        movementPrefill: {
          type: Type.OBJECT,
          description: 'Champs pré-remplis pour un mouvement de stock sur un vin existant (si actionKind = prefill_movement).',
          properties: {
            wineId: { ...S, description: 'Identifiant exact du vin existant.' },
            wineLabel: S,
            type: { type: Type.STRING, enum: ['in', 'out', 'transfer', 'adjust'] },
            qty: N,
            reason: {
              type: Type.STRING,
              enum: ['achat', 'vente', 'consommation', 'casse', 'degustation', 'offert', 'transfert', 'inventaire', 'retour', 'bouchonne', 'oxyde', 'autre'],
            },
            unitCostHT: N,
            siteId: S,
            bin: S,
            note: S,
          },
        },
        filterParams: {
          type: Type.OBJECT,
          description: 'Filtres URL à appliquer sur /vins ou /stock (si actionKind = filter_wines).',
          properties: {
            q: S,
            color: S,
            region: S,
            vintage: S,
            stock: { type: Type.STRING, enum: ['in', 'low', 'out', 'normal'] },
            apogee: B,
            tab: S,
          },
        },
      },
      required: ['route', 'actionKind'],
    },
  },
};

export const ASSISTANT_ANSWER_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    text: {
      type: Type.STRING,
      description: 'Réponse synthétique, claire et directe (2 à 5 phrases) dans la langue de l’utilisateur.',
    },
    citedWineIds: {
      type: Type.ARRAY,
      items: S,
      description: 'Identifiants des vins mentionnés.',
    },
    citedSiteIds: {
      type: Type.ARRAY,
      items: S,
      description: 'Identifiants des lieux mentionnés.',
    },
    followUps: {
      type: Type.ARRAY,
      items: S,
      description: '2 ou 3 suggestions courtes de questions suivantes pertinentes.',
    },
  },
  required: ['text', 'followUps'],
};
