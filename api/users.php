<?php
// ============================================================
//  CultuRésa — API /api/users.php  (admin/gestionnaire)
//  GET  ?action=list
//  POST ?action=create
//  POST ?action=update
//  POST ?action=delete
//  POST ?action=anonymize_bulk  — voir aussi auth.php?action=password_reset_admin_trigger
// ============================================================

require_once __DIR__ . '/../includes/api.php';

$action = $_GET['action'] ?? get_input()['action'] ?? 'list';
$input  = get_input();

// ── Liste ──────────────────────────────────────────────────
if ($action === 'list') {
    require_manager();
    $search = trim($input['search'] ?? '');
    $params = [];
    $where  = '';
    if ($search) {
        $where = "WHERE u.nom LIKE ? OR u.prenom LIKE ? OR u.email LIKE ?";
        $like  = "%$search%";
        $params = [$like, $like, $like];
    }
    // last_booking_at = date de création de la réservation la plus récente,
    // utilisé pour calculer l'inactivité RGPD côté client : un compte sans
    // login récent mais avec des bookings récents reste considéré comme actif
    // (cas typique : enfant dont le parent admin réserve à sa place).
    $users = DB::all(
        "SELECT u.id,u.email,u.prenom,u.nom,u.tel,u.niveau,u.enfants,u.accompagnants,u.role,u.services,u.email_confirmed,u.created_at,u.demandeur_id,u.structure_id,u.last_login_at,u.anonymized_at,u.deletion_notice_sent_at,
                COALESCE(u.demandeur_id, s.demandeur_id) AS effective_demandeur_id,
                s.label AS structure_label,
                d.label AS demandeur_label,
                (SELECT MAX(b.created_at) FROM bookings b WHERE b.user_id = u.id) AS last_booking_at,
                (SELECT COUNT(*)         FROM bookings b WHERE b.user_id = u.id) AS booking_count
         FROM users u
         LEFT JOIN structures  s ON s.id = u.structure_id
         LEFT JOIN demandeurs  d ON d.id = COALESCE(u.demandeur_id, s.demandeur_id)
         $where
         ORDER BY u.nom, u.prenom",
        $params
    );
    foreach ($users as &$u) {
        $u['booking_count'] = (int)$u['booking_count'];
        $u['services']      = $u['services'] ? json_decode($u['services'], true) : [];
    }
    unset($u);
    json_response(['ok' => true, 'users' => $users]);
}

// ── Lecture d'un utilisateur (manager) ────────────────────
if ($action === 'get') {
    require_manager();
    $id   = (int)($input['id'] ?? 0);
    $user = $id ? DB::one('SELECT id,email,nom,prenom,role,email_confirmed FROM users WHERE id=?', [$id]) : null;
    if (!$user) json_response(['ok' => false, 'error' => 'Introuvable'], 404);
    json_response(['ok' => true, 'user' => $user]);
}

// ── Export des données personnelles (RGPD article 15) ─────
// Accessible : à l'utilisateur lui-même (self-service) OU à un gestionnaire/admin.
// Renvoie un JSON téléchargeable contenant le profil + l'historique des réservations.
if ($action === 'export_json') {
    $currentUser = require_auth();
    $id          = (int)($input['id'] ?? $_GET['id'] ?? 0);
    if (!$id) json_response(['ok' => false, 'error' => 'ID manquant'], 400);
    // Auto-export : toujours autorisé. Sinon : gestionnaire ou admin.
    if ($id !== (int)$currentUser['id'] && !in_array($currentUser['role'], ['administrateur', 'gestionnaire'], true)) {
        json_response(['ok' => false, 'error' => 'Accès refusé'], 403);
    }
    $data = rgpd_build_export($id);
    if (!$data) json_response(['ok' => false, 'error' => 'Utilisateur introuvable'], 404);
    // Trace l'export dans le journal d'audit.
    rgpd_log('export_json', $id, $currentUser);
    // Téléchargement direct en .json
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="export-rgpd-user-' . $id . '-' . date('Ymd-His') . '.json"');
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

$adminUser = require_admin();

switch ($action) {

    case 'create':
        $email = strtolower(trim($input['email'] ?? ''));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            json_response(['ok' => false, 'error' => 'Email invalide'], 422);
        }
        if (DB::one('SELECT id FROM users WHERE email=?', [$email])) {
            json_response(['ok' => false, 'error' => 'Email déjà utilisé'], 409);
        }
        $pwd = $input['password'] ?? 'Changez-moi1!';
        DB::run(
            'INSERT INTO users (email,password,prenom,nom,tel,niveau,enfants,accompagnants,role,services,rgpd_ok,demandeur_id,structure_id)
             VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)',
            [
                $email,
                password_hash($pwd, PASSWORD_DEFAULT),
                trim($input['prenom']  ?? ''),
                trim($input['nom']     ?? ''),
                trim($input['tel']     ?? ''),
                trim($input['niveau']  ?? ''),
                (int)($input['enfants']       ?? 0),
                (int)($input['accompagnants'] ?? 0),
                $input['role'] ?? 'utilisateur',
                // Le frontend peut envoyer un tableau OU une chaîne JSON déjà encodée :
                // on normalise en tableau avant ré-encodage pour éviter le double-encodage.
                (function ($v) {
                    if (is_string($v)) $v = json_decode($v, true);
                    if (!is_array($v) || empty($v)) return null;
                    return json_encode(array_values($v));
                })($input['services'] ?? null),
                ($input['demandeur_id'] ?? '') !== '' ? (int)$input['demandeur_id'] : null,
                ($input['structure_id'] ?? '') !== '' ? (int)$input['structure_id'] : null,
            ]
        );
        json_response(['ok' => true, 'id' => DB::lastId()]);

    case 'update':
        $id = (int)($input['id'] ?? 0);
        if (!$id) json_response(['ok' => false, 'error' => 'ID manquant'], 400);
        $allowed     = ['prenom','nom','tel','niveau','enfants','accompagnants','role','demandeur_id','structure_id'];
        $int_nullables = ['demandeur_id','structure_id'];
        $fields = []; $params = [];
        foreach ($allowed as $f) {
            if (!isset($input[$f])) continue;
            $fields[] = "$f=?";
            if (in_array($f, $int_nullables)) {
                $params[] = $input[$f] !== '' ? (int)$input[$f] : null;
            } else {
                $params[] = $input[$f];
            }
        }
        if (isset($input['services'])) {
            $fields[] = 'services=?';
            // Normalisation tableau ↔ chaîne JSON (cf. case 'create') pour éviter double-encodage
            $sv = $input['services'];
            if (is_string($sv)) $sv = json_decode($sv, true);
            $params[] = (!is_array($sv) || empty($sv)) ? null : json_encode(array_values($sv));
        }
        if (empty($fields)) json_response(['ok' => true]); // rien à faire
        $params[] = $id;
        DB::run('UPDATE users SET ' . implode(',', $fields) . ' WHERE id=?', $params);
        json_response(['ok' => true]);

    // ── Suppression dure ───────────────────────────────────
    // Réservée aux comptes SANS réservation (test, doublon, erreur de saisie).
    // Pour tout compte ayant des bookings, l'anonymisation RGPD est imposée :
    // elle préserve l'historique de fréquentation pour les statistiques tout
    // en effaçant les données nominatives. Tracé dans rgpd_log.
    case 'delete':
        $id = (int)($input['id'] ?? 0);
        if (!$id) json_response(['ok' => false, 'error' => 'ID manquant'], 400);
        $target = DB::one('SELECT id, role FROM users WHERE id=?', [$id]);
        if (!$target) json_response(['ok' => false, 'error' => 'Utilisateur introuvable'], 404);
        // Garde "dernier admin" identique à l'anonymisation.
        if ($target['role'] === 'administrateur' && !rgpd_has_other_active_admin([$id])) {
            json_response(['ok' => false, 'error' => 'Impossible de supprimer le dernier administrateur actif.'], 422);
        }
        $bkCount = (int)(DB::one('SELECT COUNT(*) AS n FROM bookings WHERE user_id=?', [$id])['n'] ?? 0);
        if ($bkCount > 0) {
            json_response([
                'ok'    => false,
                'error' => 'Ce compte a ' . $bkCount . ' réservation(s) et ne peut pas être supprimé. Utilisez l\'anonymisation RGPD pour préserver l\'historique de fréquentation tout en effaçant les données nominatives.',
                'reason' => 'has_bookings',
                'booking_count' => $bkCount,
            ], 422);
        }
        DB::run('DELETE FROM users WHERE id=?', [$id]);
        rgpd_log('hard_delete', $id, $adminUser);
        json_response(['ok' => true]);

    // L'ancien case 'reset_password' (admin choisit lui-même le nouveau mot de
    // passe) a été remplacé par /auth.php?action=password_reset_admin_trigger
    // qui envoie un mail à l'utilisateur — l'admin ne connaît jamais le mot
    // de passe, c'est l'utilisateur qui le choisit.

    // ── Anonymisation en masse (transactionnelle) ──
    // Une seule transaction SQL pour N comptes : UPDATE en bloc + DELETE
    // sessions + N inserts dans rgpd_log. Si une erreur survient, rollback
    // intégral. Beaucoup plus rapide et cohérent qu'une boucle d'appels HTTP.
    case 'anonymize_bulk':
        $ids = $input['ids'] ?? [];
        if (!is_array($ids) || empty($ids)) {
            json_response(['ok' => false, 'error' => 'Aucune cible'], 400);
        }
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids), function($x) { return $x > 0; })));
        if (!$ids) json_response(['ok' => false, 'error' => 'IDs invalides'], 400);
        $pdo = DB::get();
        $pdo->beginTransaction();
        try {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            // Filtrer côté SQL : tous rôles acceptés, mais non encore anonymisé.
            $stmt = $pdo->prepare("SELECT id, role FROM users WHERE id IN ($placeholders) AND anonymized_at IS NULL");
            $stmt->execute($ids);
            $targets     = $stmt->fetchAll();
            $eligibleIds = array_map(function($t) { return (int)$t['id']; }, $targets);
            if (!$eligibleIds) {
                $pdo->rollBack();
                json_response(['ok' => true, 'anonymized' => 0, 'skipped' => count($ids)]);
            }
            // Garde-fou "dernier admin" : si le batch contient un ou plusieurs admins,
            // vérifier qu'au moins un autre admin actif resterait après l'opération.
            $adminIdsInBatch = array_map(function($t) { return (int)$t['id']; },
                array_filter($targets, function($t) { return $t['role'] === 'administrateur'; }));
            if (!empty($adminIdsInBatch) && !rgpd_has_other_active_admin($adminIdsInBatch)) {
                $pdo->rollBack();
                json_response(['ok' => false, 'error' => 'Impossible d\'anonymiser ces comptes : il ne resterait plus aucun administrateur actif.'], 422);
            }
            $eligPh = implode(',', array_fill(0, count($eligibleIds), '?'));
            // Hash unique partagé pour tout le batch : bcrypt sur 32 octets aléatoires,
            // incassable en pratique — la réutilisation entre N comptes ne change rien
            // puisqu'aucun ne pourra plus se connecter (anonymized_at != NULL bloque le login).
            $lockHash = password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT);
            // UPDATE en bloc : email recalculé par ligne avec CONCAT(id) pour garantir l'unicité.
            $pdo->prepare(
                "UPDATE users
                 SET email = CONCAT('anonymized-', id, '@deleted.local'),
                     password = ?,
                     prenom = '', nom = '', tel = '', niveau = '',
                     anonymized_at = NOW()
                 WHERE id IN ($eligPh)"
            )->execute(array_merge([$lockHash], $eligibleIds));
            // Invalider les sessions actives.
            $pdo->prepare("DELETE FROM sessions WHERE user_id IN ($eligPh)")->execute($eligibleIds);
            // Journal d'audit : une ligne par cible (granularité demandée pour la CNIL).
            $logStmt = $pdo->prepare(
                'INSERT INTO rgpd_log (action, target_user_id, actor_user_id, ip) VALUES (?, ?, ?, ?)'
            );
            $ip = $_SERVER['REMOTE_ADDR'] ?? null;
            foreach ($eligibleIds as $tid) {
                $logStmt->execute(['anonymize', $tid, $adminUser['id'] ?? null, $ip]);
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            json_response(['ok' => false, 'error' => 'Erreur lors de l\'anonymisation : ' . $e->getMessage()], 500);
        }
        json_response([
            'ok'         => true,
            'anonymized' => count($eligibleIds),
            'skipped'    => count($ids) - count($eligibleIds),
        ]);

    // ── Envoi du préavis d'anonymisation (RGPD - bonne pratique CNIL) ──
    // Pour chaque id passé, si le compte est encore inactif (role='utilisateur',
    // non anonymisé) et qu'aucun préavis n'a déjà été envoyé, envoie un mail
    // d'avertissement et pose deletion_notice_sent_at = NOW().
    case 'notify_inactive':
        $ids = $input['ids'] ?? [];
        if (!is_array($ids) || empty($ids)) {
            json_response(['ok' => false, 'error' => 'Aucun compte cible'], 400);
        }
        $ids = array_values(array_filter(array_map('intval', $ids), function($x) { return $x > 0; }));
        if (!$ids) json_response(['ok' => false, 'error' => 'IDs invalides'], 400);
        $sent = 0; $skipped = 0;
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $rows = DB::all(
            "SELECT id, email, prenom, nom, role, anonymized_at, deletion_notice_sent_at
             FROM users WHERE id IN ($placeholders)",
            $ids
        );
        foreach ($rows as $u) {
            if ($u['role'] !== 'utilisateur') { $skipped++; continue; }
            if (!empty($u['anonymized_at']))  { $skipped++; continue; }
            if (!empty($u['deletion_notice_sent_at'])) { $skipped++; continue; }
            Auth::sendDeletionNoticeEmail($u['email'], trim(($u['prenom'] ?? '') . ' ' . ($u['nom'] ?? '')), 30);
            DB::run('UPDATE users SET deletion_notice_sent_at = NOW() WHERE id = ?', [$u['id']]);
            rgpd_log('notice_sent', (int)$u['id'], $adminUser);
            $sent++;
        }
        json_response(['ok' => true, 'sent' => $sent, 'skipped' => $skipped]);

    default:
        json_response(['ok' => false, 'error' => 'Action inconnue'], 400);
}
