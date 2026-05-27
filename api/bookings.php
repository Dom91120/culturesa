<?php
// ============================================================
//  CultuRézo — API /api/bookings.php
//  GET  ?service_id=&user_id=   → réservations d'un utilisateur
//  GET  ?service_id=&all=1      → toutes les réservations (admin/gestionnaire)
//  POST ?action=book            → réserver
//  POST ?action=cancel          → annuler une réservation
//  POST ?action=validate        → valider (admin)
//  POST ?action=move            → déplacer (admin cut/paste)
//  GET  ?action=count           → compter les places prises par créneau
// ============================================================

require_once __DIR__ . '/../includes/api.php';
require_once __DIR__ . '/../includes/holidays.php';

/**
 * Détermine si le demandeur d'un utilisateur est fermé pendant les vacances
 * scolaires. Retourne [blocked (0|1), zone ('A'|'B'|'C')].
 * Si non bloqué (flag à 0, demandeur absent, ou zone invalide) : retourne [0, ''].
 */
function bk_user_school_block(int $userId): array {
    $r = DB::one(
        'SELECT d.open_on_school_holidays FROM users u
         LEFT JOIN demandeurs d ON d.id = u.demandeur_id WHERE u.id=?',
        [$userId]
    );
    // Bloqué si une ligne demandeur existe ET open_on_school_holidays = 0 (fermé).
    if (!$r || !isset($r['open_on_school_holidays']) || !empty($r['open_on_school_holidays'])) return [0, ''];
    $zoneRow = DB::one("SELECT cfg_value FROM app_config WHERE cfg_key='school_zone'");
    $zone    = $zoneRow ? strtoupper((string)($zoneRow['cfg_value'] ?? '')) : 'A';
    if (!in_array($zone, ['A','B','C'], true)) return [0, ''];
    return [1, $zone];
}

// ============================================================
//  Helpers de formatage FR (utilises pour les emails recap / validation)
// ============================================================

function bk_day_name_fr(string $key): string {
    static $map = ['lun'=>'Lundi','mar'=>'Mardi','mer'=>'Mercredi','jeu'=>'Jeudi',
                   'ven'=>'Vendredi','sam'=>'Samedi','dim'=>'Dimanche'];
    return $map[$key] ?? $key;
}

function bk_format_date_fr(?string $ymd): string {
    if (!$ymd) return '';
    static $MONTHS = ['','janvier','février','mars','avril','mai','juin','juillet',
                      'août','septembre','octobre','novembre','décembre'];
    $t = strtotime($ymd . ' 12:00:00');
    if ($t === false) return $ymd;
    // 0=dim..6=sam → mappage vers cles fr
    $dk = ['dim','lun','mar','mer','jeu','ven','sam'][(int)date('w', $t)];
    return bk_day_name_fr($dk) . ' ' . (int)date('j', $t)
         . ' ' . $MONTHS[(int)date('n', $t)] . ' ' . date('Y', $t);
}

function bk_format_hours(?string $start, ?string $end): string {
    $s = $start ? substr($start, 0, 5) : '';
    $e = $end   ? substr($end,   0, 5) : '';
    if ($s === '' && $e === '') return 'Journée entière';
    return trim($s . ' – ' . $e, ' –');
}

/**
 * Format compact d'une ligne de booking pour un email.
 * Le $row doit contenir : booking_type, theme_label, week, day_key,
 * start_time, end_time, slot_date, period_label.
 */
function bk_format_booking_line(array $row): string {
    if (($row['booking_type'] ?? '') === 'recurring') {
        $parts = [
            bk_day_name_fr($row['day_key'] ?? ''),
            bk_format_hours($row['start_time'] ?? null, $row['end_time'] ?? null),
            !empty($row['week']) ? 'Semaine ' . $row['week'] : '',
            $row['period_label'] ?? '',
            !empty($row['theme_label']) ? '« ' . $row['theme_label'] . ' »' : '',
        ];
    } else {
        $parts = [
            bk_format_date_fr($row['slot_date'] ?? null),
            bk_format_hours($row['start_time'] ?? null, $row['end_time'] ?? null),
            !empty($row['theme_label']) ? '« ' . $row['theme_label'] . ' »' : '',
        ];
    }
    return implode(' · ', array_filter($parts, fn($p) => $p !== ''));
}

// ============================================================
//  Helpers internes (factorisation des accès à la table bookings)
// ============================================================

/**
 * Capacité d'un créneau.
 *   - recurring : lit la colonne cap_<jour> sur slots (renvoie null si dayKey invalide)
 *   - unique    : lit la colonne capacity sur slots
 * Retourne $fallback si la ligne slot n'existe pas.
 */
function bk_slot_capacity(string $type, string $slotId, ?string $dayKey = null, ?int $fallback = null): ?int {
    static $capCols = ['lun'=>'cap_lun','mar'=>'cap_mar','mer'=>'cap_mer','jeu'=>'cap_jeu','ven'=>'cap_ven','sam'=>'cap_sam','dim'=>'cap_dim'];
    if ($type === 'recurring') {
        $col = $capCols[$dayKey] ?? null;
        if (!$col) return null;
        $row = DB::one("SELECT $col AS capacity FROM slots WHERE id=?", [$slotId]);
        return $row ? (int)$row['capacity'] : $fallback;
    }
    $row = DB::one("SELECT capacity FROM slots WHERE id=?", [$slotId]);
    return $row ? (int)$row['capacity'] : $fallback;
}

/**
 * Construit le WHERE et les params pour cibler un créneau donné.
 * Options : exclude_id, exclude_user_id, week.
 */
function bk_scope_where(string $type, string $serviceId, string $slotId, ?int $periodId, ?string $dayKey, array $opts): array {
    $where  = "service_id=? AND slot_id=? AND booking_type=?";
    $params = [$serviceId, $slotId, $type];
    if ($type === 'recurring') {
        $where .= " AND period_id=? AND day_key=?";
        $params[] = $periodId;
        $params[] = $dayKey;
        // Filtre semaine A/B (modèle "un slot, N semaines"). week='' = pas de contrainte.
        if (isset($opts['week'])) {
            $where .= " AND week=?";
            $params[] = (string)$opts['week'];
        }
    }
    if (isset($opts['exclude_id'])) {
        $where .= " AND id!=?";
        $params[] = (int)$opts['exclude_id'];
    }
    if (isset($opts['exclude_user_id'])) {
        $where .= " AND user_id!=?";
        $params[] = (int)$opts['exclude_user_id'];
    }
    return [$where, $params];
}

/** Nombre de réservations sur un créneau (filtres via $opts, cf. bk_scope_where). */
function bk_count_at(string $type, string $serviceId, string $slotId, ?int $periodId, ?string $dayKey, array $opts = []): int {
    [$where, $params] = bk_scope_where($type, $serviceId, $slotId, $periodId, $dayKey, $opts);
    return (int)(DB::one("SELECT COUNT(*) AS n FROM bookings WHERE $where", $params)['n'] ?? 0);
}

/** Somme enfants+accompagnants sur un créneau (mode jauge). */
function bk_gauge_sum_at(string $type, string $serviceId, string $slotId, ?int $periodId, ?string $dayKey, array $opts = []): int {
    [$where, $params] = bk_scope_where($type, $serviceId, $slotId, $periodId, $dayKey, $opts);
    return (int)(DB::one(
        "SELECT COALESCE(SUM(enfants + accompagnants), 0) AS gs FROM bookings WHERE $where",
        $params
    )['gs'] ?? 0);
}

/** Supprime tous les miroirs ponctuels d'une réservation récurrente. */
function bk_delete_mirrors(int $parentBookingId): void {
    DB::run("DELETE FROM bookings WHERE parent_booking_id=? AND booking_type='unique'", [$parentBookingId]);
}

/**
 * Régénère les miroirs ponctuels d'une réservation récurrente.
 * Itère sur les slots enfants matchant le dayKey dans la période, en honorant open_on_holidays.
 * INSERT … ON DUPLICATE KEY UPDATE (réactive un miroir précédemment annulé).
 * Retourne le nombre de slots miroirs traités.
 */
function bk_regenerate_mirrors(
    PDO $pdo, int $parentBookingId, int $userId, string $serviceId,
    string $slotId, int $periodId, string $dayKey,
    string $themeLabel, int $enfants, int $accompagnants, int $validated,
    bool $openOnHolidays, string $week = ''
): int {
    static $dowMap = ['lun'=>2,'mar'=>3,'mer'=>4,'jeu'=>5,'ven'=>6,'sam'=>7,'dim'=>1];
    $mysqlDay = $dowMap[$dayKey] ?? -1;
    if ($mysqlDay === -1) return 0;
    $period = DB::one('SELECT date_start, date_end FROM periods WHERE id=?', [$periodId]);
    if (!$period || !$period['date_start'] || !$period['date_end']) return 0;

    // Filtre semaine A/B : si la réservation porte sur une semaine spécifique, on ne génère
    // les miroirs que sur les slots concrets de cette semaine (les slots miroirs portent
    // weeks='A' ou 'B' selon la parité ISO de leur slot_date — cf. api/slots.php).
    $weekFilterSql    = $week !== '' ? ' AND s.weeks = ?' : '';
    $weekFilterParams = $week !== '' ? [$week] : [];

    if ($openOnHolidays) {
        $uSlots = DB::all(
            "SELECT s.id, s.slot_date FROM slots s WHERE s.parent_slot_id=? AND s.state='actif' AND s.slot_date BETWEEN ? AND ? AND DAYOFWEEK(s.slot_date)=?"
            . $weekFilterSql,
            array_merge([$slotId, $period['date_start'], $period['date_end'], $mysqlDay], $weekFilterParams)
        );
    } else {
        $uSlots = DB::all(
            "SELECT s.id, s.slot_date FROM slots s
             LEFT JOIN period_holidays ph ON ph.period_id=? AND ph.date=s.slot_date
             WHERE s.parent_slot_id=? AND s.state='actif' AND s.slot_date BETWEEN ? AND ? AND DAYOFWEEK(s.slot_date)=?
             AND ph.date IS NULL" . $weekFilterSql,
            array_merge([$periodId, $slotId, $period['date_start'], $period['date_end'], $mysqlDay], $weekFilterParams)
        );
    }
    if (!$uSlots) return 0;

    // Si le demandeur du user est fermé pendant les vacances scolaires,
    // on retire les occurrences dont la date tombe en vacances scolaires.
    [$schoolBlocked, $schoolZone] = bk_user_school_block($userId);
    if ($schoolBlocked) {
        $sch = school_holiday_dates($schoolZone, $period['date_start'], $period['date_end']);
        if ($sch) {
            $uSlots = array_values(array_filter($uSlots, fn($u) => !isset($sch[$u['slot_date']])));
            if (!$uSlots) return 0;
        }
    }

    $stmt = $pdo->prepare(
        "INSERT INTO bookings (booking_type,user_id,service_id,slot_id,period_id,day_key,theme_label,enfants,accompagnants,validated,parent_booking_id)
         VALUES ('unique',?,?,?,0,'',?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           theme_label=VALUES(theme_label), enfants=VALUES(enfants),
           accompagnants=VALUES(accompagnants), validated=VALUES(validated),
           parent_booking_id=VALUES(parent_booking_id)"
    );
    foreach ($uSlots as $uSlot) {
        $stmt->execute([$userId, $serviceId, $uSlot['id'], $themeLabel, $enfants, $accompagnants, $validated, $parentBookingId]);
    }
    return count($uSlots);
}

/**
 * Insère (ou récupère) une réservation récurrente. Unique par (user, service, slot, period, day).
 * Retourne l'ID (nouveau ou existant), ou null en cas d'échec.
 */
function bk_upsert_recurring(
    PDO $pdo, int $userId, string $serviceId, string $slotId,
    int $periodId, string $dayKey, string $themeLabel,
    int $enfants, int $accompagnants, int $validated, string $week = ''
): ?int {
    DB::run(
        'INSERT IGNORE INTO bookings (user_id,service_id,slot_id,period_id,day_key,week,theme_label,enfants,accompagnants,validated,auto_validate_from)
         VALUES (?,?,?,?,?,?,?,?,?,?,NOW())',
        [$userId, $serviceId, $slotId, $periodId, $dayKey, $week, $themeLabel, $enfants, $accompagnants, $validated]
    );
    $id = (int)$pdo->lastInsertId();
    if ($id) return $id;
    $row = DB::one(
        "SELECT id FROM bookings WHERE user_id=? AND service_id=? AND slot_id=? AND period_id=? AND day_key=? AND week=? AND booking_type='recurring'",
        [$userId, $serviceId, $slotId, $periodId, $dayKey, $week]
    );
    return $row ? (int)$row['id'] : null;
}

/**
 * Insère une réservation ponctuelle. Idempotent : met à jour la ligne existante
 * (theme/enfants/accompagnants/validated) si l'unique key est déjà présente.
 */
function bk_upsert_unique(
    int $userId, string $serviceId, string $slotId, int $periodId,
    string $themeLabel, int $enfants, int $accompagnants, int $validated
): void {
    // auto_validate_from = NOW() à l'insertion ; à l'update (ON DUPLICATE KEY) on ne
    // touche PAS à ce champ pour ne pas reset le compteur sur les modifs cosmétiques
    // (theme/participants). Seuls les déplacements doivent reset (cf. action=user_move).
    DB::run(
        "INSERT INTO bookings (booking_type,user_id,service_id,slot_id,period_id,day_key,theme_label,enfants,accompagnants,validated,auto_validate_from)
         VALUES ('unique',?,?,?,?,'',?,?,?,?,NOW())
         ON DUPLICATE KEY UPDATE
           period_id=VALUES(period_id),
           theme_label=VALUES(theme_label), enfants=VALUES(enfants),
           accompagnants=VALUES(accompagnants), validated=VALUES(validated)",
        [$userId, $serviceId, $slotId, $periodId, $themeLabel, $enfants, $accompagnants, $validated]
    );
}

/**
 * Vérifie qu'un slot est accessible au demandeur de l'utilisateur.
 * Règle : si le slot (ou le parent récurrent pour un miroir) a une liste de demandeurs
 * non vide, le demandeur de l'utilisateur doit y figurer. Liste vide → libre.
 * Retourne true si autorisé, false sinon.
 */
function slot_allowed_for_user(string $slotId, int $userId): bool {
    $slot = DB::one('SELECT id, parent_slot_id FROM slots WHERE id=?', [$slotId]);
    if (!$slot) return false;
    $effectiveId = !empty($slot['parent_slot_id']) ? $slot['parent_slot_id'] : $slot['id'];
    $rows = DB::all('SELECT demandeur_id FROM slot_demandeurs WHERE slot_id=?', [$effectiveId]);
    if (!$rows) return true; // aucune restriction
    $demRow = DB::one(
        'SELECT COALESCE(u.demandeur_id, str.demandeur_id) AS dem_id
         FROM users u LEFT JOIN structures str ON str.id = u.structure_id
         WHERE u.id = ?',
        [$userId]
    );
    $demId = $demRow && $demRow['dem_id'] ? (int)$demRow['dem_id'] : null;
    if (!$demId) return false;
    foreach ($rows as $r) if ((int)$r['demandeur_id'] === $demId) return true;
    return false;
}

/** Validation auto-validée ou en attente selon le demandeur lié à l'utilisateur. */
function get_user_validated(string $serviceId, int $userId): int {
    $row = DB::one(
        'SELECT COALESCE(u.demandeur_id, str.demandeur_id) AS dem_id
         FROM users u LEFT JOIN structures str ON str.id = u.structure_id
         WHERE u.id = ?',
        [$userId]
    );
    $demId = $row['dem_id'] ?? null;
    if (!$demId) return 1; // pas de demandeur → auto-validé
    $dem = DB::one(
        'SELECT validation FROM service_demandeur_settings WHERE service_id=? AND demandeur_id=?',
        [$serviceId, $demId]
    );
    return ($dem && $dem['validation']) ? 0 : 1;
}
/**
 * Mode jauge actif pour ce booking : déterminé par le flag `jauge` de
 * service_demandeur_settings (per-demandeur), couvrant les modes récurrent et ponctuel.
 * Remplace les anciens champs services.recur_gauge_enabled / ponct_gauge_enabled (supprimés).
 */
function get_user_gauge(string $serviceId, int $userId): bool {
    $row = DB::one(
        'SELECT COALESCE(u.demandeur_id, str.demandeur_id) AS dem_id
         FROM users u LEFT JOIN structures str ON str.id = u.structure_id
         WHERE u.id = ?',
        [$userId]
    );
    $demId = $row['dem_id'] ?? null;
    if (!$demId) return false;
    $dem = DB::one(
        'SELECT jauge FROM service_demandeur_settings WHERE service_id=? AND demandeur_id=?',
        [$serviceId, $demId]
    );
    return $dem && !empty($dem['jauge']);
}

// ============================================================
//  Routage
// ============================================================

$action = $_GET['action'] ?? ($_POST['action'] ?? get_input()['action'] ?? 'list');
$input  = get_input();

// ── Comptage des places (accessible une fois connecté) ──────────────────
if ($action === 'count') {
    $user      = require_auth();
    $serviceId = $input['service_id'] ?? '';
    if (!$serviceId) json_response(['ok' => false, 'error' => 'service_id manquant'], 400);

    if (!DB::one('SELECT id FROM services WHERE id=?', [$serviceId])) {
        json_response(['ok' => false, 'error' => 'Service introuvable'], 404);
    }

    require_service_access($serviceId, $user);

    // On renvoie systématiquement les deux structures de comptage (récurrent et ponctuel).
    // Les clés ne peuvent pas entrer en collision : period_id est numérique, slot_id est un VARCHAR `sl_xxx`.
    $counts = $gaugeSums = [];

    // Comptes récurrents : counts[period_id][slot_id][day_key][week]
    // (le week '' = pas de mode A/B sur ce slot)
    $rowsRec = DB::all(
        "SELECT slot_id, period_id, day_key, week,
                COUNT(*) AS taken,
                COALESCE(SUM(enfants + accompagnants), 0) AS gauge_sum
         FROM bookings WHERE service_id=? AND booking_type='recurring'
         GROUP BY slot_id, period_id, day_key, week",
        [$serviceId]
    );
    // Le mode (récurrent ou ponctuel) est déterminé par les réservations présentes :
    // déduit des lignes ci-dessus, évite une COUNT(*) séparée sur la même table.
    $hasRecur = !empty($rowsRec);
    foreach ($rowsRec as $r) {
        $w = (string)($r['week'] ?? '');
        $counts   [$r['period_id']][$r['slot_id']][$r['day_key']][$w] = (int)$r['taken'];
        $gaugeSums[$r['period_id']][$r['slot_id']][$r['day_key']][$w] = (int)$r['gauge_sum'];
    }

    // Comptes ponctuels : counts[slot_id]
    $rowsUniq = DB::all(
        "SELECT slot_id,
                COUNT(*) AS taken,
                COALESCE(SUM(enfants + accompagnants), 0) AS gauge_sum
         FROM bookings WHERE service_id=? AND booking_type='unique'
         GROUP BY slot_id",
        [$serviceId]
    );
    foreach ($rowsUniq as $r) {
        $counts   [$r['slot_id']] = (int)$r['taken'];
        $gaugeSums[$r['slot_id']] = (int)$r['gauge_sum'];
    }

    json_response(['ok' => true, 'counts' => $counts, 'gauge_sums' => $gaugeSums, 'recurring' => $hasRecur]);
}

// ── Liste des réservations ──────────────────────────────────
if ($action === 'list') {
    $user      = require_auth();
    $serviceId = $input['service_id'] ?? '';
    $all       = !empty($input['all']);

    if ($all) require_manager();
    if ($serviceId) require_service_access($serviceId, $user);

    if ($all) {
        // Une seule passe DB : joint users/structures/demandeurs une fois, puis on partitionne
        // les deux types en PHP (au lieu de deux SELECT identiques avec JOIN dupliqué).
        $rows = DB::all(
            "SELECT b.*, b.parent_booking_id AS recurring_booking_id,
                    u.prenom, u.nom, u.email, u.niveau, u.tel,
                    str.label AS structure_label,
                    dem.id    AS demandeur_id,
                    dem.label AS demandeur_label
             FROM bookings b
             JOIN users u ON u.id = b.user_id
             LEFT JOIN structures str ON str.id = u.structure_id
             LEFT JOIN demandeurs dem ON dem.id = COALESCE(u.demandeur_id, str.demandeur_id)
             WHERE b.service_id = ?",
            [$serviceId]
        );
        $bookings = $bookingsU = [];
        foreach ($rows as $r) {
            if ($r['booking_type'] === 'recurring')   $bookings[]  = $r;
            elseif ($r['booking_type'] === 'unique')  $bookingsU[] = $r;
        }
        // Restaure les ORDER BY d'origine (period_id, slot_id, day_key, nom) côté récurrent
        // et (nom) côté ponctuel — préserve l'ordre attendu par le frontend.
        usort($bookings, function($a, $b) {
            $cmp = (int)$a['period_id'] <=> (int)$b['period_id'];
            if ($cmp !== 0) return $cmp;
            $cmp = strcmp((string)$a['slot_id'], (string)$b['slot_id']);
            if ($cmp !== 0) return $cmp;
            $cmp = strcmp((string)$a['day_key'], (string)$b['day_key']);
            if ($cmp !== 0) return $cmp;
            return strcasecmp($a['nom'] ?? '', $b['nom'] ?? '');
        });
        usort($bookingsU, fn($a, $b) => strcasecmp($a['nom'] ?? '', $b['nom'] ?? ''));
    } else {
        // Idem flow utilisateur : une seule requête + partition.
        $rows = DB::all(
            "SELECT *, parent_booking_id AS recurring_booking_id
             FROM bookings WHERE service_id=? AND user_id=?",
            [$serviceId, $user['id']]
        );
        $bookings = $bookingsU = [];
        foreach ($rows as $r) {
            if ($r['booking_type'] === 'recurring')   $bookings[]  = $r;
            elseif ($r['booking_type'] === 'unique')  $bookingsU[] = $r;
        }
    }
    json_response(['ok' => true, 'bookings' => $bookings, 'bookings_unique' => $bookingsU]);
}

// ── Réserver ───────────────────────────────────────────────
if ($action === 'book') {
    $user      = require_auth();
    $serviceId = $input['service_id'] ?? '';
    $selections = $input['selections'] ?? [];
    if (!$serviceId) json_response(['ok' => false, 'error' => 'service_id manquant'], 400);

    $svc = DB::one('SELECT * FROM services WHERE id=?', [$serviceId]);
    if (!$svc) json_response(['ok' => false, 'error' => 'Service introuvable'], 404);

    require_service_access($serviceId, $user);

    $pdo = DB::get();
    $pdo->beginTransaction();
    try {
        foreach ($selections as $sel) {
            $isRecurring = !empty($sel['period_id']) && ($sel['day'] ?? '') !== '';
            $slotId = $sel['slotId'] ?? '';
            $theme  = trim($sel['themeLabel'] ?? '');
            $enfants       = (int)($sel['enfants']       ?? 0);
            $accompagnants = (int)($sel['accompagnants'] ?? 0);
            $validated = get_user_validated($serviceId, $user['id']);

            // Anti-IDOR : créneau bien rattaché à ce service
            if (!DB::one('SELECT id FROM slots WHERE id=? AND service_id=?', [$slotId, $serviceId])) {
                $pdo->rollBack();
                json_response(['ok' => false, 'error' => 'Créneau invalide'], 400);
            }
            // Restriction par demandeur : refuser si le créneau (ou son parent récurrent) n'autorise pas ce demandeur.
            if (!slot_allowed_for_user($slotId, (int)$user['id'])) {
                $pdo->rollBack();
                json_response(['ok' => false, 'error' => 'Ce créneau n\'est pas accessible à votre demandeur'], 403);
            }

            if ($isRecurring) {
                $periodId = (int)($sel['period_id'] ?? 0);
                $dayKey   = $sel['day'] ?? '';
                // Modèle "un slot, N semaines" : la sélection peut désigner une semaine
                // spécifique ('A' ou 'B') ou aucune ('' = pas de mode A/B sur ce slot).
                $week     = (string)($sel['week'] ?? '');
                $totalCap = bk_slot_capacity('recurring', $slotId, $dayKey);

                if (get_user_gauge($serviceId, $user['id'])) {
                    if ($totalCap !== null) {
                        $gaugeSum = bk_gauge_sum_at('recurring', $serviceId, $slotId, $periodId, $dayKey, ['exclude_user_id' => $user['id'], 'week' => $week]);
                        if ($gaugeSum + $enfants + $accompagnants > $totalCap) {
                            $pdo->rollBack();
                            json_response(['ok' => false, 'error' => 'La jauge est dépassée pour ce créneau'], 409);
                        }
                    }
                } else {
                    $taken = bk_count_at('recurring', $serviceId, $slotId, $periodId, $dayKey, ['week' => $week]);
                    if ($totalCap !== null && $taken >= $totalCap) {
                        $pdo->rollBack();
                        json_response(['ok' => false, 'error' => "Créneau complet ($slotId $periodId $dayKey)"], 409);
                    }
                }

                // Limite par période
                $trimCount = (int)(DB::one(
                    "SELECT COUNT(*) AS n FROM bookings
                     WHERE service_id=? AND user_id=? AND period_id=? AND booking_type='recurring'",
                    [$serviceId, $user['id'], $periodId]
                )['n'] ?? 0);
                if ($trimCount >= $svc['max_reservations_period']) {
                    $pdo->rollBack();
                    json_response(['ok' => false, 'error' => 'Limite par période atteinte'], 409);
                }

                // Limite annuelle (année scolaire en cours)
                $yearStart = (date('n') >= 9) ? date('Y') . '-09-01' : (date('Y') - 1) . '-09-01';
                $yearCount = (int)(DB::one(
                    "SELECT COUNT(*) AS n FROM bookings b
                     JOIN periods p ON p.id = b.period_id
                     WHERE b.service_id=? AND b.user_id=? AND p.date_start >= ? AND b.booking_type='recurring'",
                    [$serviceId, $user['id'], $yearStart]
                )['n'] ?? 0);
                if ($yearCount >= $svc['max_reservations']) {
                    $pdo->rollBack();
                    json_response(['ok' => false, 'error' => 'Limite annuelle atteinte'], 409);
                }

                $recurringId = bk_upsert_recurring($pdo, $user['id'], $serviceId, $slotId, $periodId, $dayKey, $theme, $enfants, $accompagnants, $validated, $week);
                if ($recurringId) {
                    bk_regenerate_mirrors(
                        $pdo, $recurringId, $user['id'], $serviceId, $slotId, $periodId, $dayKey,
                        $theme, $enfants, $accompagnants, $validated,
                        !empty($svc['open_on_holidays']), $week
                    );
                }
            } else {
                // Refuser la réservation si la date du créneau tombe en vacances scolaires
                // et que le demandeur du user est fermé pendant les vacances.
                [$schoolBlocked, $schoolZone] = bk_user_school_block($user['id']);
                if ($schoolBlocked) {
                    $slotRow = DB::one('SELECT slot_date FROM slots WHERE id=?', [$slotId]);
                    $sd = $slotRow['slot_date'] ?? null;
                    if ($sd) {
                        $sch = school_holiday_dates($schoolZone, $sd, $sd);
                        if (isset($sch[$sd])) {
                            $pdo->rollBack();
                            json_response(['ok' => false, 'error' => 'Ce créneau tombe en vacances scolaires'], 409);
                        }
                    }
                }

                $totalCap = bk_slot_capacity('unique', $slotId, null, 1);
                if (get_user_gauge($serviceId, $user['id'])) {
                    $gaugeSum = bk_gauge_sum_at('unique', $serviceId, $slotId, null, null);
                    if ($gaugeSum + $enfants + $accompagnants > $totalCap) {
                        $pdo->rollBack();
                        json_response(['ok' => false, 'error' => 'La jauge est dépassée pour ce créneau'], 409);
                    }
                } else {
                    $taken = bk_count_at('unique', $serviceId, $slotId, null, null);
                    if ($taken >= $totalCap) {
                        $pdo->rollBack();
                        json_response(['ok' => false, 'error' => "Séance complète ($slotId)"], 409);
                    }
                }

                // Resolution du period_id du booking depuis le slot (modèle unifié).
                $slotPeriodRow = DB::one('SELECT period_id FROM slots WHERE id=?', [$slotId]);
                $slotPeriodId  = (int)($slotPeriodRow['period_id'] ?? 0);

                // Limite par période (symétrique au cas récurrent). On compte les ponctuels
                // standalone du user sur cette même période, mirrors exclus.
                if ($slotPeriodId > 0) {
                    $trimCount = (int)(DB::one(
                        "SELECT COUNT(*) AS n FROM bookings
                         WHERE service_id=? AND user_id=? AND period_id=?
                           AND booking_type='unique' AND parent_booking_id IS NULL",
                        [$serviceId, $user['id'], $slotPeriodId]
                    )['n'] ?? 0);
                    if ($trimCount >= $svc['max_reservations_period']) {
                        $pdo->rollBack();
                        json_response(['ok' => false, 'error' => 'Limite par période atteinte'], 409);
                    }
                }

                // Limite annuelle (réservations standalone uniquement)
                $yearCount = (int)(DB::one(
                    "SELECT COUNT(*) AS n FROM bookings
                     WHERE service_id=? AND user_id=? AND booking_type='unique' AND parent_booking_id IS NULL",
                    [$serviceId, $user['id']]
                )['n'] ?? 0);
                if ($yearCount >= $svc['max_reservations']) {
                    $pdo->rollBack();
                    json_response(['ok' => false, 'error' => 'Limite annuelle atteinte'], 409);
                }

                bk_upsert_unique($user['id'], $serviceId, $slotId, $slotPeriodId, $theme, $enfants, $accompagnants, $validated);
            }
        }
        $pdo->commit();
        json_response(['ok' => true]);
    } catch (Exception $e) {
        $pdo->rollBack();
        json_response(['ok' => false, 'error' => $e->getMessage()], 500);
    }
}

// ── Envoyer un mail récapitulatif des réservations ─────────
// Le client envoie uniquement la liste des changements de ce save (formates cote
// client). Le serveur construit lui-meme le snapshot complet groupe par service.
if ($action === 'send_recap') {
    $user      = require_auth();
    $serviceId = $input['service_id'] ?? '';
    if (!$serviceId) json_response(['ok' => false, 'error' => 'service_id manquant'], 400);
    require_service_access($serviceId, $user);

    if (empty($user['email'])) {
        json_response(['ok' => false, 'error' => 'Adresse e-mail manquante'], 400);
    }

    $svc      = DB::one('SELECT label FROM services WHERE id=?', [$serviceId]);
    $svcLabel = $svc['label'] ?? '';
    $changes  = is_array($input['changes'] ?? null) ? $input['changes'] : [];
    $pending  = !empty($input['validation_pending']);
    $newCount = max(0, (int)($input['new_count'] ?? 0));

    require_once __DIR__ . '/../includes/mailer.php';

    $esc = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
    $userName = trim(($user['prenom'] ?? '') . ' ' . ($user['nom'] ?? ''));
    if ($userName === '') $userName = (string)($user['email'] ?? '');

    // ── Snapshot : toutes les reservations de l'user, tous services confondus ──
    // parent_booking_id IS NULL : exclut les miroirs (reservations recurrentes deja
    // representees par leur parent recurring).
    $rows = DB::all(
        "SELECT b.booking_type, b.theme_label, b.week, b.day_key, b.service_id,
                svc.label AS service_label,
                s.start_time, s.end_time, s.slot_date,
                p.label AS period_label, p.date_start AS period_start
         FROM bookings b
         LEFT JOIN services svc ON svc.id = b.service_id
         LEFT JOIN slots    s   ON s.id   = b.slot_id
         LEFT JOIN periods  p   ON p.id   = b.period_id
         WHERE b.user_id = ? AND b.parent_booking_id IS NULL
         ORDER BY svc.label, b.booking_type, p.date_start, b.day_key,
                  s.start_time, s.slot_date",
        [$user['id']]
    );

    // Groupage par service (ordre conserve par la requete : svc.label)
    $bySvc = [];
    foreach ($rows as $r) {
        $svcKey = $r['service_id'] . '|' . ($r['service_label'] ?? '');
        if (!isset($bySvc[$svcKey])) {
            $bySvc[$svcKey] = ['label' => $r['service_label'] ?? '(service supprimé)', 'lines' => []];
        }
        $bySvc[$svcKey]['lines'][] = bk_format_booking_line($r);
    }

    $changesHtml = '';
    if ($changes) {
        $items = '';
        foreach ($changes as $line) {
            $items .= '<li style="margin:.2rem 0">' . $esc($line) . '</li>';
        }
        $changesHtml =
            '<h3 style="font-size:14px;color:#444;margin:1.2em 0 .4em">Modifié à l\'instant</h3>'
            . '<p style="font-size:12px;color:#666;margin:.2em 0">Service : <strong>' . $esc($svcLabel) . '</strong></p>'
            . '<ul style="padding-left:1.2em;margin:.4em 0;font-size:13px;color:#222">' . $items . '</ul>';
    }

    $snapHtml = '<h3 style="font-size:14px;color:#444;margin:1.2em 0 .4em">Vos réservations actuelles</h3>';
    if ($bySvc) {
        foreach ($bySvc as $svcGroup) {
            $items = '';
            foreach ($svcGroup['lines'] as $line) {
                $items .= '<li style="margin:.2rem 0">' . $esc($line) . '</li>';
            }
            $snapHtml .=
                '<p style="font-size:13px;color:#222;margin:.8em 0 .2em;font-weight:600">'
                . $esc($svcGroup['label']) . '</p>'
                . '<ul style="padding-left:1.2em;margin:.2em 0 .6em;font-size:13px;color:#222">'
                . $items . '</ul>';
        }
    } else {
        $snapHtml .= '<p style="font-size:13px;color:#666;font-style:italic">Aucune réservation active.</p>';
    }

    if ($pending) {
        $intro = 'Votre demande de réservation a bien été enregistrée et est <strong>en attente de validation</strong>.';
    } elseif ($newCount > 0) {
        // Validation OFF avec au moins une nouvelle reservation → confirmation directe.
        $intro = $newCount > 1
            ? 'Vos réservations ont bien été enregistrées.'
            : 'Votre réservation a bien été enregistrée.';
    } else {
        // Que des modifications/deplacements/annulations.
        $intro = 'Vos modifications ont bien été enregistrées.';
    }

    $html =
        '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:1.5em;color:#222">'
        . '<h2 style="font-size:18px;color:#222;margin:0 0 .8em">Récapitulatif de vos réservations</h2>'
        . '<p style="font-size:13px;color:#444;margin:.4em 0">Bonjour ' . $esc($userName) . ',</p>'
        . '<p style="font-size:13px;color:#444;margin:.4em 0">' . $intro . '</p>'
        . $changesHtml
        . $snapHtml
        . '<p style="font-size:11px;color:#999;margin-top:2em;border-top:1px solid #eee;padding-top:.6em">Cet e-mail a été envoyé automatiquement par CultuRézo.</p>'
        . '</div>';

    $subject = $pending
        ? '[CultuRézo] Votre demande de réservation - ' . $svcLabel
        : '[CultuRézo] Récapitulatif de vos réservations - ' . $svcLabel;

    try {
        send_mail($user['email'], $subject, $html);
        json_response(['ok' => true]);
    } catch (Exception $e) {
        error_log('send_recap mail error: ' . $e->getMessage());
        json_response(['ok' => false, 'error' => "Envoi de l'e-mail échoué"], 500);
    }
}

// ── Annuler une réservation ────────────────────────────────
if ($action === 'cancel') {
    $user = require_auth();
    $id   = (int)($input['id'] ?? 0);
    $type = $input['type'] ?? 'recurring';

    $bk = DB::one("SELECT user_id, service_id, parent_booking_id FROM bookings WHERE id=? AND booking_type=?", [$id, $type]);
    if (!$bk) json_response(['ok' => false, 'error' => 'Réservation introuvable'], 404);
    if ($user['role'] === 'utilisateur' && $bk['user_id'] != $user['id']) {
        json_response(['ok' => false, 'error' => 'Accès refusé'], 403);
    }
    if ($user['role'] === 'gestionnaire') {
        require_service_access($bk['service_id'], $user);
    }

    // Si c'est un gestionnaire/admin qui annule la reservation d'un autre user,
    // on capture les details necessaires au mail AVANT le DELETE.
    $bkForMail = null;
    if ((int)$user['id'] !== (int)$bk['user_id']) {
        $bkForMail = DB::one(
            "SELECT b.user_id, b.theme_label, b.week, b.day_key, b.booking_type,
                    u.email, u.prenom, u.nom,
                    svc.label AS service_label,
                    s.start_time, s.end_time, s.slot_date,
                    p.label AS period_label
             FROM bookings b
             LEFT JOIN users    u   ON u.id   = b.user_id
             LEFT JOIN services svc ON svc.id = b.service_id
             LEFT JOIN slots    s   ON s.id   = b.slot_id
             LEFT JOIN periods  p   ON p.id   = b.period_id
             WHERE b.id=? AND b.booking_type=?",
            [$id, $type]
        );
    }

    if ($type === 'recurring') {
        bk_delete_mirrors($id);
        DB::run("DELETE FROM bookings WHERE id=? AND booking_type='recurring'", [$id]);
    } else {
        DB::run("DELETE FROM bookings WHERE id=? AND booking_type='unique'", [$id]);
    }

    // Mail d'information a l'utilisateur — best-effort, ne bloque pas l'action.
    if ($bkForMail && !empty($bkForMail['email'])) {
        try {
            require_once __DIR__ . '/../includes/mailer.php';
            $esc = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
            $userName = trim(($bkForMail['prenom'] ?? '') . ' ' . ($bkForMail['nom'] ?? ''));
            if ($userName === '') $userName = (string)$bkForMail['email'];
            $svcLabel = $bkForMail['service_label'] ?? '';
            $line     = bk_format_booking_line($bkForMail);
            $subject  = '[CultuRézo] Votre réservation a été annulée - ' . $svcLabel;
            $html =
                '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:1.5em;color:#222">'
                . '<h2 style="font-size:18px;color:#222;margin:0 0 .8em">Annulation de réservation</h2>'
                . '<p style="font-size:13px;color:#444;margin:.4em 0">Bonjour ' . $esc($userName) . ',</p>'
                . '<p style="font-size:13px;color:#444;margin:.4em 0">Votre réservation a été <strong>définitivement supprimée</strong> par un gestionnaire.</p>'
                . '<p style="font-size:13px;color:#222;margin:1em 0 .2em;font-weight:600">' . $esc($svcLabel) . '</p>'
                . '<ul style="padding-left:1.2em;margin:.2em 0 .6em;font-size:13px;color:#222">'
                . '<li style="margin:.2rem 0">' . $esc($line) . '</li>'
                . '</ul>'
                . '<p style="font-size:11px;color:#999;margin-top:2em;border-top:1px solid #eee;padding-top:.6em">Cet e-mail a été envoyé automatiquement par CultuRézo.</p>'
                . '</div>';
            send_mail($bkForMail['email'], $subject, $html);
        } catch (Exception $e) {
            error_log('cancel mail error: ' . $e->getMessage());
        }
    }

    json_response(['ok' => true]);
}

// ── Valider une réservation (admin) ────────────────────────
if ($action === 'validate') {
    require_manager();
    $id   = (int)($input['id'] ?? 0);
    $type = $input['type'] ?? 'recurring';
    $val  = (int)($input['validated'] ?? 1);

    // Etat precedent pour ne notifier qu'en cas de vraie transition (0→1 ou 1→0).
    $prev = DB::one("SELECT validated FROM bookings WHERE id=? AND booking_type=?", [$id, $type]);

    DB::run("UPDATE bookings SET validated=? WHERE id=? AND booking_type=?", [$val, $id, $type]);
    if ($type === 'recurring') {
        DB::run("UPDATE bookings SET validated=? WHERE parent_booking_id=? AND booking_type='unique'", [$val, $id]);
    }

    // Mail d'information a l'utilisateur — best-effort, ne bloque pas l'action.
    if ($prev && (int)$prev['validated'] !== $val) {
        try {
            $bk = DB::one(
                "SELECT b.user_id, b.theme_label, b.week, b.day_key, b.booking_type,
                        u.email, u.prenom, u.nom,
                        svc.label AS service_label,
                        s.start_time, s.end_time, s.slot_date,
                        p.label AS period_label
                 FROM bookings b
                 LEFT JOIN users    u   ON u.id   = b.user_id
                 LEFT JOIN services svc ON svc.id = b.service_id
                 LEFT JOIN slots    s   ON s.id   = b.slot_id
                 LEFT JOIN periods  p   ON p.id   = b.period_id
                 WHERE b.id=? AND b.booking_type=?",
                [$id, $type]
            );
            if ($bk && !empty($bk['email'])) {
                require_once __DIR__ . '/../includes/mailer.php';
                $esc = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
                $userName = trim(($bk['prenom'] ?? '') . ' ' . ($bk['nom'] ?? ''));
                if ($userName === '') $userName = (string)$bk['email'];
                $svcLabel = $bk['service_label'] ?? '';
                $line     = bk_format_booking_line($bk);
                $isValidation = ($val === 1);
                $intro = $isValidation
                    ? 'Votre réservation a été <strong>validée</strong> par un gestionnaire.'
                    : 'La validation de votre réservation a été <strong>annulée</strong> par un gestionnaire — elle repasse en attente.';
                $subject = $isValidation
                    ? '[CultuRézo] Votre réservation a été validée - ' . $svcLabel
                    : '[CultuRézo] Validation de votre réservation annulée - ' . $svcLabel;
                $html =
                    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:1.5em;color:#222">'
                    . '<h2 style="font-size:18px;color:#222;margin:0 0 .8em">' . ($isValidation ? 'Validation de réservation' : 'Validation annulée') . '</h2>'
                    . '<p style="font-size:13px;color:#444;margin:.4em 0">Bonjour ' . $esc($userName) . ',</p>'
                    . '<p style="font-size:13px;color:#444;margin:.4em 0">' . $intro . '</p>'
                    . '<p style="font-size:13px;color:#222;margin:1em 0 .2em;font-weight:600">' . $esc($svcLabel) . '</p>'
                    . '<ul style="padding-left:1.2em;margin:.2em 0 .6em;font-size:13px;color:#222">'
                    . '<li style="margin:.2rem 0">' . $esc($line) . '</li>'
                    . '</ul>'
                    . '<p style="font-size:11px;color:#999;margin-top:2em;border-top:1px solid #eee;padding-top:.6em">Cet e-mail a été envoyé automatiquement par CultuRézo.</p>'
                    . '</div>';
                send_mail($bk['email'], $subject, $html);
            }
        } catch (Exception $e) {
            error_log('validate mail error: ' . $e->getMessage());
        }
    }

    json_response(['ok' => true]);
}

// ── Déplacer une réservation (admin) ───────────────────────
if ($action === 'move') {
    require_manager();
    $id        = (int)($input['id'] ?? 0);
    $type      = $input['type'] ?? 'recurring';
    $serviceId = $input['service_id'] ?? '';
    $slotId    = $input['slot_id']    ?? '';
    $periodId  = (int)($input['period_id']  ?? 0);
    $dayKey    = $input['day_key']    ?? '';
    $week      = (string)($input['week'] ?? '');

    $svc = DB::one('SELECT open_on_holidays FROM services WHERE id=?', [$serviceId]);

    if ($type === 'recurring') {
        $totalCap = bk_slot_capacity('recurring', $slotId, $dayKey, 1);
        $bkSrc = DB::one("SELECT user_id, enfants, accompagnants FROM bookings WHERE id=? AND booking_type='recurring'", [$id]);
        $bkUserId = (int)($bkSrc['user_id'] ?? 0);

        if ($bkUserId && get_user_gauge($serviceId, $bkUserId)) {
            $gaugeSum = bk_gauge_sum_at('recurring', $serviceId, $slotId, $periodId, $dayKey, ['exclude_id' => $id, 'week' => $week]);
            if ($gaugeSum + (int)($bkSrc['enfants'] ?? 0) + (int)($bkSrc['accompagnants'] ?? 0) > $totalCap) {
                json_response(['ok' => false, 'error' => 'La jauge est dépassée pour ce créneau'], 409);
            }
        } else {
            $taken = bk_count_at('recurring', $serviceId, $slotId, $periodId, $dayKey, ['exclude_id' => $id, 'week' => $week]);
            if ($taken >= $totalCap) json_response(['ok' => false, 'error' => 'Créneau complet'], 409);
        }
        DB::run(
            "UPDATE bookings SET slot_id=?,period_id=?,day_key=?,week=?,auto_validate_from=NOW() WHERE id=? AND booking_type='recurring'",
            [$slotId, $periodId, $dayKey, $week, $id]
        );
        // Régénérer les miroirs
        $parent = DB::one("SELECT user_id, theme_label, enfants, accompagnants, validated FROM bookings WHERE id=? AND booking_type='recurring'", [$id]);
        bk_delete_mirrors($id);
        if ($parent) {
            bk_regenerate_mirrors(
                DB::get(), $id, (int)$parent['user_id'], $serviceId, $slotId, $periodId, $dayKey,
                $parent['theme_label'], (int)$parent['enfants'], (int)$parent['accompagnants'], (int)$parent['validated'],
                !empty($svc['open_on_holidays']), $week
            );
        }
    } else {
        $totalCap = bk_slot_capacity('unique', $slotId, null, 1);
        $bkSrcU = DB::one("SELECT user_id FROM bookings WHERE id=? AND booking_type='unique'", [$id]);
        $bkUserIdU = (int)($bkSrcU['user_id'] ?? 0);
        if ($bkUserIdU && get_user_gauge($serviceId, $bkUserIdU)) {
            $bkSrc = DB::one("SELECT enfants, accompagnants FROM bookings WHERE id=? AND booking_type='unique'", [$id]);
            $gaugeSum = bk_gauge_sum_at('unique', $serviceId, $slotId, null, null, ['exclude_id' => $id]);
            if ($gaugeSum + (int)($bkSrc['enfants'] ?? 0) + (int)($bkSrc['accompagnants'] ?? 0) > $totalCap) {
                json_response(['ok' => false, 'error' => 'La jauge est dépassée pour ce créneau'], 409);
            }
        } else {
            $taken = bk_count_at('unique', $serviceId, $slotId, null, null, ['exclude_id' => $id]);
            if ($taken >= $totalCap) json_response(['ok' => false, 'error' => 'Séance complète'], 409);
        }
        DB::run("UPDATE bookings SET slot_id=?,auto_validate_from=NOW() WHERE id=? AND booking_type='unique'", [$slotId, $id]);
    }
    json_response(['ok' => true]);
}

// ── Déplacer sa propre réservation (utilisateur) ──────────
if ($action === 'user_move') {
    $user      = require_auth();
    $id        = (int)($input['id']         ?? 0);
    $type      = $input['type']             ?? 'recurring';
    $serviceId = $input['service_id']       ?? '';
    $slotId    = $input['slot_id']          ?? '';
    $periodId  = (int)($input['period_id']  ?? 0);
    $dayKey    = $input['day_key']          ?? '';
    $week      = (string)($input['week']    ?? '');
    if (!$id || !$serviceId || !$slotId) json_response(['ok'=>false,'error'=>'Paramètres manquants'],400);

    $bk = DB::one("SELECT * FROM bookings WHERE id=? AND booking_type=?", [$id, $type]);
    if (!$bk) json_response(['ok'=>false,'error'=>'Réservation introuvable'],404);
    if ($bk['user_id'] != $user['id']) json_response(['ok'=>false,'error'=>'Accès refusé'],403);

    $svc = DB::one('SELECT max_reservations_period, open_on_holidays FROM services WHERE id=?', [$serviceId]);
    $resetValidated = (int)(get_user_validated($serviceId, (int)$bk['user_id']) === 0);
    $userGauge = get_user_gauge($serviceId, (int)$bk['user_id']);

    if ($type === 'recurring') {
        // Si changement de période, vérifier la limite trimestrielle
        if ((int)$bk['period_id'] !== $periodId) {
            $trimCount = (int)(DB::one(
                "SELECT COUNT(*) AS n FROM bookings WHERE service_id=? AND user_id=? AND period_id=? AND id!=? AND booking_type='recurring'",
                [$serviceId, $bk['user_id'], $periodId, $id]
            )['n'] ?? 0);
            if ($trimCount >= $svc['max_reservations_period']) {
                json_response(['ok'=>false,'error'=>'Limite par période atteinte pour cette période'],409);
            }
        }
        $totalCap = bk_slot_capacity('recurring', $slotId, $dayKey, 6);
        if ($userGauge) {
            $gaugeSum = bk_gauge_sum_at('recurring', $serviceId, $slotId, $periodId, $dayKey, ['exclude_id' => $id, 'week' => $week]);
            if ($gaugeSum + (int)($bk['enfants'] ?? 0) + (int)($bk['accompagnants'] ?? 0) > $totalCap) {
                json_response(['ok'=>false,'error'=>'La jauge est dépassée pour ce créneau'],409);
            }
        } else {
            $taken = bk_count_at('recurring', $serviceId, $slotId, $periodId, $dayKey, ['exclude_id' => $id, 'week' => $week]);
            if ($taken >= $totalCap) json_response(['ok'=>false,'error'=>'Créneau complet'],409);
        }
        if ($resetValidated) {
            DB::run("UPDATE bookings SET slot_id=?,day_key=?,period_id=?,week=?,validated=0,auto_validate_from=NOW() WHERE id=? AND booking_type='recurring'", [$slotId, $dayKey, $periodId, $week, $id]);
        } else {
            DB::run("UPDATE bookings SET slot_id=?,day_key=?,period_id=?,week=?,auto_validate_from=NOW() WHERE id=? AND booking_type='recurring'", [$slotId, $dayKey, $periodId, $week, $id]);
        }
        // Régénérer les miroirs
        $parent = DB::one("SELECT user_id, theme_label, enfants, accompagnants, validated FROM bookings WHERE id=? AND booking_type='recurring'", [$id]);
        bk_delete_mirrors($id);
        if ($parent) {
            $validated = $resetValidated ? 0 : (int)$parent['validated'];
            bk_regenerate_mirrors(
                DB::get(), $id, (int)$parent['user_id'], $serviceId, $slotId, $periodId, $dayKey,
                $parent['theme_label'], (int)$parent['enfants'], (int)$parent['accompagnants'], $validated,
                !empty($svc['open_on_holidays']), $week
            );
        }
    } else {
        $totalCap = bk_slot_capacity('unique', $slotId, null, 1);
        if ($userGauge) {
            $gaugeSum = bk_gauge_sum_at('unique', $serviceId, $slotId, null, null, ['exclude_id' => $id]);
            if ($gaugeSum + (int)($bk['enfants'] ?? 0) + (int)($bk['accompagnants'] ?? 0) > $totalCap) {
                json_response(['ok'=>false,'error'=>'La jauge est dépassée pour ce créneau'],409);
            }
        } else {
            $taken = bk_count_at('unique', $serviceId, $slotId, null, null, ['exclude_id' => $id]);
            if ($taken >= $totalCap) json_response(['ok'=>false,'error'=>'Séance complète'],409);
        }
        if ($resetValidated) {
            DB::run("UPDATE bookings SET slot_id=?,validated=0,auto_validate_from=NOW() WHERE id=? AND booking_type='unique'", [$slotId, $id]);
        } else {
            DB::run("UPDATE bookings SET slot_id=?,auto_validate_from=NOW() WHERE id=? AND booking_type='unique'", [$slotId, $id]);
        }
    }
    json_response(['ok'=>true]);
}

// ── Dupliquer (copier-coller de badge) ───────────────────
if ($action === 'duplicate') {
    require_manager();
    $id        = (int)($input['id'] ?? 0);
    $type      = $input['type'] ?? 'recurring';
    $serviceId = $input['service_id'] ?? '';
    $slotId    = $input['slot_id']    ?? '';
    $periodId  = (int)($input['period_id']  ?? 0);
    $dayKey    = $input['day_key']    ?? '';
    $week      = (string)($input['week'] ?? '');

    $src = DB::one("SELECT * FROM bookings WHERE id=? AND booking_type=?", [$id, $type]);
    if (!$src) json_response(['ok' => false, 'error' => 'Introuvable'], 404);
    $srcUserGauge = get_user_gauge($serviceId, (int)$src['user_id']);

    if ($type === 'recurring') {
        $totalCap = bk_slot_capacity('recurring', $slotId, $dayKey, 1);
        if ($srcUserGauge) {
            $gaugeSum = bk_gauge_sum_at('recurring', $serviceId, $slotId, $periodId, $dayKey, ['week' => $week]);
            if ($gaugeSum + (int)($src['enfants'] ?? 0) + (int)($src['accompagnants'] ?? 0) > $totalCap) {
                json_response(['ok' => false, 'error' => 'La jauge est dépassée pour ce créneau'], 409);
            }
        } else {
            $taken = bk_count_at('recurring', $serviceId, $slotId, $periodId, $dayKey, ['week' => $week]);
            if ($taken >= $totalCap) json_response(['ok' => false, 'error' => 'Créneau complet'], 409);
        }
        // Préserver enfants/accompagnants du badge source (cohérent avec la vérification jauge)
        DB::run(
            'INSERT INTO bookings (user_id,service_id,slot_id,period_id,day_key,week,theme_label,enfants,accompagnants,validated) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [$src['user_id'], $src['service_id'], $slotId, $periodId, $dayKey, $week, $src['theme_label'],
             (int)($src['enfants'] ?? 0), (int)($src['accompagnants'] ?? 0), $src['validated']]
        );
    } else {
        $totalCap = bk_slot_capacity('unique', $slotId, null, 1);
        if ($srcUserGauge) {
            $gaugeSum = bk_gauge_sum_at('unique', $serviceId, $slotId, null, null);
            if ($gaugeSum + (int)($src['enfants'] ?? 0) + (int)($src['accompagnants'] ?? 0) > $totalCap) {
                json_response(['ok' => false, 'error' => 'La jauge est dépassée pour ce créneau'], 409);
            }
        } else {
            $taken = bk_count_at('unique', $serviceId, $slotId, null, null);
            if ($taken >= $totalCap) json_response(['ok' => false, 'error' => 'Séance complète'], 409);
        }
        // Préserver les enfants/accompagnants du badge source (cohérent avec la vérification jauge ci-dessus
        // et avec la branche récurrente qui copie aussi les valeurs réelles).
        // period_id : hérité du slot cible (modèle unifié — un ponctuel a toujours une période).
        $tgtPeriodRow = DB::one('SELECT period_id FROM slots WHERE id=?', [$slotId]);
        $tgtPeriodId  = (int)($tgtPeriodRow['period_id'] ?? 0);
        bk_upsert_unique((int)$src['user_id'], $src['service_id'], $slotId, $tgtPeriodId, $src['theme_label'], (int)($src['enfants'] ?? 0), (int)($src['accompagnants'] ?? 0), (int)$src['validated']);
    }
    json_response(['ok' => true]);
}

// ── Modifier le thème ─────────────────────────────────────
if ($action === 'update_theme') {
    $user  = require_auth();
    $id    = (int)($input['id'] ?? 0);
    $type  = $input['type'] ?? 'recurring';
    $theme = trim($input['theme_label'] ?? '');
    if (!$id) json_response(['ok' => false, 'error' => 'ID manquant'], 400);

    $bk = DB::one("SELECT user_id FROM bookings WHERE id=? AND booking_type=?", [$id, $type]);
    if (!$bk) json_response(['ok' => false, 'error' => 'Réservation introuvable'], 404);
    if ($user['role'] === 'utilisateur' && $bk['user_id'] != $user['id']) {
        json_response(['ok' => false, 'error' => 'Accès refusé'], 403);
    }
    DB::run("UPDATE bookings SET theme_label=? WHERE id=? AND booking_type=?", [$theme, $id, $type]);
    if ($type === 'recurring') {
        DB::run("UPDATE bookings SET theme_label=? WHERE parent_booking_id=? AND booking_type='unique'", [$theme, $id]);
    }
    json_response(['ok' => true]);
}

// ── Pointage (présent/absent) ─────────────────────────────
if ($action === 'pointage') {
    require_manager();
    $id    = (int)($input['id'] ?? 0);
    $value = isset($input['value']) && $input['value'] !== '' ? $input['value'] : null;
    if (!$id) json_response(['ok' => false, 'error' => 'ID manquant'], 400);
    if ($value !== null && !in_array($value, ['present', 'absent'])) {
        json_response(['ok' => false, 'error' => 'Valeur invalide'], 400);
    }
    DB::run("UPDATE bookings SET pointage=? WHERE id=? AND booking_type='unique'", [$value, $id]);
    json_response(['ok' => true]);
}

// ── Modifier enfants/accompagnants ─────────────────────────
if ($action === 'update_counts') {
    $user  = require_auth();
    $id    = (int)($input['id'] ?? 0);
    $type  = $input['type'] ?? 'recurring';
    $enfants       = (int)($input['enfants']       ?? 0);
    $accompagnants = (int)($input['accompagnants'] ?? 0);
    if (!$id) json_response(['ok' => false, 'error' => 'ID manquant'], 400);

    $bk = DB::one("SELECT * FROM bookings WHERE id=? AND booking_type=?", [$id, $type]);
    if (!$bk) json_response(['ok' => false, 'error' => 'Réservation introuvable'], 404);

    if ($user['role'] === 'utilisateur' && $bk['user_id'] != $user['id']) {
        json_response(['ok' => false, 'error' => 'Accès refusé'], 403);
    }
    if ($user['role'] === 'gestionnaire') {
        require_service_access($bk['service_id'], $user);
    }

    // Vérifier la jauge si activée pour cet utilisateur (selon son demandeur dans service_demandeur_settings)
    if (get_user_gauge((string)$bk['service_id'], (int)$bk['user_id'])) {
        if ($type === 'recurring') {
            $totalCap = bk_slot_capacity('recurring', $bk['slot_id'], $bk['day_key']);
            $currentSum = bk_gauge_sum_at('recurring', $bk['service_id'], $bk['slot_id'], (int)$bk['period_id'], $bk['day_key'], ['exclude_user_id' => (int)$bk['user_id']]);
        } else {
            $totalCap = bk_slot_capacity('unique', $bk['slot_id'], null);
            $currentSum = bk_gauge_sum_at('unique', $bk['service_id'], $bk['slot_id'], null, null, ['exclude_user_id' => (int)$bk['user_id']]);
        }
        if ($totalCap !== null && $currentSum + $enfants + $accompagnants > $totalCap) {
            json_response(['ok' => false, 'error' => 'La jauge est dépassée pour ce créneau'], 409);
        }
    }

    DB::run("UPDATE bookings SET enfants=?, accompagnants=? WHERE id=? AND booking_type=?", [$enfants, $accompagnants, $id, $type]);
    if ($type === 'recurring') {
        DB::run("UPDATE bookings SET enfants=?, accompagnants=? WHERE parent_booking_id=? AND booking_type='unique'", [$enfants, $accompagnants, $id]);
    }
    json_response(['ok' => true]);
}

// ── Réservation admin (pour un utilisateur donné) ─────────
if ($action === 'admin_book') {
    require_manager();
    $userId    = (int)($input['user_id']    ?? 0);
    $serviceId = $input['service_id'] ?? '';
    $slotId    = $input['slot_id']    ?? '';
    $periodId  = (int)($input['period_id']  ?? 0);
    $dayKey    = $input['day_key']    ?? '';
    $week      = (string)($input['week']    ?? '');
    $theme     = trim($input['theme_label'] ?? '');
    $forceType = $input['type'] ?? '';
    if (!$userId || !$serviceId || !$slotId) {
        json_response(['ok' => false, 'error' => 'Paramètres manquants'], 400);
    }
    $svc = DB::one('SELECT * FROM services WHERE id=?', [$serviceId]);
    if (!$svc) json_response(['ok' => false, 'error' => 'Service introuvable'], 404);

    $targetUserGauge = get_user_gauge($serviceId, $userId);
    if ($forceType === 'recurring') {
        $totalCap = bk_slot_capacity('recurring', $slotId, $dayKey, 6);
        // Valeurs Enfants/Adultes : surcharge depuis la requête si fournie,
        // sinon retombée sur le profil de l'utilisateur cible (et 1 adulte par défaut).
        $targetUser = DB::one('SELECT enfants FROM users WHERE id=?', [$userId]);
        $enfants       = array_key_exists('enfants',       $input) ? max(0, (int)$input['enfants'])       : (int)($targetUser['enfants'] ?? 0);
        $accompagnants = array_key_exists('accompagnants', $input) ? max(0, (int)$input['accompagnants']) : 1;

        if ($targetUserGauge) {
            $gaugeSum = bk_gauge_sum_at('recurring', $serviceId, $slotId, $periodId, $dayKey, ['week' => $week]);
            if ($gaugeSum + $enfants + $accompagnants > $totalCap) {
                json_response(['ok' => false, 'error' => 'La jauge est dépassée pour ce créneau'], 409);
            }
        } else {
            $taken = bk_count_at('recurring', $serviceId, $slotId, $periodId, $dayKey, ['week' => $week]);
            if ($taken >= $totalCap) json_response(['ok' => false, 'error' => 'Créneau complet'], 409);
        }
        $pdo = DB::get();
        $recurringId = bk_upsert_recurring($pdo, $userId, $serviceId, $slotId, $periodId, $dayKey, $theme, $enfants, $accompagnants, 1, $week);
        if ($recurringId) {
            bk_regenerate_mirrors(
                $pdo, $recurringId, $userId, $serviceId, $slotId, $periodId, $dayKey,
                $theme, $enfants, $accompagnants, 1,
                !empty($svc['open_on_holidays']), $week
            );
        }
    } else {
        // Valeurs Enfants/Adultes : surcharge depuis la requête si fournie,
        // sinon retombée sur le profil de l'utilisateur cible (cohérent avec la branche récurrente).
        $targetUser    = DB::one('SELECT enfants FROM users WHERE id=?', [$userId]);
        $enfants       = array_key_exists('enfants',       $input) ? max(0, (int)$input['enfants'])       : (int)($targetUser['enfants'] ?? 0);
        $accompagnants = array_key_exists('accompagnants', $input) ? max(0, (int)$input['accompagnants']) : 1;

        if ($forceType === 'unique') {
            $totalCap = bk_slot_capacity('unique', $slotId, null, 1);
            if ($targetUserGauge) {
                $gaugeSum = bk_gauge_sum_at('unique', $serviceId, $slotId, null, null);
                if ($gaugeSum + $enfants + $accompagnants > $totalCap) {
                    json_response(['ok' => false, 'error' => 'La jauge est dépassée pour ce créneau'], 409);
                }
            } else {
                $taken = bk_count_at('unique', $serviceId, $slotId, null, null);
                if ($taken >= $totalCap) json_response(['ok' => false, 'error' => 'Séance complète'], 409);
            }
        }
        $alreadyBooked = DB::one(
            "SELECT id FROM bookings WHERE user_id=? AND service_id=? AND slot_id=? AND booking_type='unique'",
            [$userId, $serviceId, $slotId]
        );
        if ($alreadyBooked) {
            json_response(['ok' => false, 'error' => 'Cet utilisateur a déjà réservé cette séance'], 409);
        }
        // period_id hérité du slot (modèle unifié).
        $slotPeriodRow = DB::one('SELECT period_id FROM slots WHERE id=?', [$slotId]);
        $slotPeriodId  = (int)($slotPeriodRow['period_id'] ?? 0);
        bk_upsert_unique($userId, $serviceId, $slotId, $slotPeriodId, $theme, $enfants, $accompagnants, 1);
    }
    json_response(['ok' => true]);
}

json_response(['ok' => false, 'error' => 'Action inconnue'], 400);
