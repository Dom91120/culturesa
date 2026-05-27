# CultuRésa — Checklist de déploiement production

Document destiné à l'administrateur réseau pour une mise en prod propre.

## 0. Prérequis serveur

- **OS** : Linux récent (Ubuntu 24.04 LTS, Debian 12, ou équivalent)
- **PHP** : 8.3+ avec extensions `pdo_mysql`, `mbstring`, `openssl`, `json`, `intl`
- **MySQL** : 8.0+ (testé sur 8.4) ou MariaDB 11+
- **Composer** (pour installer PHPMailer)
- **Reverse proxy** : Nginx ou Apache 2.4+
- **Certbot** (Let's Encrypt) pour HTTPS

## 1. Récupération du code

```bash
cd /var/www
git clone https://github.com/Dom91120/repo.git culturesa
cd culturesa
composer install --no-dev --optimize-autoloader
```

## 2. Configuration de la base

```bash
# Créer la base et un user dédié
mysql -u root -p <<'EOF'
CREATE DATABASE culturesa CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'culturesa_app'@'localhost' IDENTIFIED BY '<MOT_DE_PASSE_FORT>';
GRANT SELECT, INSERT, UPDATE, DELETE ON culturesa.* TO 'culturesa_app'@'localhost';
GRANT CREATE, ALTER, DROP, INDEX, REFERENCES ON culturesa.* TO 'culturesa_app'@'localhost'; -- pour les migrations futures
FLUSH PRIVILEGES;
EOF

# Schéma initial
mysql -u root -p culturesa < install/culturesa.sql
```

## 3. Configuration applicative

```bash
cp includes/config.example.php includes/config.php
chmod 600 includes/config.php
chown www-data:www-data includes/config.php
```

Ce fichier lit ses valeurs sensibles depuis `getenv()`. Injecter les variables dans l'environnement PHP-FPM **ou** modifier directement le fichier (moins propre, mais OK pour démarrer).

Variables minimales à fournir (cf. `docs/ENV.md` pour le détail complet) :

```bash
DB_HOST=localhost
DB_NAME=culturesa
DB_USER=culturesa_app
DB_PASS=<MOT_DE_PASSE_FORT>
BASE_PATH=                          # vide si servi à la racine du domaine
TZ=Europe/Paris
APP_DEBUG=0                         # surtout pas '1' en prod
```

Via systemd (`/etc/systemd/system/php8.3-fpm.service.d/override.conf`) :

```ini
[Service]
Environment="DB_HOST=localhost"
Environment="DB_NAME=culturesa"
Environment="DB_USER=culturesa_app"
Environment="DB_PASS=<MOT_DE_PASSE_FORT>"
Environment="BASE_PATH="
Environment="TZ=Europe/Paris"
Environment="APP_DEBUG=0"
```

Puis : `systemctl daemon-reload && systemctl restart php8.3-fpm`.

## 4. HTTPS + reverse proxy

```bash
# Let's Encrypt + nginx (exemple Ubuntu/Debian)
apt install -y certbot python3-certbot-nginx
certbot --nginx -d culturesa.example.fr
# Renouvellement auto déjà configuré via /etc/cron.d/certbot
```

Conf nginx : voir `docs/CSP.md` pour les headers de sécurité à ajouter dans le `server { }`.

## 5. Configuration mail (SMTP)

**Pas en env vars**, géré via l'interface admin :
1. Connexion en admin sur la nouvelle instance
2. Paramètres → Configuration des e-mails
3. Renseigner host / port / username / password / from
4. Bouton "Envoyer un mail de test" pour valider

Si le serveur d'envoi est en TLS, ouvrir le port sortant (587 ou 465) dans le firewall :

```bash
ufw allow out 587/tcp
```

## 6. Cron jobs

Cf. `docs/ENV.md` section "Cron à mettre en place". Au minimum :

```cron
*/15 * * * * /usr/bin/php /var/www/culturesa/scripts/auto_validate_bookings.php >> /var/log/culturesa/auto_validate.log 2>&1
0 3 * * *   mysqldump -u backup_user --single-transaction --quick culturesa | gzip > /var/backups/culturesa/culturesa_$(date +\%Y\%m\%d).sql.gz
0 4 * * *   find /var/backups/culturesa -name 'culturesa_*.sql.gz' -mtime +30 -delete
```

(Adapter au besoin avec chiffrement GPG pour les backups, cf. ENV.md.)

## 7. Headers HTTP de sécurité

Cf. `docs/CSP.md`. Inclure dans le vhost nginx :

- `Content-Security-Policy` (d'abord en `Report-Only` une semaine, puis enforcing)
- `Strict-Transport-Security` (HSTS, **après** vérif que HTTPS marche)
- `X-Content-Type-Options`
- `X-Frame-Options`
- `Referrer-Policy`
- `Permissions-Policy`

## 8. Firewall + fail2ban

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp     # SSH
ufw allow 80/tcp     # HTTP (Let's Encrypt + redirect)
ufw allow 443/tcp    # HTTPS
ufw enable

apt install -y fail2ban
# Activer les jails par défaut : sshd, nginx-http-auth, nginx-noscript, nginx-badbots
systemctl enable --now fail2ban
```

## 9. Hardening SSH

Dans `/etc/ssh/sshd_config` :
- `PermitRootLogin no`
- `PasswordAuthentication no` (clé uniquement)
- `Port` : changer le port standard pour réduire les scans
- `AllowUsers <user_admin>` (whitelist)

Recharger : `systemctl restart sshd`.

## 10. Monitoring

Au minimum :
- **UptimeRobot** (gratuit) : ping toutes les 5 min sur `https://culturesa.example.fr` avec alerting mail/SMS
- **Sentry** (optionnel mais utile) : tracking erreurs PHP+JS

## 11. Premier compte admin

À créer manuellement après installation. L'inscription publique nécessite un email de confirmation et donne `role='utilisateur'`. Pour avoir un admin :

```sql
-- Soit promouvoir un compte existant
UPDATE users SET role='administrateur' WHERE email='ton.admin@example.fr';

-- Soit insérer directement (mot de passe hashé via password_hash en PHP)
-- → plus simple : passer par l'inscription, confirmer l'email, puis SQL UPDATE
```

## 12. Tests de bon fonctionnement

- [ ] HTTPS répond, redirection HTTP → HTTPS active
- [ ] Login admin OK
- [ ] Création d'une réservation utilisateur OK
- [ ] Bouton "Envoyer mail de test" reçoit bien le mail
- [ ] Validation d'une réservation par admin → mail à l'user reçu
- [ ] `securityheaders.com` retourne au moins A
- [ ] `auto_validate_bookings.php` tourne sans erreur (`php scripts/auto_validate_bookings.php` en CLI)
- [ ] Tentative de 6 logins ratés → message "Trop de tentatives" (rate limiting)
- [ ] Backup mysqldump tourne dans le cron quotidien
- [ ] **Restaurer un backup sur un environnement de staging** au moins une fois (sinon les backups ne servent à rien)
