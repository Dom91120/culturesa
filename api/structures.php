<?php
require_once __DIR__ . '/../includes/api.php';

$input        = get_input();
$demandeurId = (int)($_GET['demandeur_id'] ?? $input['demandeur_id'] ?? 0);

if ($demandeurId) {
    $structures = DB::all(
        'SELECT id, label FROM structures WHERE demandeur_id=? ORDER BY label',
        [$demandeurId]
    );
} else {
    $structures = DB::all('SELECT id, demandeur_id, label FROM structures ORDER BY demandeur_id, label');
}
json_response(['ok' => true, 'structures' => $structures]);
