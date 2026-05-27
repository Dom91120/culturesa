<?php
// ============================================================
//  CultuRésa — API /api/holidays.php
//  GET  ?action=list_school&zone=A
//  POST ?action=refresh_school&zone=A
// ============================================================

require_once __DIR__ . '/../includes/api.php';
require_once __DIR__ . '/../includes/holidays.php';

$action = $_GET['action'] ?? get_input()['action'] ?? '';
$input  = get_input();

// ── Liste (lecture, tous utilisateurs authentifiés) ─────────
if ($action === 'list_school') {
    require_auth();
    $zone = strtoupper($_GET['zone'] ?? $input['zone'] ?? '');
    if (!in_array($zone, ['A','B','C'], true)) {
        json_response(['ok' => false, 'error' => 'Zone invalide'], 400);
    }
    $rows = DB::all(
        'SELECT date_start, date_end, label FROM school_holidays
         WHERE zone=? ORDER BY date_start',
        [$zone]
    );
    json_response(['ok' => true, 'zone' => $zone, 'periods' => $rows]);
}

// ── Refresh depuis data.gouv.fr (admin) ─────────────────────
if ($action === 'refresh_school') {
    require_admin();
    $zone = strtoupper($input['zone'] ?? $_GET['zone'] ?? '');
    if (!in_array($zone, ['A','B','C'], true)) {
        json_response(['ok' => false, 'error' => 'Zone invalide'], 400);
    }
    $year = (int)date('Y');
    try {
        $count = refresh_school_holidays($zone, $year - 1, $year + 1);
    } catch (\Throwable $e) {
        json_response(['ok' => false, 'error' => $e->getMessage()], 500);
    }
    json_response(['ok' => true, 'zone' => $zone, 'count' => $count]);
}

json_response(['ok' => false, 'error' => 'Action inconnue'], 400);
