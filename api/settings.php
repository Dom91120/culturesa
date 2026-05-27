<?php
// ============================================================
//  CultuRézo — API /api/settings.php  (admin uniquement)
//  GET  ?action=get          → retourne toutes les clés de config
//  POST ?action=save         → enregistre les valeurs de config
//  POST ?action=test_mail    → envoie un e-mail de test
// ============================================================

require_once __DIR__ . '/../includes/api.php';
require_once __DIR__ . '/../includes/mailer.php';

$action = $_GET['action'] ?? get_input()['action'] ?? 'get';
$input  = get_input();

require_admin();

// ── Clés autorisées ──────────────────────────────────────────
const ALLOWED_KEYS = [
    'mail_driver',       // 'smtp' | 'sendmail' | 'mail'
    'mail_host',
    'mail_port',
    'mail_security',     // '' | 'tls' | 'ssl'
    'mail_username',
    'mail_password',
    'mail_from',
    'mail_from_name',
    'debug_mode',        // '0' | '1' — affiche les bandeaux dem-info / dem-info-rec
    'school_zone',       // 'A' | 'B' | 'C' — zone de vacances scolaires
    'show_mirror_slots', // '0' | '1' — afficher les créneaux miroirs dans le tableau Créneaux ponctuels
    'rgpd_retention_years', // entier ≥ 1 — durée d'inactivité au-delà de laquelle un compte est proposé à l'anonymisation (défaut 2)
];

// ── GET ──────────────────────────────────────────────────────
if ($action === 'get') {
    $rows = DB::all("SELECT cfg_key, cfg_value FROM app_config WHERE cfg_key IN ("
        . implode(',', array_fill(0, count(ALLOWED_KEYS), '?'))
        . ")", ALLOWED_KEYS);

    $cfg = [];
    foreach ($rows as $row) {
        $key = $row['cfg_key'];
        $cfg[$key] = ($key === 'mail_password' && $row['cfg_value'] !== null)
            ? '••••••••'
            : ($row['cfg_value'] ?? '');
    }
    foreach (ALLOWED_KEYS as $k) {
        if (!array_key_exists($k, $cfg)) $cfg[$k] = '';
    }
    if ($cfg['mail_from']      === '') $cfg['mail_from']      = MAIL_FROM;
    if ($cfg['mail_from_name'] === '') $cfg['mail_from_name'] = MAIL_FROM_NAME;
    if ($cfg['mail_driver']    === '') $cfg['mail_driver']    = 'smtp';
    if ($cfg['mail_port']      === '') $cfg['mail_port']      = '587';
    if ($cfg['rgpd_retention_years'] === '') $cfg['rgpd_retention_years'] = '2';

    json_response(['ok' => true, 'config' => $cfg]);
}

// ── SAVE ─────────────────────────────────────────────────────
if ($action === 'save') {
    $errors = [];

    foreach (ALLOWED_KEYS as $key) {
        if (!array_key_exists($key, $input)) continue;

        $value = $input[$key];

        // Ne jamais écraser le mot de passe si le champ est vide ou masqué
        if ($key === 'mail_password' && ($value === '' || $value === '••••••••')) continue;

        if ($key === 'mail_port' && $value !== '' && (!is_numeric($value) || (int)$value < 1 || (int)$value > 65535)) {
            $errors[] = 'Port invalide (1-65535)';
            continue;
        }
        if ($key === 'mail_from' && $value !== '' && !filter_var($value, FILTER_VALIDATE_EMAIL)) {
            $errors[] = 'Adresse e-mail expéditeur invalide';
            continue;
        }
        if ($key === 'mail_security' && !in_array($value, ['', 'tls', 'ssl'], true)) {
            $errors[] = 'Chiffrement invalide';
            continue;
        }
        if ($key === 'rgpd_retention_years' && $value !== '' && (!is_numeric($value) || (int)$value < 0 || (int)$value > 50)) {
            $errors[] = 'Durée RGPD invalide (0-50 années)';
            continue;
        }

        DB::run(
            "INSERT INTO app_config (cfg_key, cfg_value) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE cfg_value = VALUES(cfg_value)",
            [$key, $value === '' ? null : $value]
        );
    }

    if ($errors) {
        json_response(['ok' => false, 'error' => implode('. ', $errors)], 400);
    }
    json_response(['ok' => true, 'message' => 'Configuration enregistrée']);
}

// ── TEST MAIL ────────────────────────────────────────────────
if ($action === 'test_mail') {
    $to = trim($input['to'] ?? '');
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
        json_response(['ok' => false, 'error' => 'Adresse e-mail de destination invalide'], 400);
    }

    $body = '<p>Ceci est un e-mail de test envoyé depuis la configuration de <strong>CultuRézo</strong>.</p>';
    try {
        send_mail($to, '[CultuRézo] E-mail de test', $body);
        json_response(['ok' => true, 'message' => "E-mail de test envoyé à $to"]);
    } catch (\Exception $e) {
        json_response(['ok' => false, 'error' => $e->getMessage()], 500);
    }
}

json_response(['ok' => false, 'error' => 'Action inconnue'], 400);
