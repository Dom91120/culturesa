<?php
// ============================================================
//  CultuRézo — Authentification & Sessions
// ============================================================

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/mailer.php';
require_once __DIR__ . '/rgpd.php';

class Auth {

    /** Génère un token de session sécurisé */
    private static function generateToken(): string {
        return bin2hex(random_bytes(32));
    }

    /** Récupère l'IP du client (en tenant compte des reverse proxies si configurés). */
    private static function clientIp(): string {
        // Si l'admin réseau veut prendre en compte un reverse proxy, il devrait
        // setter une env var TRUSTED_PROXIES et adapter ici. Pour l'instant on
        // se contente de REMOTE_ADDR — c'est l'IP du proxy si on est derrière
        // un, mais c'est défensif (un attaquant ne peut pas usurper).
        return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    }

    /**
     * Configuration du rate limiting par kind d'attempt.
     * - threshold_email : nb max d'échecs sur le même email dans la fenêtre
     * - threshold_ip    : nb max d'échecs sur la même IP dans la fenêtre
     * - window_min      : durée de la fenêtre glissante (en minutes)
     * - lockout_min     : info pour le message d'erreur (le lock est implicite : la
     *                    fenêtre coulisse, donc il "se débloque" naturellement après
     *                    window_min sans nouvelle tentative)
     * - count_failures_only : si true, seuls les attempts avec succeeded=0 comptent
     */
    private const RATE_LIMIT_CONFIG = [
        'login' => [
            'threshold_email' => 5,
            'threshold_ip'    => 15,
            'window_min'      => 5,
            'lockout_min'     => 15,
            'count_failures_only' => true,
        ],
        'password_reset' => [
            'threshold_email' => 3,
            'threshold_ip'    => 10,
            'window_min'      => 10,
            'lockout_min'     => 30,
            'count_failures_only' => false, // chaque demande compte (succès ou non)
        ],
    ];

    /**
     * Vérifie si (email, ip) est rate-limited pour ce kind.
     * Retourne null si OK, sinon ['lockout_seconds' => int] pour communiquer le délai.
     */
    public static function checkRateLimit(string $kind, string $email): ?array {
        $c = self::RATE_LIMIT_CONFIG[$kind] ?? null;
        if (!$c) return null;
        $ip    = self::clientIp();
        $email = strtolower(trim($email));
        $filter = $c['count_failures_only'] ? 'AND succeeded = 0' : '';
        $row = DB::one(
            "SELECT
                COALESCE(SUM(CASE WHEN email = ? THEN 1 ELSE 0 END), 0) AS by_email,
                COALESCE(SUM(CASE WHEN ip = ?    THEN 1 ELSE 0 END), 0) AS by_ip
             FROM auth_attempts
             WHERE kind = ? $filter
               AND attempted_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)",
            [$email, $ip, $kind, (int)$c['window_min']]
        );
        $byEmail = (int)($row['by_email'] ?? 0);
        $byIp    = (int)($row['by_ip']    ?? 0);
        if ($byEmail >= $c['threshold_email'] || $byIp >= $c['threshold_ip']) {
            return ['lockout_seconds' => $c['lockout_min'] * 60];
        }
        return null;
    }

    /**
     * Enregistre une tentative dans auth_attempts. À appeler systématiquement après
     * un login (succès ou échec) ou un password_reset (toujours succeeded=1).
     * Inline cleanup : ~1% des inserts → DELETE des entrées > 1 jour.
     */
    public static function recordAttempt(string $kind, string $email, bool $success): void {
        $ip = self::clientIp();
        DB::run(
            "INSERT INTO auth_attempts (kind, email, ip, succeeded) VALUES (?, ?, ?, ?)",
            [$kind, strtolower(trim($email)), $ip, $success ? 1 : 0]
        );
        if (random_int(0, 99) === 0) {
            DB::run("DELETE FROM auth_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 1 DAY)");
        }
    }

    /** Retourne l'URL de base de l'application */
    private static function getAppUrl(): string {
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host   = $_SERVER['HTTP_HOST'] ?? 'localhost';
        // Priorité : constante BASE_PATH si elle est définie ET non-vide.
        if (defined('BASE_PATH') && BASE_PATH !== '') {
            return $scheme . '://' . $host . BASE_PATH;
        }
        // Auto-détection : on retire les sous-dossiers d'API (/api, /install) du
        // chemin du script appelant pour retomber sur la racine de l'application.
        // Permet aux mails de pointer vers la bonne URL même si BASE_PATH n'est
        // pas configuré.
        $dir = rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/');
        $dir = preg_replace('#/(api|install)$#', '', $dir);
        return $scheme . '://' . $host . $dir;
    }

    /** Connecte un utilisateur, retourne [token, user] ou null ou ['ok'=>false,'error'=>...] */
    public static function login(string $email, string $password): ?array {
        $user = DB::one('SELECT * FROM users WHERE email = ?', [strtolower(trim($email))]);
        if (!$user) return null;
        if (!password_verify($password, $user['password'])) return null;

        // Compte non confirmé
        if (isset($user['email_confirmed']) && !$user['email_confirmed']) {
            return ['ok' => false, 'error' => 'email_not_confirmed'];
        }
        // Compte anonymisé RGPD : connexion impossible
        if (!empty($user['anonymized_at'])) {
            return ['ok' => false, 'error' => 'account_anonymized'];
        }

        // Crée la session
        $token = self::generateToken();
        $expires = date('Y-m-d H:i:s', time() + SESSION_TTL);
        $ip = $_SERVER['REMOTE_ADDR'] ?? null;
        DB::run(
            'INSERT INTO sessions (token, user_id, expires_at, ip) VALUES (?, ?, ?, ?)',
            [$token, $user['id'], $expires, $ip]
        );
        // Met à jour la date de dernière connexion (utilisée par le scan RGPD).
        // Efface également un éventuel préavis d'anonymisation : la reconnexion
        // signifie que le compte est de nouveau actif, le préavis est annulé.
        DB::run('UPDATE users SET last_login_at = NOW(), deletion_notice_sent_at = NULL WHERE id = ?', [$user['id']]);
        // Nettoyage des sessions expirées
        DB::run('DELETE FROM sessions WHERE expires_at < NOW()');

        unset($user['password']);
        return ['token' => $token, 'user' => $user];
    }

    /** Invalide un token */
    public static function logout(string $token): void {
        DB::run('DELETE FROM sessions WHERE token = ?', [$token]);
    }

    /** Retourne l'utilisateur depuis le token, ou null */
    public static function check(string $token): ?array {
        $row = DB::one(
            'SELECT u.* FROM users u
             JOIN sessions s ON s.user_id = u.id
             WHERE s.token = ? AND s.expires_at > NOW()',
            [$token]
        );
        if (!$row) return null;
        // Prolonge la session
        DB::run(
            'UPDATE sessions SET expires_at = ? WHERE token = ?',
            [date('Y-m-d H:i:s', time() + SESSION_TTL), $token]
        );
        unset($row['password']);
        return $row;
    }

    /** Vérifie le token depuis le header Authorization: Bearer <token> */
    public static function fromRequest(): ?array {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
        if (preg_match('/Bearer\s+(.+)/i', $header, $m)) {
            return self::check(trim($m[1]));
        }
        // Fallback cookie
        $cookie = $_COOKIE['rc_token'] ?? '';
        if ($cookie) return self::check($cookie);
        return null;
    }

    /** Vérifie la politique de mot de passe */
    private static function validatePassword(string $pwd): string {
        if (strlen($pwd) < 12)              return '12 caractères minimum';
        if (!preg_match('/[A-Z]/', $pwd))    return '1 majuscule obligatoire';
        if (!preg_match('/[a-z]/', $pwd))    return '1 minuscule obligatoire';
        if (!preg_match('/[0-9]/', $pwd))    return '1 chiffre obligatoire';
        if (!preg_match('/[^A-Za-z0-9]/', $pwd)) return '1 caractère spécial obligatoire';
        return '';
    }

    /** Enregistre un nouveau compte */
    public static function register(array $data): array {
        $email = strtolower(trim($data['email'] ?? ''));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ['ok' => false, 'error' => 'Email invalide'];
        }
        $pwdErr = self::validatePassword($data['password'] ?? '');
        if ($pwdErr) {
            return ['ok' => false, 'error' => $pwdErr];
        }
        if (DB::one('SELECT id FROM users WHERE email = ?', [$email])) {
            return ['ok' => false, 'error' => 'Cet email est déjà utilisé'];
        }
        $hash = password_hash($data['password'], PASSWORD_DEFAULT);
        DB::run(
            'INSERT INTO users (email,password,prenom,nom,tel,niveau,enfants,accompagnants,rgpd_ok,services,email_confirmed,demandeur_id,structure_id)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [
                $email, $hash,
                trim($data['prenom'] ?? ''),
                trim($data['nom']    ?? ''),
                trim($data['tel']    ?? ''),
                trim($data['niveau'] ?? ''),
                (int)($data['enfants']       ?? 0),
                (int)($data['accompagnants'] ?? 0),
                empty($data['rgpd_ok']) ? 0 : 1,
                '[]',
                0, // non confirmé
                ($data['demandeur_id'] ?? '') !== '' ? (int)$data['demandeur_id'] : null,
                ($data['structure_id']  ?? '') !== '' ? (int)$data['structure_id']  : null,
            ]
        );
        $userId = (int)DB::lastId();

        // Générer et stocker le token de confirmation
        $token   = bin2hex(random_bytes(32));
        $expires = date('Y-m-d H:i:s', time() + 24 * 3600);
        DB::run(
            'INSERT INTO email_confirmations (token, user_id, expires_at) VALUES (?,?,?)',
            [$token, $userId, $expires]
        );
        self::sendConfirmationEmail($email, trim(($data['prenom'] ?? '') . ' ' . ($data['nom'] ?? '')), $token);

        return ['ok' => true, 'id' => $userId, 'email_confirmation_sent' => true];
    }

    /** Met à jour le profil d'un utilisateur */
    public static function updateProfile(int $userId, array $data): bool {
        DB::run(
            'UPDATE users SET prenom=?,nom=?,tel=?,niveau=?,enfants=?,accompagnants=?,demandeur_id=?,structure_id=? WHERE id=?',
            [
                trim($data['prenom']  ?? ''),
                trim($data['nom']     ?? ''),
                trim($data['tel']     ?? ''),
                trim($data['niveau']  ?? ''),
                (int)($data['enfants']       ?? 0),
                (int)($data['accompagnants'] ?? 0),
                ($data['demandeur_id'] ?? '') !== '' ? (int)$data['demandeur_id'] : null,
                ($data['structure_id']  ?? '') !== '' ? (int)$data['structure_id']  : null,
                $userId,
            ]
        );
        return true;
    }

    /** Vérifie qu'un token est valide sans activer le compte */
    public static function validateToken(string $token): bool {
        if (!$token) return false;
        return (bool) DB::one(
            'SELECT user_id FROM email_confirmations WHERE token=? AND expires_at > NOW()',
            [$token]
        );
    }

    /** Valide un token de confirmation d'email */
    public static function confirmEmail(string $token): array {
        if (!$token) return ['ok' => false, 'error' => 'Token manquant'];
        $row = DB::one(
            'SELECT user_id FROM email_confirmations WHERE token=? AND expires_at > NOW()',
            [$token]
        );
        if (!$row) return ['ok' => false, 'error' => 'Lien invalide ou expiré'];
        DB::run('UPDATE users SET email_confirmed=1 WHERE id=?', [$row['user_id']]);
        DB::run('DELETE FROM email_confirmations WHERE token=?', [$token]);
        return ['ok' => true];
    }

    /** Alias public pour le renvoi par un admin */
    public static function resendConfirmationEmail(string $email, string $name, string $token): void {
        self::sendConfirmationEmail($email, $name, $token);
    }

    // ── Helpers de mise en forme des e-mails ─────────────────────
    //
    // Conception : HTML basé sur des <table> (compatible Gmail, Outlook,
    // clients mobiles), inline CSS uniquement (les <style> sont souvent
    // strippés). Look "carte blanche sur fond gris doux" + bandeau d'identité
    // avec petit kicker en majuscules pour situer le mail.

    /** Wrappe un contenu HTML dans la carte mail commune (header + footer). */
    private static function emailLayout(string $kicker, string $bodyHtml): string {
        $kickerEsc = htmlspecialchars(strtoupper($kicker));
        return '<!DOCTYPE html><html lang="fr"><head>'
            . '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            . '<title>CultuRézo</title></head>'
            . '<body style="margin:0;padding:0;background:#f3f5f8;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;color:#1a1f2e">'
            . '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f5f8;padding:36px 16px">'
            . '<tr><td align="center">'
            . '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:14px;max-width:520px;width:100%;box-shadow:0 1px 2px rgba(15,17,23,.04),0 6px 24px rgba(15,17,23,.08);overflow:hidden">'
            // Header
            . '<tr><td style="padding:28px 36px 22px;border-bottom:1px solid #eef0f3">'
            . '<div style="font-size:1.45rem;font-weight:600;letter-spacing:-.015em;color:#1a1f2e;line-height:1">Résa<span style="color:#6dceaa">Go</span></div>'
            . '<div style="font-size:.66rem;color:#9aa0b4;margin-top:6px;letter-spacing:.12em;font-weight:600">' . $kickerEsc . '</div>'
            . '</td></tr>'
            // Body
            . '<tr><td style="padding:30px 36px 32px;font-size:.94rem;line-height:1.65;color:#1a1f2e">' . $bodyHtml . '</td></tr>'
            // Footer
            . '<tr><td style="padding:18px 36px;background:#f9fafb;border-top:1px solid #eef0f3;font-size:.7rem;color:#9aa0b4;text-align:center;line-height:1.55">'
            . 'CultuRézo &middot; Système de réservation<br>'
            . '<span style="color:#bcc0cf">Cet e-mail est automatique, merci de ne pas y répondre.</span>'
            . '</td></tr>'
            . '</table>'
            . '</td></tr></table>'
            . '</body></html>';
    }

    /**
     * Bouton CTA centré. $tone détermine la couleur :
     *   'primary' (vert, défaut), 'danger' (rouge), 'warn' (orange).
     */
    private static function emailButton(string $url, string $label, string $tone = 'primary'): string {
        $tones = [
            'primary' => ['bg' => '#6dceaa', 'fg' => '#0f1117'],
            'danger'  => ['bg' => '#e06b6b', 'fg' => '#ffffff'],
            'warn'    => ['bg' => '#e8a45a', 'fg' => '#1a1f2e'],
        ];
        $c = $tones[$tone] ?? $tones['primary'];
        return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto"><tr><td style="border-radius:8px;background:' . $c['bg'] . '">'
            . '<a href="' . htmlspecialchars($url) . '" style="display:inline-block;padding:13px 30px;font-weight:600;font-size:.94rem;color:' . $c['fg'] . ';text-decoration:none;border-radius:8px;letter-spacing:.005em">' . $label . '</a>'
            . '</td></tr></table>';
    }

    /**
     * Encadré d'information (warn = orange / danger = rouge / info = bleu).
     */
    private static function emailNoticeBox(string $html, string $tone = 'warn'): string {
        $tones = [
            'warn'   => ['bg' => '#fff7e8', 'br' => '#f0c378', 'fg' => '#7a5418'],
            'danger' => ['bg' => '#fdecec', 'br' => '#e8a8a8', 'fg' => '#9c2c2c'],
            'info'   => ['bg' => '#eef4ff', 'br' => '#b7c8ec', 'fg' => '#3a4a78'],
        ];
        $c = $tones[$tone] ?? $tones['warn'];
        return '<div style="background:' . $c['bg'] . ';border-left:3px solid ' . $c['br'] . ';border-radius:6px;padding:12px 16px;font-size:.85rem;color:' . $c['fg'] . ';margin:18px 0;line-height:1.55">' . $html . '</div>';
    }

    /** Greeting standard "Bonjour Prénom," (ou "Bonjour,") + paragraphe muet. */
    private static function emailGreeting(string $name): string {
        $firstName = trim(explode(' ', trim($name))[0]);
        $hello = $firstName === '' ? 'Bonjour,' : ('Bonjour ' . htmlspecialchars($firstName) . ',');
        return '<p style="margin:0 0 16px;font-size:1rem">' . $hello . '</p>';
    }

    /** Envoie l'email de confirmation d'inscription */
    private static function sendConfirmationEmail(string $email, string $name, string $token): void {
        $confirmUrl = self::getAppUrl() . '/confirm.php?token=' . urlencode($token);
        $subject    = 'Confirmez votre inscription — CultuRézo';
        $body = self::emailLayout(
            'Confirmation d\'inscription',
            self::emailGreeting($name)
            . '<p style="margin:0 0 12px">Merci de votre inscription sur <strong>CultuRézo</strong>. Pour activer votre compte, cliquez sur le bouton ci-dessous.</p>'
            . self::emailButton($confirmUrl, '✓  Confirmer mon adresse')
            . '<p style="margin:0;font-size:.82rem;color:#6b7280">Ce lien est valable <strong>24 heures</strong>. Si vous n\'avez pas créé de compte sur CultuRézo, ignorez simplement ce message.</p>'
        );
        try {
            send_mail($email, $subject, $body);
        } catch (\Exception $e) {
            error_log('CultuRézo mailer error (confirm): ' . $e->getMessage());
        }
    }

    /** Demande un changement d'email : envoie un lien au nouvel email + alerte à l'ancien */
    public static function requestEmailChange(int $userId, string $newEmail): array {
        $newEmail = strtolower(trim($newEmail));
        if (!filter_var($newEmail, FILTER_VALIDATE_EMAIL)) {
            return ['ok' => false, 'error' => 'Adresse e-mail invalide'];
        }
        $user = DB::one('SELECT email, prenom, nom FROM users WHERE id=?', [$userId]);
        if (!$user) return ['ok' => false, 'error' => 'Utilisateur introuvable'];
        if ($user['email'] === $newEmail) {
            return ['ok' => false, 'error' => 'C\'est déjà votre adresse e-mail actuelle'];
        }
        if (DB::one('SELECT id FROM users WHERE email=?', [$newEmail])) {
            return ['ok' => false, 'error' => 'Cette adresse e-mail est déjà utilisée'];
        }

        // Supprimer les demandes précédentes de cet utilisateur
        DB::run('DELETE FROM email_change_requests WHERE user_id=?', [$userId]);

        $token   = bin2hex(random_bytes(32));
        $expires = date('Y-m-d H:i:s', time() + 24 * 3600);
        DB::run(
            'INSERT INTO email_change_requests (token, user_id, new_email, expires_at) VALUES (?,?,?,?)',
            [$token, $userId, $newEmail, $expires]
        );

        $fullName = trim($user['prenom'] . ' ' . $user['nom']);
        self::sendEmailChangeRequestEmail($newEmail, $fullName, $token);
        self::sendEmailChangeAlertEmail($user['email'], $fullName, $newEmail);

        return ['ok' => true];
    }

    /** Valide un token de demande de changement d'email */
    public static function validateEmailChangeToken(string $token): bool {
        if (!$token) return false;
        return (bool) DB::one(
            'SELECT user_id FROM email_change_requests WHERE token=? AND expires_at > NOW()',
            [$token]
        );
    }

    /** Confirme le changement d'email */
    public static function confirmEmailChange(string $token): array {
        if (!$token) return ['ok' => false, 'error' => 'Token manquant'];
        $row = DB::one(
            'SELECT user_id, new_email FROM email_change_requests WHERE token=? AND expires_at > NOW()',
            [$token]
        );
        if (!$row) return ['ok' => false, 'error' => 'Lien invalide ou expiré'];

        // Vérifier que le nouvel email n'a pas été pris entre-temps
        if (DB::one('SELECT id FROM users WHERE email=? AND id != ?', [$row['new_email'], $row['user_id']])) {
            DB::run('DELETE FROM email_change_requests WHERE token=?', [$token]);
            return ['ok' => false, 'error' => 'Cette adresse e-mail est désormais utilisée par un autre compte'];
        }

        DB::run('UPDATE users SET email=? WHERE id=?', [$row['new_email'], $row['user_id']]);
        DB::run('DELETE FROM email_change_requests WHERE token=?', [$token]);
        // Invalider toutes les sessions : reconnexion obligatoire avec le nouvel email
        DB::run('DELETE FROM sessions WHERE user_id=?', [$row['user_id']]);

        return ['ok' => true, 'new_email' => $row['new_email']];
    }

    /** Envoie le lien de confirmation au nouvel email */
    private static function sendEmailChangeRequestEmail(string $email, string $name, string $token): void {
        $confirmUrl = self::getAppUrl() . '/confirm.php?type=email_change&token=' . urlencode($token);
        $subject    = 'Confirmez votre nouvelle adresse e-mail — CultuRézo';
        $body = self::emailLayout(
            'Changement d\'adresse e-mail',
            self::emailGreeting($name)
            . '<p style="margin:0 0 12px">Une demande de changement d\'adresse e-mail a été effectuée pour votre compte. Cliquez sur le bouton ci-dessous pour confirmer cette nouvelle adresse.</p>'
            . self::emailButton($confirmUrl, '✓  Confirmer ma nouvelle adresse')
            . '<p style="margin:0;font-size:.82rem;color:#6b7280">Ce lien est valable <strong>24 heures</strong>. Si vous n\'êtes pas à l\'origine de cette demande, ignorez ce message — votre adresse actuelle reste inchangée.</p>'
        );
        try {
            send_mail($email, $subject, $body);
        } catch (\Exception $e) {
            error_log('CultuRézo mailer error (email change request): ' . $e->getMessage());
        }
    }

    /** Envoie une alerte à l'ancienne adresse lors d'un changement d'email */
    private static function sendEmailChangeAlertEmail(string $email, string $name, string $newEmail): void {
        $subject = 'Alerte : demande de changement d\'adresse e-mail — CultuRézo';
        $body = self::emailLayout(
            'Alerte de sécurité',
            self::emailGreeting($name)
            . '<p style="margin:0 0 4px">Une demande de changement d\'adresse e-mail vers <strong>' . htmlspecialchars($newEmail) . '</strong> a été initiée sur votre compte.</p>'
            . self::emailNoticeBox(
                'Si vous n\'êtes <strong>pas</strong> à l\'origine de cette demande, contactez immédiatement l\'administration.',
                'warn'
            )
            . '<p style="margin:0;font-size:.82rem;color:#6b7280">Si c\'est bien vous, vous pouvez ignorer ce message. Le changement ne sera effectif qu\'après confirmation via le lien envoyé à la nouvelle adresse.</p>'
        );
        try {
            send_mail($email, $subject, $body);
        } catch (\Exception $e) {
            error_log('CultuRézo mailer error (email change alert): ' . $e->getMessage());
        }
    }

    // ── Suppression self-service (RGPD article 17) ─────────────

    /**
     * Crée une demande de suppression de compte.
     * Vérifie le mot de passe pour s'assurer que c'est bien l'utilisateur,
     * génère un token valable 24h, et envoie un mail avec un lien de confirmation.
     * Refuse les rôles gestionnaire/administrateur (ces comptes doivent être
     * supprimés par un autre admin pour éviter de tomber à zéro admin).
     */
    public static function requestAccountDeletion(int $userId, string $password): array {
        $user = DB::one('SELECT id, email, prenom, nom, role, password FROM users WHERE id=?', [$userId]);
        if (!$user) return ['ok' => false, 'error' => 'Utilisateur introuvable'];
        if (!password_verify($password, $user['password'])) {
            return ['ok' => false, 'error' => 'Mot de passe incorrect'];
        }
        // Garde-fou : un admin ne peut pas s'auto-supprimer s'il est le dernier
        // admin actif. Vérification au moment de la demande pour rejeter tôt ;
        // re-vérifiée à la confirmation par mail (le contexte peut avoir changé).
        if ($user['role'] === 'administrateur' && !rgpd_has_other_active_admin([$userId])) {
            return ['ok' => false, 'error' => 'Vous êtes le dernier administrateur actif. Promouvez d\'abord un autre compte au rang d\'administrateur avant de supprimer le vôtre.'];
        }
        // Supprimer toute demande précédente puis créer un nouveau token 24h.
        DB::run('DELETE FROM account_deletion_requests WHERE user_id=?', [$userId]);
        $token   = bin2hex(random_bytes(32));
        $expires = date('Y-m-d H:i:s', time() + 24 * 3600);
        DB::run(
            'INSERT INTO account_deletion_requests (token, user_id, expires_at) VALUES (?,?,?)',
            [$token, $userId, $expires]
        );
        self::sendDeletionConfirmationEmail($user['email'], trim($user['prenom'] . ' ' . $user['nom']), $token);
        return ['ok' => true];
    }

    /** Vérifie qu'un token de suppression est valide. */
    public static function validateDeletionToken(string $token): bool {
        if (!$token) return false;
        return (bool) DB::one(
            'SELECT user_id FROM account_deletion_requests WHERE token=? AND expires_at > NOW()',
            [$token]
        );
    }

    /**
     * Confirme et exécute la suppression d'un compte.
     * Applique la même anonymisation que côté admin : nom/prenom/email/tel/niveau
     * vidés, password verrouillé, anonymized_at posé. Sessions invalidées.
     * Journalise dans rgpd_log avec action 'self_delete'.
     * Retourne ['ok' => true] ou ['ok' => false, 'error' => ...].
     */
    public static function confirmAccountDeletion(string $token): array {
        if (!$token) return ['ok' => false, 'error' => 'Token manquant'];
        $row = DB::one(
            'SELECT user_id FROM account_deletion_requests WHERE token=? AND expires_at > NOW()',
            [$token]
        );
        if (!$row) return ['ok' => false, 'error' => 'Lien invalide ou expiré'];
        $userId = (int)$row['user_id'];
        // Re-vérification "dernier admin actif" au moment de la confirmation
        // (entre la demande et le clic mail, le rôle ou l'état du parc admin
        // peut avoir changé).
        $target = DB::one('SELECT role FROM users WHERE id=?', [$userId]);
        if ($target && $target['role'] === 'administrateur' && !rgpd_has_other_active_admin([$userId])) {
            DB::run('DELETE FROM account_deletion_requests WHERE user_id=?', [$userId]);
            return ['ok' => false, 'error' => 'Vous êtes désormais le dernier administrateur actif — la suppression a été annulée.'];
        }
        // Anonymisation : même mécanique que api/users.php case 'anonymize'.
        $anonEmail = 'anonymized-' . $userId . '@deleted.local';
        $lockHash  = password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT);
        DB::run(
            "UPDATE users SET email=?, password=?, prenom='', nom='', tel='', niveau='',
                              anonymized_at=NOW() WHERE id=?",
            [$anonEmail, $lockHash, $userId]
        );
        DB::run('DELETE FROM sessions WHERE user_id=?', [$userId]);
        DB::run('DELETE FROM account_deletion_requests WHERE user_id=?', [$userId]);
        // Journal d'audit RGPD (actor = target ici puisque c'est self-service).
        rgpd_log('self_delete', $userId, ['id' => $userId]);
        return ['ok' => true];
    }

    /**
     * Envoie le préavis d'anonymisation à un utilisateur inactif.
     * L'utilisateur peut annuler en se reconnectant simplement (Auth::login()
     * efface automatiquement deletion_notice_sent_at).
     */
    public static function sendDeletionNoticeEmail(string $email, string $name, int $graceDays = 30): void {
        $appUrl  = self::getAppUrl();
        $days    = (int)$graceDays;
        $subject = 'Votre compte CultuRézo sera supprimé pour inactivité dans ' . $days . ' jours';
        $body = self::emailLayout(
            'Préavis d\'inactivité',
            self::emailGreeting($name)
            . '<p style="margin:0 0 12px">Nous constatons que vous ne vous êtes plus connecté à votre compte <strong>CultuRézo</strong> depuis longtemps.</p>'
            . self::emailNoticeBox(
                'Conformément à notre politique de conservation des données (article 5 du RGPD), votre compte sera <strong>anonymisé d\'ici ' . $days . ' jours</strong> si vous ne vous reconnectez pas.',
                'warn'
            )
            . '<p style="margin:0 0 4px">L\'anonymisation effacera définitivement vos nom, prénom, e-mail et téléphone. L\'historique de vos réservations sera conservé sous forme anonyme à des fins statistiques.</p>'
            . self::emailButton($appUrl, '↪  Se reconnecter et conserver mon compte', 'warn')
            . '<p style="margin:0;font-size:.82rem;color:#6b7280">Une simple connexion suffit à annuler la suppression — aucune autre action n\'est requise. Si vous ne souhaitez plus utiliser le service, ignorez ce message&nbsp;: votre compte sera anonymisé automatiquement.</p>'
        );
        try {
            send_mail($email, $subject, $body);
        } catch (\Exception $e) {
            error_log('CultuRézo mailer error (notice): ' . $e->getMessage());
        }
    }

    /** Envoie l'email de confirmation de suppression de compte. */
    private static function sendDeletionConfirmationEmail(string $email, string $name, string $token): void {
        $confirmUrl = self::getAppUrl() . '/confirm.php?type=delete&token=' . urlencode($token);
        $subject    = 'Confirmez la suppression de votre compte — CultuRézo';
        $body = self::emailLayout(
            'Demande de suppression',
            self::emailGreeting($name)
            . '<p style="margin:0 0 12px">Vous avez demandé la suppression de votre compte <strong>CultuRézo</strong>. Pour confirmer définitivement cette action, cliquez sur le bouton ci-dessous.</p>'
            . self::emailButton($confirmUrl, '🗑️  Confirmer la suppression', 'danger')
            . self::emailNoticeBox(
                '<strong>Action irréversible.</strong> Vos nom, prénom, e-mail et téléphone seront définitivement effacés. L\'historique de vos réservations sera conservé sans lien personnel, à des fins statistiques.',
                'danger'
            )
            . '<p style="margin:0;font-size:.82rem;color:#6b7280">Ce lien est valable <strong>24 heures</strong>. Si vous n\'êtes pas à l\'origine de cette demande, ignorez ce message — votre compte reste inchangé.</p>'
        );
        try {
            send_mail($email, $subject, $body);
        } catch (\Exception $e) {
            error_log('CultuRézo mailer error (deletion): ' . $e->getMessage());
        }
    }

    // ── Réinitialisation de mot de passe (self-service + admin trigger) ──

    /**
     * Crée un token de réinitialisation et envoie le mail.
     * Anti-énumération : retourne toujours ['ok' => true] même si l'email
     * n'existe pas — le serveur ne révèle jamais à un visiteur anonyme
     * l'existence ou non d'un compte. L'envoi du mail est conditionné
     * à l'existence effective du compte (et au fait qu'il ne soit pas
     * anonymisé).
     */
    public static function requestPasswordReset(string $email): array {
        $email = strtolower(trim($email));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            // On reste vague côté retour pour ne pas révéler quoi que ce soit.
            return ['ok' => true];
        }
        $user = DB::one('SELECT id, email, prenom, nom, anonymized_at FROM users WHERE email=?', [$email]);
        if ($user && empty($user['anonymized_at'])) {
            self::_createAndSendPasswordResetToken((int)$user['id'], $user['email'], trim(($user['prenom'] ?? '') . ' ' . ($user['nom'] ?? '')));
        }
        // Retour systématique "ok" — l'attaquant ne peut pas déduire d'info.
        return ['ok' => true];
    }

    /**
     * Trigger admin : envoie un mail de reset au user cible, sans révéler ni
     * choisir le mot de passe. Le mail part dans tous les cas (l'admin sait
     * que le compte existe puisqu'il le sélectionne dans la liste).
     */
    public static function adminTriggerPasswordReset(int $userId): array {
        $user = DB::one('SELECT id, email, prenom, nom, anonymized_at FROM users WHERE id=?', [$userId]);
        if (!$user) return ['ok' => false, 'error' => 'Utilisateur introuvable'];
        if (!empty($user['anonymized_at'])) return ['ok' => false, 'error' => 'Ce compte est anonymisé, le reset est impossible'];
        self::_createAndSendPasswordResetToken((int)$user['id'], $user['email'], trim(($user['prenom'] ?? '') . ' ' . ($user['nom'] ?? '')));
        return ['ok' => true];
    }

    /** Helper interne : supprime les anciens tokens du user, en crée un nouveau et envoie le mail. */
    private static function _createAndSendPasswordResetToken(int $userId, string $email, string $name): void {
        DB::run('DELETE FROM password_reset_requests WHERE user_id=?', [$userId]);
        $token   = bin2hex(random_bytes(32));
        $expires = date('Y-m-d H:i:s', time() + 3600); // 1h (court pour réduire la fenêtre d'attaque)
        DB::run(
            'INSERT INTO password_reset_requests (token, user_id, expires_at) VALUES (?,?,?)',
            [$token, $userId, $expires]
        );
        self::sendPasswordResetEmail($email, $name, $token);
    }

    /** Valide qu'un token de reset est encore actif. Utilisé par confirm.php. */
    public static function validatePasswordResetToken(string $token): bool {
        if (!$token) return false;
        return (bool) DB::one(
            'SELECT user_id FROM password_reset_requests WHERE token=? AND expires_at > NOW()',
            [$token]
        );
    }

    /**
     * Confirme et applique le nouveau mot de passe. Vérifie la politique de
     * complexité, met à jour le hash, supprime les sessions actives et le
     * token. Trace dans rgpd_log (action 'password_reset').
     */
    public static function confirmPasswordReset(string $token, string $newPwd): array {
        if (!$token) return ['ok' => false, 'error' => 'Token manquant'];
        $row = DB::one(
            'SELECT user_id FROM password_reset_requests WHERE token=? AND expires_at > NOW()',
            [$token]
        );
        if (!$row) return ['ok' => false, 'error' => 'Lien invalide ou expiré'];
        $err = self::validatePassword($newPwd);
        if ($err) return ['ok' => false, 'error' => $err];
        $userId = (int)$row['user_id'];
        DB::run('UPDATE users SET password=? WHERE id=?', [password_hash($newPwd, PASSWORD_DEFAULT), $userId]);
        DB::run('DELETE FROM password_reset_requests WHERE user_id=?', [$userId]);
        DB::run('DELETE FROM sessions WHERE user_id=?', [$userId]);
        rgpd_log('password_reset', $userId, ['id' => $userId]);
        return ['ok' => true];
    }

    /** Envoie le mail avec le lien de réinitialisation (look unifié). */
    private static function sendPasswordResetEmail(string $email, string $name, string $token): void {
        $resetUrl = self::getAppUrl() . '/confirm.php?type=reset_password&token=' . urlencode($token);
        $subject  = 'Réinitialisation de votre mot de passe — CultuRézo';
        $body = self::emailLayout(
            'Réinitialisation de mot de passe',
            self::emailGreeting($name)
            . '<p style="margin:0 0 12px">Une demande de réinitialisation de votre mot de passe CultuRézo a été effectuée. Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe.</p>'
            . self::emailButton($resetUrl, '🔑  Choisir un nouveau mot de passe')
            . self::emailNoticeBox(
                'Ce lien est valable <strong>1 heure</strong> seulement, pour des raisons de sécurité. Au-delà, il faudra refaire une demande.',
                'info'
            )
            . '<p style="margin:0;font-size:.82rem;color:#6b7280">Si vous n\'êtes pas à l\'origine de cette demande, ignorez ce message — votre mot de passe actuel reste inchangé.</p>'
        );
        try {
            send_mail($email, $subject, $body);
        } catch (\Exception $e) {
            error_log('CultuRézo mailer error (password reset): ' . $e->getMessage());
        }
    }

    /** Change le mot de passe */
    public static function changePassword(int $userId, string $current, string $newPwd): array {
        $user = DB::one('SELECT password FROM users WHERE id=?', [$userId]);
        if (!$user || !password_verify($current, $user['password'])) {
            return ['ok' => false, 'error' => 'Mot de passe actuel incorrect'];
        }
        $pwdErr = self::validatePassword($newPwd);
        if ($pwdErr) {
            return ['ok' => false, 'error' => $pwdErr];
        }
        DB::run('UPDATE users SET password=? WHERE id=?', [password_hash($newPwd, PASSWORD_DEFAULT), $userId]);
        return ['ok' => true];
    }
}
