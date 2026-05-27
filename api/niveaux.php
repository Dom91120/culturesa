<?php
// ============================================================
//  CultuRézo — API /api/niveaux.php
//  GET  action=list   (public) → liste des niveaux
//  POST action=create (auth)   → cree un niveau (dedup case-insensitive)
// ============================================================

require_once __DIR__ . '/../includes/api.php';

$action = $_GET['action'] ?? 'list';
$input  = get_input();

if ($action === 'list') {
    $niveaux = DB::all('SELECT id, label, demandeur_id FROM niveaux ORDER BY demandeur_id, position, id');
    json_response(['ok' => true, 'niveaux' => $niveaux]);
}

// Actions modifiantes : tout utilisateur authentifie peut creer un niveau
// (option choisie pour permettre l'enrichissement libre depuis les formulaires).
require_auth();

switch ($action) {
    case 'create': {
        $label = trim((string)($input['label'] ?? ''));
        if ($label === '' || mb_strlen($label) > 50) {
            json_response(['ok' => false, 'error' => 'Libelle invalide (1-50 caracteres)'], 400);
        }
        $demRaw = $input['demandeur_id'] ?? null;
        $demId  = ($demRaw === '' || $demRaw === null) ? null : (int)$demRaw;

        // Deduplication : la collation utf8mb4_0900_ai_ci de la colonne label est
        // case+accent insensitive, donc un simple WHERE label = ? matche aussi
        // "CP" / "cp" / "Cp" comme equivalents. On retourne l'existant s'il y en a un,
        // sans creer de doublon (peu importe qu'il soit transverse ou attache a un demandeur).
        $existing = DB::one(
            'SELECT id, label, demandeur_id FROM niveaux WHERE label = ? ORDER BY id LIMIT 1',
            [$label]
        );
        if ($existing) {
            $existing['demandeur_id'] = $existing['demandeur_id'] !== null
                ? (int)$existing['demandeur_id'] : null;
            json_response(['ok' => true, 'niveau' => $existing, 'created' => false]);
        }

        DB::run('INSERT INTO niveaux (label, demandeur_id, position) VALUES (?, ?, ?)',
                [$label, $demId, 0]);
        $id = (int)DB::lastId();
        json_response([
            'ok'      => true,
            'created' => true,
            'niveau'  => ['id' => $id, 'label' => $label, 'demandeur_id' => $demId],
        ]);
    }
}

json_response(['ok' => false, 'error' => 'Action inconnue'], 400);
