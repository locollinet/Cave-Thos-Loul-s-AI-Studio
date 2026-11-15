# Audit Phase 0 — Cepia (`Cave-Thos-Loul-s-AI-Studio`)

> **Date** : 15 novembre 2026  
> **Périmètre** : Audit complet du code (`src/`, `server/`, `firestore.rules`, `storage.rules`, `tests/`) selon le brief d'évolution [`docs/EVOLUTION_BRIEF.md`](./EVOLUTION_BRIEF.md) et préparation du rendez-vous commercial **Château de La Commaraine** (Pommard — Hôtel 5★, deux restaurants, cuverie/caveau).  
> **Règle Phase 0 respectée** : Aucune modification de code applicatif n'a été effectuée. Ce document sert de point d'arrêt pour validation humaine avant le lancement du Lot 0.

---

## 1. Constats A1 à A16

| Réf. | Statut | Preuve (`fichier:ligne`) | Analyse technique détaillée |
| :--- | :--- | :--- | :--- |
| **A1** | **Confirmé** | `firestore.rules:110-112`<br>`src/app/Layout.tsx:61`<br>`src/pages/Settings.tsx:207` | Dans `firestore.rules`, `match /orgs/{orgId}` autorise `update` à `isAdmin(orgId) \|\| isPlatformAdmin()` (`owner` et `manager`) en vérifiant uniquement que `ownerUid` et `id` sont inchangés. Un client authentifié `owner` ou `manager` peut donc modifier librement `modules`, `profile`, `isDemo` et `expiresAt`. Côté UI, `canManageModules = can('manager') \|\| !!user?.demo` affiche également les interrupteurs de modules en production pour `owner` et `manager`. |
| **A2** | **Confirmé** *(contrainte d'échelle Firestore)* | `firestore.rules:200-205` | `isBackOffice(orgId)` (`owner`, `manager`, `sommelier`, `accountant`) peut créer/modifier `stock/{id}` tant que `stockShape()` est valide (`qty >= 0`). Seul le rôle `staff` est contraint par `binsOnly() \|\| emptyLevel() \|\| pairedWithMovement(orgId)`. Comme noté au Lot 0.2 du brief, cette distinction est imposée par la limite Firestore de 20 appels `get()/getAfter()` par transaction/batch lors des réceptions de factures, inventaires ou imports CSV. |
| **A3** | **Confirmé** | `firestore.rules:251-258`<br>`src/pages/wines/WineDrawer.tsx:177` | `match /racks/{id}` et `match /bottles/{id}` utilisent `allow write: if isMember(orgId) && validId(id)`. `write` couvrant `create, update, delete`, un `staff` peut supprimer tous les casiers ou créer/supprimer des flacons numérotés (`RareBottle`). De plus, dans `WineDrawer.tsx:177`, le bouton « Nouveau flacon » est affiché à tous les rôles sans filtre `can('sommelier')`. |
| **A4** | **Nuancé** *(protégé côté UI, ouvert dans `firestore.rules`)* | `firestore.rules:124-125`<br>`src/pages/Settings.tsx:423-428` | Côté UI (`Settings.tsx:423-428`), l'application bloque déjà la rétrogradation ou la suppression du dernier `owner` (`owners <= 1`). En revanche, dans `firestore.rules:124-125`, `allow update: if hasRole(orgId, ['owner'])` et `allow delete: if hasRole(orgId, ['owner']) \|\| (signedIn() && uid == request.auth.uid)` permettent à `org.ownerUid` de rétrograder son propre rôle ou de supprimer son document `members/{ownerUid}` via le SDK client. |
| **A5** | **Nuancé** *(selon la sous-collection)* | `firestore.rules:229-249`<br>`src/pages/Contacts.tsx:34`<br>`src/pages/Inventory.tsx:269` | • `openBottles` (`firestore.rules:246-249`) : écriture par `staff` **voulue** (ouverture et service au verre en salle).<br>• `inventories` (`firestore.rules:229-232`) : l'UI (`Inventory.tsx:269`) masque le bouton « Valider l'inventaire » aux `staff` (`can('sommelier')`), mais `firestore.rules` autorise `staff` à modifier `status: 'closed'` ou à écraser un inventaire.<br>• `partners` (`firestore.rules:233-238` & `Contacts.tsx:34`) : **non voulu** — `firestore.rules` autorise `create, update` à tout membre et `Contacts.tsx:34` utilise `can('staff')`, permettant à un serveur/commis de créer ou modifier des fiches fournisseurs/clients. |
| **A6** | **Nuancé** *(1re partie infirmée grâce à `mergePrivate`, 2e partie confirmée)* | `src/data/store.ts:62-65, 103-111, 317-341`<br>`src/data/stock.ts:138-151` | • **Achat HT (`buyHT`) — Infirmé** : `w.buyPriceHT` n'est **pas** `undefined` pour les rôles back-office. `subscribeCollection('orgs/{orgId}/wines')` dans `store.ts:317-341` souscrit automatiquement en parallèle à `orgs/{orgId}/wineCosts` et fusionne (`mergePrivate`) `buyPriceHT` et `coefficient` dans les objets `Wine` en mémoire.<br>• **Vente HT (`sellHT`) — Confirmé** : `stockValue()` (`stock.ts:138-151`) calcule uniquement `n * (w.sellPriceHT ?? 0)`. Sur un profil restaurant/hôtel où seul `menuPriceTTC` est renseigné (ou lorsque `sellPriceHT` contient un tarif B2B par défaut), la valorisation « Valeur vente HT » est soit à `0 €`, soit décorrélée du prix carte (`menuPriceTTC / (1 + vatRate/100)`). |
| **A7** | **Confirmé** | `src/data/stock.ts:155-162`<br>`src/pages/Stock.tsx:80-81` | `wineAlerts(w, qty, year)` ne lit que `w.alertThreshold` (unique par vin). Pis : dans `Stock.tsx:80`, lorsque l'utilisateur filtre sur un site précis (ex. *Bistrot*), `total` vaut le stock de ce seul site mais est comparé au seuil global `w.alertThreshold` de l'établissement. |
| **A8** | **Confirmé** *(Bug critique en démo multi-org)* | `src/app/org.tsx:173-177`<br>`src/pages/Stock.tsx:71` | `activeSiteId` est lu dans `localStorage.getItem('lt-active-site')` sans clé `orgId` et n'est pas réinitialisé lors d'un `switchOrg`. Si l'utilisateur sélectionne un site dans l'organisation A puis bascule sur l'organisation B, `activeSiteId` conserve l'ID du site de A (introuvable dans `B.sites`), ce qui rend `visibleSites` vide (`[]`) dans `Stock.tsx:71` et affiche **0 bouteille partout** jusqu'au changement manuel du sélecteur de site. |
| **A9** | **Infirmé sur 10 routes / Confirmé sur `/contacts`** | `src/App.tsx:38-65` | Un composant `<Guard id="...">` existe **déjà** dans `src/App.tsx:38-65` et protège `/vins`, `/stock`, `/inventaire`, `/carte/*`, `/service/*`, `/achats/*`, `/negoce/*`, `/compta/*`, `/pilotage/*` et `/reglages`. Deux lacunes subsistent toutefois :<br>1. `/contacts` (`App.tsx:55`) n'a aucun `<Guard>` (accessible par URL directe même pour `staff`).<br>2. `<Guard>` redirige silencieusement vers `/` sans message explicatif lorsque le module est désactivé. |
| **A10** | **Confirmé** | `src/modules/carte/AiPanel.tsx:21`<br>`server/aiInput.ts:48` | `const flat = sections.flatMap((s) => s.items).slice(0, 150);` tronque la carte aux 150 premiers vins dans l'ordre des sections. Sur une carte de 400 références (cas de La Commaraine), les dernières sections (souvent les grands rouges ou liquoreux) sont totalement invisibles pour le sommelier IA client. |
| **A11** | **Confirmé** | `server.ts:35`<br>`server/pos.ts:24` | `app.use('/api/pos', posRouter)` est monté sans le middleware `requireUser` (contrairement à `/api/ai` ligne 31). Sans impact de sécurité immédiat car l'endpoint renvoie uniquement `400` ou `501` sans effet de bord, mais `requireUser` doit être ajouté avant toute évolution. |
| **A12** | **Confirmé** | `package.json`<br>`server/auth.ts:105-124` | `firebase-admin` n'est pas installé. `verifyIdToken()` vérifie les JWT Firebase localement via `node:crypto` (`RSA-SHA256`) et les clés publiques Google JWKS mises en cache. Choix léger et rapide adapté à Cloud Run (ne vérifie pas la révocation immédiate du token, ce qui reste acceptable pour le rate-limiting IA par `uid`). |
| **A13** | **Confirmé** | `firestore.rules:188-199`<br>`src/data/stock.ts:93-109` | `buildMovementOps()` regroupe plusieurs mouvements touchant le même couple `(wineId, siteId)` en un seul `StockLevel` avec `mv: [id1, id2, ...]`. Or `pairedWithMovement()` dans `firestore.rules:191` exige `d.mv.size() == 1`. Si un `staff` soumet un lot contenant deux mouvements sur le même vin et le même site, Firestore rejette le batch. |
| **A14** | **Confirmé** *(et amplifié par `wineCosts` + `movements` sans limite)* | `src/app/org.tsx:154-159`<br>`src/data/store.ts:317-335`<br>`src/pages/dashboard/CellarDashboard.tsx:105` | `OrgProvider` ouvre 6 listeners de collections (`sites`, `wines`, `producers`, `partners`, `stock`, `members`) + un **7e listener caché** sur `wineCosts` (déclenché automatiquement par `PRIVATE_FIELDS.wines` dans `store.ts:317`). De plus, `CellarDashboard.tsx:105`, `NegoceDashboard.tsx:58` et `ChainDashboard.tsx:52` appellent `useCollection<Movement>('movements')` **sans `limit`** (contrairement à `Stock.tsx:31` qui passe `limit: 500`). |
| **A15** | **Nuancé** *(Routes déjà en `React.lazy`, mais imports statiques dans `App.tsx`)* | `src/App.tsx:1-31`<br>`src/modules/carte/PublicList.tsx:4` | `PublicList` est déjà chargé via `lazy(() => import('@/modules/carte/PublicList'))` en dehors de `<Gate />`. Un visiteur QR ne télécharge donc ni Three.js, ni Recharts, ni SheetJS (`xlsx`), ni les pages back-office. En revanche, `App.tsx` importe statiquement `AuthProvider`, `OrgProvider`, `Layout` (qui lui-même importe `ModuleSwitcherModal` et toutes les données de démo `demoSetup.ts` !) ainsi que `I18nProvider` (tous les dictionnaires). |
| **A16** | **Confirmé** *(Cache IndexedDB actif, mais promesse `writeBatch.commit()` bloquante hors-ligne)* | `src/data/firebase.ts:37-44`<br>`src/data/store.ts:288`<br>`src/modules/service/useServiceActions.ts:47` | `persistentLocalCache({ tabManager: persistentMultipleTabManager() })` est **déjà activé** dans `firebase.ts:37-44`. Toutefois, dans Firebase JS SDK, la promesse `writeBatch(db).commit()` ne se résout qu'à réception de l'accusé serveur. En cave voûtée hors-ligne, `commit(ops).then(onDone)` dans `useServiceActions.ts:47` laisse le bouton en attente et n'affiche pas le toast « Bouteille sortie — Annuler » tant que le Wi-Fi n'est pas revenu. |

---

## 2. Mesures

*(Note d'environnement : le binaire `node`/`npm` n'étant pas installé dans le `PATH` local du poste macOS — le build et le déploiement s'exécutant sur Google AI Studio / Cloud Run — les métriques ci-dessous sont établies par analyse statique exacte du graphe d'imports et des schémas Firestore).*

### 2.1 Graphe des chunks & points d'alourdissement du bundle
- **Routes découpées (`React.lazy` dans `src/App.tsx:13-30`)** : `Dashboard`, `Wines`, `Stock`, `Inventory`, `Contacts`, `Settings`, `PlatformAdmin`, `Carte`, `Service`, `Achats`, `Negoce`, `Compta`, `Pilotage`, `PublicList`.
- **Dépendances lourdes bien isolées** :
  - `three` (~600 ko min) : isolé dans `src/components/cellar/CellarScene3D.tsx`, chargé via `React.lazy` depuis `CellarMap.tsx:10` uniquement au clic sur « Immersion 3D ».
  - `@zxing/library` (~350 ko min) : chargé par `await import('@zxing/library')` dans `src/components/Scanner.tsx:39` uniquement à l'ouverture de la caméra et seulement si l'API native `BarcodeDetector` est absente.
- **2 fuites de bundle identifiées dans les chunks principaux** :
  1. **`src/data/demoSetup.ts` + `src/data/demo/*` (~120 ko de fixtures JSON/TS)** sont importés **statiquement** par `src/components/ModuleSwitcherModal.tsx:22`, lui-même importé statiquement par `src/app/Layout.tsx:11` (chargé dès `App.tsx:5`, y compris sur `/c/:orgId/:listId` !).
  2. **`xlsx` (SheetJS, ~450 ko min)** est chargé dynamiquement dans `src/modules/achats/NewInvoice.tsx:19`, mais est importé **statiquement** (`import * as XLSX from 'xlsx'`) dans `src/pages/wines/ImportWines.tsx:3`, ce qui alourdit systématiquement le chunk de la page `/vins`.

### 2.2 Lectures Firestore à l'ouverture de session (`useOrg` + `Dashboard`)

| Collection écoutée | Source du listener | Volume pour **300 vins / 2 sites** | Volume pour **1 500 vins / 3 sites** |
| :--- | :--- | :--- | :--- |
| `users/{uid}` + `orgs/{orgId}` | `org.tsx:115, 153` | 2 docs | 2 docs |
| `orgs/{orgId}/sites` | `org.tsx:154` | 2 docs | 3 docs |
| `orgs/{orgId}/wines` | `org.tsx:155` | 300 docs | 1 500 docs |
| `orgs/{orgId}/wineCosts` *(listener parallèle)* | `store.ts:317` | 300 docs *(0 pour `staff`)* | 1 500 docs *(0 pour `staff`)* |
| `orgs/{orgId}/stock` | `org.tsx:158` | ~450 docs | ~3 000 docs |
| `orgs/{orgId}/producers` | `org.tsx:156` | ~60 docs | ~250 docs |
| `orgs/{orgId}/partners` | `org.tsx:157` | ~30 docs | ~80 docs |
| `orgs/{orgId}/members` | `org.tsx:159` | ~8 docs | ~20 docs |
| **Sous-total `OrgProvider` (toutes pages)** | | **~1 152 lectures** | **~6 355 lectures** |
| `orgs/{orgId}/movements` *(sans `limit` sur Dashboard !)* | `CellarDashboard.tsx:105` | 500 à 5 000+ docs | 5 000 à 25 000+ docs |
| `orgs/{orgId}/wineLists` + `openBottles` | `CellarDashboard.tsx:106-107` | ~15 docs | ~30 docs |

> **Constat majeur** : L'absence de `{ orderBy: ['createdAt', 'desc'], limit: 500 }` sur `useCollection<Movement>('movements')` dans `CellarDashboard.tsx:105`, `NegoceDashboard.tsx:58` et `ChainDashboard.tsx:52` est le premier facteur de coût et de ralentissement après quelques mois d'exploitation.

### 2.3 Couverture de tests existante (Q10)
Le projet dispose déjà de **24 fichiers de tests** dans `tests/` :
- Sécurité Firestore : `tests/rules/firestore.rules.ts` (309 lignes, couvrant rôles, `wineCosts`, `stock`, `pairedWithMovement`, `wineLists` publiques, `orgInvites`).
- Métier & calculs : `stock.test.ts`, `service.test.ts`, `carte.test.ts`, `carteSmart.test.ts`, `achats.test.ts`, `einvoice.test.ts`, `negoce.test.ts`, `compta.test.ts`, `pilotage.test.ts`, `cellar.test.ts`, `pos.test.ts`, `dashboard.test.ts`, `importWines.test.ts`, `wine.test.ts`.
- Tech & UX : `serverAuth.test.ts`, `aiInput.test.ts`, `scan.test.ts`, `pwa.test.ts`, `ux.test.ts`, `orgSwitch.test.ts`, `demo.test.ts`.

---

## 3. Audit UX Statique

### 3.1 Parcours critiques (§1.5 du brief) — Comptage des interactions

| Parcours | Cible Brief | Actuel dans le code | Détail du parcours actuel |
| :--- | :---: | :---: | :--- |
| **1. Sortir 1 bouteille en service** (`/service`) | **≤ 3 taps** | **2 taps** ✅ | 1. Recherche ou filtre couleur/site dans `ServiceTab.tsx` → 2. Tap sur **« Sortir 1 bouteille »** (`onTake`). Toast avec bouton **« Annuler »** pendant 7 s (`useServiceActions.ts:52`). |
| **2. Ouvrir une bouteille au verre / servir 1 verre** | **≤ 3 taps** | **1 à 2 taps** ✅ | Onglet « Service au verre » (`GlassTab.tsx`) : **1 tap** sur **« + 1 verre »** pour une bouteille ouverte ; **1 tap** sur **« Ouvrir »** (ou **2 taps** avec switch Coravin) pour ouvrir une référence au verre. |
| **3. Chercher un vin et voir ses emplacements par site** | **≤ 2 actions** | **2 actions** ✅ | Dans `/vins` (`Wines.tsx`) ou `/stock` (`Stock.tsx`) : 1. Saisie dans la barre de recherche → 2. Clic sur la ligne pour ouvrir `WineDrawer.tsx` (affiche le détail par site, les casiers `bins` et les flacons numérotés). |
| **4. Réceptionner une facture PDF de 10 lignes** | **≤ 2 min** | **~1 min 30** ✅ | `/achats` → Glisser-déposer PDF/XML Factur-X (`NewInvoice.tsx`) → Extraction Gemini Flash ou parseur XML déterministe → `Review.tsx` pré-associe les vins (`canonicalKey`) → 1 clic sur « Réceptionner et entrer en stock ». |
| **5. Réconcilier un rapport Z de caisse** | **≤ 2 min** | **~1 min** ✅ | `/service` → Bouton « Rapport Z (caisse) » → Import CSV (`PosReconciliationModal.tsx`) → Appariement automatique par nom/millésime → 1 clic sur « Déduire N bouteille(s) ». |
| **6. Consulter la carte publique via QR code** | **< 2 s** | **~1,5 s** ✅ | `/c/:orgId/:listId` (`PublicList.tsx`) : lecture directe du document `wineLists/{listId}`, sélecteur de langue (8 langues), filtres couleur/région/verre/prix, et panneau Sommelier IA. |

### 3.2 Navigation par rôle (`staff` vs `sommelier` vs `owner`)
- Actuellement dans `src/registry.ts:32-46`, un utilisateur `staff` sur un profil `restaurant` voit **6 entrées** dans la barre latérale :
  1. `Tableau de bord` (`/`) — affiche `StaffDashboard.tsx` (épuré et adapté).
  2. `Catalogue des vins` (`/vins`) — lecture seule (boutons d'édition masqués par `canEdit = can('sommelier')`), **sauf** dans `WineDrawer.tsx:177` où le bouton « Nouveau flacon » reste visible pour `staff` !
  3. `Stock & caves` (`/stock`) — permet de sortir/transférer et de voir le plan de cave.
  4. `Inventaire` (`/inventaire`) — comptage terrain.
  5. `Service & au verre` (`/service`) — cœur du métier salle.
  6. `Clients & fournisseurs` (`/contacts`) — **anomalie** : aucun champ `roles` n'est défini sur le module `contacts` dans `src/registry.ts:36`, et `Contacts.tsx:34` utilise `can('staff')`, donnant accès au carnet fournisseurs/clients aux serveurs.

### 3.3 Incohérences visuelles & accessibilité
- **Doublon d'interface sur le plan de cave (`Stock.tsx:228-260`)** : L'onglet « Plan de cave » propose un sélecteur entre `Vue simplifiée (Grille)` (`CellarPlan.tsx`) et `Vue 2D / 3D Réaliste` (`CellarMap.tsx`), alors que `CellarMap.tsx` contient lui-même son propre sélecteur `Casiers 2D` (`CellarRack2D.tsx`) vs `Immersion 3D` (`CellarScene3D.tsx`). Il y a donc deux grilles 2D concurrentes.
- **Contraste et lisibilité en cave sombre** : La palette chaude crème (`#FAF7F2`) est très élégante en salle/bureau, mais le mode Service (`/service`) mérite de conserver des boutons d'action à fort contraste et une hauteur minimale de `44px` sur tous les contrôles secondaires (notamment le toggle Coravin dans `GlassTab.tsx:161-168`).

---

## 4. Risques Classés P0 à P3

### 🔴 P0 — Bloquants (Sécurité Firestore ou Bug critique de démo)
1. **Bug A8 (`lt-active-site` non scopé par `orgId` dans `src/app/org.tsx:173`)** : Lorsqu'on change d'organisation (ex. passage d'une démo Négoce à une démo Restaurant/Hôtel pendant le call La Commaraine), `activeSiteId` garde l'ID du site précédent et affiche **0 bouteille en stock** sur `/stock`.
2. **Faille A1 (`firestore.rules:110-112` & `Layout.tsx:61`)** : Un `owner` ou `manager` d'une organisation de production peut activer lui-même tous les modules payants (`modules`), changer son `profile` ou modifier `isDemo` / `expiresAt` dans Firestore.
3. **Faille A3/A4/A5 (`firestore.rules:124, 229-258`)** : Un rôle `staff` peut supprimer des casiers (`racks`), manipuler des flacons numérotés (`bottles`), créer/modifier des partenaires (`partners`) et clôturer un inventaire (`inventories`), et le dernier `owner` peut se supprimer/rétrograder via les règles Firestore.
4. **Comportement hors-ligne du bouton « Sortir 1 bouteille » (A16 — `src/data/store.ts:288`)** : `await batch.commit()` ne résout sa promesse qu'au retour du réseau. Si on coupe le Wi-Fi en démo pour prouver le mode cave voûtée, l'interface ne confirme pas la sortie immédiatement.

### 🟠 P1 — Majeurs (Exactitude métier pour un Hôtel-Restaurant 5★ comme La Commaraine)
5. **Valorisation du stock vente HT en profil restaurant (A6 — `src/data/stock.ts:138-151`)** : `stockValue()` ignore `menuPriceTTC` lorsque `sellPriceHT` est absent, faussant le KPI de valeur de vente et de marge potentielle.
6. **Listener `movements` sans limite sur les Dashboards (A14 — `CellarDashboard.tsx:105`)** : Risque de facturation Firestore élevée et de ralentissement à l'ouverture du tableau de bord.
7. **Troncature aveugle à 150 vins du Sommelier IA (A10 — `AiPanel.tsx:21`)** : Sur une carte gastronomique de 400+ vins, les sections situées après le 150e vin sont ignorées par l'IA.
8. **Accès de `staff` à `/contacts` et au bouton « Nouveau flacon » (`registry.ts:36`, `WineDrawer.tsx:177`)** : Pollue l'interface de l'équipe de salle et expose le fichier fournisseurs.

### 🟡 P2 — Importants (Évolutions fonctionnelles à forte valeur commerciale)
9. **Seuils d'alerte et disponibilité au verre globaux au lieu de par site (A7 / Lot 4)** : Utile pour distinguer les règles de la *Cave de garde*, du *Bistrot* et du *Restaurant gastronomique*.
10. **Mise à jour du prix d'achat au dernier prix facturé au lieu du CMP (Lot 6.2 — `receive.ts:143`)** : Lors d'une réception de facture dans `receive.ts:143`, `buyPriceHT` est écrasé par le dernier prix unitaire HT au lieu d'être lissé en Coût Moyen Pondéré (CMP).
11. **Consolidation des sorties par site dans le tableau de bord (Lot 3.1)** : Pouvoir filtrer les sorties et le chiffre/coût matière par point de vente (*Bistrot* vs *Gastronomique* vs *Caveau*) sur une période donnée.

### 🟢 P3 — Confort & Optimisation
12. **Fuite de `demoSetup.ts` dans `Layout.tsx` et de `xlsx` dans `ImportWines.tsx`** : Facile à corriger via `await import(...)` dynamique.
13. **Restriction de `batches` (lots douaniers) à `isBackOffice` dans `firestore.rules:261`** : Cohérence avec le module Négoce.
14. **Condition `d.mv.size() == 1` dans `pairedWithMovement` (A13 — `firestore.rules:191`)** : Assouplir ou documenter.

---

## 5. Améliorations Rapides (< 1/2 journée chacune — Idéales avant le call La Commaraine)

1. **Corriger le bug multi-org `lt-active-site` (A8)** dans `src/app/org.tsx:173` : scoper la clé `localStorage` par organisation (`lt-active-site:${orgId}`) et vérifier que `activeSiteId` appartient bien à `sites` (sinon retomber sur `all`). *(15 min)*
2. **Rendre le commit Firestore optimiste hors-ligne (A16)** dans `src/data/store.ts:288` : lorsque `navigator.onLine === false`, résoudre immédiatement après l'écriture dans le cache local IndexedDB sans bloquer l'UI sur l'accusé serveur, pour que le toast « Bouteille sortie — Annuler » fonctionne instantanément en cave voûtée sans réseau. *(30 min)*
3. **Protéger `/contacts` et « Nouveau flacon » pour `staff` (Lot 1.5)** : ajouter `roles: ['owner', 'manager', 'sommelier', 'accountant']` sur `contacts` dans `src/registry.ts:36`, ajouter `<Guard id="contacts">` dans `src/App.tsx:55`, et entourer le bouton « Nouveau flacon » de `can('sommelier')` dans `src/pages/wines/WineDrawer.tsx:177`. *(15 min)*
4. **Corriger `stockValue()` pour le profil restaurant (A6 / Lot 2)** dans `src/data/stock.ts:138-151` : utiliser `w.sellPriceHT ?? (w.menuPriceTTC ? w.menuPriceTTC / (1 + vatRate / 100) : 0)` afin d'afficher la vraie valeur carte HT et la marge théorique. *(30 min)*
5. **Ajouter `limit: 500` sur `movements` dans les 3 Dashboards (A14)** (`CellarDashboard.tsx:105`, `NegoceDashboard.tsx:58`, `ChainDashboard.tsx:52`). *(10 min)*
6. **Pré-filtrer intelligemment les 150 vins envoyés au Sommelier IA (A10 / Lot 5)** dans `src/modules/carte/AiPanel.tsx:21` : au lieu de `.slice(0, 150)` dans l'ordre des sections, scorer les vins par pertinence vis-à-vis de la question du client + équilibrer toutes les sections/couleurs pour couvrir une carte de 400+ références. *(45 min)*

---

## 6. Propositions de Simplification ou Suppression

1. **Ne PAS recréer un moteur de suggestions d'apogée/rotation séparé (Lot 3.2)** :
   - Le fichier `src/modules/carte/suggestions.ts` (`computeSuggestions`, 142 lignes, déjà testé dans `tests/carteSmart.test.ts`) calcule **déjà** les vins en fin d'apogée (`pastWindow`), dans leur fenêtre d'apogée (`window`), dormants depuis ≥ 90 jours (`dormant`), en stock critique (`lowStock`) et à forte marge (`margin`).
   - **Proposition** : Au lieu de dupliquer une logique concurrente dans `src/data/stock.ts`, extraire/partager la fonction pure d'apogée et de vélocité entre `src/data/stock.ts` (`maturityRisk`) et `src/modules/carte/suggestions.ts`, et afficher directement ce widget dans `CellarDashboard.tsx`.
2. **Unifier les deux vues 2D du plan de cave (`CellarPlan.tsx` vs `CellarRack2D.tsx`)** :
   - Dans `Stock.tsx:228-260`, l'utilisateur doit choisir entre « Vue simplifiée (Grille) » et « Vue 2D / 3D Réaliste », qui elle-même contient un switch « Casiers 2D » / « Immersion 3D ». Simplifier en un seul sélecteur à 3 modes clairs ou conserver uniquement la vue casiers 2D + 3D.
3. **Remplacer l'import statique de `demoSetup.ts` dans `ModuleSwitcherModal.tsx:22` et `PlatformAdmin.tsx:7` par un import dynamique** :
   - Économise ~120 ko dans le bundle initial chargé par toutes les pages.
4. **Remplacer l'import statique de `xlsx` dans `ImportWines.tsx:3` par `await import('xlsx')`** :
   - Aligne `ImportWines.tsx` sur `NewInvoice.tsx:19` et allège de ~450 ko le chunk `/vins`.

---

## 7. Ajustements Proposés au Brief (`docs/EVOLUTION_BRIEF.md`)

L'audit du code révèle que **plusieurs briques demandées dans le brief existent déjà en production** dans le dépôt :

1. **Lot 4 (`WineList.siteIds` et `priceOverrides`) — Déjà implémenté dans le module Carte !**
   - Le brief (§5 Lot 4) demande d'ajouter `siteIds?: string[]` sur `WineList` et de filtrer `build.ts` selon ces sites.
   - **Réalité du code** : `WineList.siteIds: string[]` et `WineList.priceOverrides: Record<string, number>` **existent déjà** dans `src/modules/carte/types.ts:27-32`, sont déjà utilisés par `qtyForSites(stock, list.siteIds)` dans `src/modules/carte/build.ts:56, 97, 158`, et sont déjà configurables dans l'UI (`SettingsPanel.tsx` du module Carte) !
   - **Ajustement proposé** : Pour La Commaraine, exclure la *Cave de garde* de la carte QR du Bistrot ou du Gastronomique fonctionne **déjà aujourd'hui sans écrire une ligne de code**. Le Lot 4 peut donc se concentrer uniquement sur les surcharges optionnelles par site sur `StockLevel` (`alertThreshold` par site, `byGlass` par site).
2. **Lot 1.3 (`<Guard>` de route par module) — Déjà présent dans `src/App.tsx:38-65` !**
   - `<Guard id="...">` enveloppe déjà toutes les routes sauf `/contacts`.
   - **Ajustement proposé** : Ajouter simplement `<Guard id="contacts">` sur `/contacts` et remplacer la redirection silencieuse par un bandeau/écran explicite si souhaité.
3. **Lot 2 (`w.buyPriceHT` soi-disant `undefined` pour le back-office) — Déjà résolu par `store.ts` !**
   - `src/data/store.ts:62-65, 317-341` fusionne déjà `orgs/{orgId}/wineCosts` dans `wines` via `mergePrivate()`. Il n'y a donc aucun bug de lecture de `buyPriceHT` pour `owner`, `manager`, `sommelier` et `accountant`. Le Lot 2 se résume à enrichir `stockValue()` avec `menuPriceTTC` et le détail par couleur/site.

---

## 8. Réponses aux Questions Ouvertes (Q7, Q9, Q10) & Arbitrage Humain

### Réponse à Q7 — Signification de `qty` pour `reason: 'verre'` dans `Movement`
- **Vérifié dans `src/modules/service/logic.ts:156` (`buildOpenBottleOps`)** : Lorsqu'on ouvre une bouteille pour le service au verre, le mouvement créé est `{ wine, siteId, type: 'out', qty: 1, reason: 'verre' }`.
- Lorsqu'on sert ensuite un verre (`buildServeOps`, ligne 190), seul le compteur `glassesServed` du document `openBottles/{id}` est incrémenté (aucun document `Movement` n'est créé).
- **Conclusion** : `m.qty` sur un mouvement `reason: 'verre'` exprime **1 bouteille entière sortie du stock** (exactement comme `vente`). Dans `maturityRisk()` (Lot 3.2), on peut donc additionner directement `m.qty` pour `['vente', 'verre', 'consommation', 'offert', 'degustation']` sans aucune conversion verre/bouteille.

### Réponse à Q9 — Usage et chargement de `three`
- **Vérifié dans `src/components/cellar/CellarMap.tsx:10` et `CellarScene3D.tsx`** : `three` est utilisé exclusivement pour la vue 3D WebGL d'un casier et est **déjà chargé en lazy-loading** (`React.lazy`). Il n'impacte ni le chargement initial, ni le mode Service, ni la carte QR publique.

### Réponse à Q10 — Couverture de tests & ESLint
- 24 fichiers de tests unitaires et de règles Firestore couvrent déjà le cœur métier (`tests/`).
- `npm run lint` exécute `tsc --noEmit`. L'ajout d'ESLint est optionnel (P3) et non prioritaire avant le rendez-vous commercial.

### Décisions attendues de Loul's avant lancement du Lot 0
1. **Plan d'action immédiat pré-call La Commaraine** : Souhaites-tu que j'exécute en priorité un **Pack Pré-Call Rapide** (Lot 0 Sécurité Firestore + Quick Wins A8 `lt-active-site`, A16 commit hors-ligne, Lot 1.5 masquage `/contacts` pour `staff`, Lot 2 valorisation carte HT, Lot 3.1/3.2 rotation & apogée, et Lot 5 Sommelier IA 400+ vins) ?
2. **Navigation `staff` (Lot 1.5)** : Pour le rôle `staff` (serveur/commis), confirme-t-on le retrait de `Clients & fournisseurs` (`/contacts`) tout en gardant `Tableau de bord`, `Service & au verre`, `Stock & caves`, `Catalogue des vins` (lecture seule) et `Inventaire` ?
3. **Synchronisation Notion & Google Drive** : Souhaites-tu que je crée dès maintenant la fiche prospect **Château de La Commaraine** dans la base Notion **🎯 Prospects, Clients & Calls** et que j'uploade ce brief + audit dans le dossier Drive partagé Cepia (`1REAWXTqmpYwNVwv8ex_bapqVirrV6YUH`) ?
