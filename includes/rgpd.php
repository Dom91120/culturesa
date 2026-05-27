<?php
// ============================================================
//  CultuRésa — Helpers RGPD
//
//  Fonctions partagées entre les endpoints API (api/*) et le flow
//  de confirmation par e-mail (confirm.php). Vit dans /includes/
//  pour être inclus indifféremment des deux contextes sans
//  déclencher les en-têtes CORS / la gestion JSON de l'API.
// ============================================================

require_once __DIR__ . '/db.php';

/**
 * Vrai s'il existe au moins un administrateur ACTIF (non anonymisé)
 * autre que les ids fournis. Sert de garde-fou contre la perte du
 * dernier admin lors d'une suppression / anonymisation.
 *
 * @param int[] $excludingIds Ids à exclure du compte (= candidats à la suppression)
 */
function rgpd_has_other_active_admin(array $excludingIds): bool {
    $excludingIds = array_values(array_filter(array_map('intval', $excludingIds), function($x) { return $x > 0; }));
    if (empty($excludingIds)) {
        $row = DB::one("SELECT COUNT(*) AS n FROM users WHERE role='administrateur' AND anonymized_at IS NULL");
    } else {
        $ph  = implode(',', array_fill(0, count($excludingIds), '?'));
        $row = DB::one(
            "SELECT COUNT(*) AS n FROM users WHERE role='administrateur' AND anonymized_at IS NULL AND id NOT IN ($ph)",
            $excludingIds
        );
    }
    return ((int)($row['n'] ?? 0)) > 0;
}

/**
 * Construit la structure complète des données personnelles d'un utilisateur,
 * destinée à l'export RGPD article 15 (droit d'accès) / 20 (portabilité).
 *
 * Inclut le profil + l'intégralité des réservations (récurrentes + ponctuelles)
 * avec leurs métadonnées (service, créneau, période, thème, pointage).
 *
 * Retourne null si l'utilisateur n'existe pas.
 */
function rgpd_build_export(int $userId): ?array {
    $user = DB::one(
        'SELECT u.id, u.email, u.prenom, u.nom, u.tel, u.niveau, u.enfants, u.accompagnants,
                u.role, u.rgpd_ok, u.created_at, u.email_confirmed, u.last_login_at, u.anonymized_at,
                u.demandeur_id, u.structure_id,
                d.label AS demandeur_label, s.label AS structure_label
         FROM users u
         LEFT JOIN demandeurs d ON d.id = u.demandeur_id
         LEFT JOIN structures s ON s.id = u.structure_id
         WHERE u.id = ?',
        [$userId]
    );
    if (!$user) return null;

    // Réservations enrichies du libellé du service et du créneau.
    $bookings = DB::all(
        "SELECT b.id, b.booking_type, b.service_id, b.slot_id, b.period_id, b.day_key, b.week,
                b.validated, b.theme_label, b.enfants, b.accompagnants, b.pointage,
                b.created_at, b.parent_booking_id,
                sv.label AS service_label,
                p.label  AS period_label, p.etiquette AS period_etiquette,
                p.date_start AS period_date_start, p.date_end AS period_date_end
         FROM bookings b
         LEFT JOIN services sv ON sv.id = b.service_id
         LEFT JOIN periods  p  ON p.id = b.period_id
         WHERE b.user_id = ?
         ORDER BY b.created_at DESC",
        [$userId]
    );

    return [
        'export_meta' => [
            'generated_at'   => date('c'),
            'rgpd_article'   => 'Article 15 (droit d\'accès) / 20 (portabilité)',
            'application'    => 'CultuRésa',
        ],
        'profile' => $user,
        'bookings' => $bookings,
    ];
}

/**
 * Journalise une action RGPD dans la table rgpd_log.
 *
 * Principe de minimisation : NE PAS y stocker de données nominatives
 * (nom, email, etc.) — seulement les identifiants et la nature de l'action.
 * Si l'utilisateur cible est anonymisé plus tard, le log reste valide pour
 * tracer "qui a fait quoi" sans réintroduire les données effacées.
 *
 * @param string     $action       Type d'action (ex: 'anonymize', 'self_delete')
 * @param int|null   $targetUserId Sujet de l'action (compte concerné)
 * @param array|null $actor        Utilisateur ayant déclenché l'action
 * @param array|null $details      Contexte spécifique (sera JSON-encodé)
 */
function rgpd_log(string $action, ?int $targetUserId = null, ?array $actor = null, ?array $details = null): void {
    $actorId = $actor['id'] ?? null;
    $ip      = $_SERVER['REMOTE_ADDR'] ?? null;
    try {
        DB::run(
            'INSERT INTO rgpd_log (action, target_user_id, actor_user_id, details, ip) VALUES (?, ?, ?, ?, ?)',
            [$action, $targetUserId, $actorId, $details ? json_encode($details, JSON_UNESCAPED_UNICODE) : null, $ip]
        );
    } catch (\Throwable $e) {
        // Le log RGPD ne doit jamais bloquer l'action métier. On trace dans
        // error_log si la table n'existe pas (migration non jouée par exemple).
        error_log('rgpd_log insert failed: ' . $e->getMessage());
    }
}
