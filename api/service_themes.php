<?php
// GET  ?service_id=X   → retourne le mode et la liste des thèmes pour ce service
// POST                  → met à jour le mode et remplace la liste des thèmes

require_once __DIR__ . '/../includes/api.php';
require_auth();

$input = get_input();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $serviceId = trim($_GET['service_id'] ?? '');
    if (!$serviceId) json_response(['ok' => false, 'error' => 'service_id manquant'], 400);

    $svc = DB::one('SELECT themes_mode FROM services WHERE id = ?', [$serviceId]);
    if (!$svc) json_response(['ok' => false, 'error' => 'Service inconnu'], 404);

    $rows = DB::all(
        'SELECT id, label, position
         FROM service_themes
         WHERE service_id = ?
         ORDER BY position, id',
        [$serviceId]
    );
    $themes = array_map(fn($r) => [
        'id'       => (int)$r['id'],
        'label'    => (string)$r['label'],
        'position' => (int)$r['position'],
    ], $rows);

    json_response([
        'ok'     => true,
        'mode'   => $svc['themes_mode'] ?: 'libre',
        'themes' => $themes,
    ]);
}

// POST — remplacement de la liste + mode
$user = require_manager();
$serviceId = trim($input['service_id'] ?? '');
if (!$serviceId) json_response(['ok' => false, 'error' => 'service_id manquant'], 400);
require_manager_service($serviceId, $user);

$mode = ($input['mode'] ?? 'libre') === 'liste' ? 'liste' : 'libre';

DB::run('UPDATE services SET themes_mode = ? WHERE id = ?', [$mode, $serviceId]);
DB::run('DELETE FROM service_themes WHERE service_id = ?', [$serviceId]);

// Nettoyage : trim, suppression des vides, dédoublonnage insensible à la casse, longueur max 255
$themes = $input['themes'] ?? [];
$seen = [];
$position = 0;
foreach ($themes as $t) {
    // Accepte string brut ou {label:..}
    $label = is_array($t) ? trim((string)($t['label'] ?? '')) : trim((string)$t);
    if ($label === '') continue;
    if (mb_strlen($label) > 255) $label = mb_substr($label, 0, 255);
    $k = mb_strtolower($label);
    if (isset($seen[$k])) continue;
    $seen[$k] = 1;
    DB::run(
        'INSERT INTO service_themes (service_id, label, position) VALUES (?, ?, ?)',
        [$serviceId, $label, $position++]
    );
}

json_response(['ok' => true, 'mode' => $mode]);
