<?php
// CultuRésa — API /api/periods.php
require_once __DIR__ . '/../includes/api.php';
require_once __DIR__ . '/../includes/holidays.php';
require_once __DIR__ . '/../includes/exercice.php';

$action = $_GET['action'] ?? 'list';
$input  = get_input();

if ($action === 'list') {
    require_auth();
    $serviceId = $input['service_id'] ?? null;
    // Le nombre de "relations" (hors period_holidays qui cascade) sert au front pour
    // décider si une période peut être supprimée ou seulement désactivée.
    // On compte :
    //   - bookings rattachés (period_id = p.id)
    //   - slots récurrents rattachés (period_id = p.id)
    //   - slots ponctuels (slot_type='unique') du même service qui tombent dans
    //     la plage [date_start, date_end], même s'ils ne portent pas de period_id explicite.
    //     Si p.service_id est NULL (période globale), la condition `service_id = NULL`
    //     reste UNKNOWN et exclut ces slots du compte.
    $relSql = '(SELECT COUNT(*) FROM bookings WHERE period_id = p.id)'
            . ' + (SELECT COUNT(*) FROM slots WHERE period_id = p.id)'
            . ' + (SELECT COUNT(*) FROM slots WHERE slot_type=\'unique\' AND service_id = p.service_id'
            . '       AND slot_date BETWEEN p.date_start AND p.date_end) AS relations_count';
    if ($serviceId) {
        // Périodes propres au service ; si aucune, retomber sur les périodes globales
        $periods = DB::all(
            "SELECT p.*, $relSql FROM periods p WHERE service_id=? ORDER BY date_start IS NULL, date_start, id",
            [$serviceId]
        );
        if (empty($periods)) {
            $periods = DB::all("SELECT p.*, $relSql FROM periods p WHERE service_id IS NULL ORDER BY date_start IS NULL, date_start, id");
        }
    } else {
        $periods = DB::all("SELECT p.*, $relSql FROM periods p WHERE service_id IS NULL ORDER BY date_start IS NULL, date_start, id");
    }
    // Liste des exercices distincts apparaissant dans la sélection de périodes,
    // triée par label (chronologique car les labels sont "YYYY" / "YYYY-YYYY").
    $exercices = [];
    $exIds = array_filter(array_unique(array_map(fn($p) => $p['exercice_id'] ?? null, $periods)));
    if (!empty($exIds)) {
        $ph = implode(',', array_fill(0, count($exIds), '?'));
        $exercices = DB::all("SELECT id, label, created_at FROM exercice WHERE id IN ($ph) ORDER BY label", array_values($exIds));
    }
    json_response(['ok' => true, 'periods' => $periods, 'exercices' => $exercices]);
}

$manager = require_manager();

switch ($action) {
    case 'create':
        $cStart = $input['date_start'] ?? null;
        $cEnd   = $input['date_end']   ?? null;
        $cSvc   = $input['service_id'] ?? null;
        // Si le client précise explicitement l'exercice (cas du bouton "Ajouter une période"
        // qui force l'exercice en cours), on l'utilise tel quel. Sinon on déduit du label.
        if (array_key_exists('exercice_id', $input) && $input['exercice_id'] !== null && $input['exercice_id'] !== '') {
            $cExId = (int)$input['exercice_id'];
        } else {
            $cExLabel = compute_exercice_label($cStart, $cEnd);
            $cExId    = $cExLabel ? find_or_create_exercice($cExLabel) : null;
        }
        // Verrou : la création n'est permise que sur le dernier exercice du service
        // (le service n'a pas encore de périodes → création libre, qui amorcera le 1er exercice).
        $cLatest = latest_exercice_id_for_service($cSvc);
        if ($cLatest !== null && $cExId !== null && $cExId !== $cLatest) {
            json_response(['ok' => false, 'error' => "Création autorisée uniquement sur le dernier exercice du service."], 403);
        }
        if ($cExId && $cStart && $cEnd) {
            $err = validate_period_in_exercice($cExId, $cSvc, $cStart, $cEnd);
            if ($err) json_response(['ok' => false, 'error' => $err], 400);
        }
        DB::run(
            'INSERT INTO periods (service_id,exercice_id,label,date_start,date_end,color,position) VALUES (?,?,?,?,?,?,?)',
            [
                $cSvc,
                $cExId,
                trim($input['label'] ?? 'Nouvelle période'),
                $cStart,
                $cEnd,
                $input['color']      ?? '#6dceaa',
                (int)($input['position'] ?? 99),
            ]
        );
        $newId = (int)DB::lastId();
        refresh_period_holidays($newId);
        if ($cExId) recompute_exercice_label($cExId);
        json_response(['ok' => true, 'id' => $newId]);

    case 'update':
        $id = (int)($input['id'] ?? 0);
        if (!$id) json_response(['ok' => false, 'error' => 'ID manquant'], 400);
        $allowed = ['label','etiquette','date_start','date_end','color','position','state'];
        $fields = []; $params = [];
        foreach ($allowed as $f) {
            if (array_key_exists($f, $input)) { $fields[] = "$f=?"; $params[] = $input[$f]; }
        }
        // Rattachement à un exercice : seulement si le client le précise explicitement.
        // Les changements de dates ne déclenchent plus de réaffectation automatique : la
        // période reste dans son exercice ; seul le libellé de l'exercice est recalculé.
        if (array_key_exists('exercice_id', $input)) {
            $fields[] = 'exercice_id=?';
            $params[] = $input['exercice_id'] === '' ? null : $input['exercice_id'];
        }
        if (empty($fields)) json_response(['ok' => false, 'error' => 'Rien à modifier'], 400);
        // Validation préalable si dates et/ou exercice changent : 2 années contigües max,
        // pas de chevauchement avec une autre période du même service dans l'exercice.
        $current = DB::one('SELECT service_id, exercice_id, date_start, date_end FROM periods WHERE id=?', [$id]);
        if (!$current) json_response(['ok' => false, 'error' => 'Période introuvable'], 404);
        $newStart = array_key_exists('date_start', $input) ? $input['date_start'] : $current['date_start'];
        $newEnd   = array_key_exists('date_end',   $input) ? $input['date_end']   : $current['date_end'];
        $newSvc   = $current['service_id'];
        $newExId  = array_key_exists('exercice_id', $input)
            ? ($input['exercice_id'] === '' ? null : (int)$input['exercice_id'])
            : ($current['exercice_id'] !== null ? (int)$current['exercice_id'] : null);
        // Verrou : on n'agit que sur le dernier exercice du service (avant ET après l'update).
        $uLatest  = latest_exercice_id_for_service($newSvc);
        $currExId = $current['exercice_id'] !== null ? (int)$current['exercice_id'] : null;
        if ($uLatest !== null && $currExId !== null && $currExId !== $uLatest) {
            json_response(['ok' => false, 'error' => "Modification autorisée uniquement sur le dernier exercice du service."], 403);
        }
        if ($uLatest !== null && $newExId !== null && $newExId !== $uLatest) {
            json_response(['ok' => false, 'error' => "L'exercice cible doit être le dernier exercice du service."], 403);
        }
        if ($newExId && $newStart && $newEnd) {
            $err = validate_period_in_exercice($newExId, $newSvc, $newStart, $newEnd, $id);
            if ($err) json_response(['ok' => false, 'error' => $err], 400);
        }
        $params[] = $id;
        DB::run("UPDATE periods SET " . implode(',', $fields) . " WHERE id=?", $params);
        refresh_period_holidays($id);
        // Recalcul du libellé : exercice cible + ancien (si différent, ce qui survient seulement
        // si exercice_id a changé via le payload).
        if ($newExId) recompute_exercice_label($newExId);
        if ($current['exercice_id'] && (int)$current['exercice_id'] !== $newExId) {
            recompute_exercice_label((int)$current['exercice_id']);
        }
        if (array_key_exists('exercice_id', $input)) cleanup_orphan_exercices();
        json_response(['ok' => true]);

    case 'delete':
        $id = (int)($input['id'] ?? 0);
        if (!$id) json_response(['ok' => false, 'error' => 'ID manquant'], 400);
        $delPeriod = DB::one('SELECT service_id, exercice_id FROM periods WHERE id=?', [$id]);
        if (!$delPeriod) json_response(['ok' => false, 'error' => 'Période introuvable'], 404);
        // Verrou : on ne supprime que sur le dernier exercice du service.
        $dLatest = latest_exercice_id_for_service($delPeriod['service_id']);
        $dExId   = $delPeriod['exercice_id'] !== null ? (int)$delPeriod['exercice_id'] : null;
        if ($dLatest !== null && $dExId !== null && $dExId !== $dLatest) {
            json_response(['ok' => false, 'error' => "Suppression autorisée uniquement sur le dernier exercice du service."], 403);
        }
        // Cascade applicatif (la FK fk_bk_period a été supprimée pour permettre period_id=0 sentinelle des bookings unique)
        DB::run("DELETE FROM bookings WHERE period_id=? AND booking_type='recurring'", [$id]);
        DB::run('DELETE FROM periods WHERE id=?', [$id]);
        if ($delPeriod && $delPeriod['exercice_id']) {
            recompute_exercice_label((int)$delPeriod['exercice_id']);
        }
        cleanup_orphan_exercices();
        json_response(['ok' => true]);

    case 'cycle':
        // Roll-over : duplique toutes les périodes actives en y ajoutant +1 an,
        // puis désactive les originales. Optionnellement clone aussi les créneaux
        // récurrents associés.
        $serviceId       = $input['service_id'] ?? null;
        $recreatePeriods = (int)($input['recreate_periods'] ?? 1) === 1;
        $recreateSlots   = (int)($input['recreate_slots']   ?? 1) === 1;
        if (!$recreatePeriods) {
            // Aucune action demandée — renvoie OK sans rien faire.
            json_response(['ok' => true, 'created' => 0, 'slots_created' => 0]);
        }
        $where  = $serviceId ? 'service_id=?' : 'service_id IS NULL';
        $params = $serviceId ? [$serviceId] : [];
        $actives = DB::all(
            "SELECT * FROM periods WHERE state='actif' AND $where ORDER BY date_start IS NULL, date_start, id",
            $params
        );
        if (empty($actives)) {
            json_response(['ok' => false, 'error' => 'Aucune période active à reconduire'], 409);
        }
        // Garde-fou désactivé pour tests : la fin de la dernière période active
        // n'est plus vérifiée par rapport à la date du jour.
        // Helpers locaux
        $isLeap = function (int $y): bool {
            return ($y % 4 === 0 && $y % 100 !== 0) || ($y % 400 === 0);
        };
        $shiftYear = function (?string $d) use ($isLeap): ?string {
            if (!$d) return null;
            $dt    = new DateTime($d);
            $y     = (int)$dt->format('Y');
            $m     = (int)$dt->format('m');
            $day   = (int)$dt->format('d');
            $ny    = $y + 1;
            // Cas spécial fin février : on mappe sur le dernier jour de février de l'année cible.
            if ($m === 2) {
                $isEndOfFeb = ($day === 29) || ($day === 28 && !$isLeap($y));
                if ($isEndOfFeb) {
                    $newDay = $isLeap($ny) ? 29 : 28;
                    return sprintf('%04d-02-%02d', $ny, $newDay);
                }
            }
            return sprintf('%04d-%02d-%02d', $ny, $m, $day);
        };
        $pdo = DB::get();
        $pdo->beginTransaction();
        try {
            // Étape 0 — Snapshot en mémoire des créneaux récurrents actifs (avant toute mutation),
            // pour pouvoir les cloner ensuite vers les nouvelles périodes.
            // Le clonage est limité au cycle service-spécifique : les périodes globales
            // n'ont pas de slot dédié (les slots sont toujours rattachés à un service).
            $snapSlots = [];
            if ($recreateSlots && $serviceId) {
                foreach ($actives as $p) {
                    $snapSlots[(int)$p['id']] = DB::all(
                        "SELECT * FROM slots WHERE slot_type='recurring' AND period_id=? AND service_id=?",
                        [(int)$p['id'], $serviceId]
                    );
                }
            }
            // Capture des IDs avant mutation (pour journaliser et permettre l'undo).
            $archivedPeriodIds = array_map('intval', array_column(
                DB::all("SELECT id FROM periods WHERE state='desactive' AND $where", $params),
                'id'
            ));
            // Étape 1 — Périodes actuellement 'desactive' → 'archive' (cleanup de l'exercice précédent).
            DB::run("UPDATE periods SET state='archive' WHERE state='desactive' AND $where", $params);

            // Pré-calcul du nouvel exercice : 1 entrée pour toutes les nouvelles périodes,
            // libellée d'après min/max année des dates décalées (ex. "2026-2027").
            $newMinYS = null; $newMaxYE = null;
            foreach ($actives as $p) {
                $ns = $shiftYear($p['date_start']);
                $ne = $shiftYear($p['date_end']);
                if ($ns) { $y = (int)substr($ns, 0, 4); $newMinYS = $newMinYS === null ? $y : min($newMinYS, $y); }
                if ($ne) { $y = (int)substr($ne, 0, 4); $newMaxYE = $newMaxYE === null ? $y : max($newMaxYE, $y); }
            }
            $newExerciceId = null;
            if ($newMinYS !== null && $newMaxYE !== null) {
                $newExerciceLabel = $newMinYS === $newMaxYE ? (string)$newMinYS : "$newMinYS-$newMaxYE";
                $newExerciceId    = find_or_create_exercice($newExerciceLabel);
            }
            $created = 0;
            $slotsCreated = 0;
            $newPeriodIds = [];
            $newRecurringSlotIds = [];
            $newMirrorSlotIds    = [];
            $oldDeactivatedPeriodIds = []; // périodes qui passent de 'actif' à 'desactive' à l'étape 5
            foreach ($actives as $p) {
                $newStart = $shiftYear($p['date_start']);
                $newEnd   = $shiftYear($p['date_end']);
                DB::run(
                    "INSERT INTO periods (service_id, exercice_id, label, etiquette, date_start, date_end, color, position, state)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'actif')",
                    [
                        $p['service_id'],
                        $newExerciceId,
                        $p['label'],
                        $p['etiquette'],
                        $newStart,
                        $newEnd,
                        $p['color'],
                        (int)$p['position'],
                    ]
                );
                $newId = (int)DB::lastId();
                $newPeriodIds[] = $newId;
                refresh_period_holidays($newId);
                // Étape 4 — Cloner les créneaux récurrents de l'ancienne période vers la nouvelle (depuis le snapshot)
                // ET pré-générer leurs miroirs uniques pour chaque date concrète de la nouvelle période.
                if ($recreateSlots && $serviceId) {
                    // Données pour la pré-génération des miroirs (cf. api/slots.php save flow)
                    $svc        = DB::one('SELECT active_days, open_on_holidays FROM services WHERE id=?', [$serviceId]);
                    $activeDays = $svc ? array_filter(array_map('trim', explode(',', $svc['active_days']))) : [];
                    $phpDayMap  = ['lun'=>1,'mar'=>2,'mer'=>3,'jeu'=>4,'ven'=>5,'sam'=>6,'dim'=>0];
                    $holidayDates = [];
                    if (empty($svc['open_on_holidays'])) {
                        // open_on_holidays=0 → service fermé pendant les jours fériés → exclure ces dates
                        $rows = DB::all('SELECT date FROM period_holidays WHERE period_id=?', [$newId]);
                        $holidayDates = array_flip(array_column($rows, 'date'));
                    }
                    foreach (($snapSlots[(int)$p['id']] ?? []) as $sl) {
                        $newSlotId = 'sl_' . substr(md5(uniqid('', true)), 0, 8);
                        DB::run(
                            "INSERT INTO slots (id, service_id, slot_type, period_id, start_time, end_time, slot_date, weeks,
                                                cap_lun, cap_mar, cap_mer, cap_jeu, cap_ven, cap_sam, cap_dim, state)
                             VALUES (?, ?, 'recurring', ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'actif')",
                            [
                                $newSlotId,
                                $sl['service_id'],
                                $newId,
                                $sl['start_time'],
                                $sl['end_time'],
                                $sl['weeks'],
                                $sl['cap_lun'], $sl['cap_mar'], $sl['cap_mer'],
                                $sl['cap_jeu'], $sl['cap_ven'], $sl['cap_sam'], $sl['cap_dim'],
                            ]
                        );
                        $newRecurringSlotIds[] = $newSlotId;
                        $slotsCreated++;

                        // Pré-générer les miroirs uniques pour chaque jour avec capacité définie.
                        if (!$newStart || !$newEnd || !$activeDays) continue;
                        $weeksStr  = $sl['weeks'] ?? '';
                        $weeksList = $weeksStr ? array_filter(array_map('trim', explode(',', $weeksStr))) : [];
                        $capByDay  = [
                            'lun' => $sl['cap_lun'], 'mar' => $sl['cap_mar'], 'mer' => $sl['cap_mer'],
                            'jeu' => $sl['cap_jeu'], 'ven' => $sl['cap_ven'], 'sam' => $sl['cap_sam'], 'dim' => $sl['cap_dim'],
                        ];
                        foreach ($activeDays as $dayKey) {
                            $targetDay = $phpDayMap[$dayKey] ?? -1;
                            if ($targetDay === -1) continue;
                            if (!isset($capByDay[$dayKey]) || $capByDay[$dayKey] === null) continue;
                            $dayCap = (int)$capByDay[$dayKey];
                            $cur = new DateTime($newStart);
                            $end = new DateTime($newEnd);
                            while ((int)$cur->format('w') !== $targetDay) {
                                if ($cur > $end) break;
                                $cur->modify('+1 day');
                            }
                            while ($cur <= $end) {
                                $dateStr = $cur->format('Y-m-d');
                                $isoWeek = (int)$cur->format('W');
                                $isWeekA = ($isoWeek % 2 === 0);
                                $matches = empty($weeksList)
                                    || ($isWeekA  && in_array('A', $weeksList, true))
                                    || (!$isWeekA && in_array('B', $weeksList, true));
                                if (!isset($holidayDates[$dateStr]) && $matches) {
                                    $uSlotId     = 'u_' . $newSlotId . '_' . $dateStr;
                                    $mirrorWeeks = empty($weeksList) ? null : ($isWeekA ? 'A' : 'B');
                                    DB::run(
                                        "INSERT INTO slots (id, service_id, slot_type, parent_slot_id, period_id, start_time, end_time, slot_date, weeks, capacity, state)
                                         VALUES (?, ?, 'unique', ?, ?, ?, ?, ?, ?, ?, 'actif')
                                         ON DUPLICATE KEY UPDATE
                                           period_id=VALUES(period_id),
                                           start_time=VALUES(start_time), end_time=VALUES(end_time),
                                           weeks=VALUES(weeks), capacity=VALUES(capacity)",
                                        [$uSlotId, $sl['service_id'], $newSlotId, $newId,
                                         $sl['start_time'], $sl['end_time'], $dateStr, $mirrorWeeks, $dayCap]
                                    );
                                    $newMirrorSlotIds[] = $uSlotId;
                                }
                                $cur->modify('+7 days');
                            }
                        }
                    }
                }
                // Étape 5 — Les anciennes périodes passent à 'desactive'.
                DB::run("UPDATE periods SET state='desactive' WHERE id=?", [(int)$p['id']]);
                $oldDeactivatedPeriodIds[] = (int)$p['id'];
                $created++;
            }
            // Journaliser le cycle pour permettre l'undo.
            $eventData = [
                'archived_period_ids'        => $archivedPeriodIds,
                'new_period_ids'             => $newPeriodIds,
                'new_recurring_slot_ids'     => $newRecurringSlotIds,
                'new_mirror_slot_ids'        => $newMirrorSlotIds,
                'old_deactivated_period_ids' => $oldDeactivatedPeriodIds,
            ];
            DB::run(
                'INSERT INTO cycle_events (service_id, data) VALUES (?, ?)',
                [$serviceId, json_encode($eventData)]
            );
            $pdo->commit();
            json_response(['ok' => true, 'created' => $created, 'slots_created' => $slotsCreated]);
        } catch (Throwable $e) {
            $pdo->rollBack();
            json_response(['ok' => false, 'error' => 'Erreur : ' . $e->getMessage()], 500);
        }

    case 'undo_cycle':
        // Revertit le dernier cycle journalisé pour le service (ou cycle global si service_id null).
        $serviceId = $input['service_id'] ?? null;
        $where  = $serviceId ? 'service_id=?' : 'service_id IS NULL';
        $params = $serviceId ? [$serviceId] : [];
        $event = DB::one(
            "SELECT id, data FROM cycle_events WHERE $where ORDER BY id DESC LIMIT 1",
            $params
        );
        if (!$event) {
            json_response(['ok' => false, 'error' => 'Aucun changement d\'exercice à annuler'], 404);
        }
        $data = json_decode($event['data'], true) ?: [];
        $pdo = DB::get();
        $pdo->beginTransaction();
        try {
            // 1. Supprimer les nouveaux miroirs et leurs réservations.
            if (!empty($data['new_mirror_slot_ids'])) {
                $ids = $data['new_mirror_slot_ids'];
                $ph  = implode(',', array_fill(0, count($ids), '?'));
                DB::run("DELETE FROM bookings WHERE slot_id IN ($ph) AND booking_type='unique'", $ids);
                DB::run("DELETE FROM slots    WHERE id      IN ($ph)", $ids);
            }
            // 2. Supprimer les nouveaux slots récurrents et leurs réservations.
            if (!empty($data['new_recurring_slot_ids'])) {
                $ids = $data['new_recurring_slot_ids'];
                $ph  = implode(',', array_fill(0, count($ids), '?'));
                DB::run("DELETE FROM bookings WHERE slot_id IN ($ph) AND booking_type='recurring'", $ids);
                DB::run("DELETE FROM slots    WHERE id      IN ($ph)", $ids);
            }
            // 3. Supprimer les nouvelles périodes (et leurs bookings/holidays liés).
            if (!empty($data['new_period_ids'])) {
                $ids = array_map('intval', $data['new_period_ids']);
                $ph  = implode(',', array_fill(0, count($ids), '?'));
                DB::run("DELETE FROM bookings        WHERE period_id IN ($ph) AND booking_type='recurring'", $ids);
                DB::run("DELETE FROM period_holidays WHERE period_id IN ($ph)", $ids);
                DB::run("DELETE FROM periods         WHERE id        IN ($ph)", $ids);
            }
            // 4. Restaurer les périodes désactivées par le cycle → 'actif'.
            if (!empty($data['old_deactivated_period_ids'])) {
                $ids = array_map('intval', $data['old_deactivated_period_ids']);
                $ph  = implode(',', array_fill(0, count($ids), '?'));
                DB::run("UPDATE periods SET state='actif' WHERE id IN ($ph)", $ids);
            }
            // 5. Restaurer les périodes archivées par le cycle → 'desactive'.
            if (!empty($data['archived_period_ids'])) {
                $ids = array_map('intval', $data['archived_period_ids']);
                $ph  = implode(',', array_fill(0, count($ids), '?'));
                DB::run("UPDATE periods SET state='desactive' WHERE id IN ($ph)", $ids);
            }
            // 6. Supprimer l'entrée d'événement (un seul undo possible par cycle).
            DB::run("DELETE FROM cycle_events WHERE id=?", [(int)$event['id']]);
            // 7. Nettoyer les exercices devenus orphelins (plus aucune période liée).
            cleanup_orphan_exercices();
            $pdo->commit();
            json_response(['ok' => true]);
        } catch (Throwable $e) {
            $pdo->rollBack();
            json_response(['ok' => false, 'error' => 'Erreur : ' . $e->getMessage()], 500);
        }

    case 'undo_cycle_info':
        // Retourne le nombre de réservations qui seraient supprimées par l'undo
        // (= bookings rattachés aux nouvelles périodes / nouveaux slots créés par le dernier cycle).
        $serviceId = $input['service_id'] ?? null;
        $where  = $serviceId ? 'service_id=?' : 'service_id IS NULL';
        $params = $serviceId ? [$serviceId] : [];
        $event = DB::one(
            "SELECT id, created_at, data FROM cycle_events WHERE $where ORDER BY id DESC LIMIT 1",
            $params
        );
        if (!$event) {
            json_response(['ok' => true, 'has_undo' => false, 'bookings_count' => 0]);
        }
        $data = json_decode($event['data'], true) ?: [];
        $bookingsCount = 0;
        if (!empty($data['new_period_ids'])) {
            $ids = array_map('intval', $data['new_period_ids']);
            $ph  = implode(',', array_fill(0, count($ids), '?'));
            $bookingsCount += (int)DB::one(
                "SELECT COUNT(*) AS n FROM bookings WHERE booking_type='recurring' AND period_id IN ($ph)",
                $ids
            )['n'];
        }
        $slotIds = array_merge(
            $data['new_recurring_slot_ids'] ?? [],
            $data['new_mirror_slot_ids']    ?? []
        );
        if (!empty($slotIds)) {
            $ph = implode(',', array_fill(0, count($slotIds), '?'));
            $bookingsCount += (int)DB::one(
                "SELECT COUNT(*) AS n FROM bookings WHERE slot_id IN ($ph)",
                $slotIds
            )['n'];
        }
        json_response([
            'ok' => true,
            'has_undo' => true,
            'created_at' => $event['created_at'],
            'bookings_count' => $bookingsCount,
        ]);

    default:
        json_response(['ok' => false, 'error' => 'Action inconnue'], 400);
}
