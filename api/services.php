<?php
// ============================================================
//  CultuRésa — API /api/services.php
//  GET    → liste des services
//  POST   ?action=create  → créer un service (admin)
//  POST   ?action=update  → modifier un service (admin)
//  POST   ?action=delete  → supprimer un service (admin)
// ============================================================

require_once __DIR__ . '/../includes/api.php';

$action = $_GET['action'] ?? 'list';
$input  = get_input();

// ── Liste des services (accessible à tous les utilisateurs connectés) ──
if ($action === 'list') {
    $user = require_auth();
    $services = DB::all('SELECT * FROM services ORDER BY position, id');

    // Filtrer par services autorisés si l'utilisateur n'est pas admin
    if ($user['role'] === 'utilisateur' && !empty($user['services'])) {
        $allowed = json_decode($user['services'], true);
        // Sécurité : si le champ a été stocké double-encodé (ex. '"[]"' au lieu de '[]'),
        // la première décode retourne une chaîne — on retente une décode pour récupérer le tableau.
        if (is_string($allowed)) $allowed = json_decode($allowed, true);
        if (!is_array($allowed)) $allowed = [];
        if (!empty($allowed)) {
            $filtered = array_values(array_filter($services, fn($s) => in_array($s['id'], $allowed)));
            // Si au moins un service correspond, restreindre ; sinon laisser tout passer
            if (!empty($filtered)) $services = $filtered;
        }
    }

    // Filtrer par demandeur : un utilisateur ne voit que les services où son
    // demandeur est référencé dans service_demandeur_settings. Le demandeur est
    // récupéré soit directement (u.demandeur_id), soit hérité de sa structure
    // (str.demandeur_id) — cohérent avec api/bookings.php.
    $userDemId = null;
    if ($user['role'] === 'utilisateur') {
        $demRow = DB::one(
            'SELECT COALESCE(u.demandeur_id, str.demandeur_id) AS dem_id
             FROM users u LEFT JOIN structures str ON str.id = u.structure_id
             WHERE u.id = ?',
            [$user['id']]
        );
        $userDemId = $demRow && $demRow['dem_id'] ? (int)$demRow['dem_id'] : null;
        if ($userDemId) {
            $serviceIds = array_column($services, 'id');
            if ($serviceIds) {
                $placeholders = implode(',', array_fill(0, count($serviceIds), '?'));
                $demRows      = DB::all(
                    "SELECT service_id FROM service_demandeur_settings WHERE service_id IN ($placeholders) AND demandeur_id=?",
                    array_merge($serviceIds, [$userDemId])
                );
                $allowedByDem = array_column($demRows, 'service_id');
                $services     = array_values(array_filter($services, fn($s) => in_array($s['id'], $allowedByDem)));
            } else {
                $services = [];
            }
        }
    }

    // Attacher les créneaux à chaque service.
    // Les slots renvoyés sont toujours restreints à un exercice : celui demandé via
    // ?exercice_id=… (= flèches de navigation entre exercices côté UI), sinon le dernier
    // exercice du service. Les miroirs portent désormais le period_id de leur parent
    // récurrent, donc le filtre exercice les couvre. Les ponctuels manuels (period_id IS NULL)
    // restent visibles quel que soit l'exercice.
    // ?include_inactive=1 (admin/gestionnaire) bypass uniquement le filtre state — utilisé
    // par la mirror UI pour permettre la réactivation des miroirs désactivés.
    $includeInactive = !empty($input['include_inactive']) || !empty($_GET['include_inactive']);
    $canSeeInactive  = in_array($user['role'] ?? '', ['gestionnaire', 'administrateur'], true);
    $stateCond       = ($includeInactive && $canSeeInactive) ? '' : "AND state = 'actif'";
    $requestedExId   = $input['exercice_id'] ?? $_GET['exercice_id'] ?? null;
    $requestedExId   = ($requestedExId !== null && $requestedExId !== '') ? (int)$requestedExId : null;
    foreach ($services as &$svc) {
        // Filtre exercice : exercice demandé (admin) sinon dernier exercice du service.
        $exerciseCondRec  = '';
        $exerciseCondUniq = '';
        $exerciseParams   = [];
        if ($requestedExId !== null) {
            $targetExId = $requestedExId;
        } else {
            $latestEx = DB::one("SELECT MAX(exercice_id) AS m FROM periods WHERE service_id = ?", [$svc['id']]);
            $targetExId = ($latestEx && $latestEx['m'] !== null) ? (int)$latestEx['m'] : null;
        }
        if ($targetExId !== null) {
            $exerciseCondRec  = " AND period_id IN (SELECT id FROM periods WHERE service_id = ? AND (exercice_id IS NULL OR exercice_id = ?))";
            $exerciseCondUniq = " AND (period_id IS NULL OR period_id IN (SELECT id FROM periods WHERE service_id = ? AND (exercice_id IS NULL OR exercice_id = ?)))";
            $exerciseParams   = [$svc['id'], $targetExId];
        }
        $svc['slots_recurring'] = DB::all(
            "SELECT * FROM slots
             WHERE service_id = ? AND slot_type = 'recurring' AND period_id IS NOT NULL $stateCond $exerciseCondRec
             ORDER BY period_id, start_time",
            array_merge([$svc['id']], $exerciseParams)
        );
        $capDays = ['lun','mar','mer','jeu','ven','sam','dim'];
        foreach ($svc['slots_recurring'] as &$_sl) {
            $parts = [];
            foreach ($capDays as $_d) {
                if ($_sl['cap_' . $_d] !== null) $parts[] = $_d . ':' . (int)$_sl['cap_' . $_d];
            }
            $_sl['caps'] = implode('|', $parts);
        }
        unset($_sl);
        $svc['slots_unique'] = DB::all(
            "SELECT * FROM slots WHERE service_id = ? AND slot_type = 'unique' $stateCond $exerciseCondUniq ORDER BY slot_date, start_time",
            array_merge([$svc['id']], $exerciseParams)
        );
        // ── Charger les restrictions de demandeurs par créneau ──
        // On indexe par slot_id ; les miroirs récupèrent la liste du parent récurrent.
        $allSlotIds = array_merge(
            array_column($svc['slots_recurring'], 'id'),
            array_column($svc['slots_unique'], 'id')
        );
        $demByRec  = []; // récurrents : id → [demId,...]
        $demBySlot = []; // tous : id → [demId,...]
        if (!empty($allSlotIds)) {
            $ph     = implode(',', array_fill(0, count($allSlotIds), '?'));
            $rows   = DB::all("SELECT slot_id, demandeur_id FROM slot_demandeurs WHERE slot_id IN ($ph)", $allSlotIds);
            foreach ($rows as $r) {
                $demBySlot[$r['slot_id']][] = (int)$r['demandeur_id'];
            }
            foreach ($svc['slots_recurring'] as $rec) {
                $demByRec[$rec['id']] = $demBySlot[$rec['id']] ?? [];
            }
        }
        // Attache demandeur_ids sur chaque slot.
        foreach ($svc['slots_recurring'] as &$_sl) {
            $_sl['demandeur_ids'] = $demBySlot[$_sl['id']] ?? [];
        }
        unset($_sl);
        foreach ($svc['slots_unique'] as &$_sl) {
            // Miroir → hérite du parent récurrent. Ponctuel pur → sa propre liste.
            if (!empty($_sl['parent_slot_id']) && isset($demByRec[$_sl['parent_slot_id']])) {
                $_sl['demandeur_ids'] = $demByRec[$_sl['parent_slot_id']];
            } else {
                $_sl['demandeur_ids'] = $demBySlot[$_sl['id']] ?? [];
            }
        }
        unset($_sl);
        // ── Filtrage côté utilisateur final ──
        // Un créneau est visible si sa liste est vide (aucune restriction) ou contient le demandeur du user.
        if ($userDemId !== null) {
            $matches = fn($sl) => empty($sl['demandeur_ids']) || in_array($userDemId, $sl['demandeur_ids'], true);
            $svc['slots_recurring'] = array_values(array_filter($svc['slots_recurring'], $matches));
            $svc['slots_unique']    = array_values(array_filter($svc['slots_unique'],    $matches));
        }
        // Décoder active_days
        $svc['active_days']      = explode(',', $svc['active_days']);
        $svc['open_on_holidays'] = (bool)($svc['open_on_holidays'] ?? false);
    }
    unset($svc);

    json_response(['ok' => true, 'services' => $services]);
}

// ── Actions admin et gestionnaire ───────────────────────────
$manager = require_manager();

switch ($action) {

    case 'create':
        $max = (int)(DB::one(
            "SELECT MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)) AS m
             FROM services WHERE id REGEXP '^svc_[0-9]+$'"
        )['m'] ?? 0);
        $id = sprintf('svc_%03d', $max + 1);
        DB::run(
            'INSERT INTO services (id,label,validation_bloquante,max_reservations,max_reservations_period,active_days,position)
             VALUES (?,?,?,?,?,?,?)',
            [
                $id,
                trim($input['label'] ?? 'Nouveau service'),
                1,
                (int)($input['max_reservations'] ?? 3),
                (int)($input['max_reservations_period'] ?? 1),
                implode(',', $input['active_days'] ?? ['lun','mar','mer','jeu','ven']),
                (int)($input['position'] ?? 99),
            ]
        );
        $month = (int)date('n');
        $year  = (int)date('Y');
        $y1 = ($month >= 9) ? $year : $year - 1; // année de début de l'année scolaire
        $y2 = $y1 + 1;
        foreach ([
            ['T1', 'T1 — Septembre - Décembre', '#00b050', "$y1-09-01", "$y1-12-31", 1],
            ['T2', 'T2 — Janvier - Mars',       '#ff0000', "$y2-01-01", "$y2-03-31", 2],
            ['T3', 'T3 — Avril - Juin',         '#ffff00', "$y2-04-01", "$y2-06-30", 3],
        ] as [$etiquette, $label, $color, $ds, $de, $pos]) {
            DB::run(
                'INSERT INTO periods (service_id, etiquette, label, color, date_start, date_end, position) VALUES (?,?,?,?,?,?,?)',
                [$id, $etiquette, $label, $color, $ds, $de, $pos]
            );
        }
        json_response(['ok' => true, 'id' => $id]);

    case 'update':
        $id = $input['id'] ?? '';
        if (!$id) json_response(['ok' => false, 'error' => 'ID manquant'], 400);
        require_manager_service($id, $manager);
        $fields = [];
        $params = [];
        $allowed = ['label','icon','validation_bloquante','max_reservations','max_reservations_period','ponct_duration','ponct_capacity','recur_duration','recur_capacity','morning_start','morning_end','afternoon_start','afternoon_end','position','booking_delay','auto_validation_delay','open_on_holidays','show_previous_exercices'];
        foreach ($allowed as $f) {
            if (isset($input[$f])) { $fields[] = "$f=?"; $params[] = $input[$f]; }
        }
        if (isset($input['active_days'])) {
            $fields[] = 'active_days=?';
            $params[] = is_array($input['active_days'])
                ? implode(',', $input['active_days'])
                : $input['active_days'];
        }
        if (empty($fields)) json_response(['ok' => false, 'error' => 'Rien à modifier'], 400);
        $params[] = $id;
        DB::run('UPDATE services SET ' . implode(',', $fields) . ' WHERE id=?', $params);
        json_response(['ok' => true]);

    case 'delete':
        $id = $input['id'] ?? '';
        if (!$id) json_response(['ok' => false, 'error' => 'ID manquant'], 400);
        require_manager_service($id, $manager);
        DB::run('DELETE FROM services WHERE id=?', [$id]);
        json_response(['ok' => true]);

    default:
        json_response(['ok' => false, 'error' => 'Action inconnue'], 400);
}
