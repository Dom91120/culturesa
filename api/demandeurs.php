<?php
require_once __DIR__ . '/../includes/api.php';

$action = $_GET['action'] ?? 'list';
$input  = get_input();

if ($action === 'list') {
    $demandeurs = DB::all('SELECT id, label, open_on_school_holidays FROM demandeurs ORDER BY id');
    foreach ($demandeurs as &$d) {
        $d['open_on_school_holidays'] = (int)$d['open_on_school_holidays'];
    }
    unset($d);
    json_response(['ok' => true, 'demandeurs' => $demandeurs]);
}

// Actions modifiantes : admin uniquement.
require_admin();

switch ($action) {
    case 'create': {
        $label = trim((string)($input['label'] ?? ''));
        if ($label === '') json_response(['ok' => false, 'error' => 'Libellé requis'], 400);
        // open=1 par défaut (pas de clé envoyée → ouvert).
        $open = array_key_exists('open_on_school_holidays', $input)
            ? (!empty($input['open_on_school_holidays']) ? 1 : 0)
            : 1;
        DB::run('INSERT INTO demandeurs (label, open_on_school_holidays) VALUES (?, ?)', [$label, $open]);
        json_response(['ok' => true, 'id' => (int)DB::get()->lastInsertId()]);
    }
    case 'update': {
        $id = (int)($input['id'] ?? 0);
        if (!$id) json_response(['ok' => false, 'error' => 'id requis'], 400);
        $sets = []; $args = [];
        if (array_key_exists('label', $input)) {
            $label = trim((string)$input['label']);
            if ($label === '') json_response(['ok' => false, 'error' => 'Libellé requis'], 400);
            $sets[] = 'label = ?'; $args[] = $label;
        }
        if (array_key_exists('open_on_school_holidays', $input)) {
            $sets[] = 'open_on_school_holidays = ?';
            $args[] = !empty($input['open_on_school_holidays']) ? 1 : 0;
        }
        if (!$sets) json_response(['ok' => false, 'error' => 'Aucun champ à mettre à jour'], 400);
        $args[] = $id;
        DB::run('UPDATE demandeurs SET ' . implode(', ', $sets) . ' WHERE id = ?', $args);
        json_response(['ok' => true]);
    }
    case 'delete': {
        $id = (int)($input['id'] ?? 0);
        if (!$id) json_response(['ok' => false, 'error' => 'id requis'], 400);
        DB::run('DELETE FROM demandeurs WHERE id = ?', [$id]);
        json_response(['ok' => true]);
    }
}

json_response(['ok' => false, 'error' => 'Action inconnue'], 400);
