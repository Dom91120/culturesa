<?php
// ============================================================
//  CultuRézo — API /api/auth.php
//  POST /api/auth.php?action=login
//  POST /api/auth.php?action=register
//  POST /api/auth.php?action=logout
//  GET  /api/auth.php?action=me
// ============================================================

require_once __DIR__ . '/../includes/api.php';

$action = $_GET['action'] ?? get_input()['action'] ?? '';
$input  = get_input();

switch ($action) {

    // ── Connexion ──────────────────────────────────────────
    case 'login':
        $loginEmail = (string)($input['email'] ?? '');
        // Rate limit : si trop de tentatives ratées sur cet email OU cette IP dans
        // les 5 dernières minutes, on bloque (429 Too Many Requests). Vu avant même
        // d'essayer le login pour ne pas surcharger MySQL et ne pas leaker du timing.
        $rl = Auth::checkRateLimit('login', $loginEmail);
        if ($rl) {
            $mins = max(1, (int)ceil($rl['lockout_seconds'] / 60));
            json_response([
                'ok' => false,
                'error' => "Trop de tentatives de connexion. Réessayez dans environ $mins minute" . ($mins > 1 ? 's' : '') . ".",
            ], 429);
        }
        $result = Auth::login($loginEmail, $input['password'] ?? '');
        // Enregistre la tentative (succès = on a un token valide).
        $loginSuccess = is_array($result) && !empty($result['token']);
        Auth::recordAttempt('login', $loginEmail, $loginSuccess);
        if (!$result) {
            json_response(['ok' => false, 'error' => 'Email ou mot de passe incorrect'], 401);
        }
        if (isset($result['ok']) && !$result['ok']) {
            json_response(['ok' => false, 'error' => $result['error']], 403);
        }
        // Envoi du cookie httpOnly
        setcookie('rc_token', $result['token'], [
            'expires'  => time() + SESSION_TTL,
            'path'     => '/',
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        $debugRow = DB::one("SELECT cfg_value FROM app_config WHERE cfg_key='debug_mode'");
        $debugVal = $debugRow ? (string)($debugRow['cfg_value'] ?? '') : '';
        $zoneRow  = DB::one("SELECT cfg_value FROM app_config WHERE cfg_key='school_zone'");
        $zoneVal  = $zoneRow ? strtoupper((string)($zoneRow['cfg_value'] ?? '')) : '';
        if (!in_array($zoneVal, ['A','B','C'], true)) $zoneVal = 'A';
        $mirrorRow = DB::one("SELECT cfg_value FROM app_config WHERE cfg_key='show_mirror_slots'");
        $mirrorVal = $mirrorRow ? (string)($mirrorRow['cfg_value'] ?? '') : '';
        json_response([
            'ok'     => true,
            'token'  => $result['token'],
            'user'   => normalize_user($result['user']),
            'config' => [
                'debug_mode'        => $debugVal === '1' ? '1' : '0',
                'school_zone'       => $zoneVal,
                'show_mirror_slots' => $mirrorVal === '1' ? '1' : '0',
            ],
        ]);

    // ── Déconnexion ────────────────────────────────────────
    case 'logout':
        $user = Auth::fromRequest();
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (preg_match('/Bearer\s+(.+)/i', $header, $m)) Auth::logout(trim($m[1]));
        elseif (!empty($_COOKIE['rc_token'])) Auth::logout($_COOKIE['rc_token']);
        setcookie('rc_token', '', ['expires' => time() - 3600, 'path' => '/']);
        json_response(['ok' => true]);

    // ── Informations du compte connecté ───────────────────
    case 'me':
        $user = require_auth();
        $debugRow = DB::one("SELECT cfg_value FROM app_config WHERE cfg_key='debug_mode'");
        $debugVal = $debugRow ? (string)($debugRow['cfg_value'] ?? '') : '';
        $zoneRow  = DB::one("SELECT cfg_value FROM app_config WHERE cfg_key='school_zone'");
        $zoneVal  = $zoneRow ? strtoupper((string)($zoneRow['cfg_value'] ?? '')) : '';
        if (!in_array($zoneVal, ['A','B','C'], true)) $zoneVal = 'A';
        $mirrorRow = DB::one("SELECT cfg_value FROM app_config WHERE cfg_key='show_mirror_slots'");
        $mirrorVal = $mirrorRow ? (string)($mirrorRow['cfg_value'] ?? '') : '';
        json_response([
            'ok'     => true,
            'user'   => normalize_user($user),
            'config' => [
                'debug_mode'        => $debugVal === '1' ? '1' : '0',
                'school_zone'       => $zoneVal,
                'show_mirror_slots' => $mirrorVal === '1' ? '1' : '0',
            ],
        ]);

    // ── Renvoi du mail de confirmation (admin) ─────────────
    case 'resend_confirmation':
        require_manager();
        $userId = (int)($input['user_id'] ?? 0);
        if (!$userId) json_response(['ok' => false, 'error' => 'user_id manquant'], 400);
        $user = DB::one('SELECT id,email,prenom,nom,email_confirmed FROM users WHERE id=?', [$userId]);
        if (!$user) json_response(['ok' => false, 'error' => 'Utilisateur introuvable'], 404);
        if ($user['email_confirmed']) json_response(['ok' => false, 'error' => 'Compte déjà confirmé'], 409);
        // Supprimer les anciens tokens et en créer un nouveau
        DB::run('DELETE FROM email_confirmations WHERE user_id=?', [$userId]);
        $token   = bin2hex(random_bytes(32));
        $expires = date('Y-m-d H:i:s', time() + 24 * 3600);
        DB::run('INSERT INTO email_confirmations (token,user_id,expires_at) VALUES (?,?,?)', [$token, $userId, $expires]);
        Auth::resendConfirmationEmail($user['email'], trim($user['prenom'].' '.$user['nom']), $token);
        json_response(['ok' => true]);

    // ── Inscription ────────────────────────────────────────
    case 'register':
        $result = Auth::register($input);
        if (!$result['ok']) {
            json_response(['ok' => false, 'error' => $result['error']], 422);
        }
        json_response(['ok' => true, 'id' => $result['id'], 'email_confirmation_sent' => !empty($result['email_confirmation_sent'])]);

    // ── Mise à jour du profil ──────────────────────────────
    case 'update_profile':
        $user = require_auth();
        Auth::updateProfile((int)$user['id'], $input);
        $updated = DB::one('SELECT id,email,prenom,nom,tel,niveau,enfants,accompagnants,role,services,demandeur_id,structure_id FROM users WHERE id=?', [$user['id']]);
        json_response(['ok' => true, 'user' => normalize_user($updated)]);

    // ── Demande de changement d'email ──────────────────────
    case 'email_change_request':
        $user   = require_auth();
        $result = Auth::requestEmailChange((int)$user['id'], $input['new_email'] ?? '');
        if (!$result['ok']) json_response(['ok' => false, 'error' => $result['error']], 422);
        json_response(['ok' => true]);

    // ── Changement de mot de passe ─────────────────────────
    case 'change_password':
        $user   = require_auth();
        $result = Auth::changePassword((int)$user['id'], $input['current'] ?? '', $input['new'] ?? '');
        json_response($result + ['ok' => $result['ok']]);

    // ── Mot de passe oublié (public, anti-énumération) ──
    // Réponse toujours "ok" pour ne jamais révéler si l'email existe ou non.
    // Le mail n'est envoyé que si le compte existe et n'est pas anonymisé.
    case 'password_reset_request':
        $resetEmail = (string)($input['email'] ?? '');
        // Rate limit silencieux : si trop de demandes dans la fenêtre, on renvoie
        // le même message qu'en succès sans rien envoyer. Ne pas distinguer évite
        // de leaker à un attaquant qu'il a déjà testé cet email.
        $rl = Auth::checkRateLimit('password_reset', $resetEmail);
        if (!$rl) {
            Auth::requestPasswordReset($resetEmail);
        }
        // Compte chaque attempt (succès ou ignoré rate limit) pour que le compteur
        // s'incrémente même quand on n'envoie pas.
        Auth::recordAttempt('password_reset', $resetEmail, true);
        json_response(['ok' => true, 'message' => 'Si cette adresse est associée à un compte, un e-mail vient d\'être envoyé.']);

    // ── Trigger admin : envoie un mail de reset à un autre user ──
    // Remplace l'ancien users.php?action=reset_password (qui demandait à
    // l'admin de choisir lui-même le mot de passe, ce qui posait problème
    // de confidentialité). Trace dans rgpd_log.
    case 'password_reset_admin_trigger':
        $admin  = require_admin();
        $userId = (int)($input['id'] ?? 0);
        if (!$userId) json_response(['ok' => false, 'error' => 'ID manquant'], 400);
        $result = Auth::adminTriggerPasswordReset($userId);
        if (!$result['ok']) json_response($result, 422);
        rgpd_log('password_reset_admin_trigger', $userId, $admin);
        json_response(['ok' => true]);

    // ── Pré-check self-delete : l'utilisateur courant peut-il s'auto-supprimer ? ──
    // Sert à désactiver le bouton "Demander la suppression" côté UI si la
    // garde "dernier admin actif" s'applique (= éviter d'ouvrir la modale
    // pour rien et de demander le mot de passe inutilement).
    case 'self_delete_check':
        $user = require_auth();
        if ($user['role'] === 'administrateur'
            && !rgpd_has_other_active_admin([(int)$user['id']])) {
            json_response([
                'ok'      => true,
                'allowed' => false,
                'reason'  => 'Vous êtes le dernier administrateur actif. Promouvez d\'abord un autre compte au rang d\'administrateur avant de supprimer le vôtre.',
            ]);
        }
        json_response(['ok' => true, 'allowed' => true]);

    // ── Demande de suppression self-service (RGPD art. 17) ──
    // L'utilisateur saisit son mot de passe ; on génère un token valable 24h
    // et on envoie un mail avec le lien de confirmation. La suppression
    // effective a lieu lors du clic sur ce lien (cf. confirm.php?type=delete).
    case 'account_deletion_request':
        $user   = require_auth();
        $result = Auth::requestAccountDeletion((int)$user['id'], $input['password'] ?? '');
        if (!$result['ok']) json_response(['ok' => false, 'error' => $result['error']], 422);
        // Trace la demande dans le journal d'audit.
        rgpd_log('self_delete_requested', (int)$user['id'], $user);
        json_response(['ok' => true]);

    default:
        json_response(['ok' => false, 'error' => 'Action inconnue'], 400);
}
