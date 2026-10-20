# Architecture — Loul's & Thos

Plateforme de gestion de cave / négoce / carte des vins. React 19 + Vite + Tailwind v4 + Firebase (Auth, Firestore) + Express (routes IA Gemini côté serveur). Conçue pour tourner dans **Google AI Studio** (importé depuis GitHub) : `firebase-applet-config.json` est remplacé par AI Studio, la clé `GEMINI_API_KEY` est injectée côté serveur.

## Principes

- **Multi-tenant** : toutes les données métier sont sous `orgs/{orgId}/{collection}/{id}`. Jamais de donnée « globale » hors `users/{uid}`, `orgs/{orgId}` et `public_lists/{publicId}`.
- **Mode démo local** : sans Firebase configuré (ou en mode démo), la même API de données (`src/data/store.ts`) écrit dans `localStorage`. Le code applicatif ne doit **jamais** importer `firebase/firestore` directement : il passe par `useOrg()`, `useCollection()` et `commit(ops)`.
- **Écritures atomiques** : `commit([...ops])` avec `set`, `delete`, `inc` (incrément atomique). Les mouvements de stock se créent uniquement via `buildMovementOps` (`src/data/stock.ts`) : un mouvement immuable + des incréments de `stock/{wineId__siteId}`.
- **Rôles** : `owner > manager > sommelier > accountant > staff`. Voir `src/registry.ts` (`NAV`, accès par module et rôle) ; les règles Firestore (`firestore.rules`) appliquent les mêmes rôles côté serveur.
- **i18n** : FR + EN. `useT()` ; toute chaîne visible passe par `t('cle')`. Chaque lot possède son fichier de messages (`src/i18n/core.ts`, `carte.ts`, `negoce.ts`).
- **Calculs sensibles** (TVA, marges, DRM) : fonctions pures dans des fichiers `*.ts` testables (Vitest, dossier `tests/`), pas dans les composants.

## Carte du code

| Chemin | Rôle |
|---|---|
| `src/types.ts` | Modèle commun (Org, Wine, StockLevel, Movement, Partner, PurchaseInvoice…) |
| `src/lib/wine.ts` | Clé canonique, rapprochement de vins (`findMatches`), format, couleur |
| `src/lib/utils.ts` | Formats (eur, dates), CSV, export, TVA |
| `src/lib/api.ts` | `apiPost` vers `/api/ai/*` (jeton Firebase joint automatiquement) |
| `src/data/store.ts` | Couche de données (Firestore / local), `Op` |
| `src/data/stock.ts` | Mouvements, agrégats, alertes |
| `src/app/org.tsx` | `useOrg()` (org, rôle, sites, vins, stock, partenaires…), `useCollection<T>(name)` |
| `src/ui/index.tsx` | Kit UI (Button, Field, Modal, Tabs, Table, Toast/confirm…) |
| `src/registry.ts` | Navigation, modules, profils |
| `src/pages/*` | Cave & stock (lot 1) |
| `src/modules/carte`, `achats` | Carte des vins intelligente, achats par IA (lot 2) |
| `src/modules/negoce`, `compta`, `pilotage` | Ventes, comptabilité & douane, pilotage (lot 3) |
| `server.ts`, `server/*` | Express, routes IA, protection (`requireUser`) |

## Collections Firestore (sous `orgs/{orgId}/`)

- **Cœur & Stock** : `members`, `invites`, `sites`, `producers`, `wines`, `stock`, `movements`, `partners`, `inventories`, `wineImages` (ou Cloud Storage `orgs/{orgId}/wines/{wineId}`)
- **Carte & Achats** : `wineLists`, `openBottles`, `purchaseInvoices`
- **Négoce, Compta & Pilotage** : `documents`, `payments`, `consignments`, `counters`, `expenses`, `expenseCategories`, `assets`, `drmReports`, `accountingSettings`, `offers`
- **Top-level multi-tenant** :
  - `users/{uid}` : annuaire d'appartenance utilisateur et organisation active
  - `orgs/{orgId}` : métadonnées de l'organisation, profil, modules, charte et expiration
  - `public_lists/{publicId}` : instantané dénormalisé de carte publiée (lecture publique sans prix d'achat ni quantité de stock)
  - `public_offers/{publicId}` : sélection commerciale partagée par lien sécurisé

## Fiabilité transactionnelle & Sécurité

- **Numérotation continue** : `getNextSequence(orgId, counterKey)` utilise `runTransaction` sur `orgs/{orgId}/counters/{cle}` pour garantir une séquence continue sans trou ni doublon.
- **Atomicité des stocks** : `assertStockAvailability` et `firestore.rules` interdisent strictement les stocks négatifs ; mouvements immuables en création seule (`allow update, delete: if false`).
- **Rôle Plateforme** : `platformAdmin` réservé aux administrateurs commerciaux et support via custom claims JWT, donnant accès à `/plateforme` pour provisionner et administrer les démos prospects.
- **Règles Storage** : `storage.rules` restreint les téléversements aux images de moins de 5 Mo pour les membres autorisés de l'organisation.
- **Quotas IA** : contrôlés par organisation côté serveur (500/h client, 30/h démo, 40/h carte publique) avec journalisation sans rétention des contenus.

