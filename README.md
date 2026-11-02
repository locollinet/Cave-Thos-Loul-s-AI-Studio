# Loul's & Thos

Plateforme de gestion de cave, de négoce et de carte des vins — pour les maisons de négoce, les négociants indépendants, les hôtels / restaurants / palaces avec cave, et les chaînes.

- **Cave & stock** : référentiel de vins (clé canonique, détection de doublons), multi-sites, mouvements traçables, inventaire mobile, alertes (rupture, stock bas, apogée).
- **Carte des vins intelligente** : cartes liées au stock réel (un vin épuisé disparaît), 4 templates, QR code, version publique, sommelier IA, fiches techniques générées.
- **Achats par IA** : import de factures PDF / image / Excel, rapprochement automatique avec le référentiel, réception en stock. Les factures électroniques reçues (Factur-X, XML CII ou UBL) sont lues exactement, sans IA.
- **Négoce** : devis, factures, avoirs, règlements, dépôt-vente. Export de la facture électronique au format CII EN 16931 (règles françaises de la réforme 2026-2027), à déposer sur la plateforme agréée de l'entreprise.
- **Comptabilité & douane** : TVA (CA3), DRM, charges, immobilisations, journal et export FEC.
- **Pilotage** : marges, rotation, analyse ABC, réassort.
- **Service & au verre** : mode tablette pour la salle (sortie bouteille en un geste avec « Annuler »), bouteilles ouvertes, verres servis, fraîcheur et pertes. Ventes de caisse importées depuis le rapport de fin de service (CSV), une seule fois par rapport ; connexion directe à une caisse sur projet.
- **Mentions légales des cartes** : prix nets TTC service compris, sulfites, colles allergènes (œuf, lait) par vin, avertissement santé, dans les 7 langues de la carte publique.
- **Offres clients & relances** : sélections de vins envoyées par lien public ou PDF à la charte de la maison, conversion en devis ; relances d'impayés et de devis par e-mail.
- **Fiche client 360°** : chiffre d'affaires, encours, retards, vins achetés, offres et dépôts.
- **Photos des vins** : prises par l'équipe (téléphone ou import) ; lecture d'étiquette par IA pour préremplir une fiche (sans jamais inventer). Pas de récupération d'images sur Internet (droits d'auteur).
- **Scan de codes-barres** (EAN/UPC) : sélection d'un vin, mouvements, inventaire en continu ; application installable (PWA) avec écran de démarrage hors ligne.
- **Tableaux de bord par métier** (négoce, palace / restaurant, chaîne, équipe) avec liste de démarrage ; carte interactive des terroirs dans le catalogue.
- **Catalogue et stock** : liste compacte groupée par région · sous-région · domaine, tri par colonne, raccourcis, vues enregistrées, sélection multiple (ajout à une carte, offre, ajustement des prix, export, archivage).
- Multi-tenant, rôles (propriétaire, gestionnaire, sommelier, comptable, équipe), FR / EN, mode sombre, palette de commandes (⌘K).

> Architecture détaillée : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Démarrage local

```bash
npm install
cp .env.example .env     # optionnel : GEMINI_API_KEY pour les fonctions IA
npm run dev              # http://localhost:3000
```

Sans configuration Firebase, l'app démarre en **mode démo** : les données (fictives) sont stockées dans le navigateur. Cliquez sur « Essayer en mode démo ».

## Explorer la cave

Le catalogue et les niveaux de stock partagent les mêmes filtres : région, sous-région,
domaine, couleur, pays, millésime, cépage, format, disponibilité, quantité et prix.
Les filtres se cumulent ; les critères actifs peuvent être retirés individuellement.
Les domaines proposés dépendent de la région et de la sous-région choisies.

- Présentation par défaut : **région → sous-région → domaine**, avec sections repliables
  et totaux calculés sur les résultats et le site sélectionné. Les vues par domaine
  et liste continue restent disponibles.
- Quantités : bornes inclusives, raccourcis ≥ 12 / 24 / 48 / 60 bouteilles.
  Prix : base explicite (achat HT, vente HT ou carte TTC) ; un prix absent est exclu
  lorsqu'une borne est appliquée. L'export stock reprend la sélection filtrée.
- Apogée : uniquement les fenêtres complètes renseignées, année courante incluse.
- Caractéristiques : recherche textuelle dans les notes et la fiche technique,
  sans déduire ni certifier de profil sensoriel. Les terroirs manquants sont signalés,
  jamais inventés ; la sous-région et l'appellation sont éditables dans la fiche vin.
- Le journal conserve sa recherche et affiche les 500 derniers mouvements ;
  les filtres de sélection concernent les niveaux de stock, pas le journal.

La fiche vin sépare la présentation éditoriale (terroir, dégustation, accords, service)
de l'onglet **Gestion** (stocks, prix, mouvements). Les gestionnaires peuvent enrichir
la fiche technique depuis cette présentation.

Le sommelier professionnel et public utilise un formulaire commun : plat, budget,
occasion et précisions. Il indique si Gemini n'est pas configuré. Le contexte IA reste
limité aux 150 premières références de la carte ; le budget est une consigne de conseil,
pas un filtre de stock. Les conseils générés restent à vérifier.

## Charte graphique & marque blanche

Chaque carte se paramètre dans l'onglet **Design** de l'éditeur, avec aperçu en direct
(aperçu, impression PDF et page publique QR utilisent le même rendu) :

- **Point de départ** : 5 modèles (Palace, Classique Prestige, Moderne Épuré, Bistrot, Grand Cru Or),
  la **charte de l'établissement**, ou un design **sur mesure** dès qu'un réglage est modifié.
- **Typographie** : 16 polices sélectionnées (sérifs classiques, capitales, linéales, manuscrites),
  pour les titres et pour le texte.
- **Couleurs** : fond, texte, accent, avec harmonies suggérées et contrôle de contraste WCAG
  (texte ≥ 4,5:1, accent ≥ 3:1).
- **Mise en page** : ornement, alignement, casse des rubriques, respiration, présentation
  des prix (alignés, points de conduite, sous le vin), taille du titre.
- **Signature** : logo, accroche et pied de carte (la mention légale reste toujours affichée).

**Réglages › Identité** définit la charte de l'établissement. Les cartes qui la suivent sont
republiées automatiquement quand elle change. Les nouvelles cartes la suivent par défaut.
L'option « Habiller l'application » applique logo, polices et couleur principale à l'interface
de l'équipe ; une couleur insuffisamment lisible sur le fond de l'interface est ignorée.

Limites : polices servies par Google Fonts (pour une police propriétaire sous licence ou
une exigence RGPD stricte, prévoir l'auto-hébergement) ; logo ≤ 300 Ko (PNG, JPG, WebP, SVG),
non intégré à la carte publique au-delà de 400 000 caractères encodés. Une charte par
organisation : pour un groupe, une organisation par établissement ou une évolution « charte
par site » reste à prévoir.

## Avec Firebase (production)

1. Créez un projet Firebase : activez **Authentication** (Google et email / mot de passe, vérification d'email et TOTP 2FA optionnel), **Firestore** et **Cloud Storage**.
2. Remplacez `firebase-applet-config.json` par la configuration web de votre projet (dans Google AI Studio, ce fichier est fourni et remplacé automatiquement).
3. Déployez les règles de sécurité et les index :
   - `firebase deploy --only firestore:rules` (`firestore.rules`)
   - `firebase deploy --only firestore:indexes` (`firestore.indexes.json`)
   - `firebase deploy --only storage` (`storage.rules`)
4. Renseignez `GEMINI_API_KEY` côté serveur (dans AI Studio, la clé est injectée dans les paramètres de secrets).
5. Pour le rôle plateforme (« admin Loul's & Thos ») réservé à l'équipe commerciale et au support, appliquez le custom claim `platformAdmin: true`.

> Guide complet des démos commerciales et configuration console Firebase : [docs/DEMO.md](docs/DEMO.md)

## Dans Google AI Studio

Importez ce dépôt GitHub depuis AI Studio (Build → import depuis GitHub). L'app est démarrée par `npm run dev` (serveur Express + Vite sur le port 3000) ; Firebase et la clé Gemini sont fournis par AI Studio.

Pour préparer les démos clients sur Firebase réel (authentification, cloisonnement, IA, démos par typologie de prospect), consultez le guide dédié : [docs/DEMO.md](docs/DEMO.md) et [docs/AI_STUDIO_PROMPT.md](docs/AI_STUDIO_PROMPT.md).

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur Express + Vite (port 3000) |
| `npm run build` | Build de production (`dist/`) |
| `npm start` | Sert `dist/` en production |
| `npm run lint` | Vérification TypeScript (`tsc --noEmit`) |
| `npm test` | Tests unitaires et intégration (Vitest) |
| `npm run test:rules` | Règles Firestore dans l'émulateur (Java 11+ et `firebase-tools`) |

## Sécurité & Confidentialité

- **Routes IA (`/api/ai/*`)** : jeton Firebase vérifié par signature (clés publiques Google), quotas par compte (300/h) et par organisation (500/h). Sans compte : sommelier d'une carte publiée uniquement (40/h par carte, 20/h par appareil) et mode démo limité par IP (30/h), sous un plafond global ; `DEMO_AI=off` ferme l'IA sans compte. Authentification avant lecture du corps (1 Mo, 30 Mo pour les fichiers). Journalisation d'usage (durée, modèle, succès/échec) sans jamais stocker le contenu des requêtes.
- **En-têtes HTTP** : CSP stricte en production (`CSP_MODE=report-only` pour l'observer), `nosniff`, HSTS, `frame-ancestors 'self'`.
- **Règles Firestore** (testées dans l'émulateur) : cloisonnement par organisation et par rôle (`owner`, `manager`, `sommelier`, `accountant`, `staff`). Prix d'achat, coefficients et coûts rangés dans `wineCosts` / `movementCosts`, illisibles pour l'équipe de salle. L'équipe ne modifie une quantité qu'avec le mouvement signé qui la justifie (même lot, horodatage serveur). Mouvements immuables, compteurs de numérotation qui n'avancent que d'un pas.
- **Transactions atomiques** : le numéro de facture est réservé dans la même transaction que la facture et ses sorties de stock (ni trou ni doublon) ; une sortie qui rendrait un stock négatif est refusée.
- **Invitations sécurisées** : lien à jeton valable 7 jours, adresse email vérifiée exigée, invitation consommée à l'inscription.
- **RGPD & Mes Données** : export JSON de toutes les collections accessibles au rôle, export CSV protégé contre l'injection de formules, demande de suppression enregistrée (`deletionRequests`) et suivie dans la console plateforme.
- **Cartes et offres publiques** : instantanés sans prix d'achat ni stock, lecture par identifiant seulement ; une offre expirée n'est plus lisible.

