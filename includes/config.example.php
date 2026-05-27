<?php
// ============================================================
//  CultuRésa — Configuration applicative (template)
// ============================================================
//  Copiez ce fichier en config.php (déjà gitignored) et adaptez les valeurs.
//
//  En PRODUCTION : laissez les `define` ci-dessous tels quels (ils lisent depuis
//  getenv()). L'administrateur réseau injecte les vraies valeurs via variables
//  d'environnement (systemd, Apache SetEnv, nginx fastcgi_param, Docker…).
//  Voir docs/ENV.md pour la liste exhaustive et les mécanismes d'injection.
//
//  En LOCAL : tu peux soit définir les env vars (.env via phpdotenv, ou export
//  shell), soit hardcoder en remplaçant les fallbacks ci-dessous.
// ============================================================

// Petit helper : lit getenv() avec fallback typé.
$_env = static function(string $key, $default = '') {
    $v = getenv($key);
    if ($v === false || $v === '') return $default;
    return $v;
};

define('DB_HOST',     $_env('DB_HOST',     'localhost'));
define('DB_PORT', (int)$_env('DB_PORT',     3306));
define('DB_NAME',     $_env('DB_NAME',     'culturesa'));
define('DB_USER',     $_env('DB_USER',     'culturesa_user'));
define('DB_PASS',     $_env('DB_PASS',     ''));            // ⚠️ JAMAIS de vrai mot de passe ici en clair
define('DB_CHARSET',  $_env('DB_CHARSET',  'utf8mb4'));

define('SESSION_TTL', (int)$_env('SESSION_TTL', 8 * 3600));
define('BASE_PATH',         $_env('BASE_PATH',  ''));

// Email expéditeur par défaut (peut être surchargé via l'admin UI → app_config).
define('MAIL_FROM',      $_env('MAIL_FROM',      'noreply@culturesa.fr'));
define('MAIL_FROM_NAME', $_env('MAIL_FROM_NAME', 'CultuRésa'));

date_default_timezone_set($_env('TZ', 'Europe/Paris'));

// DEBUG_MODE : `1` / `true` / `yes` / `on` (case-insensitive) → debug actif.
// En prod : laisser vide ou `0`.
$_debug = strtolower((string)$_env('APP_DEBUG', ''));
$_isDebug = in_array($_debug, ['1','true','yes','on'], true);
define('DEBUG_MODE', $_isDebug);

if ($_isDebug) {
    error_reporting(E_ALL);
    ini_set('display_errors', 1);
} else {
    // Les erreurs sont LOGGÉES dans error_log (visible par l'admin / Sentry) mais
    // pas affichées à l'utilisateur. Différence vs ancien comportement
    // `error_reporting(0)` qui supprimait TOUT — on perd alors la trace en prod.
    error_reporting(E_ALL);
    ini_set('display_errors', 0);
    ini_set('log_errors', 1);
}

// DSN Sentry (optionnel) pour le tracking d'erreurs.
define('SENTRY_DSN', $_env('SENTRY_DSN', ''));
