<?php
// ============================================================
//  CultuRézo — API /api/slots.php
//  POST ?action=save          → sauvegarder les créneaux d'un service (admin)
//  POST ?action=set_state     → activer / désactiver / archiver un créneau
//  POST ?action=set_demandeurs → définir les demandeurs autorisés
// ============================================================

require_once __DIR__ . '/../includes/api.php';
require_once __DIR__ . '/../includes/holidays.php';

// Normalise un horaire au format "HH:MM" (zero-pad). Tolere "9h00", "9:0", "09:00:00".
// Renvoie '' si l'entree est vide / invalide (creneau "journee entiere").
function normalize_slot_time($t): string {
    if ($t === null || $t === '') return '';
    $t = trim((string)$t);
    $t = str_replace('h', ':', $t);
    if (!preg_match('/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/', $t, $m)) return '';
    return str_pad($m[1], 2, '0', STR_PAD_LEFT) . ':' . str_pad($m[2], 2, '0', STR_PAD_LEFT);
}

$action = $_GET['action'] ?? '';
$input  = get_input();

// ── Admin et gestionnaire ──────────────────────────────────
$manager = require_manager();

switch ($action) {

    // Sauvegarde complète des créneaux d'un service
    case 'save':
        $serviceId = $input['service_id'] ?? '';
        $type      = $input['type'] ?? 'recurring';
        $periodId  = isset($input['period_id']) ? (int)$input['period_id'] : null;
        $slots     = $input['slots'] ?? [];
        if (!$serviceId) json_response(['ok' => false, 'error' => 'service_id manquant'], 400);
        if ($type === 'recurring' && !$periodId) json_response(['ok' => false, 'error' => 'period_id manquant'], 400);
        require_manager_service($serviceId, $manager);

        $pdo = DB::get();
        $pdo->beginTransaction();
        try {
            if ($type === 'recurring') {
                // IDs des créneaux conservés dans le nouveau payload
                $keptIds = array_values(array_filter(array_column($slots, 'id')));

                // Stratégie UPSERT (au lieu de DELETE+INSERT global) pour préserver les
                // réservations récurrentes : la FK bookings.slot_id -> slots.id est ON DELETE
                // CASCADE, un DELETE global du slot effaçait donc les bookings recurring.
                //
                // - Slots non conservés : DELETE explicite (cascade-supprime leurs bookings
                //   recurring, ce qui est attendu puisque l'utilisateur a retiré le slot).
                // - Miroirs des slots supprimés : on ne supprime QUE les miroirs actifs ;
                //   les désactivés/archivés sont préservés comme trace historique.
                // - Slots conservés : INSERT ON DUPLICATE KEY UPDATE plus bas (ne touche pas
                //   la FK, donc bookings préservés).
                //
                // Les créneaux dont state != 'actif' sont protégés (pas dans le payload).
                $oldRecIds = DB::all(
                    'SELECT id FROM slots WHERE service_id=? AND slot_type="recurring" AND period_id=? AND state="actif"',
                    [$serviceId, $periodId]
                );
                foreach ($oldRecIds as $old) {
                    if (!in_array($old['id'], $keptIds)) {
                        // Miroirs actifs uniquement : supprimer leurs bookings unique puis le miroir.
                        // Les miroirs désactivés/archivés restent en base — le schéma autorise un
                        // parent_slot_id orphelin (pas de FK sur cette colonne).
                        $activeChildren = DB::all(
                            'SELECT id FROM slots WHERE parent_slot_id=? AND (state IS NULL OR state="actif")',
                            [$old['id']]
                        );
                        foreach ($activeChildren as $child) {
                            DB::run("DELETE FROM bookings WHERE slot_id=? AND booking_type='unique'", [$child['id']]);
                            DB::run('DELETE FROM slots WHERE id=?', [$child['id']]);
                        }
                        // Le slot recurring lui-même : DELETE → CASCADE supprime ses bookings recurring.
                        DB::run('DELETE FROM slots WHERE id=?', [$old['id']]);
                    }
                }

                // Données pour pré-créer les créneaux uniques
                $period     = DB::one('SELECT date_start, date_end FROM periods WHERE id=?', [$periodId]);
                $svc        = DB::one('SELECT active_days, ponct_capacity, open_on_holidays FROM services WHERE id=?', [$serviceId]);
                $activeDays = $svc ? array_filter(array_map('trim', explode(',', $svc['active_days']))) : [];
                $phpDayMap  = ['lun'=>1,'mar'=>2,'mer'=>3,'jeu'=>4,'ven'=>5,'sam'=>6,'dim'=>0];
                $defaultCap = (int)($svc['ponct_capacity'] ?? 6);
                $holidayDates = [];
                refresh_period_holidays($periodId);
                if (empty($svc['open_on_holidays']) && $period) {
                    $rows = DB::all('SELECT date FROM period_holidays WHERE period_id=?', [$periodId]);
                    $holidayDates = array_flip(array_column($rows, 'date'));
                }

                $generatedMirrorIds = [];

                // Demandeurs autorisés au niveau du service (pour filtrer le payload).
                $serviceDemRows = DB::all(
                    'SELECT demandeur_id FROM service_demandeur_settings WHERE service_id=?',
                    [$serviceId]
                );
                $serviceDemAllowed = array_flip(array_map('intval', array_column($serviceDemRows, 'demandeur_id')));

                foreach ($slots as $sl) {
                    $slId = $sl['id'] ?? ('sl_' . substr(md5(uniqid()), 0, 8));
                    // Normalise les horaires en "HH:MM" pour que le tri alpha en base et au front
                    // donne le bon ordre ("9:00" devenait apres "10:00" sans padding).
                    $startTime = normalize_slot_time($sl['start_time'] ?? '');
                    $endTime   = normalize_slot_time($sl['end_time']   ?? '');
                    // Le frontend peut envoyer `weeks` (nouveau modèle, ex. 'A,B') ou `week_ab`
                    // (ancien modèle, ex. 'A'). On accepte les deux pour rester rétrocompatible.
                    $weeksStr  = $sl['weeks'] ?? ($sl['week_ab'] ?? '');
                    $weeksStr  = $weeksStr !== '' ? $weeksStr : null;
                    $weeksList = $weeksStr ? array_filter(array_map('trim', explode(',', $weeksStr))) : [];
                    $cap = $sl['cap'] ?? [];
                    DB::run(
                        'INSERT INTO slots (id,service_id,slot_type,period_id,start_time,end_time,slot_date,weeks,cap_lun,cap_mar,cap_mer,cap_jeu,cap_ven,cap_sam,cap_dim)
                         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                         ON DUPLICATE KEY UPDATE
                           period_id=VALUES(period_id),
                           start_time=VALUES(start_time), end_time=VALUES(end_time),
                           slot_date=VALUES(slot_date), weeks=VALUES(weeks),
                           cap_lun=VALUES(cap_lun), cap_mar=VALUES(cap_mar), cap_mer=VALUES(cap_mer),
                           cap_jeu=VALUES(cap_jeu), cap_ven=VALUES(cap_ven), cap_sam=VALUES(cap_sam),
                           cap_dim=VALUES(cap_dim)',
                        [$slId, $serviceId, 'recurring', $periodId,
                         $startTime, $endTime,
                         ($sl['slot_date'] ?? '') ?: null,
                         $weeksStr,
                         isset($cap['lun']) ? (int)$cap['lun'] : null,
                         isset($cap['mar']) ? (int)$cap['mar'] : null,
                         isset($cap['mer']) ? (int)$cap['mer'] : null,
                         isset($cap['jeu']) ? (int)$cap['jeu'] : null,
                         isset($cap['ven']) ? (int)$cap['ven'] : null,
                         isset($cap['sam']) ? (int)$cap['sam'] : null,
                         isset($cap['dim']) ? (int)$cap['dim'] : null,
                        ]
                    );
                    // Ré-insérer les demandeurs autorisés. Depuis le passage à UPSERT (au lieu de
                    // DELETE+INSERT global), le CASCADE ne se déclenche plus pour les slots
                    // conservés : on wipe explicitement les anciennes lignes avant de ré-insérer.
                    DB::run('DELETE FROM slot_demandeurs WHERE slot_id=?', [$slId]);
                    $demIds = $sl['demandeur_ids'] ?? null;
                    if (is_array($demIds) && !empty($demIds)) {
                        $stmtSD = $pdo->prepare('INSERT INTO slot_demandeurs (slot_id, demandeur_id) VALUES (?, ?)');
                        $seen = [];
                        foreach ($demIds as $did) {
                            $did = (int)$did;
                            if ($did <= 0 || isset($seen[$did]) || !isset($serviceDemAllowed[$did])) continue;
                            $seen[$did] = true;
                            $stmtSD->execute([$slId, $did]);
                        }
                    }
                    // Pré-créer les créneaux uniques pour chaque date de la période
                    if ($period && $period['date_start'] && $period['date_end'] && $activeDays) {
                        foreach ($activeDays as $dayKey) {
                            $targetDay = $phpDayMap[$dayKey] ?? -1;
                            if ($targetDay === -1) continue;
                            // Jour sans cap explicite → pas de créneau miroir
                            if (!isset($sl['cap'][$dayKey])) continue;
                            $dayCap = (int)$sl['cap'][$dayKey];
                            $cur = new DateTime($period['date_start']);
                            $end = new DateTime($period['date_end']);
                            while ((int)$cur->format('w') !== $targetDay) {
                                if ($cur > $end) break;
                                $cur->modify('+1 day');
                            }
                            while ($cur <= $end) {
                                $dateStr  = $cur->format('Y-m-d');
                                $isoWeek  = (int)$cur->format('W');
                                $isWeekA  = ($isoWeek % 2 === 0);
                                // Slot sans contrainte (NULL/vide) : applicable toujours.
                                // Sinon : la semaine de l'occurrence doit être dans la liste.
                                $matches  = empty($weeksList)
                                            || ($isWeekA && in_array('A', $weeksList, true))
                                            || (!$isWeekA && in_array('B', $weeksList, true));
                                if (!isset($holidayDates[$dateStr]) && $matches) {
                                    $uSlotId      = 'u_' . $slId . '_' . $dateStr;
                                    // Le miroir est une occurrence concrète : sa semaine est unique.
                                    $mirrorWeeks  = empty($weeksList) ? null : ($isWeekA ? 'A' : 'B');
                                    $generatedMirrorIds[] = $uSlotId;
                                    DB::run(
                                        'INSERT INTO slots (id,service_id,slot_type,parent_slot_id,period_id,start_time,end_time,slot_date,weeks,capacity)
                                         VALUES (?,?,?,?,?,?,?,?,?,?)
                                         ON DUPLICATE KEY UPDATE
                                           period_id=VALUES(period_id),
                                           start_time=VALUES(start_time), end_time=VALUES(end_time),
                                           weeks=VALUES(weeks), capacity=VALUES(capacity)',
                                        [$uSlotId, $serviceId, 'unique', $slId, $periodId,
                                         $startTime, $endTime, $dateStr, $mirrorWeeks, $dayCap]
                                    );
                                }
                                $cur->modify('+7 days');
                            }
                        }
                    }
                }

                // Nettoyage : supprimer les miroirs orphelins des créneaux conservés.
                // (cap[jour] retiré, week_ab modifié, jour férié/vacances ajouté, etc.)
                // Les miroirs désactivés/archivés sont préservés (trace historique) même si
                // leur génération est désormais inactive.
                if (!empty($keptIds)) {
                    $placeholders = implode(',', array_fill(0, count($keptIds), '?'));
                    $existingMirrors = DB::all(
                        "SELECT id FROM slots WHERE service_id=? AND slot_type='unique'
                         AND parent_slot_id IN ($placeholders)
                         AND (state IS NULL OR state='actif')",
                        array_merge([$serviceId], $keptIds)
                    );
                    $generatedSet = array_flip($generatedMirrorIds);
                    foreach ($existingMirrors as $mir) {
                        if (!isset($generatedSet[$mir['id']])) {
                            DB::run("DELETE FROM bookings WHERE slot_id=? AND booking_type='unique'", [$mir['id']]);
                            DB::run('DELETE FROM slots WHERE id=?', [$mir['id']]);
                        }
                    }
                }
            } else {
                $manualSlots = array_values(array_filter($slots, fn($sl) => empty($sl['parent_slot_id'])));
                $mirrorSlots = array_values(array_filter($slots, fn($sl) => !empty($sl['parent_slot_id'])));

                // Demandeurs autorisés au niveau du service (pour filtrer le payload).
                $serviceDemRows = DB::all(
                    'SELECT demandeur_id FROM service_demandeur_settings WHERE service_id=?',
                    [$serviceId]
                );
                $serviceDemAllowed = array_flip(array_map('intval', array_column($serviceDemRows, 'demandeur_id')));

                // Créneaux manuels : delete + reinsert. Préserver ceux qui sont désactivés / archivés.
                DB::run('DELETE FROM slots WHERE service_id=? AND slot_type="unique" AND parent_slot_id IS NULL AND state="actif"', [$serviceId]);
                // Charge une fois les périodes actives du service pour résoudre period_id par date.
                // Modèle unifié : un ponctuel est rattaché à une période exactement comme un récurrent.
                $activePeriods = DB::all(
                    "SELECT id, date_start, date_end FROM periods
                     WHERE service_id=? AND state='actif'
                       AND date_start IS NOT NULL AND date_end IS NOT NULL
                     ORDER BY date_start, id",
                    [$serviceId]
                );
                $_resolvePeriodForDate = function(?string $d) use ($activePeriods): ?int {
                    if (!$d) return null;
                    foreach ($activePeriods as $p) {
                        if ($d >= $p['date_start'] && $d <= $p['date_end']) return (int)$p['id'];
                    }
                    return null;
                };
                foreach ($manualSlots as $sl) {
                    $slId = $sl['id'] ?? ('sl_' . substr(md5(uniqid()), 0, 8));
                    // Normalise les horaires en "HH:MM" (cf. note dans la branche recurring).
                    $startTime = normalize_slot_time($sl['start_time'] ?? '');
                    $endTime   = normalize_slot_time($sl['end_time']   ?? '');
                    $slDate    = ($sl['slot_date'] ?? '') ?: null;
                    // Règle (b) : refus si la date ne tombe dans aucune période active.
                    // (Une date manquante reste tolérée — l'éditeur peut sauvegarder un brouillon.)
                    $periodId = $_resolvePeriodForDate($slDate);
                    if ($slDate && $periodId === null) {
                        $pdo->rollBack();
                        json_response([
                            'ok' => false,
                            'error' => "Le créneau ponctuel du $slDate ne tombe dans aucune période active du service. "
                                     . "Crée d'abord une période couvrant cette date.",
                        ], 400);
                    }
                    DB::run(
                        'INSERT INTO slots (id,service_id,slot_type,period_id,start_time,end_time,slot_date,capacity)
                         VALUES (?,?,?,?,?,?,?,?)',
                        [$slId, $serviceId, 'unique', $periodId,
                         $startTime, $endTime,
                         $slDate,
                         (int)($sl['capacity'] ?? 6)]
                    );
                    // Ré-insérer les demandeurs autorisés (la DELETE a CASCADE-supprimé les anciennes
                    // lignes ; le payload porte l'état courant côté éditeur).
                    $demIds = $sl['demandeur_ids'] ?? null;
                    if (is_array($demIds) && !empty($demIds)) {
                        $stmtSD = $pdo->prepare('INSERT INTO slot_demandeurs (slot_id, demandeur_id) VALUES (?, ?)');
                        $seen = [];
                        foreach ($demIds as $did) {
                            $did = (int)$did;
                            if ($did <= 0 || isset($seen[$did]) || !isset($serviceDemAllowed[$did])) continue;
                            $seen[$did] = true;
                            $stmtSD->execute([$slId, $did]);
                        }
                    }
                }
                // Miroirs : update capacity uniquement (les demandeurs sont hérités du parent récurrent).
                foreach ($mirrorSlots as $sl) {
                    DB::run('UPDATE slots SET capacity=? WHERE id=?', [(int)($sl['capacity'] ?? 6), $sl['id']]);
                }
            }
            $pdo->commit();
        } catch (Exception $e) {
            $pdo->rollBack();
            json_response(['ok' => false, 'error' => $e->getMessage()], 500);
        }
        json_response(['ok' => true]);

    case 'set_state':
        // Change l'état d'un (ou plusieurs) créneau(x) entre actif / desactive / archive.
        // Le state des miroirs (slot_type='unique' avec parent_slot_id) suit automatiquement
        // celui du créneau récurrent parent.
        $ids   = $input['ids']   ?? null;   // array of slot ids
        $state = $input['state'] ?? '';
        if (!in_array($state, ['actif','desactive','archive'], true)) {
            json_response(['ok' => false, 'error' => 'État invalide'], 400);
        }
        if (!is_array($ids) || !$ids) {
            $single = $input['id'] ?? '';
            if (!$single) json_response(['ok' => false, 'error' => 'ID(s) manquant(s)'], 400);
            $ids = [$single];
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $rows = DB::all("SELECT id, service_id, slot_type FROM slots WHERE id IN ($placeholders)", $ids);
        foreach ($rows as $r) require_manager_service($r['service_id'], $manager);
        // Mettre à jour les slots ciblés
        DB::run(
            "UPDATE slots SET state=? WHERE id IN ($placeholders)",
            array_merge([$state], $ids)
        );
        // Propager aux miroirs des récurrents impactés
        $recIds = array_values(array_filter(
            array_map(fn($r) => $r['slot_type'] === 'recurring' ? $r['id'] : null, $rows)
        ));
        if ($recIds) {
            $recPh = implode(',', array_fill(0, count($recIds), '?'));
            DB::run(
                "UPDATE slots SET state=? WHERE parent_slot_id IN ($recPh)",
                array_merge([$state], $recIds)
            );
        }
        json_response(['ok' => true, 'updated' => count($rows)]);

    case 'set_demandeurs':
        // Définit la liste des demandeurs autorisés sur un créneau.
        // Refusé sur un miroir (les miroirs héritent de leur parent récurrent).
        // Payload : { slot_id, demandeur_ids: [int,...] }   demandeur_ids vide → aucune restriction.
        $slotId = (string)($input['slot_id'] ?? '');
        $demIds = $input['demandeur_ids'] ?? [];
        if (!$slotId) json_response(['ok' => false, 'error' => 'slot_id requis'], 400);
        if (!is_array($demIds)) json_response(['ok' => false, 'error' => 'demandeur_ids doit être une liste'], 400);
        $slot = DB::one('SELECT service_id, parent_slot_id FROM slots WHERE id=?', [$slotId]);
        if (!$slot) json_response(['ok' => false, 'error' => 'Créneau introuvable'], 404);
        require_manager_service($slot['service_id'], $manager);
        if (!empty($slot['parent_slot_id'])) {
            json_response(['ok' => false, 'error' => 'Un miroir hérite des demandeurs de son parent récurrent'], 400);
        }
        $pdo = DB::get();
        $pdo->beginTransaction();
        try {
            DB::run('DELETE FROM slot_demandeurs WHERE slot_id=?', [$slotId]);
            // Filtrage : ne garder que les demandeurs rattachés au service (cohérence).
            if (!empty($demIds)) {
                $serviceDemIds = DB::all(
                    'SELECT demandeur_id FROM service_demandeur_settings WHERE service_id=?',
                    [$slot['service_id']]
                );
                $allowed = array_flip(array_map('intval', array_column($serviceDemIds, 'demandeur_id')));
                $stmt = $pdo->prepare('INSERT INTO slot_demandeurs (slot_id, demandeur_id) VALUES (?, ?)');
                foreach ($demIds as $did) {
                    $did = (int)$did;
                    if ($did > 0 && isset($allowed[$did])) {
                        $stmt->execute([$slotId, $did]);
                    }
                }
            }
            $pdo->commit();
        } catch (Exception $e) {
            $pdo->rollBack();
            json_response(['ok' => false, 'error' => $e->getMessage()], 500);
        }
        json_response(['ok' => true]);

    default:
        json_response(['ok' => false, 'error' => 'Action inconnue'], 400);
}
