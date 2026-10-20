# Guide de Démonstration Commerciale & Procédures Firebase — Loul's & Thos

Ce document présente l'organisation des démonstrations commerciales pour les 4 profils de prospects cibles, les comptes de démonstration prêts à l'emploi, les scénarios de démonstration de 15 minutes, l'utilisation du générateur de démo prospect, et les étapes de configuration manuelle dans la console Firebase.

---

## 1. Typologies de prospects et comptes de démonstration

Chaque typologie dispose d'un modèle prédéfini avec données réalistes et cohérentes sur 12 mois, et d'une segmentation stricte des rôles :

### 1.1 Maison de négoce — « Maison Bertrand & Fils » (Beaune)
- **Positionnement** : Achat en gros, stockage sous douane, catalogue étendu, devis, factures, relances d'impayés, offres commerciales partagées par lien, comptabilité & TVA.
- **Comptes de démonstration** :
  - **Propriétaire** : `pierre.bertrand@bertrand-vins.example` (Rôle : `owner`) — Accès complet.
  - **Responsable des ventes** : `sophie.dubois@bertrand-vins.example` (Rôle : `manager`) — Devis, factures, catalogue, stock.
  - **Comptable** : `luc.martin@bertrand-vins.example` (Rôle : `accountant`) — Facturation, TVA, journal, DRM douanière, export FEC.
  - **Opérateur de chai** : `julien.faure@bertrand-vins.example` (Rôle : `staff`) — Mouvements d'entrées/sorties, inventaire mobile. *Aucun accès aux prix de vente ni aux marges financières*.

### 1.2 Négociant indépendant sans boutique — « Cave Itinérante — Claire Martin »
- **Positionnement** : Activité nomade, utilisation mobile/tablette prioritaire, devis rapides sur le terrain, dépôt-vente chez des partenaires restaurateurs, offres clients instantanées par lien public.
- **Comptes de démonstration** :
  - **Propriétaire** : `claire.martin@cave-itinerante.example` (Rôle : `owner`)
  - **Assistant commercial** : `thomas.morel@cave-itinerante.example` (Rôle : `staff`)

### 1.3 Palace & restaurant gastronomique — « Le Grand Palais » (Paris)
- **Positionnement** : Établissement de prestige, charte graphique sur mesure (marque blanche « Palace »), carte des vins interactive multilingue (FR, EN, IT) accessible par QR code sur table, sommelier IA d'accords mets-vins, mode service en salle, gestion des bouteilles ouvertes et verres servis, photos haute définition du catalogue.
- **Comptes de démonstration** :
  - **Direction de la restauration** : `direction@legrandpalais.example` (Rôle : `owner`)
  - **Chef Sommelier** : `sommelier@legrandpalais.example` (Rôle : `sommelier`) — Gestion des cartes, fiches techniques, achats, photos, sommellerie IA.
  - **Équipe de salle** : `service@legrandpalais.example` (Rôle : `staff`) — Tablette de service, verres servis, inventaire. *Pas de vue sur les marges*.

### 1.4 Chaîne & groupe — « Groupe Riviera Hôtels » (Paris & Annecy)
- **Positionnement** : Groupe multi-établissements (3 sites : Palace Paris, Hôtel du Lac, Bar Lounge), transferts de stock inter-sites, consolidation du stock global, une carte des vins dédiée par établissement.
- **Comptes de démonstration** :
  - **Direction Générale** : `direction@riviera-hotels.example` (Rôle : `owner`)
  - **Directeur des Achats Groupe** : `achats@riviera-hotels.example` (Rôle : `manager`)
  - **Direction Financière** : `finance@riviera-hotels.example` (Rôle : `accountant`)

---

## 2. Scénarios de démonstration (15 minutes)

### Scénario A : Le Palace / Restaurant Gastronomique (15 min)
1. **00:00 - 03:00 : Accueil & Marque Blanche**  
   Ouvrir l'application sur la tablette ou l'écran. Montrer l'adaptation visuelle automatique (palette ivoire / or bordeaux, typographie Cormorant, logo de l'établissement).
2. **03:00 - 06:00 : La Carte des Vins Vivante & le QR Code**  
   Aller dans « Carte des vins ». Montrer le QR code de table. Flasher ou ouvrir le lien public (`/p/{id}`) en simulant un client. Montrer le basculement FR/EN/IT instantané.
3. **06:00 - 09:00 : Le Sommelier IA d'accords mets-vins**  
   Sur la carte publique, poser une question au sommelier virtuel : *« Quel vin blanc conseilleriez-vous avec un turbot rôti au beurre noisette ? »*. Montrer la recommandation précise issue uniquement de la cave du restaurant.
4. **09:00 - 12:00 : Le Mode Service en Salle**  
   Basculer sur le compte sommelier ou staff et ouvrir « Service & au verre ». Montrer la gestion des bouteilles ouvertes, la contenance restante, et le décompte automatique des verres servis en salle.
5. **12:00 - 15:00 : Pilotage & Réception de factures par IA**  
   Aller dans « Achats », glisser une facture fournisseur PDF/image : l'IA extrait les références, millésimes, volumes et prix, et met à jour les stocks de façon atomique.

### Scénario B : La Maison de Négoce (15 min)
1. **00:00 - 04:00 : Catalogue & Stock multi-sites**  
   Recherche rapide (⌘K), vision consolidée du stock disponible, réservé et en dépôt-vente.
2. **04:00 - 08:00 : Cycle de Vente & Devis instantané**  
   Créer un devis client dans « Ventes & négoce » : sélection du client, calcul automatique des marges et remises, numérotation transactionnelle continue (sans trou ni doublon).
3. **08:00 - 11:00 : Offres clients par lien public**  
   Partager une offre de vins rares par lien public (`/o/{id}`) : le client consulte l'offre sans voir ni les prix d'achat ni le stock total de la maison.
4. **11:00 - 15:00 : TVA, DRM Douanière et Export comptable FEC**  
   Montrer le registre de douane (DRM), les déclarations de TVA et l'export normalisé FEC en un clic pour l'expert-comptable.

---

## 3. Générateur de démo prospect (Console Plateforme)

Accessible aux utilisateurs disposant du droit plateforme (`isPlatformAdmin` ou mode démo) via le menu **« Console Plateforme »** (`/plateforme`) :

1. Cliquer sur **« Créer une démo prospect »**.
2. Renseigner :
   - **Nom de l'entreprise ou de l'établissement prospect** (ex. *Hôtel Martinez Cannes*).
   - **Typologie / Profil métier** (Restaurant, Négoce, Indépendant ou Chaîne).
   - **Couleur d'accentuation** (ou teinte de leur charte).
   - **Email du prospect** (destinataire de l'invitation).
   - **Durée de validité** (par défaut 30 jours).
3. Cliquer sur **« Créer la démo »** :
   - Une organisation dédiée est provisionnée et initialisée avec le jeu de données du modèle correspondant.
   - Les comptes de démonstration par rôle sont automatiquement créés.
   - Un lien d'invitation sécurisé unique (valable 7 jours) avec le rôle Propriétaire est généré et copié dans le presse-papiers.
   - Transmettre ce lien au prospect par e-mail ou messagerie.

### Réinitialisation et gestion du cycle de vie
- **Réinitialisation manuelle** : Depuis la console plateforme ou les réglages, cliquer sur « Réinitialiser la démo » pour restaurer le jeu de données d'origine.
- **Prolongation** : Bouton « Prolonger de 30 jours » sur la fiche de l'organisation dans la console.
- **Expiration** : À l'issue des 30 jours, l'organisation passe en lecture seule, puis peut être supprimée après confirmation.

---

## 4. Configuration manuelle requise dans la Console Firebase

Pour passer de l'environnement de développement AI Studio à un projet Firebase de production réel, voici la liste exhaustive des étapes à configurer dans la console Google Firebase ([console.firebase.google.com](https://console.firebase.google.com)) :

### 4.1 Authentification (Firebase Authentication)
1. **Activer Google Sign-In** :
   - Aller dans *Authentication* > *Sign-in method*.
   - Activer le fournisseur **Google**, sélectionner l'e-mail d'assistance du projet.
2. **Activer Email / Mot de passe** :
   - Activer le fournisseur **Adresse e-mail/Mot de passe**.
   - Activer l'option « Lien pour la réinitialisation du mot de passe ».
3. **Double authentification TOTP (2FA)** :
   - Dans Firebase console > *Authentication* > *Paramètres* > *MFA / Double authentification* (ou Google Cloud Identity Platform) :
   - Activer la vérification en 2 étapes par application d'authentification (TOTP Google Authenticator / Microsoft Authenticator).

### 4.2 Base de données (Cloud Firestore)
1. Créer la base de données Firestore en mode **Production** (Europe de l'Ouest : `europe-west1` ou `europe-west9`).
2. Déployer les règles de sécurité depuis le dépôt :
   ```bash
   firebase deploy --only firestore:rules
   ```
3. Déployer les index composites :
   ```bash
   firebase deploy --only firestore:indexes
   ```

### 4.3 Stockage de fichiers (Cloud Storage)
1. Activer **Cloud Storage** dans la région correspondant à Firestore.
2. Déployer les règles de stockage :
   ```bash
   firebase deploy --only storage
   ```

### 4.4 Attribution du rôle Plateforme Admin
Pour attribuer le custom claim `platformAdmin` au compte commercial ou support principal :
Exécuter via le script admin ou le CLI Firebase Functions :
```javascript
admin.auth().setCustomUserClaims('<UID_ADMIN>', { platformAdmin: true });
```

### 4.5 Extension d'envoi d'emails (Optionnel)
Pour envoyer automatiquement les invitations par e-mail sans lien copié manuel :
- Installer l'extension Firebase **Trigger Email from Firestore** (`firestore-send-email`).
- Pointer sur la collection `mail` ou `orgs/{orgId}/invites`.
- Renseigner le serveur SMTP (ex. Sendgrid, Resend ou Google Workspace SMTP).
