# Analyse & Cadrage Technique — Assistant IA Intégré (Lot 8)

> **Date** : 16/11/2026
> **Statut** : Phase A complétée et confrontée au code source
> **Périmètre** : `src/modules/assistant/*`, `server/aiAssistant.ts`, `server/gemini.ts`, `server/auth.ts`, `src/pages/Wines.tsx`, `src/pages/Stock.tsx`, `tests/assistant/*`

---

## 1. Confrontation au code existant (Preuves fichier par fichier)

| Point vérifié | Constat dans le dépôt | Preuve (Fichier & Symboles) |
|---|---|---|
| **Filtres et tri du catalogue** | **Confirmé.** Les filtres de vins, le groupement et le tri sont des fonctions pures réutilisables telles quelles. | `src/lib/wineFilters.ts` : `WineFilters`, `EMPTY_FILTERS`, `matchesWine()`, `sortWines()`, `buildWineSections()` |
| **Calculs de stock, alertes et maturité** | **Confirmé (et en avance sur le brief).** Non seulement `qtyAt`, `stockByWine`, `stockValue`, `stockValuation` et `wineAlerts` existent, mais `maturityRisk()` (prévu au Lot 3 dans le brief) est **déjà codé et testé**. | `src/data/stock.ts` : `qtyAt()`, `stockByWine()`, `stockValue()`, `stockValuation()`, `wineAlerts()`, `maturityRisk()`, `buildMovementOps()` |
| **Rapprochement et détection de doublons** | **Confirmé.** Le rapprochement flou par bigrammes (Dice) + clé canonique existe pour un candidat unitaire (`findMatches`) ainsi que par grappes sur tout le catalogue (`findDuplicateGroups`). | `src/lib/wine.ts` : `canonicalKey()`, `findMatches()`, `similarity()`, `parseFormatCl()`, `parseColor()`, `wineLabel()`<br>`src/pages/wines/Duplicates.tsx` : `findDuplicateGroups()` |
| **KPIs de pilotage, marges et rotation** | **Confirmé.** Les fonctions pures de calcul des ventes, marges, ABC, vins dormants et réassort sont isolées hors composants React. | `src/modules/pilotage/kpis.ts` : `buildSalesData()`, `computeKpis()`, `winePerformance()`, `rankWines()`, `abcAnalysis()`, `dormantWines()`, `bySite()`<br>`src/modules/pilotage/replenish.ts` : `suggestReplenishment()`, `latestSuppliers()` |
| **Source de vérité des droits (`NAV`)** | **Nuancé / Corrigé.** Le §14 du brief indiquait que `pilotage` était réservé à `owner`, `manager`, `accountant`. Dans le code actuel, `sommelier` y a aussi accès. Dériver automatiquement de `NAV` évite toute divergence. | `src/registry.ts` (ligne 50) : `id: 'pilotage'`, `module: 'pilotage'`, `roles: ['owner', 'manager', 'sommelier', 'accountant']`, helpers `hasRole()`, `atLeast()`, `isNavVisible()` |
| **Données chargées par `useOrg()` vs à la demande** | **Confirmé.** `OrgProvider` souscrit en temps réel à 6 collections (`sites`, `wines`, `producers`, `partners`, `stock`, `members`). Les collections `movements`, `purchaseInvoices`, `wineLists`, `openBottles`, `documents` ne sont pas dans `useOrg()` et doivent être lues à la demande via `store.subscribeCollection()`. | `src/app/org.tsx` (lignes 154–159) : `useStoreSub` sur `sites`, `wines`, `producers`, `partners`, `stock`, `members`.<br>`src/data/store.ts` : `PRIVATE_FIELDS` sépare `wineCosts` et `movementCosts` pour que `staff` (`canSeeCosts === false`) ne reçoive jamais les prix d'achat. |
| **Routeur et Palette de commandes (`⌘K`)** | **Confirmé.** `CommandPalette` vit dans `src/app/Layout.tsx` (état `palette`), filtre une liste de commandes `Cmd[]` et s'ouvre au clavier ou via la loupe. | `src/app/Layout.tsx` (lignes 94, 470, 488–787) : `CommandPalette` |
| **Appels Gemini & `getAiClient()`** | **À compléter.** `docs/ENVIRONMENTS.md` et `getAiClient()` n'existaient pas encore ; `server/gemini.ts` instancie directement `new GoogleGenAI({ apiKey })` et passe `temperature` (à retirer sur Gemini 3.x). | `server/gemini.ts` : `modelList()`, `generateJson()`<br>`server/ai.ts` : routes `/sommelier`, `/tech-sheet`, `/batch-tech-sheet`, `/parse-invoice` |
| **Quotas dans `requireUser`** | **Confirmé.** `requireUser` est monté sur `/api/ai` dans `server.ts` et décompte 1 hit par requête HTTP dans `take()`. Sans identifiant de question, une boucle de 4 tours consomme 4 unités de quota. | `server/auth.ts` : `QUOTAS`, `take()`, `requireUser()` |

---

## 2. Catalogue d'outils affiné (V1 + Étape 2)

| Outil | Module requis | Rôles autorisés (`registry.ts`) | `needsCosts` | Fonctions réutilisées | Entrées clés | Sortie & Fiches (`ResultCard[]`) |
|---|---|---|---|---|---|---|
| **`find_wines`** | `stock` | Tous (`owner`, `manager`, `sommelier`, `accountant`, `staff`) | `false` *(coûts purgés si `!canSeeCosts`)* | `matchesWine`, `sortWines`, `stockByWine`, `qtyAt`, `stockValuation`, `findMatches` | `query`, `region`, `subRegion`, `producer`, `color`, `vintage`, `formatCl`, `stockStatus`, `minQty`, `maxQty`, `minPrice`, `maxPrice`, `apogeeOnly`, `siteId`, `sortBy`, `limit` | Top 20 vins + totaux (`totalRefs`, `totalBottles`, `totalMenuTTC`, et `totalCostHT`/`totalSellHT` si `canSeeCosts`) + lien filtré `/vins?...` |
| **`stock_alerts`** | `stock` | Tous | `false` *(coûts purgés si `!canSeeCosts`)* | `wineAlerts`, `maturityRisk`, lecture `openBottles` | `kinds` (`out`, `low`, `apogee`, `past`, `maturity_risk`, `open_bottles`), `siteId`, `openDaysThreshold`, `limit` | Top 20 alertes triées par urgence + compteurs par catégorie + fiches d'alerte cliquables |
| **`rotation`** | `stock` | Tous | `false` *(coûts purgés si `!canSeeCosts`)* | `dormantWines`, lecture bornée `movements` (`limit: 500`) | `metric` (`dormant`, `top_out`, `shrinkage`, `compare_sites`), `days` (≤ 365), `siteId`, `limit` | Top 20 lignes de rotation / dormants / casse / comparatif inter-sites |
| **`margins`** | `pilotage` | `owner`, `manager`, `sommelier`, `accountant` | `true` | `buildSalesData`, `computeKpis`, `winePerformance`, `rankWines` | `focus` (`low_margins`, `top_margins`, `underpriced`, `summary`), `siteId`, `minMarginPct`, `days`, `limit` | KPIs de marge + Top 20 cuvées à faible/forte marge ou sous-valorisées |
| **`data_quality`** | `stock` | `owner`, `manager`, `sommelier`, `accountant` | `false` | `findDuplicateGroups`, `stockByWine` | `checks` (`missing_price`, `missing_bin`, `missing_tech_sheet`, `missing_apogee`, `missing_allergens`, `duplicates`), `siteId`, `limit` | Compteurs d'anomalies par type + Top 20 fiches à compléter + liens directs |
| **`help`** | — | Tous | `false` | Recherche mots-clés sur `HELP_ARTICLES` (FR/EN) | `query`, `topic` | Top 3 fiches d'aide correspondantes + route associée si autorisée |
| **`navigate`** | Selon route cible | Selon `isNavVisible` de la route cible | Selon prefill | `NAV`, `isNavVisible`, `findMatches` (anti-doublon Étape 2) | `route`, `reason`, `prefill` (`newWine`, `movement`, `filters`) | Carte d'action cliquable qui ouvre l'écran cible pré-rempli (jamais de navigation ni d'écriture automatique) |

---

## 3. Écarts identifiés et simplifications retenues

1. **Alignement strict avec `NAV` (`src/registry.ts`)** : plutôt que de coder en dur les rôles de `margins`, on lit dynamiquement la définition de l'entrée `pilotage` dans `NAV`.
2. **Inclusion de `maturityRisk` et `openBottles` dès la V1** : `maturityRisk` étant déjà présent et testé dans `src/data/stock.ts`, et `openBottles` étant une petite collection légère, ils sont intégrés directement dans `stock_alerts` sans complexité supplémentaire.
3. **Étape 2 (création de vin + stock initial)** : lorsqu'un utilisateur demande *« Ajoute 6 magnums de Chablis 2020 à 95 € HT »*, `WineFormModal` accepte désormais un pré-remplissage (`initialPrefill`) incluant optionnellement une quantité initiale (`initialQty` + `initialSiteId`), ce qui permet de créer la fiche vin et son mouvement d'entrée initial en un seul clic de validation humaine.

---

## 4. Risques & Parades

| Risque | Catégorie | Parade mise en œuvre |
|---|---|---|
| Fuite de prix d'achat (`buyPriceHT`, `coefficient`, `costHT`) vers `staff` | Sécurité | Double barrière : `availableTools` masque `margins`, et `sanitizeForRole()` purge récursivement les clés de coût de toutes les sorties d'outils et des cartes UI lorsque `!canSeeCosts`. Couvert par test unitaire dédié. |
| Abus de quota via réutilisation infinie d'un même `questionId` | Sécurité / Coût | `server/auth.ts` suit chaque `questionId` en mémoire avec une fenêtre TTL de 2 minutes et un plafond strict de 5 appels par `questionId`. Au-delà, un nouveau quota est décompté ou refusé. |
| Perte des `thoughtSignature` Gemini 3 entre deux tours d'outils | Technique | Le serveur renvoie `modelContent` (l'objet `Content` exact renvoyé par le SDK `@google/genai`) et le client le réinjecte tel quel dans `history` sans le reconstruire. |
| Paramètre `temperature` déconseillé sur Gemini 3.x | Technique | Retiré pour tous les modèles `gemini-3*` dans `server/gemini.ts` et `server/aiAssistant.ts` ; niveau de thinking configuré à `low` pour optimiser la latence. |
| Croissance excessive de l'historique côté client | Performance | Élagage automatique au-delà des 10 derniers échanges et plafonnement serveur à 200 Ko. |

---

## 5. Réponses aux questions ouvertes (§19)

- **A1 (Emplacement du schéma partagé)** : `src/modules/assistant/schema.ts`, importé côté client via `@/modules/assistant/schema` et côté serveur via `../src/modules/assistant/schema` (`tsconfig.json` couvre déjà `src` et `server.ts`).
- **A2 (Streaming vs indicateurs d'étape)** : Indicateurs d'étape temps réel (*« Je consulte le stock… »*, *« J'analyse les rotations… »*) à chaque aller-retour d'outil. Plus fiable avec les réponses structurées JSON + appels d'outils successifs.
- **A3 (Quotas de l'assistant)** : 60 questions/heure par utilisateur authentifié, 15 questions/heure par IP en démo (chaque question pouvant comporter jusqu'à 4 allers-retours d'outils sous le même `X-Question-Id`).
- **A4 (`openBottles` et casiers)** : `openBottles` inclus dans `stock_alerts` (bouteilles ouvertes depuis > N jours) ; détection des bouteilles sans casier incluse dans `data_quality`.
- **A5 (Contenu d'aide)** : 10 fiches bilingues FR/EN regroupées dans `src/modules/assistant/helpContent.ts` pour un fonctionnement instantané même hors-ligne.
- **A6 (Modèles)** : `gemini-3.8-flash` par défaut avec fallback initial (avant le 1er outil) sur `gemini-3.1-flash-lite`, configurable via `GEMINI_ASSISTANT_MODEL` et passant par `getAiClient()`.
- **A7 (Vérification serveur du rôle)** : Inutile pour la sécurité des données puisque tous les outils s'exécutent dans le navigateur sous le contrôle de `firestore.rules`.
- **A8 (Filtres URL sur `/vins` et `/stock`)** : Ajoutés dans `src/pages/Wines.tsx` et `src/pages/Stock.tsx` (`q`, `color`, `region`, `vintage`, `stock`, `apogee`), permettant aux boutons *« Voir les N vins »* d'ouvrir la liste exactement filtrée.

---

## 6. Estimation de charge

- **Étape 1 (Socle, 6 familles d'outils, route serveur Gemini 3, panneau UX, tests & golden set)** : 3,5 jours.
- **Étape 2 (Pré-remplissage guidé sur Vins & Mouvements de stock avec détection de doublons)** : 1,5 jour.
- **Total** : **5 jours**.
