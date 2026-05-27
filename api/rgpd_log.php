<?php
// ============================================================
//  CultuRézo — API /api/rgpd_log.php  (admin uniquement)
//  GET ?action=list      → liste les entrées du journal RGPD
//  GET ?action=export    → export CSV du journal complet
//
//  Les libellés target/actor utilisent l'état actuel des comptes :
//  un compte anonymisé apparaîtra avec son email "anonymized-{id}@..."
//  — c'est volontaire (le log ne ré-introduit pas de données effacées).
// ============================================================

require_once __DIR__ . '/../includes/api.php';

$action = $_GET['action'] ?? 'list';

require_admin();

if ($action === 'list') {
    $limit  = max(1, min(500, (int)($_GET['limit']  ?? 200)));
    $offset = max(0, (int)($_GET['offset'] ?? 0));
    $rows = DB::all(
        "SELECT l.id, l.action, l.target_user_id, l.actor_user_id, l.details, l.ip, l.created_at,
                t.email AS target_email, t.nom AS target_nom, t.prenom AS target_prenom, t.anonymized_at AS target_anonymized_at,
                a.email AS actor_email, a.nom AS actor_nom, a.prenom AS actor_prenom
         FROM rgpd_log l
         LEFT JOIN users t ON t.id = l.target_user_id
         LEFT JOIN users a ON a.id = l.actor_user_id
         ORDER BY l.created_at DESC, l.id DESC
         LIMIT $limit OFFSET $offset"
    );
    $total = (int)(DB::one('SELECT COUNT(*) AS n FROM rgpd_log')['n'] ?? 0);
    json_response(['ok' => true, 'rows' => $rows, 'total' => $total]);
}

if ($action === 'export') {
    // Export CSV simple (sans données nominatives — uniquement les identifiants
    // et les libellés actuels des comptes, qui peuvent eux-mêmes être anonymisés).
    $rows = DB::all(
        "SELECT l.created_at, l.action, l.target_user_id, l.actor_user_id, l.ip, l.details
         FROM rgpd_log l
         ORDER BY l.created_at DESC, l.id DESC"
    );
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="rgpd-log-' . date('Ymd-His') . '.csv"');
    $out = fopen('php://output', 'w');
    fputcsv($out, ['Date', 'Action', 'Cible (user_id)', 'Acteur (user_id)', 'IP', 'Détails'], ';');
    foreach ($rows as $r) {
        fputcsv($out, [
            $r['created_at'],
            $r['action'],
            $r['target_user_id'] ?? '',
            $r['actor_user_id']  ?? '',
            $r['ip']             ?? '',
            $r['details']        ?? '',
        ], ';');
    }
    fclose($out);
    exit;
}

json_response(['ok' => false, 'error' => 'Action inconnue'], 400);
