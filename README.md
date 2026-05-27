# CultuRésa — Application LAMP

Système de réservation de créneaux culturels (sorties scolaires, ateliers, visites…).
Converti depuis la version HTML autonome (localStorage) vers une architecture LAMP complète.

---

## Structure des fichiers

```
culturesa/
├── index.php               ← Page principale (SPA)
├── .htaccess               ← Config Apache (sécurité, cache, compression)
├── api/
│   ├── auth.php            ← Connexion, inscription, profil, mot de passe
│   ├── bookings.php        ← Réservations (CRUD + comptage)
│   ├── export.php          ← Export CSV Excel-compatible
│   ├── services.php        ← Gestion des services (activités)
│   ├── slots.php           ← Gestion des créneaux horaires
│   ├── stats.php           ← Statistiques dashboard
│   └── users.php           ← Gestion des comptes (admin)
├── includes/
│   ├── api.php             ← Helpers JSON, CORS, guards auth
│   ├── auth.php            ← Logique auth (login/register/sessions)
│   ├── config.example.php  ← Modèle de configuration
│   ├── config.php          ← ← À CRÉER (voir installation)
│   └── db.php              ← Singleton PDO
├── public/
│   ├── css/app.css         ← Feuille de style
│   └── js/app.js           ← JavaScript frontend
└── install/
    ├── index.php           ← Assistant d'installation web
    └── culturesa.sql        ← Schéma de base de données
```

---

## Installation rapide

### Option A — Via l'assistant web

1. Déposez les fichiers sur votre serveur LAMP
2. Ouvrez `http://votre-domaine/culturesa/install/` dans un navigateur
3. Remplissez les paramètres DB et le compte admin
4. Cliquez sur **Installer**
5. **Supprimez ou protégez le dossier `install/`**

### Option B — Manuelle

1. **Créer la base de données MySQL :**
   ```sql
   CREATE DATABASE culturesa CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

2. **Importer le schéma :**
   ```bash
   mysql -u root -p culturesa < install/culturesa.sql
   ```

3. **Configurer la connexion :**
   ```bash
   cp includes/config.example.php includes/config.php
   # Éditez includes/config.php avec vos paramètres
   ```

4. **Créer le compte administrateur :**
   ```sql
   UPDATE users
   SET password = '$2y$12$VOTRE_HASH_ICI'
   WHERE email = 'admin@culturesa.fr';
   ```
   Générer un hash PHP : `php -r "echo password_hash('VotreMotDePasse', PASSWORD_DEFAULT);"`

5. **Protéger le dossier install/ :**
   ```bash
   rm -rf install/
   # ou ajouter dans install/.htaccess : Require all denied
   ```

---

## Configuration Apache (VirtualHost)

```apache
<VirtualHost *:80>
    ServerName culturesa.exemple.fr
    DocumentRoot /var/www/culturesa

    <Directory /var/www/culturesa>
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog  ${APACHE_LOG_DIR}/culturesa_error.log
    CustomLog ${APACHE_LOG_DIR}/culturesa_access.log combined
</VirtualHost>
```

Activer mod_rewrite et mod_headers :
```bash
a2enmod rewrite headers deflate expires
systemctl restart apache2
```

---

## Compte par défaut

Après installation via l'assistant :
- **Email :** celui que vous avez saisi
- **Mot de passe :** celui que vous avez saisi

Après installation manuelle avec le SQL brut :
- **Email :** `admin@culturesa.fr`  
- **Mot de passe :** à définir via hash PHP (voir ci-dessus)

---

## Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| 🔐 Auth sécurisée | Sessions PHP côté serveur (token + cookie httpOnly) |
| 🏷️ Multi-services | Plusieurs activités avec configuration indépendante |
| 📅 Mode récurrent | Créneaux par période (Période 1/2/3 par défaut) × jour de la semaine |
| 📌 Mode ponctuel | Séances avec date spécifique |
| 🎨 Thèmes | Saisie libre du thème par l'enseignant |
| 👥 Rôles | Utilisateur / Gestionnaire / Administrateur |
| 🗓️ Planning | Vue grille admin des inscriptions |
| 📈 Statistiques | Graphiques Chart.js (période, créneau, jour, capacité) |
| 📥 Export CSV | Export Excel-compatible avec BOM UTF-8 |
| ⚙️ Paramètres | Jours, créneaux, capacités, nb max de réservations |
| 🔧 Validation | Mode optionnel de validation admin avant confirmation |
| 🌙 Thème sombre | Mode clair/sombre persisté |

---

## Sécurité

- Mots de passe hashés avec `password_hash()` (bcrypt)
- Sessions stockées en base avec expiration
- Protection CSRF via tokens Bearer
- Headers de sécurité via `.htaccess`
- Requêtes paramétrées PDO (protection injection SQL)
- Accès au dossier `includes/` bloqué depuis le web

---

## Prérequis serveur

- PHP ≥ 7.4 (PHP 8.x recommandé)
- MySQL ≥ 5.7 ou MariaDB ≥ 10.3
- Apache avec `mod_rewrite` activé
- Extensions PHP : `pdo`, `pdo_mysql`, `mbstring`
