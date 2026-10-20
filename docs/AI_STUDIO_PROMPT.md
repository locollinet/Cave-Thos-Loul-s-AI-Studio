# Prompt AI Studio — préparer Loul's & Thos pour les démos clients

## Mode d'emploi

1. Poussez ce dépôt sur GitHub, puis importez-le dans Google AI Studio (Build).
2. Vérifiez que l'application démarre (`npm run dev`, port 3000) et qu'AI Studio a bien fourni
   la configuration Firebase (`firebase-applet-config.json`) et la clé `GEMINI_API_KEY`.
3. Collez le prompt ci-dessous **en une seule fois**. S'il est trop long pour une session,
   envoyez-le par étapes (§ 4.1 à 4.7), en commençant toujours par le contexte (§ 1 à 3).
4. Après chaque étape, faites dérouler la check-list de recette (§ 6).

---

## PROMPT

### 1. Contexte

Tu reprends une application **existante et fonctionnelle** : « Loul's & Thos », plateforme de
gestion de cave, de carte des vins et de négoce. Cibles : maisons de négoce, négociants
indépendants sans boutique, hôtels / restaurants / palaces avec cave, chaînes et groupes.

Le code est dans ce projet. **Ne le réécris pas** : appuie-toi dessus, prolonge-le, et
conserve son architecture, son design et ses conventions. Avant toute modification, lis
`README.md`, `docs/ARCHITECTURE.md`, `src/types.ts`, `src/data/store.ts`, `src/app/org.tsx`,
`src/app/auth.tsx`, `firestore.rules`, `server.ts` et `server/*`.

Ce qui existe déjà (à préserver) :

- **Front** : React 19, Vite 6, TypeScript, Tailwind 4, React Router 7 ; interface FR/EN
  (dictionnaires `src/i18n/*`, parité FR/EN obligatoire) ; kit d'interface `src/ui` ;
  charte graphique paramétrable et marque blanche (`src/lib/brand.ts`).
- **Données** : abstraction `DataStore` (`src/data/store.ts`) avec deux implémentations :
  Firestore (production) et stockage local du navigateur (mode démo sans Firebase).
  Chemins multi-tenant : `orgs/{orgId}/{collection}/{id}`, `users/{uid}`,
  `public_lists/{publicId}`, `public_offers/{publicId}`.
- **Modules** : cave & stock (mouvements immuables via `buildMovementOps`), inventaire,
  carte des vins (charte, QR, page publique, vins au verre, suggestions, 7 langues),
  service & vins au verre, achats (factures lues par IA), négoce (devis, factures,
  avoirs, règlements, relances, offres clients, dépôt-vente), comptabilité & douane
  (aides à la préparation), pilotage, photos des vins, scan code-barres, PWA.
- **Serveur** : Express (`server.ts`) qui sert Vite en dev et `dist` en production, et
  expose les routes IA `/api/ai/*` (sommelier, fiche technique, lecture de facture,
  lecture d'étiquette, traduction) avec Gemini côté serveur (`server/gemini.ts`).
- **Rôles** : owner, manager, sommelier, accountant, staff (`src/registry.ts`,
  `firestore.rules`).
- **Données de démo** : `src/data/demo.ts` (`buildDemoOps`) génère un jeu fictif riche par
  profil ; `src/modules/service/demo.ts` et `src/modules/negoce/offers/demo.ts` complètent.

### 2. Objectif

Rendre l'application **prête pour des démonstrations clients sur Firebase réel**, pour les
quatre typologies de prospects, avec : authentification, cloisonnement strict des données
par organisation, IA opérationnelle, données de démo réalistes et réinitialisables, et un
moyen simple pour l'équipe commerciale de créer une démo personnalisée pour un prospect.

### 3. Règles de travail

- Garde le mode démo local (sans Firebase) fonctionnel : c'est le filet de sécurité.
- Toute logique sensible (numérotation, stock, quotas IA, création d'organisations de
  démo, réinitialisation) s'exécute **côté serveur** (routes Express ou Cloud Functions),
  jamais uniquement dans le navigateur.
- Aucun secret dans le code ou dans le dépôt. La clé Gemini reste côté serveur.
- Données de démo **100 % fictives** (personnes, clients, e-mails en `.example`).
- Ne casse aucun test : `npm run lint` et `npm test` doivent passer ; ajoute des tests pour
  chaque nouvelle logique (règles Firestore via l'émulateur, fonctions serveur).
- Respecte le design existant (palette ivoire / bordeaux, titrage Cormorant, sobriété) et
  les textes FR + EN pour tout nouvel écran.
- **Hors périmètre** (ne pas faire) : intégrations caisse et logiciels comptables,
  facturation de l'abonnement et paiements, facturation électronique.

### 4. Travaux à réaliser

#### 4.1 Firebase réel et authentification

1. Branche Firebase Authentication : Google et e-mail / mot de passe (déjà prévus dans
   `src/app/auth.tsx`), réinitialisation du mot de passe, vérification de l'e-mail.
2. Active la **double authentification (TOTP)** si Identity Platform est disponible sur le
   projet ; sinon, documente précisément l'étape manuelle à faire dans la console.
3. Remplace la saisie manuelle d'identifiant d'organisation par des **invitations par
   lien** : le propriétaire invite un e-mail avec un rôle ; l'invité reçoit un lien
   (e-mail via l'extension Firebase « Trigger Email » si elle est configurée, sinon lien
   copiable), se connecte, et rejoint l'organisation avec le rôle prévu. Expiration à 7 jours.
4. Corrige le texte de l'écran de connexion selon que Firebase est configuré ou non.

#### 4.2 Cloisonnement et sécurité des données

1. Déploie `firestore.rules` et **teste-les avec l'émulateur Firestore** (`@firebase/rules-unit-testing`) :
   - un membre d'une organisation ne lit ni n'écrit jamais une autre organisation ;
   - chaque rôle n'accède qu'à ce que `src/registry.ts` lui ouvre (ex. staff : pas de
     données financières ; accountant : pas d'écriture sur les cartes) ;
   - les mouvements de stock sont immuables ;
   - `public_lists` et `public_offers` ne contiennent ni prix d'achat ni stock et ne sont
     lisibles que par identifiant (pas de listing).
2. Ajoute un **rôle plateforme** « admin Loul's & Thos » (custom claim `platformAdmin`)
   distinct des rôles d'organisation, pour l'équipe commerciale et le support.
3. Migre les photos des vins (`orgs/{orgId}/wineImages/{wineId}`, data URL) vers
   **Cloud Storage** (`orgs/{orgId}/wines/{wineId}.webp`) avec règles Storage équivalentes ;
   garde le champ `hasImage` et adapte `src/components/WinePhoto.tsx`.

#### 4.3 Fiabilité transactionnelle

1. **Numérotation des devis, factures, avoirs et offres** : utilise une transaction
   Firestore (`runTransaction`) sur `orgs/{orgId}/counters/{clé}` pour garantir une suite
   continue, sans doublon ni trou, même avec plusieurs utilisateurs simultanés
   (voir `src/modules/negoce/ops.ts` et `DocumentEditor.tsx`).
2. **Stock** : les écritures « mouvement + incrément du niveau de stock » doivent être
   atomiques ; refuse côté serveur ou par transaction une sortie qui rendrait le stock
   négatif.
3. **Republication des cartes publiques** : déplace la logique de `src/modules/carte/autoPublish.ts`
   côté serveur (Cloud Function sur écriture de `wines`, `stock`, `wineLists` et du document
   d'organisation), pour qu'une carte publiée reste à jour même si personne n'a
   l'application ouverte. Garde l'empreinte `hashPublicDoc` pour éviter les écritures inutiles.
4. Supprime le découpage non atomique des lots de plus de 450 écritures dans
   `src/data/store.ts` pour les opérations métier (garde-le seulement pour les imports
   et la génération de démo).

#### 4.4 IA (Gemini)

1. Vérifie et configure le modèle via `GEMINI_MODEL` (un modèle Flash actuellement
   disponible ; la liste de repli est dans `server/gemini.ts` — mets-la à jour avec des
   noms de modèles existants).
2. Teste réellement chaque route : `/api/ai/sommelier`, `/api/ai/tech-sheet`,
   `/api/ai/parse-invoice`, `/api/ai/label`, `/api/ai/translate`. Conserve les schémas
   de réponse stricts, la règle « ne rien inventer » et la protection contre les
   instructions cachées dans les données.
3. Remplace le quota par adresse IP (`server/auth.ts`) par un **quota par organisation**
   stocké côté serveur (ex. `orgs/{orgId}/usage/{AAAAMM}`), avec des limites par type de
   compte (démo, client) et un message clair quand la limite est atteinte. La page publique
   d'une carte garde un quota anonyme par carte.
4. Journalise l'usage (nombre d'appels, modèle, durée, succès/échec) sans jamais stocker le
   contenu des demandes.

#### 4.5 Démos par typologie de prospect

1. Crée quatre **modèles de démo** à partir de `buildDemoOps` (+ `buildServiceDemoOps`,
   `buildOffersDemoOps`) :
   - **Maison de négoce** (« Maison Bertrand & Fils », Beaune) : catalogue large, devis,
     factures, relances, offres clients publiées, achats, comptabilité, pilotage sur
     12 mois.
   - **Négociant indépendant sans boutique** (« Cave Itinérante — Claire Martin ») : mobile
     d'abord, devis rapides, dépôt-vente, offres envoyées par lien.
   - **Palace / hôtel-restaurant** (« Le Grand Palais ») : charte palace et marque blanche
     activées, carte des vins publiée en FR/EN/IT avec QR, vins au verre et bouteilles
     ouvertes, mode service, photos sur une dizaine de vins.
   - **Groupe / chaîne** (« Groupe Riviera Hôtels ») : trois établissements, transferts
     entre sites, consolidation, une carte par établissement.
2. Crée pour chaque modèle des **comptes de démonstration** (un par rôle utile : propriétaire,
   sommelier, comptable, équipe en salle) afin de montrer la segmentation des droits.
3. **Générateur de démo prospect** (réservé au rôle plateforme) : formulaire « nom du
   prospect, typologie, logo, couleurs, e-mail du prospect, durée » → crée une organisation
   cloisonnée à partir du modèle, applique logo et charte (marque blanche), invite le
   prospect avec le rôle propriétaire, et fixe une date d'expiration.
4. **Réinitialisation** : bouton « Réinitialiser la démo » (admin plateforme et propriétaire
   d'une démo) et tâche planifiée nocturne qui restaure les organisations de démo, avec
   dates recalculées pour que l'historique reste « récent ».
5. **Expiration** : une démo expirée passe en lecture seule puis est supprimée après 30 jours,
   avec avertissement préalable au prospect.
6. Bandeau discret « Démo — données fictives » dans les organisations de démo.

#### 4.6 Console plateforme (admin Loul's & Thos)

Écran réservé au rôle plateforme : liste des organisations (type, démo ou client, création,
expiration, dernière activité, utilisateurs, consommation IA du mois), actions
« ouvrir en lecture seule », « réinitialiser », « prolonger », « supprimer » (avec
confirmation). Aucun accès en écriture aux données d'un client hors de ces actions.

#### 4.7 Exploitation

1. Sauvegardes : export planifié de Firestore (ou procédure documentée).
2. Journal d'activité par organisation (connexions, invitations, changements de rôle,
   publications de carte, suppression de données).
3. Page « Mes données » : export complet (JSON/CSV) et demande de suppression de
   l'organisation (RGPD).
4. Hébergement des polices : héberge localement les polices de la charte
   (`src/lib/brand.ts`) au lieu de Google Fonts, pour éviter de transmettre l'adresse IP des
   visiteurs des cartes publiques.
5. Mets à jour `README.md` et `docs/ARCHITECTURE.md`.

### 5. Livrables attendus

- Code et tests à jour, `npm run lint` et `npm test` au vert, tests des règles Firestore.
- Règles Firestore et Storage déployables, index Firestore nécessaires.
- Fonctions serveur (republication, numérotation, quotas, démos, réinitialisation, expiration).
- Un document `docs/DEMO.md` : comptes de démo, scénario de présentation de 15 minutes par
  typologie, comment créer une démo prospect, comment la réinitialiser.
- Liste explicite de ce qui reste à faire ou à configurer manuellement dans la console Firebase.

### 6. Recette (à vérifier avant de considérer le travail terminé)

- [ ] Deux comptes de deux organisations différentes ne voient jamais les données l'un de l'autre (test émulateur + test manuel).
- [ ] Un compte « staff » ne voit aucun montant financier ; un compte « accountant » ne peut pas modifier une carte.
- [ ] Deux utilisateurs créant une facture au même instant obtiennent deux numéros consécutifs distincts.
- [ ] Une sortie de stock supérieure au stock disponible est refusée.
- [ ] Modifier le prix d'un vin met à jour la carte publique en moins d'une minute, application fermée.
- [ ] Les cinq routes IA répondent avec la vraie clé ; le quota par organisation s'applique.
- [ ] Les quatre démos se créent, se personnalisent (logo, couleurs) et se réinitialisent.
- [ ] Le QR code de la carte du « Grand Palais » s'ouvre sur un téléphone, sans connexion, en FR/EN/IT.
- [ ] Une offre client publiée s'ouvre par son lien public, sans prix d'achat ni stock.
- [ ] L'application s'installe sur mobile (PWA) et l'écran de démarrage s'affiche hors ligne.
- [ ] Aucune erreur dans la console du navigateur sur les parcours de démo.
