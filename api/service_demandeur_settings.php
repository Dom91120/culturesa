<?php
// GET  ?service_id=X   → retourne les lignes existantes pour ce service
// POST action=replace   → supprime puis réinsère toutes les lignes du service

require_once __DIR__ . '/../includes/api.php';
require_auth();

$input = get_input();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $serviceId = trim($_GET['service_id'] ?? '');
    if (!$serviceId) json_response(['ok' => false, 'error' => 'service_id manquant'], 400);

    $rows = DB::all(
        'SELECT sds.*, d.label, d.open_on_school_holidays
         FROM service_demandeur_settings sds
         JOIN demandeurs d ON d.id = sds.demandeur_id
         WHERE sds.service_id = ?
         ORDER BY d.id',
        [$serviceId]
    );

    $settings = array_map(fn($r) => [
        'demandeur_id'           => (int)$r['demandeur_id'],
        'label'                  => $r['label'],
        'recurrent'              => (int)$r['recurrent'],
        'semaine_ab'             => (int)$r['semaine_ab'],
        'validation'             => (int)$r['validation'],
        'themes'                 => (int)$r['themes'],
        'jauge'                  => (int)$r['jauge'],
        'open_on_school_holidays'=> (int)$r['open_on_school_holidays'],
    ], $rows);

    json_response(['ok' => true, 'settings' => $settings]);
}

// POST
$user = require_manager();
$serviceId = trim($input['service_id'] ?? '');
if (!$serviceId) json_response(['ok' => false, 'error' => 'service_id manquant'], 400);
require_manager_service($serviceId, $user);

DB::run('DELETE FROM service_demandeur_settings WHERE service_id = ?', [$serviceId]);

foreach (($input['rows'] ?? []) as $row) {
    $demandeurId = (int)($row['demandeur_id'] ?? 0);
    if (!$demandeurId) continue;
    DB::run(
        'INSERT INTO service_demandeur_settings (service_id, demandeur_id, recurrent, semaine_ab, validation, themes, jauge)
         VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
            $serviceId, $demandeurId,
            (int)($row['recurrent']  ?? 0),
            (int)($row['semaine_ab'] ?? 0),
            (int)($row['validation'] ?? 0),
            (int)($row['themes']     ?? 0),
            (int)($row['jauge']      ?? 0),
        ]
    );
}
json_response(['ok' => true]);
