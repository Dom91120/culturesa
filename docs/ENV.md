# CultuRésa — Variables d'environnement

Document destiné à l'administrateur réseau qui déploie CultuRésa en production.

Toutes les valeurs sensibles sont lues par `includes/config.php` via `getenv()`. Elles doivent être injectées dans l'environnement du process PHP (PHP-FPM, mod_php, CLI cron…), **pas dans le code versionné**.

## Mécanismes possibles d'injection

Au choix, selon l'infrastructure :

- **systemd unit** : `Environment="DB_PASS=xxx"` dans le fichier `.service` de PHP-FPM
- **Apache** : `SetEnv DB_PASS xxx` dans le vhost (et `mod_env` chargé)
- **nginx + PHP-FPM** : `fastcgi_param DB_PASS xxx;` dans la conf nginx, OU `env[DB_PASS] = $DB_PASS` dans `www.conf` du pool PHP-FPM
- **Fichier `.env` chargé par phpdotenv** : nécessite `composer require vlucas/phpdotenv` puis chargement explicite dans config.php (NON activé pour l'instant — l'admin peut choisir d'ajouter ça)
- **Docker / docker-compose** : section `environment:` du service PHP

## Variables attendues

| Nom | Type | Obligatoire | Défaut | Description |
|---|---|---|---|---|
| `DB_HOST` | string | recommandé | `localhost` | Hôte MySQL/MariaDB |
| `DB_PORT` | int | non | `3306` | Port MySQL |
| `DB_NAME` | string | recommandé | `culturesa` | Nom de la base |
| `DB_USER` | string | recommandé | `root` | Utilisateur MySQL (**créer un user dédié `culturesa_app` en prod, pas root**) |
| `DB_PASS` | string | **oui en prod** | `''` | Mot de passe MySQL |
| `DB_CHARSET` | string | non | `utf8mb4` | Encodage MySQL |
| `SESSION_TTL` | int (secondes) | non | `28800` (8h) | Durée de vie d'une session |
| `BASE_PATH` | string | non | `/culturesa` | Préfixe d'URL si l'app n'est pas servie à la racine du domaine (ex : `/` si servie à la racine) |
| `TZ` | string | non | `Europe/Paris` | Timezone PHP (`date_default_timezone_set`) |
| `APP_DEBUG` | bool (`1`/`0`) | non | `0` | `1` = affichage des erreurs PHP (dev uniquement). En prod : laisser vide ou `0`. |
| `SENTRY_DSN` | string (URL) | non | `''` | DSN Sentry si l'on active le tracking d'erreurs (cf. integration future) |

## Configuration mail

**Pas dans les env vars.** La config SMTP est gérée via l'interface admin (Paramètres → Configuration des e-mails) et stockée dans la table `app_config` :

| Clé `cfg_key` | Description |
|---|---|
| `mail_driver` | `smtp` ou `mail` |
| `mail_host` | hôte SMTP (ex : `smtp.office365.com`) |
| `mail_port` | port (ex : `587`) |
| `mail_security` | `tls`, `ssl`, ou vide |
| `mail_username` | identifiant SMTP |
| `mail_password` | mot de passe SMTP |
| `mail_from` | adresse expéditeur |
| `mail_from_name` | nom expéditeur |

→ L'admin réseau **n'a rien à faire** pour le mail (sauf ouvrir le port sortant 587/TLS dans le firewall).

## Cron à mettre en place

### 1. Auto-validation des réservations (obligatoire)

Cf. `scripts/auto_validate_bookings.php` — header pour la doc complète :

```cron
*/15 * * * * /usr/bin/php /var/www/culturesa/scripts/auto_validate_bookings.php >> /var/log/culturesa/auto_validate.log 2>&1
```

Le script doit hériter des mêmes env vars que PHP-FPM (`DB_PASS` notamment). Si le cron est lancé par un user différent de PHP-FPM, vérifier que l'environnement est bien propagé (`SystemdEnvFile` ou wrapper script qui source les vars).

### 2. Cleanup auth_attempts (optionnel)

La table `auth_attempts` (rate limiting) s'auto-nettoie ~1% des inserts (DELETE des entrées > 1 jour). Sur un volume très bas (< 100 logins/jour), ce cleanup peut être très rare. Pour garantir une rotation :

```cron
0 4 * * * mysql -u root culturesa -e "DELETE FROM auth_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 1 DAY)" > /dev/null 2>&1
```

Pas critique — la table ne grossira pas plus que quelques milliers de lignes même sans cron.

## Rate limiting des tentatives d'auth

L'application limite automatiquement les tentatives de connexion et de demande de mot de passe oublié pour résister aux attaques brute-force.

| Action | Seuil par email | Seuil par IP | Fenêtre | Lock affiché |
|---|---|---|---|---|
| Login | 5 échecs | 15 échecs | 5 min | 15 min |
| Password reset | 3 demandes | 10 demandes | 10 min | 30 min |

Comportement :
- **Login** : au-delà du seuil, l'utilisateur voit le message "Trop de tentatives de connexion. Réessayez dans X minutes." (HTTP 429). La fenêtre est glissante : le compteur baisse au fur et à mesure que les vieilles tentatives sortent de la fenêtre.
- **Password reset** : au-delà du seuil, l'app **ne renvoie aucune erreur visible** mais n'envoie pas le mail (évite le leak d'info à un attaquant qui scanne les emails).

Aucun service tiers, juste du code PHP + une table `auth_attempts`. Seuils tunables dans `includes/auth.php` (constante `Auth::RATE_LIMIT_CONFIG`) — pas exposés via env var pour rester simples.

## Permissions filesystem

| Chemin | Owner | Mode | Notes |
|---|---|---|---|
| `/var/www/culturesa/*` | `www-data` (lecture) | 644 fichiers, 755 dossiers | code applicatif |
| `/var/www/culturesa/includes/config.php` | `www-data` | **600** | contient potentiellement `SENTRY_DSN`, à protéger |
| `/var/log/culturesa/` | `www-data` (write) | 755 | logs cron + app |
| backups SQL (cf. cron mysqldump) | `root` ou user dédié | 600, hors webroot | jamais accessible depuis le web |

## Backups DB (à coordonner côté infra)

À automatiser via cron, **non versionné dans le code** :

```bash
# Quotidien 3h
0 3 * * * mysqldump -u backup_user --single-transaction --quick culturesa | gzip | gpg --encrypt --recipient backup@chatillon92.fr > /var/backups/culturesa/culturesa_$(date +\%Y\%m\%d).sql.gz.gpg
# Rotation 30 jours
0 4 * * * find /var/backups/culturesa -name 'culturesa_*.sql.gz.gpg' -mtime +30 -delete
```

Tester une restauration **au moins une fois par mois**.
