# Structuration des Caves Multi-Sites & Plan Visuel Interactif de Rangement

Système complet de repérage et de rangement des bouteilles par site, combinant une saisie rapide au quotidien et un plan de cave interactif 2D avec configurateur ultra-simple (casiers matriciels, armoires à vin avec clayettes en quinconce et double rangée avant/arrière).

### User Review & Critical Decisions

> [!IMPORTANT]
> **Garantie d'intégration sans régression & Ergonomie UX/UI** :
> 1. **Intégration 100% non destructive** : L'existant repose déjà sur `StockLevel.bin` (`bin?: string`). Aucun schéma n'est cassé, aucun module tiers n'est impacté (Achats, Facturation, Négoce, Verre au vin, Compta et Exports CSV fonctionnent exactement à l'identique). Le nouveau schéma `SiteLayout` est purement additif et optionnel sur chaque `Site`.
> 2. **Ergonomie & Best Practices UX/UI** :
>    - *Zéro friction au quotidien* : Saisie directe inline de l'emplacement (autocomplétion intelligente des casiers configurés ou texte libre).
>    - *Plan de cave réactif & tactile* : Visualiseur vectoriel ultra-lisible (sans 3D lourde), avec sélecteur de rangée avant/arrière en 1 clic, visualisation nette des quinconces pyramidaux, et infobulles d'action directe (servir/consommer une bouteille sans quitter le plan).
>    - *Assistant de création en 3 étapes simples* : Presets prêts à l'emploi (Armoire EuroCave, Étagère casiers bois, Zone vrac) avec aperçu interactif en direct.

- **Décision confirmée 1 (Double modalité fluide)** : Édition inline instantanée dans la liste et le tiroir de stock + nouvel onglet dédié « Plan de cave » dans la page Stock (`Niveaux` | `Plan de cave` | `Journal`).
- **Décision confirmée 2 (Formats de rangement & Quinconce)** : Prise en charge des casiers matriciels réguliers et des clayettes coulissantes en quinconce (décalage physique d'une demi-bouteille avec une place de moins sur le rang supérieur) avec bascule limpide « Rangée Avant / Rangée Arrière ».
- **Décision confirmée 3 (Zéro complexité technique pour l'utilisateur)** : Modèles préconfigurés de meubles avec nommage automatique des alvéoles (ex: `A1`, `B3`, ou `C1-AV`, `C1-AR`).

---

### 1. Overview & Core Concept

- **Ce que fait la fonctionnalité** : 
  Permet à chaque établissement de structurer visuellement chaque site de stockage (Cave voûtée, Réserve de service, Armoire de dégustation, Boutique) en meubles et clayettes, et de savoir exactement où chaque bouteille est posée.
- **Pour qui** :
  - **Sommelier / Serveur en service** : Trouver la bouteille commandée en 3 secondes grâce au repérage visuel précis de l'étagère et du rang (avant ou arrière).
  - **Gestionnaire / Caviste** : Réaliser des inventaires partiels meuble par meuble sans recompter toute la cave.
  - **Amateur éclairé / Particulier** : Gérer des armoires denses avec clayettes en quinconce sans devoir déplacer 12 bouteilles pour savoir ce qui est stocké au fond.
- **Bénéfice clé** :
  Ergonomie totale, zéro formation requise, aucune perturbation des habitudes actuelles.

---

### 2. User Experience & Visual Design

#### A. Principes d'Ergonomie & Best Practices UX
- **Loi de Hick & Zéro surcharge cognitive** : L'utilisateur n'est jamais confronté à un formulaire complexe. Chaque vue a un but unique.
- **Feedback d'action immédiat (<100ms)** : Chaque clic (sélection d'alvéole, changement de rangée avant/arrière, attribution de bouteille) s'exécute instantanément sans rechargement.
- **Affordance claire et sans piège** :
  - Cases vides : fond pointillé léger avec icône discrète `+` invitant à ranger un vin.
  - Cases occupées : couleur de la capsule/vin, nom du domaine, millésime et jauge de bouteilles restantes bien visible.
- **Gestion intuitive de la double profondeur (Avant / Arrière)** :
  - Bascule tactile à deux segments `[ Rangée Avant ]` / `[ Rangée Arrière ]` au-dessus de la clayette.
  - Indicateur visuel discret sur la rangée avant indiquant si des bouteilles sont stockées derrière ("+3 bouteilles en rangée arrière").

#### B. Parcours Utilisateur Détaillés

1. **Parcours Saisie Rapide (dans la liste de stock)** :
   - Dans le tableau des stocks, la colonne « Emplacement » affiche le code (ex: `Armoire 1 · C2-AV`).
   - Clic sur l'emplacement : ouverture d'un **Popover Inline** :
     - Liste déroulante des casiers configurés sur le site avec leur taux de remplissage.
     - Option de saisie libre (pour ceux qui veulent juste taper `Étagère fond droite`).
     - Validation immédiate avec notification discrète (Toast).
2. **Parcours Navigation dans le Plan de Cave** :
   - Onglet `Plan de cave` dans la page Stock.
   - Sélecteur de site en haut (Cave principale, Bar, Réserve...).
   - Vue en grille des meubles : cartes épurées présentant chaque meuble avec son icône, son nombre d'étages et sa jauge de capacité (ex: `38 / 48 bouteilles · 79%`).
   - Clic sur un meuble : ouverture plein écran élégante de la clayette/du rack.
3. **Parcours Interaction sur la Clayette / Meuble** :
   - Représentation réaliste des alvéoles :
     * Si casier régulier : grille propre alignée.
     * Si clayette en quinconce : rangées imbriquées avec décalage géométrique naturel d'une demi-bouteille.
   - Survol / Clic sur une bouteille : **Carte d'action flottante** :
     * Miniature de l'étiquette & domaine.
     * Nom, millésime, format (75 cl, Magnum).
     * Quantité dans cette alvéole / Stock total.
     * Boutons d'action directs : `Sortir 1 bouteille` (ouvre le modal mouvement pré-rempli) | `Déplacer` | `Fiche vin`.
   - Clic sur une alvéole vide : sélecteur de vin rapide parmi les bouteilles du site sans emplacement.
4. **Parcours Création de Meuble (Configurateur express en 3 clics)** :
   - Bouton « + Nouveau meuble » dans le plan de cave.
   - Choix du type avec illustration visuelle :
     * 🍷 **Armoire à vin / Clayette coulissante** (options quinconce & double rangée activables d'un simple toggle).
     * 🔲 **Casier matriciel / Étagère bois** (colonnes x rangées, idéal alvéoles individuelles ou casiers de 6).
     * 📦 **Zone palettes / Vrac** (stockage par cartons ou caisses).
   - Curseurs simples pour ajuster les dimensions avec **Aperçu visuel interactif en temps réel** dans la modale.
   - Génération automatique des identifiants (`A1`, `A2`...). Enregistrement immédiat.

#### C. Tokens & Hiérarchie Visuelle (Design Constitution)
- **Palette** : 
  - Fond `bg-surface-2/40` avec bordures ultra-fines `border-border/70`.
  - Pas de badges pilules superflus, typographie propre avec séparateurs typographiques discrets (`·`).
  - Codes couleur vin cohérents :
    * Rouge : `bg-rose-950/20 text-rose-300 border-rose-800/40`
    * Blanc : `bg-amber-950/20 text-amber-300 border-amber-700/40`
    * Rosé : `bg-pink-950/20 text-pink-300 border-pink-800/40`
    * Bulles : `bg-yellow-950/20 text-yellow-300 border-yellow-700/40`
- **Typographie** :
  - Coordonnées et jauges numériques en `tabular-nums font-mono`.

---

### 3. Key Product Decisions & Trade-Offs

- **Compatibilité Totale avec le Codebase Existant** :
  - *Choix retenu* : Le champ `StockLevel.bin` reste la clé de voûte universelle de stockage.
  - *Pourquoi* : Zéro migration de données, zéro régression sur les filtres, le tri, les exports CSV, les mouvements d'achats/ventes, et la démo existante.
  - *Alternative écartée* : Créer une collection de base de données séparée pour chaque bouteille individuelle ("bottle-by-bottle tracking"), qui aurait alourdi inutilement le système et ralenti le chargement.
- **Rendu Visuel 2D Vectoriel Isométrique vs 3D Three.js** :
  - *Choix retenu* : Rendu vectoriel SVG + Flexbox/CSS Grid réactif.
  - *Pourquoi* : Ultra-rapide (<50ms de rendu), parfaitement tactile sur smartphone et tablette en sous-sol de cave, lisible sans avoir à manipuler une caméra 3D complexe.
- **Gestion du Quinconce & Double Profondeur** :
  - *Choix retenu* : Calcul mathématique des coordonnées avec suffixe propre (ex: `ARM1-R2-03-AV` pour Meuble ARM1, Rangée 2, Colonne 3, Rang Avant) et bascule d'affichage claire `Avant / Arrière`.
  - *Pourquoi* : Très facile à comprendre pour un utilisateur non initié, tout en modélisant fidèlement la physique d'une armoire de vieillissement.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

#### Schéma d'Architecture & Flux de Données

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                StockPage                                    │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ Tabs: [ Niveaux (Tableau) ]  [ Plan de Cave (Visuel) ]  [ Journal ]  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│                             CellarPlanView                                  │
│        ┌─────────────────────────────┴─────────────────────────────┐        │
│        ▼                                                           ▼        │
│  RackOverviewGrid (Liste des meubles du site)          RackDetailModal      │
│   ├── Jauge d'occupation (%)                            ├── Visualiseur     │
│   ├── Bouton "+ Ajouter un meuble"                      │    ├── Quinconce  │
│   └── Actions (Renommer, Supprimer meuble)              │    └── Av / Ar    │
│                                                         └── SlotPopover     │
│                                                              ├── Affecter   │
│                                                              └── Consommer  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                    Modèle de Données (Types & Firestore)                    │
│                                                                             │
│  Site (src/types.ts)                                                        │
│   └── layout?: SiteLayout {                                                 │
│         racks: CellarRack[] (géométrie, dimensions, quinconce, doubleProf)  │
│       }                                                                     │
│                                                                             │
│  StockLevel (src/types.ts) [INCHANGÉ & 100% COMPATIBLE]                     │
│   ├── id: `${wineId}__${siteId}`                                            │
│   ├── wineId: string                                                        │
│   ├── siteId: string                                                        │
│   ├── qty: number                                                           │
│   └── bin?: string (ex: "A-01", "C2-AV", etc.)                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Fichiers Modifiés et Nouveaux Composants
1. `src/types.ts` :
   - Ajout des interfaces `CellarRack`, `RackGeometry` (`'matrix' | 'staggered_shelf' | 'bulk'`), et `SiteLayout`.
   - Maintien rigoureux de tous les types existants (`Site`, `StockLevel`, `Movement`).
2. `src/pages/stock/CellarPlan.tsx` :
   - Composant principal de la vue plan de cave, gérant l'exploration des meubles du site actif.
3. `src/pages/stock/RackDetailView.tsx` :
   - Rendu visuel d'un meuble avec grille régulière ou clayettes en quinconce, sélecteur Avant/Arrière, et interactions d'attribution.
4. `src/pages/stock/RackConfigModal.tsx` :
   - Modale guidée en 3 clics avec prévisualisation dynamique en temps réel.
5. `src/pages/stock/QuickBinPopover.tsx` :
   - Éditeur inline discret pour affecter ou modifier l'emplacement directement depuis la table de stock ou la fiche vin sans ouvrir le grand plan.
6. `src/pages/Stock.tsx` & `src/pages/wines/WineDrawer.tsx` :
   - Intégration naturelle du 3ème onglet `Plan de cave` dans `Stock.tsx`.
   - Remplacement du texte statique d'emplacement dans `WineDrawer.tsx` par le bouton d'édition rapide cliquable.
7. `src/data/demo.ts` :
   - Enrichissement du site de démonstration avec une configuration de cave modèle (1 armoire de vieillissement en quinconce double rangée + 1 casier matriciel traditionnel).
