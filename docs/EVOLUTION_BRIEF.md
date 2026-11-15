# Brief d'évolution — Loul's & Thos (Cave)

> **Version** 1.1 — 15/11/2026
> **Destinataire** : agent de développement (Antigravity) avec accès en écriture au dépôt `locollinet/Cave-Thos-Loul-s-AI-Studio`
> **Auteur** : Product Owner
> **Statut** : hypothèses de travail. **Le code fait foi.** Ce document ne contient ni nom de prospect ni donnée commerciale : il peut être commité dans `docs/EVOLUTION_BRIEF.md`.

---

## Sommaire

0. [Comment utiliser ce document](#0-comment-utiliser-ce-document)
1. [Contexte produit](#1-contexte-produit)
2. [Invariants à ne jamais casser](#2-invariants-à-ne-jamais-casser)
3. [Garde-fous contre l'usine à gaz](#3-garde-fous-contre-lusine-à-gaz)
4. [Phase 0 — Audit (avant tout code)](#4-phase-0--audit-avant-tout-code)
5. [Lots de travail](#5-lots-de-travail)
6. [Référentiel UX/UI](#6-référentiel-uxui)
7. [Definition of Done et modèle de PR](#7-definition-of-done-et-modèle-de-pr)
8. [Décisions actées et questions ouvertes](#8-décisions-actées-et-questions-ouvertes)
9. [Annexes](#9-annexes)

---

## 0. Comment utiliser ce document

### 0.1 Ton rôle

Tu es **lead développeur et relecteur critique**, pas un simple exécutant. Tu as accès à tout le code, ce qui n'était pas le cas lors de la rédaction initiale de ce brief. Tu as donc **le droit et le devoir** de :

- **contester** une demande inutile, redondante ou trop lourde, et proposer une alternative plus simple ;
- **signaler** toute contradiction entre ce brief et le code (le code gagne, mais tu le documentes) ;
- **refuser** d'ajouter une dépendance, une collection ou un concept qui n'est pas justifié (voir §3) ;
- **proposer de supprimer** du code mort ou des fonctionnalités qui alourdissent sans servir les parcours clés.

Tu ne décides pas seul des questions encore ouvertes listées en §8.2 : tu prépares les options dans l'audit, l'humain tranche.

### 0.2 Déroulé imposé

```text
Phase 0 : Audit  ──►  livrable docs/AUDIT.md, aucun changement fonctionnel  ──►  STOP, validation humaine
Lot 0   : Sécurité et intégrité         ──►  1 branche, 1 PR  ──►  STOP
Lot 1   : Modules et profil             ──►  1 branche, 1 PR  ──►  STOP
Lot 2   : Gestion des accès             ──►  1 branche, 1 PR  ──►  STOP
Lot 3   : Traçabilité et maturité       ──►  1 branche, 1 PR  ──►  STOP
Lot 4   : Paramètres par lieu           ──►  1 branche, 1 PR  ──►  STOP
Lot 5   : UX/UI                         ──►  1 branche, 1 PR  ──►  STOP
Lot 6   : IA (sommelier, factures, POS) ──►  1 branche, 1 PR  ──►  STOP
Lot 7   : Conditionnels, NE PAS DÉMARRER sans GO explicite
```

- **Une branche par lot** (`lot-0-securite`, `lot-1-modules`…). Jamais de commit direct sur `main`.
- **Une PR par lot**, découpée en commits lisibles. Si un lot dépasse environ 1 500 lignes modifiées, découpe-le.
- **Vérification de l'interface** : en Phase 0 et sur les lots backend/logique (Lots 0 à 4, 6), procède par **inspection statique des composants React/Tailwind** sans lancer de navigateur headless pour générer des captures d'écran. Pour le **Lot 5 (UX/UI)**, fournis un parcours commenté (et des captures à 390 px, 820 px et 1 440 px uniquement si l'outillage le permet sans friction).

### 0.3 Ce qui a été lu et ce que tu dois vérifier

| Déjà inspecté | Non inspecté (à vérifier toi-même en priorité) |
|---|---|
| `README.md`, `docs/ARCHITECTURE.md` | Les composants d'interface (`src/pages/**`, `src/modules/**`, `src/ui/index.tsx`, `src/components/**`) |
| `src/types.ts`, `src/registry.ts` | `src/data/store.ts`, `src/data/firebase.ts` |
| `src/data/stock.ts`, `src/app/org.tsx` | `server/auth.ts`, `server/ai.ts`, `server/aiSchemas.ts`, `server/gemini.ts` |
| `firestore.rules`, `server.ts`, `server/pos.ts` | `storage.rules`, `src/App.tsx` (routeur) |
| `package.json`, arborescence de `src/lib`, `src/data`, `src/pages`, `src/modules`, `server/` et `tests/` | Le contenu des tests, `src/lib/posReport.ts`, `src/lib/importWines.ts` |

**Conséquence :** tout ce qui touche l'interface dans ce brief repose sur des principes, pas sur une observation des écrans. Ton audit du code des composants (§4.C) prime.

---

## 1. Contexte produit

### 1.1 Le produit

Plateforme de gestion de **cave, carte des vins et négoce** : multi-établissements, avec des rôles, de l'IA côté serveur (Gemini) et un mode démo local. La stack est React 19, Vite 6, Tailwind 4, Firebase (Auth, Firestore, Storage) et Express. Le produit tourne dans Google AI Studio et sur Cloud Run.

### 1.2 Cibles, par ordre de priorité

1. **Restaurants gastronomiques et hôtels 4 et 5 étoiles** avec plusieurs points de vente. C'est la cible prioritaire.
2. **Petits groupes** de 2 à 5 établissements.
3. **Négociants et cavistes.** Les modules existent déjà ; on les maintient sans investir davantage.

### 1.3 Cas d'usage de référence (anonymisé)

> Un hôtel 5 étoiles d'environ 40 chambres, avec :
> - **deux restaurants** : un bistrot d'environ 50 couverts et une table gastronomique **installée dans une cave voûtée, où le réseau est peu fiable** ;
> - un bar, du room service, une boutique, une villa privatisable ;
> - un **domaine viticole attenant**, qui produit ses propres cuvées ;
> - environ 70 permanents et **une vingtaine de saisonniers** l'été ;
> - une clientèle internationale ;
> - un rattachement à un petit groupe de 3 à 4 maisons.

### 1.4 Positionnement : ce qui guide tous les arbitrages

Le marché propose déjà des logiciels standards entre 25 et 100 € par mois. **On ne gagne pas en ajoutant des fonctionnalités**, mais grâce à quatre choses :

- **la fiabilité** : stock juste, traçabilité, sécurité ;
- **l'adaptation à la maison** : c'est un socle sur mesure ;
- **une expérience de service irréprochable**, sur tablette, en salle, pendant le rush ;
- **une IA qui n'invente jamais rien.**

**Règle d'or :** chaque fonctionnalité doit servir au moins un des parcours clés décrits ci-dessous. Tout le reste doit pouvoir se désactiver.

### 1.5 Personas et parcours clés (avec objectifs mesurables)

| Persona | Parcours clé | Objectif |
|---|---|---|
| **Serveur ou commis** (rôle `staff`) | Sortir une bouteille pendant le service | **3 interactions au maximum, moins de 5 secondes**, possibilité d'annuler, aucun prix d'achat visible |
| **Sommelier** | Réceptionner une livraison | Facture électronique : moins d'une minute. Facture PDF de 20 lignes : moins de 2 minutes, avec validation humaine |
| **Sommelier** | Faire l'inventaire d'une cave au scan | Fonctionne avec un réseau faible ; les écarts sont visibles avant la clôture |
| **Sommelier** | Tenir la carte à jour | Un vin épuisé disparaît de la carte publique **sans aucune action manuelle** |
| **Directeur ou gérant** | Piloter | Un tableau de bord avec « 3 chiffres et 3 actions » : valeur du stock, vins à risque, écarts |
| **Directeur ou gérant** | Gérer les accès | Inviter, limiter à certains lieux, désactiver un saisonnier : **moins de 30 secondes** |
| **Client de l'hôtel** | Consulter la carte via QR code | Carte lisible en 4G dans une cave voûtée, multilingue, rapide |

---

## 2. Invariants à ne jamais casser

Ils viennent de `docs/ARCHITECTURE.md`, complétés par l'auteur. **Toute PR qui en enfreint un est refusée.**

1. **Couche de données unique.** Le code applicatif n'importe jamais `firebase/firestore` directement. Il passe par `useOrg()`, `useCollection()` et `commit(ops)` (`src/data/store.ts`). **Le mode démo (localStorage) doit fonctionner pour toute nouvelle fonctionnalité**, ou la désactiver explicitement avec un message clair.
2. **Les mouvements de stock** se créent **uniquement** via `buildMovementOps` (`src/data/stock.ts`). Ils ne peuvent pas être modifiés, et le stock évolue par incréments atomiques.
3. **Il n'existe que quatre types de mouvement** : `in`, `out`, `transfer`, `adjust`. Ils sont combinés à une **raison** (`MovementReason`). Un nouveau besoin se traduit par une **raison** ou un **champ optionnel**, **jamais par un nouveau type** (les règles Firestore et `stockDeltas()` en dépendent).
4. **Les coûts restent séparés** : `wineCosts` et `movementCosts`. On ne met **jamais** `buyPriceHT` ni `coefficient` dans `wines`. Le rôle `staff` ne voit **jamais** les coûts, ni dans les règles, ni dans l'interface.
5. **Multi-tenant** : toutes les données métier sont sous `orgs/{orgId}/…`. Il n'y a pas de donnée globale en dehors de `users`, `orgs`, `public_lists` et `public_offers`.
6. **Les calculs sensibles** (TVA, marges, DRM, maturité, valorisation) sont des **fonctions pures testées** dans `tests/`, jamais écrites dans des composants.
7. **i18n** : toute chaîne visible passe par `t('cle')`, en français **et** en anglais.
8. **Chaque modification de règle Firestore s'accompagne d'un test** dans `tests/rules/`, et `npm run test:rules` doit passer.
9. **Pas d'écriture serveur avec le SDK Admin sans validation humaine.** Le SDK Admin **contourne les règles Firestore**. Si on l'introduit, le serveur doit reproduire tous les contrôles (stock jamais négatif, rôle, périmètre) et les tester.
10. **L'IA n'invente jamais rien** : elle indique sa source et son niveau de confiance, et un humain valide **avant** toute écriture.
11. **Le mode local n'applique pas les règles Firestore.** L'interface doit donc respecter elle aussi les droits. On ne compte pas uniquement sur les règles pour masquer une action.
12. **Ne pas toucher sans raison grave** à la génération des factures électroniques (CII EN 16931), à la numérotation légale (`counters`) ni à l'export FEC. Ce sont des sujets légaux, déjà testés.

---

## 3. Garde-fous contre l'usine à gaz

### 3.1 La grille de questions, obligatoire dans chaque PR

Réponds à ces questions dans la description de la PR :

1. **Quel parcours clé (§1.5) cette modification sert-elle ?**
2. **Est-ce que ça existe déjà, même partiellement ?** Cite les fichiers concernés.
3. **Quelle est la version la plus simple qui atteint 80 % de la valeur ?** L'as-tu choisie ? Sinon, pourquoi ?
4. **Quel code peut-on supprimer ou simplifier au passage ?**
5. **Combien de nouveaux concepts** (types, collections, écrans, dépendances) ? Objectif : **un au maximum par lot**.
6. **La fonctionnalité peut-elle se désactiver** pour un client qui n'en veut pas ?
7. **Quel coût de maintenance à 12 mois ?** (tests, i18n, mode démo, règles)

### 3.2 Les règles

- **Pas de nouvelle collection Firestore** sans un tableau qui la justifie : pourquoi pas un champ sur un document existant, qui lit, qui écrit, quelle règle, quel volume.
- **Pas de nouvelle dépendance** sans indiquer son poids après compression, l'alternative native ou existante, et pourquoi. **Aucune nouvelle bibliothèque de composants d'interface** (pas de MUI, Chakra ou Ant) : on enrichit `src/ui/index.tsx`.
- **Pas de framework générique** : pas de système de plugins, de moteur de règles, de matrice de permissions case par case, de constructeur de formulaires ou de bus d'événements.
- **On étend les types existants** plutôt que d'en créer des parallèles (voir §3.4).
- **On supprime le code mort** repéré dans l'audit, dans une PR séparée.
- **Pas d'optimisation prématurée** : on mesure d'abord (§4.B), puis on optimise ce qui dépasse les budgets (§6.3).

### 3.3 Suspects à examiner pendant l'audit

| Suspect | Question |
|---|---|
| `three` et `@types/three` (3D) | À quoi servent-ils ? Sont-ils chargés à la demande ? Leur valeur justifie-t-elle leur poids ? |
| `recharts`, `xlsx`, `@zxing/library`, `qrcode` | Sont-ils chargés à la demande, seulement sur les écrans qui les utilisent ? |
| Modules négoce, compta, DRM, FEC | On les garde, mais ils doivent être **invisibles et inaccessibles** pour un profil restaurant ou hôtel |
| Données de démo (`src/data/demo/**`) | Volume et poids dans l'application ? Sont-elles chargées à la demande ? |
| Composants de plus de 400 lignes | À découper uniquement si ça facilite la lisibilité ou les tests, pas par principe |
| Dépendances de typage (`@types/*`) et outils de build dans `dependencies` | Hygiène à corriger, priorité basse, à vérifier avec le build d'AI Studio |
| Commentaire `eslint-disable` alors qu'ESLint n'est pas installé | Ajouter une configuration minimale (`typescript-eslint` et `react-hooks`) ? À proposer, sans l'imposer |

### 3.4 Idées déjà évaluées et rejetées

Elles viennent d'une ancienne spécification (« Cepia »). **Ne les implémente pas.**

| Idée rejetée | Pourquoi | Ce qu'on fait à la place |
|---|---|---|
| Nouveaux types de mouvement (`purchase_in`, `sale_out`, `transfer_internal`, `loss_out`…) | Ça casse les règles Firestore et `stockDeltas()` | `type` combiné à `reason`, plus un champ `source` optionnel (Lot 3) |
| Un concept `CellarZone` en parallèle de `Site` | Il ferait doublon : `Site` a déjà un type (`cave`, `restaurant`, `bar`…), un plan de cave (`CellarRack.zone`), un stock par site et des transferts | On utilise `Site`. Les paramètres par lieu sont traités au Lot 4 via `StockLevel`. |
| Mettre à jour `stats/summary` dans `buildMovementOps`, côté navigateur | Les coûts deviendraient lisibles par le rôle `staff`, le document serait falsifiable, les chiffres faux après un changement de prix, et le document très sollicité | Si un jour c'est nécessaire, statistiques calculées côté serveur (Lot 7.3) |
| `UserProfile.allowedOrgs[].role` | Le document `users/{uid}` est **modifiable par l'utilisateur** : un rôle stocké là n'a aucune valeur de sécurité | La seule référence reste `orgs/{orgId}/members/{uid}` |
| Écrire les accords mets-vins dans `technicalSheet` | La fiche technique décrit le vin et reste stable, alors que le menu change chaque semaine : les accords seraient vite faux | Accords calculés à la volée ou stockés avec la version du menu (Lot 7.2) |
| Le propriétaire active lui-même les modules en production | En production, les modules correspondent à ce que le client paie | Activation par la **plateforme** en production, mais laissée ouverte au `owner` **en mode démo** (`isDemo` / `localStorage`) pour les démonstrations commerciales (Lot 1) |
| Écrans de permissions case par case | Un gérant ne saura pas s'en servir | 5 rôles métier, plus un périmètre par lieu (Lot 2) |
| Synchronisation automatique d'annuaire (SCIM) ou auto-join par domaine email en Lot 2 | En hôtellerie-restauration, les équipes de salle et saisonniers n'ont presque jamais d'email nominatif d'entreprise | Invitations directes enrichies avec lieux et date de fin de contrat (Lot 2) |

---

## 4. Phase 0 — Audit (avant tout code)

**Livrable : `docs/AUDIT.md`. Aucun changement fonctionnel.** Tu peux seulement ajouter des scripts de mesure temporaires, à retirer ensuite.

### 4.A Vérifier les constats de l'auteur

Pour chaque ligne : **Confirmé, Infirmé ou Nuancé**, avec le fichier et la ligne concernés.

| # | Constat supposé | Où regarder |
|---|---|---|
| A1 | `orgs/{orgId}` : `owner` et `manager` peuvent modifier `modules`, `profile`, `isDemo` et **`expiresAt`** | `firestore.rules`, bloc `match /orgs/{orgId}` |
| A2 | `stock` : le back-office (`owner`, `manager`, `sommelier`, `accountant`) écrit librement **sans mouvement associé**. Seul le rôle `staff` doit justifier ses écritures. | `firestore.rules`, bloc `match /stock/{id}` |
| A3 | `bottles` (flacons d'exception) et `racks` : **n'importe quel membre**, y compris `staff`, peut écrire **et supprimer** | `firestore.rules` |
| A4 | `members` : le propriétaire peut se rétrograder ou se supprimer lui-même, et laisser l'organisation **sans propriétaire** | `firestore.rules`, bloc `match /members/{uid}` |
| A5 | `inventories`, `openBottles` et `partners` sont modifiables par `staff`. Est-ce voulu ? | `firestore.rules` |
| A6 | `stockValue()` lit `w.buyPriceHT` alors que les règles **interdisent** ce champ dans `wines` : où se fait la fusion avec `wineCosts` ? Et `sellHT` utilise `sellPriceHT` (prix négoce), donc la valeur est fausse pour un restaurant, qui vend au prix carte | `src/data/stock.ts`, et ceux qui l'appellent |
| A7 | `wineAlerts()` utilise **un seul** `alertThreshold` par vin, pas de seuil par site | `src/data/stock.ts` |
| A8 | `activeSiteId` est enregistré dans `localStorage` sous une clé **commune à toutes les organisations** (`lt-active-site`). Après un changement d'organisation, l'identifiant de site ne correspond plus. | `src/app/org.tsx` |
| A9 | Les modules filtrent **seulement le menu** (`isNavVisible`). Les pages restent-elles accessibles en tapant l'adresse ? | `src/registry.ts`, `src/App.tsx` |
| A10 | Le sommelier IA est limité aux **150 premières références** de la carte | README, `server/ai.ts` |
| A11 | `/api/pos/deplete` n'est pas protégé par une authentification. Ce n'est pas grave tant que la route répond 501, mais à noter pour plus tard. | `server.ts`, `server/pos.ts` |
| A12 | Le serveur vérifie les jetons **sans le SDK Admin** (`firebase-admin` est absent de `package.json`). À confirmer. | `server/auth.ts` |
| A13 | `pairedWithMovement()` exige `d.mv.size() == 1`, alors que `buildMovementOps` peut regrouper **plusieurs** mouvements sur une même ligne de stock dans un lot. Un lot `staff` avec deux mouvements sur le même vin et le même site échouerait. | `firestore.rules`, `src/data/stock.ts` |
| A14 | `useOrg()` charge en continu **toutes** les collections `wines`, `stock`, `partners`, `producers`, `members` et `sites`. Combien de lectures au démarrage avec 1 500 références ? | `src/app/org.tsx` |
| A15 | La carte publique (QR code) charge-t-elle **tout** le code de l'application ? | `vite build`, routeur |
| A16 | Le cache persistant de Firestore (`persistentLocalCache`) est-il activé ? Que se passe-t-il pour une sortie de bouteille saisie sans réseau ? | `src/data/firebase.ts` |

### 4.B Mesures

- **Poids du build** : taille de chaque fichier généré après compression (`vite build`). Liste les bibliothèques lourdes et indique si elles sont chargées à la demande.
- **Lectures Firestore au démarrage** : estimation mathématique pour 300 et pour 1 500 références d'après `useOrg()`.
- **Tests** : nombre, temps d'exécution, et fonctions critiques non couvertes.

### 4.C Audit UX et visuel (par lecture statique du code)

> **Consigne d'exécution :** Ne lance pas de navigateur headless pour générer des captures d'écran en Phase 0. Analyse directement le code de `src/pages/**`, `src/modules/**`, `src/components/**` et `src/ui/index.tsx`.

1. Pour chaque **parcours clé** (§1.5) : nombre d'interactions (clics/saisies dans le code), et points de friction repérés.
2. **Incohérences UI/Tailwind** : boutons, espacements, typographie, couleurs codées en dur hors thème, états vides, erreurs, chargements, confirmations, responsive mobile/tablette (`sm:`, `md:`, `lg:`, largeurs fixes problématiques).
3. **Accessibilité** : contraste, focus visible, libellés de formulaires, cibles tactiles de 44 px minimum (`min-h-11`), navigation au clavier.
4. **Navigation par rôle** : ce que voit `staff`, `sommelier` et `owner`. Y a-t-il trop d'entrées ?

### 4.D Santé du code

Code mort (exports jamais importés, fichiers orphelins), logique dupliquée, usages de `any`, `TODO` et `FIXME`, composants géants.

### 4.E Structure de `docs/AUDIT.md`

```markdown
# Audit — <date>
## 1. Constats A1 à A16 (Confirmé / Infirmé / Nuancé + preuve)
## 2. Mesures (build, lectures Firestore, tests)
## 3. Audit UX statique (parcours, incohérences CSS/UI, accessibilité)
## 4. Risques classés P0 (bloquant) à P3 (confort)
## 5. Améliorations rapides (moins d'une demi-journée chacune)
## 6. Propositions de SIMPLIFICATION ou SUPPRESSION
## 7. Ajustements proposés à ce brief (ce qui est inutile, faux ou à reprioriser)
## 8. Questions pour l'humain
```

**→ STOP. Attends la validation humaine avant le Lot 0.**

---

## 5. Lots de travail

> Chaque lot suit la même structure : **objectif, état actuel, changements, tests, critères d'acceptation, hors périmètre, points à contester**. Les estimations en jours sont **indicatives**.

---

### Lot 0 — Sécurité et intégrité (P0) — environ 2 à 3 jours

**Objectif :** combler les failles des règles Firestore sans casser les parcours existants ni brider les démonstrations commerciales.

#### 0.1 Réserver modules, profil, démo et expiration à la plateforme (hors organisations de démo)

```js
// match /orgs/{orgId}
allow update: if isPlatformAdmin() || (
  isAdmin(orgId)
  && request.resource.data.ownerUid == resource.data.ownerUid
  && request.resource.data.id == orgId
  && (
    // En production (isDemo != true), ni modules ni profile ne sont modifiables par le client
    (resource.data.get('isDemo', false) == false
      && !request.resource.data.diff(resource.data).affectedKeys()
           .hasAny(['modules', 'profile', 'isDemo', 'expiresAt']))
    // En mode démo (isDemo == true), le owner peut basculer modules et profile pour les démos commerciales, sans toucher à isDemo ni expiresAt
    || (resource.data.get('isDemo', false) == true
      && hasRole(orgId, ['owner'])
      && !request.resource.data.diff(resource.data).affectedKeys()
           .hasAny(['isDemo', 'expiresAt']))
  )
);
```

- Vérifie les écrans qui modifient aujourd'hui `modules` ou `profile` (`Settings.tsx` ?) : conserve les interrupteurs actifs en mode local (`localStorage`) ou lorsque `org.isDemo === true`, et affiche-les en lecture seule pour une organisation de production.

#### 0.2 Intégrité du stock : contrôler la cohérence plutôt que tout bloquer

> ⚠️ **Correction d'une recommandation antérieure.** L'idée initiale était d'exiger `pairedWithMovement` pour **tous** les rôles. **C'est impossible** : Firestore limite les appels `get()`, `exists()` et `getAfter()` à **20 par lot d'écritures** (et 10 par opération). Or chaque ligne de stock contrôlée lit un mouvement différent. Une réception de 40 lignes ou une clôture d'inventaire serait refusée.

**Approche demandée :**

1. **Garder** la règle actuelle (le back-office écrit librement, le rôle `staff` doit associer un mouvement), et **corriger A13** : accepter `mv.size() >= 1` pour `staff` en vérifiant au minimum `mv[0]`, ou découper côté client pour que chaque ligne de stock `staff` ne cite qu'un mouvement.
2. **Ajouter un contrôle de cohérence entre le registre et le stock** :
   - une fonction pure `reconcileStock(movements, stock)` dans `src/data/stock.ts`, qui recalcule le stock à partir des mouvements (le registre fait foi, puisqu'il ne peut pas être modifié) et liste les écarts ;
   - un écran « Contrôle d'intégrité » réservé à `owner` et `manager` (Pilotage ou Réglages), qui affiche les écarts, propose un **ajustement tracé** (`adjust`, raison `inventaire`) et indique qui a modifié le stock en dernier.
3. **Vérifier** que **tous** les endroits qui écrivent dans `stock/` (import initial, clôture d'inventaire, réception de facture, ventes de caisse, service) créent bien un mouvement. Cherche tous les chemins `stock/` et les appels à `withStockFields`.

#### 0.3 Flacons d'exception et casiers

**Décision actée (D4) :** Un serveur (`staff`) doit pouvoir sortir un flacon d'exception pendant le service si le sommelier est absent (passage au statut « servi » tracé), mais ne peut ni en créer, ni modifier ses métadonnées/prix, ni le supprimer.

```js
match /bottles/{id} {
  allow read: if isMember(orgId);
  allow create: if hasRole(orgId, ['owner', 'manager', 'sommelier']) && validId(id);
  allow update: if validId(id) && (
    hasRole(orgId, ['owner', 'manager', 'sommelier'])
    || (hasRole(orgId, ['staff'])
        && request.resource.data.diff(resource.data).affectedKeys()
             .hasOnly(['status', 'servedAt', 'servedBy', 'movementId', 'updatedAt']))
  );
  allow delete: if false; // un flacon change de statut, il ne disparaît jamais
}
match /racks/{id} {
  allow read: if isMember(orgId);
  allow write: if hasRole(orgId, ['owner', 'manager', 'sommelier']) && validId(id);
}
```

Adapte les noms de champs exacts (`status`, `servedAt`, etc.) à ce qui existe réellement dans `RareBottle` (`src/types.ts`).

#### 0.4 Protéger le propriétaire

- Le membre dont l'`uid` vaut `org.ownerUid` ne peut **ni être rétrogradé ni être supprimé** (voir l'annexe 9.2).
- La passation de propriété passe par la plateforme (hors périmètre).

#### 0.5 Écritures du rôle `staff` (Décision actée D3)

- `partners` : lecture autorisée aux membres, écriture réservée à `['owner', 'manager', 'sommelier', 'accountant']` (`staff` ne crée ni ne modifie de partenaires).
- `openBottles` : `staff` peut ouvrir et servir au verre.
- `inventories` : `staff` peut saisir les quantités comptées sur un inventaire au statut `'in_progress'` (ou équivalent dans le code), mais **seuls `['owner', 'manager', 'sommelier']` peuvent clôturer/valider un inventaire** (puisque la clôture génère des écritures d'ajustement de stock).

#### 0.6 Hors code, à documenter dans `docs/OPERATIONS.md`

Une liste de vérifications que l'humain fera dans la console :
- région Firestore (`europe-west1`) ;
- restauration à une date précise (PITR) et exports planifiés sur Cloud Storage ;
- version Identity Platform activée ;
- Gemini via Vertex AI en région Europe ;
- alertes de budget GCP.

Ajoute aussi un fichier `LICENSE` « Propriétaire, tous droits réservés ».

**Tests obligatoires :** un test positif et un test négatif par règle modifiée, dans `tests/rules/`. Teste aussi `reconcileStock` dans `tests/stock.test.ts`.

**Critères d'acceptation :**
- un `manager` ne peut plus modifier `modules` ni `expiresAt` sur une organisation de production ;
- en mode démo (`isDemo == true` ou mode local), le `owner` peut toujours activer/désactiver les modules depuis `Settings.tsx` ;
- un `staff` ne peut plus supprimer un flacon ni modifier un partenaire ni clôturer un inventaire ;
- le propriétaire ne peut plus se retirer de l'organisation ;
- l'écran d'intégrité affiche **zéro écart** sur les données de démo ;
- tous les parcours existants fonctionnent.

---

### Lot 1 — Modules, profil et protection des pages — environ 2 jours

**Objectif :** qu'un client ne voie **et n'atteigne** que ce qu'il a souscrit, et que la démo pour un restaurant/hôtel soit épurée.

**État actuel :** `Org.modules`, `PROFILE_MODULES` et `isNavVisible()` existent. Le profil `restaurant` exclut déjà le négoce et la compta.

**Changements :**
1. **Protéger les pages** : un composant `<RequireModule module="negoce">` (ou l'équivalent dans le routeur existant) qui affiche un écran sobre « Module non activé sur votre abonnement » au lieu de la page.
2. **Tableau de bord** : chaque bloc déclare le module dont il dépend et se masque si le module est désactivé.
3. **Activation des modules** : dans `PlatformAdmin.tsx` pour les comptes clients en production, ET dans `Settings.tsx` lorsque l'organisation est en mode démo (`isDemo === true` ou `localStorage`) pour permettre au Product Owner de faire des démonstrations en direct. Pour un client en production, `Settings.tsx` affiche la liste en **lecture seule** avec un bouton « Demander l'activation ».
4. **Pas de nouveau `OrgProfile` `'hotel'` (Décision actée D1)** : on conserve le profil `restaurant` (dont le libellé affiché dans l'UI devient « Restaurant & Hôtellerie ») afin de ne pas dupliquer la logique métier.
5. **Navigation par rôle** : `staff` voit **3 entrées au maximum** (Service, Inventaire, Carte en lecture). Vérifie ce que montre l'audit.

**Critères d'acceptation :**
- avec le profil restaurant, `/negoce` affiche l'écran « non activé » ;
- aucun bloc du tableau de bord n'affiche de données d'un module désactivé ;
- les tests unitaires de `isNavVisible` et du composant de protection passent.

---

### Lot 2 — Gestion des accès — environ 4 à 6 jours

**Objectif :** permettre au gérant d'administrer les accès **simplement**, avec un **périmètre par lieu**, une **désactivation** en un clic et une **date de fin** automatique pour les saisonniers.

> **Note d'architecture :** Le mécanisme d'auto-adhésion par domaine email (`domains` + `joinRequests`) est reporté en Lot 7 conditionnel. En hôtellerie-restauration, le personnel de salle et les saisonniers utilisent des adresses personnelles : tout passe par le système d'invitation enrichi ci-dessous.

#### 2.1 Modèle de données

```ts
// src/types.ts
export interface Member {
  uid: string;
  email: string;
  name: string;
  role: Role;
  status?: 'active' | 'disabled';   // absent = actif (pas de migration nécessaire)
  siteIds?: string[];               // absent = tous les lieux
  expiresAt?: number;               // fin de contrat saisonnier/CDD (ms)
  invitedBy?: string;
  createdAt: number;
}
export interface Invite {
  email: string; role: Role; token?: string; createdAt: number; expiresAt?: number;
  siteIds?: string[];               // nouveau : périmètre transmis au membre
  memberExpiresAt?: number;         // nouveau : date de fin du futur membre
  invitedBy?: string;
}
```

#### 2.2 Règles : le point critique

1. **`isMember()` doit vérifier le statut et la date de fin.** Si on oublie, **un membre désactivé ou un saisonnier dont le contrat est terminé garde tous ses accès.**
2. **Délégation** : un `manager` peut inviter, modifier et désactiver des membres de **rang inférieur au sien**, **dans son propre périmètre de lieux**. Personne ne peut augmenter son propre rôle.
3. **Périmètre par lieu**, appliqué **aux écritures** : un mouvement ou une écriture de stock sur un site hors périmètre est refusé (pour un transfert, on vérifie le site de départ et le site d'arrivée).
4. **Les lectures restent filtrées uniquement dans l'interface.** C'est un compromis assumé, car `useOrg()` charge toute la collection `stock` et une règle de lecture par site casserait ces abonnements. Les niveaux de stock d'un autre lieu sont peu sensibles. **Documente ce choix.**

Le détail des règles est en annexe 9.2. **Vérifie le budget d'appels `get()`**.

#### 2.3 Écran « Réglages › Accès »

| Onglet | Contenu | Rôles |
|---|---|---|
| **Membres** | Nom, rôle (en langage métier), lieux autorisés, statut, date de fin. Actions : modifier, désactiver, réactiver. | `owner`, et `manager` dans son périmètre |
| **Invitations** | En cours, copier le lien d'invitation, renvoyer, annuler. Le formulaire d'invitation comprend rôle, lieux et date de fin optionnelle (avec raccourcis « Fin de saison / 3 mois »). | `owner`, `manager` |

**Exigences UX :**
- chaque rôle est décrit en **une phrase métier** (« Équipe de salle : sort des bouteilles, ne voit pas les prix d'achat ») ;
- une action courante (inviter, désactiver) prend **moins de 30 secondes** ;
- la désactivation se fait par un **interrupteur** avec confirmation, **jamais par une suppression** ;
- une date de fin approchant sous 7 jours affiche un badge d'alerte visuel.

**Tests :**
- un membre désactivé ne lit plus rien ;
- un membre dont la date de fin est dépassée ne lit plus rien ;
- un `manager` ne peut pas créer un autre `manager` ;
- un `manager` limité au site A ne peut ni inviter sur le site B ni écrire un mouvement sur le site B ;
- le propriétaire ne peut pas être désactivé.

**Hors périmètre :** auto-join par domaine email, journal des accès dédié (`auditLog`), connexion Microsoft/SAML/OIDC, mode PIN sur tablette partagée.

---

### Lot 3 — Traçabilité et maturité — environ 3 à 4 jours

#### 3.1 Champ `source` sur les mouvements

```ts
export type MovementSource = 'manual' | 'invoice_ai' | 'einvoice' | 'pos_report' | 'inventory' | 'transfer' | 'service' | 'import';
// Movement.source?: MovementSource  (optionnel, rétrocompatible)
```

- Renseigné partout où des mouvements sont créés : ajoute `source` à `MovementInput`.
- Règle : si `source` est présent, sa valeur doit faire partie de la liste.
- Filtre « source » dans le journal des mouvements.

#### 3.2 Croisement maturité × vitesse de vente : la fonctionnalité qui différencie

**Pourquoi :** une cave de palace ou de grand restaurant contient des bouteilles à plusieurs centaines d'euros. Une bouteille servie après son apogée, c'est de la marge perdue et un client déçu.

**Fonction pure** dans `src/lib/maturity.ts`, testée :

```ts
export type MaturityStatus = 'past' | 'at_risk' | 'ok' | 'too_young' | 'unknown_apogee' | 'insufficient_history';

export interface MaturityRisk {
  wineId: string;
  qty: number;
  apogeeFrom?: number;
  apogeeTo?: number;
  yearsLeft: number | null;          // apogeeTo - année courante + 1 (l'année en cours compte)
  velocityPerYear: number | null;    // bouteilles par an
  projectedSold: number | null;      // velocity × yearsLeft, arrondi à l'inférieur
  atRiskBottles: number;             // max(0, qty - projectedSold)
  status: MaturityStatus;
}

export function maturityRisk(
  wine: Pick<Wine, 'id' | 'apogeeFrom' | 'apogeeTo' | 'createdAt'>,
  qty: number,
  outMovements: Pick<Movement, 'wineId' | 'qty' | 'date' | 'reason' | 'type'>[],
  now: Date,
  opts?: { windowDays?: number; minHistoryDays?: number }, // par défaut 365 et 90
): MaturityRisk;
```

**Les règles de calcul :**
- **Vitesse** : somme des sorties (`type: 'out'`, raisons `vente`, `verre`, `consommation`, `offert` et `degustation`) sur la fenêtre, ramenée à un an selon la période réellement observée : `min(fenêtre, maintenant − wine.createdAt)`.
- **Historique de moins de 90 jours** : statut `insufficient_history`. Pas de projection inventée.
- **Pas d'`apogeeTo`** : statut `unknown_apogee`, avec une invitation à le renseigner.
- **Raison `verre`** : vérifie dans le module Service ce que représente `qty` (une bouteille ouverte du stock ou un verre servi ?) et documente dans l'audit.
- **Valeur en euros du risque** : prix carte pour tous les rôles, prix d'achat **uniquement pour le back-office**.

**Données :** les mouvements ne sont pas chargés de façon globale. Fais une requête sur les 365 derniers jours (champ `date`) et filtre le reste côté client. Vérifie l'index nécessaire.

**Interface :**
- un bloc de tableau de bord « Vins à surveiller » : top 5, nombre de bouteilles à risque, valeur ;
- un filtre « Maturité » dans Stock ;
- une option par carte « Mettre en avant les vins à leur apogée » (badge discret, désactivé par défaut) ;
- une **suggestion d'action** sur chaque vin à risque : « Proposer au verre », « Mettre en avant sur la carte » ou « Signaler au sommelier ». **Ce sont des suggestions**, sans aucune action automatique.

**Source de l'apogée :** ajoute `apogeeSource?: 'producer' | 'critic' | 'sommelier' | 'ai'`. L'IA ne renseigne **jamais** l'apogée sans validation humaine, et la source est affichée.

---

### Lot 4 — Paramètres par lieu — environ 5 à 7 jours

**Objectif :** dans un hôtel ou un établissement multi-points de vente, le bar, le bistrot, le restaurant gastronomique et le room service n'ont pas les mêmes prix, le même service au verre ni les mêmes seuils d'alerte.

**État actuel :** `Wine.menuPriceTTC`, `Wine.byGlass` et `Wine.alertThreshold` sont **uniques par vin**, alors que `StockLevel` existe déjà **par vin et par site**.

**Décision actée (D6) — Étendre `StockLevel` (sans nouvelle collection) :**

```ts
export interface StockLevel {
  // … existant
  menuPriceTTC?: number;        // surcharge du prix carte pour ce lieu
  byGlass?: ByTheGlass;         // surcharge du service au verre
  alertThreshold?: number;      // surcharge du seuil
  hiddenOnSite?: boolean;       // ce vin n'est pas proposé dans ce lieu
}
```

- **Avantages :** pas de nouvelle collection, des données déjà chargées par `useOrg()`, et une règle `staff` qui interdit déjà ces champs (`changedKeys().hasOnly(['qty','mv','updatedAt','bin','bins'])`).
- **Points à vérifier dans le code :** s'assurer qu'une ligne `StockLevel` à `qty: 0` est bien conservée/supportée par `emptyLevel()` et que les opérations `inc` avec `merge: true` dans `buildMovementOps` préservent intactes ces propriétés de surcharge.

**Les autres changements :**
- les fonctions `effectiveMenuPrice(wine, level)`, `effectiveThreshold(wine, level)` et `effectiveByGlass(wine, level)` reprennent les valeurs du vin quand il n'y a pas de surcharge. Elles sont pures et testées ;
- `wineAlerts()` utilise le seuil propre au lieu ;
- les cartes des vins (`wineLists`) reçoivent un champ `siteIds?: string[]` : une carte affiche le stock et les prix des lieux qui lui sont liés (et permet d'exclure la « Cave de garde » de la carte publique iPad) ;
- **correction de A8** : la clé `localStorage` devient `lt-active-site:{orgId}`, et on vérifie que le site existe toujours ;
- **correction de A6** : `stockValue()` calcule une valeur de vente adaptée au profil (prix carte HT pour un restaurant ou un hôtel, prix négoce pour un négociant) et ne lit les coûts **que** depuis la source autorisée (`wineCosts`).

**Hors périmètre :** les coûts par lieu (le prix d'achat reste propre au vin), la facturation interne entre lieux.

---

### Lot 5 — UX/UI : en continu, plus un lot dédié de 4 à 6 jours

Tu appliques le référentiel du §6 **à chaque PR**. Le lot dédié traite les priorités issues de l'audit :

1. **Mode service sur tablette :**
   - plein écran, recherche en premier, cibles de 48 px ou plus ;
   - thème sombre « salle », adapté à une salle peu éclairée ;
   - sortie en un geste avec annulation (vérifie l'existant) ;
   - **indicateur réseau** et liste des opérations en attente ou refusées à la synchronisation (lié à A16).
2. **Navigation par rôle**, épurée (Lot 1).
3. **Tableaux de bord par persona** : « 3 chiffres et 3 actions » ; pas de graphiques décoratifs.
4. **Unification du kit d'interface** (`src/ui/index.tsx`) : variables de design dans le `@theme` de Tailwind 4, variantes de boutons, champs, états.
5. **Performances** (§6.3) : chargement à la demande par module (`React.lazy`), bibliothèques lourdes chargées seulement où elles servent, **carte publique la plus légère possible**.
6. **Listes longues** (1 500 références) : mesure d'abord la réactivité. N'ajoute une virtualisation (`react-window` ou équivalent léger) **que si** l'objectif n'est pas tenu.
7. **Hors ligne** (A16) : évalue l'activation de `persistentLocalCache`. Attention : la numérotation des factures et les vérifications de stock ne sont contrôlées qu'au retour du réseau. Il faut donc un écran des opérations refusées.

---

### Lot 6 — IA : sommelier, factures, caisse — environ 4 à 6 jours

#### 6.1 Sommelier : présélection au lieu de la limite de 150 références
1. Présélection **déterministe**, côté serveur ou client : stock positif sur le ou les lieux de la carte, couleur, tranche de prix, disponibilité au verre.
2. Envoi des **N meilleurs candidats** à Gemini (par exemple 60 ; à mesurer).
3. **Validation côté serveur** : chaque `wineId` renvoyé doit figurer parmi les candidats. Les autres sont écartés.
4. Le budget reste une consigne de conseil. L'avertissement « à vérifier » reste affiché.

#### 6.2 Factures (Entrées de stock IA)
- Un score de confiance par ligne, et une mise en évidence des lignes de faible confiance.
- Un **écart de prix** par rapport au dernier coût connu, visible **uniquement par le back-office**.
- Les **bons de livraison sans prix** sont acceptés : réception en stock (`in`, raison `achat`, `source: 'invoice_ai'`), coût à compléter plus tard.
- **Priorité aux factures électroniques** (Factur-X, CII, UBL), déjà lues exactement (`source: 'einvoice'`).

#### 6.3 Correspondance entre libellés de caisse et vins (Sorties de stock)
- Lors de l'import des ventes (`posReport.ts`), un libellé inconnu comme « CHAMB. MUS. 19 » est **associé une seule fois** par le sommelier, puis mémorisé.
- **Sans nouvelle collection** : un champ `Wine.posAliases?: string[]` en complément de `posCode`. Le rapprochement devient déterministe ; l'IA ne propose que pour les libellés inconnus.

#### 6.4 Photo d'une feuille manuscrite ou d'un rapport de ventes par article
- Permettre au sommelier de photographier ou d'importer l'état des ventes par article de fin de service ou sa feuille de sortie manuscrite.
- Rapprochement via `posAliases` + Gemini pour les lignes non reconnues, puis écran de validation humaine avant appel à `buildMovementOps` (`type: 'out'`, `reason: 'vente'`, `source: 'pos_report'`).
- Pour refuser un double import d'un rapport de caisse, utilise comme clé le numéro de rapport/ticket et la date.

---

### Lot 7 — Conditionnels : NE PAS DÉMARRER sans GO explicite

| # | Sujet | Condition de démarrage | Points d'attention |
|---|---|---|---|
| 7.1 | **Connexion directe à la caisse (Webhook temps réel)** | La caisse du client est connue | Authentification par secret propre à chaque organisation (signature HMAC). Un ticket n'est traité qu'une fois (collection `posTickets` en création seule). Gestion des annulations et remboursements. Écritures serveur avec `firebase-admin`, **donc invariant n° 9**. Option : passer par HubRise. |
| 7.2 | **Menus du chef et accords mets-vins** | Demandé pour une démo ou un client signé | Menus **par lieu**, avec une période de validité. Accords calculés à la volée dans le module Sommelier IA ou stockés avec la version du menu et validés par le sommelier. **Jamais écrits en dur dans `technicalSheet`.** |
| 7.3 | **Couche groupe multi-organisations** | Un deuxième établissement juridique distinct est signé | `groups/{groupId}`, statistiques **calculées côté serveur**, transferts entre établissements côté serveur. Pas de requêtes client à la volée sur plusieurs organisations. |
| 7.4 | **Auto-join par domaine email, SSO SAML/OIDC et 2FA** | Exigé par le service IT d'un grand groupe | Identity Platform + collection `/domains` si nécessaire. |
| 7.5 | **Mode PIN sur tablette partagée** | Validé avec le client | Le PIN identifie la personne mais ne l'authentifie pas au sens strict. **Interdit pour les flacons d'exception.** |
| 7.6 | **Valorisation de la cave** (cotes de marché) | Demandée par un client | Source de données, licence, coût |

---

## 6. Référentiel UX/UI

### 6.1 Principes

1. **Le service d'abord.** L'interface de salle doit fonctionner d'une main, debout, dans une lumière faible, en moins de 5 secondes.
2. **Le langage du métier**, pas celui du développeur : « Sortir une bouteille », pas « Créer un mouvement out ».
3. **Une action principale par écran**, clairement identifiée.
4. **Annuler plutôt que confirmer** pour les actions fréquentes et réversibles. Confirmation explicite pour les actions graves (désactiver un membre, clôturer un inventaire).
5. **Afficher l'état du système** : chargement (squelettes plutôt que spinners), écran vide avec une action proposée, erreur avec une issue (« Réessayer », « Voir le détail »), succès discret.
6. **Une confidentialité visible** : un rôle qui ne voit pas les coûts ne voit **ni la colonne ni le libellé**, pas des cases vides.
7. **Une sobriété premium** : un back-office épuré et dense quand il le faut (mode compact pour 1 500 références), une **carte publique soignée** qui respecte la charte de l'établissement.

### 6.2 Règles concrètes

| Thème | Règle |
|---|---|
| Cibles tactiles | 44 px minimum, 48 px en mode service |
| Contraste | Niveau WCAG AA : 4,5:1 pour le texte, 3:1 pour les composants. Le contrôle existe déjà pour les chartes : le réutiliser. |
| Focus | Visible sur tous les éléments interactifs, navigation complète au clavier sur bureau |
| Animations | Discrètes (150 à 250 ms), en respectant `prefers-reduced-motion` |
| Typographie | Deux familles au maximum dans l'application, avec une échelle cohérente. Les 16 polices restent réservées aux cartes. |
| Densité | Mode confortable par défaut, mode compact pour les listes du back-office |
| Mise en page | Tablette d'abord pour le service, bureau d'abord pour le back-office, téléphone pour l'inventaire et le scan |
| Formulaires | Libellés toujours visibles, validation au bon moment, valeurs par défaut intelligentes, montants au format local (`1 234,50 €`) |
| Palette de commandes (⌘K) | Elle existe déjà : y ajouter les nouvelles actions (inviter un membre, contrôle d'intégrité…) |
| Mode sombre | Sur tous les écrans, sans couleur codée en dur |
| i18n | Prévoir des textes anglais environ 30 % plus longs, sans texte tronqué |

### 6.3 Budgets de performance

Ces objectifs sont indicatifs. **On mesure d'abord dans l'audit, et on ne régresse jamais.**

| Surface | Objectif |
|---|---|
| **Carte publique (QR code)** | Affichage principal (LCP) **en moins de 2,5 s en 4G**, **moins de 150 Ko de JavaScript compressé** sur cette page, CLS inférieur à 0,1 |
| Coque de l'application, back-office | Moins de 250 Ko de JavaScript compressé au premier chargement, le reste chargé à la demande |
| Réactivité | INP inférieur à 200 ms, y compris pour une liste de 1 500 références |
| Démarrage | Pas d'écran blanc : un squelette s'affiche en moins de 1 s |
| Firestore | Pas de nouvel abonnement global dans `useOrg()` sans justification. Préférer des requêtes ciblées. |

---

## 7. Definition of Done et modèle de PR

### 7.1 Definition of Done

Une PR est terminée quand **toutes** ces conditions sont remplies :

- [ ] `npm run lint` (si configuré), `npm test`, `npm run test:rules` et `npm run build` passent
- [ ] Chaque règle Firestore modifiée a un test positif et un test négatif
- [ ] Chaque fonction de calcul ajoutée est pure et testée
- [ ] Toutes les chaînes ajoutées existent en **français et en anglais**
- [ ] Le **mode démo** fonctionne, ou la fonctionnalité y est désactivée avec un message clair
- [ ] Aucune nouvelle dépendance, ou une dépendance justifiée (poids, alternative, raison)
- [ ] Aucune nouvelle collection, ou une collection justifiée (§3.2)
- [ ] Parcours UI vérifié (responsive mobile/tablette/bureau et mode sombre vérifiés dans les classes Tailwind)
- [ ] Les budgets de performance (§6.3) ne régressent pas
- [ ] `docs/ARCHITECTURE.md` et le `README` sont mis à jour si le modèle ou les règles changent
- [ ] La grille de questions du §3.1 est remplie

### 7.2 Modèle de PR

```markdown
## Lot X.Y — <titre>

### Pourquoi
Parcours servi : <§1.5>. Problème constaté : <constat de l'audit ou du brief>.

### Ce qui change
- …

### Ce qui existait déjà et a été réutilisé
- …

### Ce que j'ai simplifié ou supprimé
- …

### Grille de questions (§3.1)
1. Parcours : …
2. Existant : …
3. Version la plus simple : …
4. Suppressions : …
5. Nouveaux concepts : … (objectif : 1 au maximum)
6. Désactivable : oui / non, pourquoi
7. Maintenance à 12 mois : …

### Sécurité
Règles modifiées : … / Tests ajoutés : …

### Vérification UI & Responsive
Parcours testé (390 px / 820 px / 1 440 px) : …

### Écarts avec le brief
<ce que j'ai fait différemment, et pourquoi>

### Points à valider par un humain
- …
```

---

## 8. Décisions actées et questions ouvertes

### 8.1 Décisions déjà tranchées par le Product Owner (à appliquer directement)

| # | Sujet | Décision |
|---|---|---|
| D1 | Profil `hotel` distinct de `restaurant` ? | **Non.** On garde le profil technique `restaurant` (affiché « Restaurant & Hôtellerie » dans l'UI). Pas de nouveau `OrgProfile`. |
| D2 | Activation des modules et création d'organisation ? | En **mode démo** (`isDemo == true` ou `localStorage`), le `owner` peut modifier `modules` et `profile` dans `Settings.tsx`. En **production** (`isDemo == false`), seule la plateforme (`PlatformAdmin`) peut modifier `modules` et `profile`. |
| D3 | Rôle `staff` sur `partners` et clôture d'inventaire ? | **Non.** `staff` ne peut ni créer ni modifier de `partners`. Sur `inventories`, `staff` peut compter (saisir les lignes), mais seuls `sommelier`, `manager` et `owner` peuvent clôturer/valider l'inventaire. |
| D4 | Rôle `staff` sur les flacons d'exception (`bottles`) ? | **Oui uniquement pour le service** (passer un flacon au statut « servi » avec mouvement associé). Création et modification des métadonnées réservées à `['owner', 'manager', 'sommelier']`. Suppression interdite pour tous (`allow delete: if false`). |
| D5 | Journal des accès (`auditLog`), auto-join par domaine et bouton Microsoft ? | **Reportés hors du Lot 2** (Lot 7 conditionnel). On garde le Lot 2 focalisé sur `status`, `siteIds` et `expiresAt` sur les membres et invitations. |
| D6 | Option A (`StockLevel`) ou Option B (`siteOffers`) pour les paramètres par lieu ? | **Option A (`StockLevel`) retenue** par défaut. Ne proposer l'Option B dans l'audit que si une incompatibilité technique bloquante est démontrée dans `src/data/stock.ts`. |

### 8.2 Questions ouvertes à instruire dans `docs/AUDIT.md`

| # | Question à éclairer par la lecture du code | Impact |
|---|---|---|
| Q7 | Que représente aujourd'hui `qty` pour la raison `verre` dans le module Service (une bouteille ouverte sortie du stock ou un verre servi) ? | Lot 3.2 |
| Q9 | Où et comment est utilisé `three` (visualisation 3D de cave) ? Quel est son poids dans le bundle et est-il chargé en `React.lazy` ? | Lot 5 |
| Q10 | Quelle est la couverture de tests actuelle et faut-il ajouter une config minimale ESLint (`typescript-eslint` + `react-hooks`) ? | Qualité |

---

## 9. Annexes

### 9.1 Glossaire métier

| Terme | Définition |
|---|---|
| **Apogée** | Période pendant laquelle un vin est à son meilleur. Champs `apogeeFrom` et `apogeeTo`. |
| **Au verre** | Vin servi au verre à partir d'une bouteille ouverte (`openBottles`) |
| **BL** | Bon de livraison : il liste les quantités livrées, souvent sans les prix |
| **Ticket Z / État des ventes** | Récapitulatif de clôture de caisse (le rapport des ventes par article sert à décrémenter le stock) |
| **DRM** | Déclaration récapitulative mensuelle à la douane, pour les entrepositaires agréés |
| **FEC** | Fichier des écritures comptables, obligatoire en cas de contrôle fiscal |
| **CBO** | Caisse bois d'origine, qui valorise un flacon |
| **Magnum** | Bouteille de 150 cl (`formatCl: 150`) |
| **Flacon d'exception** | Bouteille suivie à l'unité (`RareBottle`) : numéro, état, provenance |
| **Allocation** | Quantité réservée par un domaine à un client (`WineAllocation`) |

### 9.2 Esquisses de règles Firestore

> **À adapter et tester.** Ce sont des propositions, pas du code validé. Vérifie la syntaxe et le budget d'appels `get()`.

```js
// ---------- Membres actifs (statut et date de fin)
function memberActive(d) {
  return d.get('status', 'active') == 'active'
    && (d.get('expiresAt', 0) == 0 || request.time.toMillis() < d.get('expiresAt', 0));
}
function isMember(orgId) {
  // exists() d'abord : get() n'est évalué que si le document existe (évaluation court-circuit)
  return signedIn() && exists(memberPath(orgId)) && memberActive(get(memberPath(orgId)).data);
}

// ---------- Rang et périmètre
function rank(r) {
  return r == 'owner' ? 5 : r == 'manager' ? 4 : r == 'sommelier' ? 3 : r == 'accountant' ? 2 : 1;
}
function mySiteIds(orgId) {
  return get(memberPath(orgId)).data.get('siteIds', null);
}
// Le périmètre cible doit être inclus dans le mien (null = tous les lieux)
function siteScopeOk(orgId, ids) {
  return mySiteIds(orgId) == null || (ids != null && mySiteIds(orgId).toSet().hasAll(ids.toSet()));
}
function canActOnSite(orgId, siteId) {
  return mySiteIds(orgId) == null || siteId in mySiteIds(orgId);
}

// ---------- Membres : propriétaire protégé, délégation au manager
match /members/{uid} {
  allow read: if isMember(orgId) || isPlatformAdmin();

  allow create: if signedIn() && request.resource.data.uid == uid && (
      // 1. Le créateur devient propriétaire (existant)
      (uid == request.auth.uid && getAfter(orgPath(orgId)).data.ownerUid == uid && request.resource.data.role == 'owner')
      // 2. Invitation consommée par l'invité (existant, enrichi avec siteIds et expiresAt)
      || (uid == request.auth.uid && validInvite(orgId))
    );

  allow update: if request.resource.data.uid == uid && (
      // Chacun peut modifier son nom, sans toucher à son rôle, son statut ni à son périmètre
      (uid == request.auth.uid && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['name']))
      // Le propriétaire gère tout le monde, sauf lui-même (pas d'auto-rétrogradation ni d'auto-désactivation)
      || (hasRole(orgId, ['owner']) && uid != orgDoc(orgId).data.ownerUid)
      // Le manager gère les rangs inférieurs, dans son périmètre, sans pouvoir les promouvoir à son niveau
      || (hasRole(orgId, ['manager'])
          && uid != orgDoc(orgId).data.ownerUid
          && rank(resource.data.role) < 4 && rank(request.resource.data.role) < 4
          && siteScopeOk(orgId, request.resource.data.get('siteIds', null)))
    );

  // On désactive plutôt que de supprimer. Suppression : jamais le propriétaire.
  allow delete: if uid != orgDoc(orgId).data.ownerUid
    && (hasRole(orgId, ['owner']) || (signedIn() && uid == request.auth.uid));
}

// ---------- Invitations par le manager
// Dans match /invites/{email} : ajouter au create/update
//   || (hasRole(orgId, ['manager'])
//       && rank(request.resource.data.role) < 4
//       && siteScopeOk(orgId, request.resource.data.get('siteIds', null)))
// et transmettre siteIds / memberExpiresAt au membre dans validInvite().

// ---------- Mouvements : périmètre par lieu (à ajouter au create existant)
//   && canActOnSite(orgId, request.resource.data.siteId)
//   && (request.resource.data.type != 'transfer' || canActOnSite(orgId, request.resource.data.toSiteId))
//   && (!('source' in request.resource.data) || request.resource.data.source in
//        ['manual','invoice_ai','einvoice','pos_report','inventory','transfer','service','import'])
```

### 9.3 Correspondance avec l'ancienne spécification « Cepia »

| Ancien chantier | Décision dans ce brief |
|---|---|
| 1. Modules par établissement (`enabledModules`, `rbac.ts`, interrupteurs pour le propriétaire) | **Lot 1** : on réutilise `Org.modules` et `registry.ts`, l'activation est réservée à la plateforme en prod (et ouverte au `owner` en démo), les pages sont protégées |
| 2.1 Caves distinctes (`CellarZone`, `transfer_internal`) | **Rejeté** au profit de `Site` et des transferts existants, plus les paramètres par lieu sur `StockLevel` au **Lot 4** |
| 2.2 Multi-établissements (`allowedOrgs`, `stats/summary` côté client, transferts entre établissements) | **Lot 7.3**, à démarrer seulement avec un deuxième établissement juridique, et calculé côté serveur |
| 3.1 Entrées par IA | **Lot 6.2** : amélioration de l'existant (confiance, écart de prix, BL) |
| 3.2 Sorties par IA (ticket / rapport de ventes) | **Lot 6.3** (correspondance des libellés via `posAliases`) puis **6.4** (photo/import du rapport de ventes ou feuille de sortie) |
| 4. Menu du chef et accords | **Lot 7.2**, conditionnel, avec des menus par lieu et sans écriture dans `technicalSheet` |
| 5.1 Mouvements non modifiables | **Déjà en place**, plus le contrôle de cohérence `reconcileStock` au **Lot 0.2** |
| 5.2 Protection des prix d'achat | **Déjà en place** (`wineCosts`, `movementCosts`), à vérifier dans l'audit (A6) |
| 5.3 `performedBy` et `source` | `userId` et `userName` existent ; `source` est ajouté au **Lot 3.1** |
| 5.4 Export de secours | Les exports existent ; les vraies sauvegardes GCP/Firestore se configurent dans la console (**Lot 0.6**, `OPERATIONS.md`) |

### 9.4 Prompt de démarrage pour l'agent

```text
Lis entièrement docs/EVOLUTION_BRIEF.md, puis docs/ARCHITECTURE.md, README.md et firestore.rules.
Exécute uniquement la Phase 0 (§4) : produis docs/AUDIT.md selon la structure du §4.E.
Pour l'audit UX (§4.C), procède uniquement par lecture statique des composants dans src/pages, src/modules et src/ui sans lancer de navigateur pour prendre des captures d'écran.
Ne modifie aucun comportement de l'application. Sois critique : signale ce qui, dans le brief, est inutile, faux, redondant ou trop lourd au regard du code réel, et propose plus simple.
Termine par les réponses aux questions Q7, Q9 et Q10 (§8.2), puis arrête-toi et attends ma validation.
```