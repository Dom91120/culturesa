<?php
// ============================================================
//  CultuRézo — API /api/stats.php  (admin/gestionnaire)
//  GET ?service_id=&type=&period_id=&exercice_id=&date_from=&date_to=
//
//  type        : 'rec' | 'uniq' | 'all'  (défaut 'all')
//  period_id   : restreint à une période précise
//  exercice_id : restreint aux périodes d'un exercice
//  date_from   : YYYY-MM-DD (inclus). Filtre sur slot.slot_date (uniq)
//                ou period.date_end (rec, "actif à partir de date_from").
//  date_to     : YYYY-MM-DD (inclus). Symétrique.
//
//  Renvoie : kpis, service_meta, by_period, by_day, evolution,
//  by_slot_fill, top_structures, top_niveaux, pointage.
// ============================================================

require_once __DIR__ . '/../includes/api.php';

require_manager();
$serviceId  = $_GET['service_id'] ?? get_input()['service_id'] ?? '';
if (!$serviceId) json_response(['ok' => false, 'error' => 'service_id manquant'], 400);

$svc = DB::one('SELECT * FROM services WHERE id=?', [$serviceId]);
if (!$svc) json_response(['ok' => false, 'error' => 'Service introuvable'], 404);

$type       = $_GET['type']        ?? 'all';
$periodId   = $_GET['period_id']   ?? '';
$exerciceId = $_GET['exercice_id'] ?? '';
$dateFrom   = $_GET['date_from']   ?? '';
$dateTo     = $_GET['date_to']     ?? '';
if (!in_array($type, ['rec', 'uniq', 'all'], true)) $type = 'all';

/**
 * Construit la clause WHERE commune appliquée à `bookings b` (avec JOIN slots s ON s.id=b.slot_id).
 * Retourne [sqlFragment, params] — le sqlFragment commence par ' AND '.
 * Exclut systématiquement les miroirs (parent_booking_id IS NULL) pour ne pas compter en double.
 */
function stats_where(string $serviceId, string $type, string $periodId, string $exerciceId, string $dateFrom, string $dateTo): array {
    $sql = ' AND b.service_id = ? AND b.parent_booking_id IS NULL';
    $params = [$serviceId];

    if ($type === 'rec')        { $sql .= " AND b.booking_type = 'recurring'"; }
    elseif ($type === 'uniq')   { $sql .= " AND b.booking_type = 'unique'";    }

    if ($periodId !== '') {
        $sql .= ' AND b.period_id = ?';
        $params[] = (int)$periodId;
    }
    if ($exerciceId !== '') {
        $sql .= ' AND b.period_id IN (SELECT id FROM periods WHERE exercice_id = ?)';
        $params[] = (int)$exerciceId;
    }
    // Plage de dates : on s'appuie sur slot.slot_date pour les ponctuels et sur la période
    // (date_start/date_end) pour les récurrents — un booking récurrent "compte" pour la plage
    // si l'intervalle de sa période chevauche la plage demandée.
    if ($dateFrom !== '' || $dateTo !== '') {
        // Pré-charge la période côté SQL via sous-requête.
        if ($dateFrom !== '') {
            $sql .= " AND (
                (b.booking_type = 'unique' AND s.slot_date >= ?)
             OR (b.booking_type = 'recurring' AND EXISTS (
                    SELECT 1 FROM periods p WHERE p.id = b.period_id AND p.date_end >= ?))
            )";
            $params[] = $dateFrom;
            $params[] = $dateFrom;
        }
        if ($dateTo !== '') {
            $sql .= " AND (
                (b.booking_type = 'unique' AND s.slot_date <= ?)
             OR (b.booking_type = 'recurring' AND EXISTS (
                    SELECT 1 FROM periods p WHERE p.id = b.period_id AND p.date_start <= ?))
            )";
            $params[] = $dateTo;
            $params[] = $dateTo;
        }
    }
    return [$sql, $params];
}

[$where, $params] = stats_where($serviceId, $type, $periodId, $exerciceId, $dateFrom, $dateTo);

// ── KPIs ──────────────────────────────────────────────────
$totalRow = DB::one(
    "SELECT
        COUNT(*) AS total,
        COUNT(DISTINCT b.user_id) AS distinct_users,
        SUM(CASE WHEN b.validated = 0 THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN b.pointage = 'present' THEN 1 ELSE 0 END) AS present_n,
        SUM(CASE WHEN b.pointage = 'absent'  THEN 1 ELSE 0 END) AS absent_n,
        SUM(CASE WHEN b.pointage IS NULL     THEN 1 ELSE 0 END) AS untracked_n,
        COALESCE(SUM(b.enfants), 0) AS total_enf,
        COALESCE(SUM(b.accompagnants), 0) AS total_acc
     FROM bookings b
     JOIN slots s ON s.id = b.slot_id
     WHERE 1=1 $where",
    $params
);

$totalBookings = (int)($totalRow['total'] ?? 0);
$distinctUsers = (int)($totalRow['distinct_users'] ?? 0);
$pending       = (int)($totalRow['pending'] ?? 0);
$presentN      = (int)($totalRow['present_n'] ?? 0);
$absentN       = (int)($totalRow['absent_n'] ?? 0);
$untrackedN    = (int)($totalRow['untracked_n'] ?? 0);
$totalEnf      = (int)($totalRow['total_enf'] ?? 0);
$totalAcc      = (int)($totalRow['total_acc'] ?? 0);

// ── Taux de remplissage global : somme(taken) / somme(cap) sur les créneaux concernés ──
// Pour les récurrents : cap = somme des cap_<jour> actifs sur le slot.
// Pour les ponctuels : cap = slot.capacity.
$slotsCap = DB::all(
    "SELECT s.id, s.slot_type, s.capacity,
            COALESCE(s.cap_lun,0)+COALESCE(s.cap_mar,0)+COALESCE(s.cap_mer,0)+
            COALESCE(s.cap_jeu,0)+COALESCE(s.cap_ven,0)+COALESCE(s.cap_sam,0)+
            COALESCE(s.cap_dim,0) AS rec_cap
     FROM slots s
     WHERE s.service_id = ? AND (s.state = 'actif' OR s.state IS NULL)",
    [$serviceId]
);
$capBySlot = [];
foreach ($slotsCap as $sl) {
    $capBySlot[$sl['id']] = ($sl['slot_type'] === 'recurring')
        ? (int)$sl['rec_cap']
        : (int)$sl['capacity'];
}

// Réservations filtrées groupées par slot (pour calculer taken par slot).
$slotTaken = DB::all(
    "SELECT b.slot_id, COUNT(*) AS taken
     FROM bookings b
     JOIN slots s ON s.id = b.slot_id
     WHERE 1=1 $where
     GROUP BY b.slot_id",
    $params
);
$takenBySlot = [];
foreach ($slotTaken as $row) {
    $takenBySlot[$row['slot_id']] = (int)$row['taken'];
}
$totalCap = $totalTaken = 0;
foreach ($takenBySlot as $sid => $tk) {
    if (isset($capBySlot[$sid])) {
        $totalCap   += $capBySlot[$sid];
        $totalTaken += min($tk, $capBySlot[$sid]); // borne pour ne pas dépasser 100%
    }
}
$fillRatePct = $totalCap > 0 ? (int)round(100 * $totalTaken / $totalCap) : null;

// ── Service meta : on n'affiche les sections pointage/jauge que s'il y a au moins un signal ──
$hasPointage = ($presentN + $absentN) > 0;
$hasGauge    = ($totalEnf + $totalAcc) > 0;
$hasValidation = (int)($svc['validation'] ?? 0) === 1;

// ── Distribution par période (compte) ─────────────────────
$byPeriod = DB::all(
    "SELECT b.period_id AS period_id,
            p.label    AS label,
            p.color    AS color,
            COUNT(*)   AS count
     FROM bookings b
     JOIN slots s ON s.id = b.slot_id
     LEFT JOIN periods p ON p.id = b.period_id
     WHERE 1=1 $where
     GROUP BY b.period_id, p.label, p.color
     ORDER BY p.date_start IS NULL, p.date_start, b.period_id",
    $params
);

// ── Distribution par jour de la semaine ───────────────────
// Pour les récurrents : day_key direct. Pour les ponctuels : déduit de slot.slot_date.
// Sous-requête pour contourner only_full_group_by (l'expression CASE référence des
// colonnes non-aggrégées).
$byDayRows = DB::all(
    "SELECT day_key, COUNT(*) AS count FROM (
        SELECT CASE
                 WHEN b.booking_type = 'recurring' THEN b.day_key
                 ELSE ELT(DAYOFWEEK(s.slot_date), 'dim','lun','mar','mer','jeu','ven','sam')
               END AS day_key
        FROM bookings b
        JOIN slots s ON s.id = b.slot_id
        WHERE 1=1 $where
     ) AS x
     GROUP BY day_key
     ORDER BY FIELD(day_key, 'lun','mar','mer','jeu','ven','sam','dim')",
    $params
);

// ── Évolution dans le temps (par mois) ────────────────────
// Pour les récurrents : on prend la date_start de la période comme proxy.
// Pour les ponctuels : slot.slot_date.
$evolution = DB::all(
    "SELECT bucket, COUNT(*) AS count FROM (
        SELECT DATE_FORMAT(
            CASE
                WHEN b.booking_type = 'unique' THEN s.slot_date
                ELSE (SELECT p.date_start FROM periods p WHERE p.id = b.period_id)
            END,
            '%Y-%m'
        ) AS bucket
        FROM bookings b
        JOIN slots s ON s.id = b.slot_id
        WHERE 1=1 $where
     ) AS x
     WHERE bucket IS NOT NULL
     GROUP BY bucket
     ORDER BY bucket",
    $params
);

// ── Top créneaux par taux de remplissage ──────────────────
// On reprend $takenBySlot et on calcule le pct, label = "HH:MM-HH:MM".
$slotLabels = DB::all(
    "SELECT id, start_time, end_time, slot_date, slot_type FROM slots WHERE service_id = ?",
    [$serviceId]
);
$slotInfo = [];
foreach ($slotLabels as $sl) {
    $slotInfo[$sl['id']] = $sl;
}
$bySlotFill = [];
foreach ($takenBySlot as $sid => $taken) {
    if (!isset($slotInfo[$sid])) continue;
    $cap = $capBySlot[$sid] ?? 0;
    if ($cap <= 0) continue;
    $sl = $slotInfo[$sid];
    $hours = substr($sl['start_time'], 0, 5) . '–' . substr($sl['end_time'], 0, 5);
    $label = $sl['slot_type'] === 'unique' && $sl['slot_date']
        ? ($sl['slot_date'] . ' ' . $hours)
        : $hours;
    $bySlotFill[] = [
        'slot_id'   => $sid,
        'label'     => $label,
        'cap'       => $cap,
        'taken'     => $taken,
        'fill_pct'  => (int)round(100 * min($taken, $cap) / $cap),
    ];
}
// Tri par fill_pct desc, on garde top 10.
usort($bySlotFill, fn($a, $b) => $b['fill_pct'] - $a['fill_pct']);
$bySlotFill = array_slice($bySlotFill, 0, 10);

// ── Top structures ────────────────────────────────────────
$topStructures = DB::all(
    "SELECT COALESCE(str.label, '(Sans structure)') AS label,
            u.structure_id AS structure_id,
            COUNT(*) AS count
     FROM bookings b
     JOIN slots s ON s.id = b.slot_id
     JOIN users u ON u.id = b.user_id
     LEFT JOIN structures str ON str.id = u.structure_id
     WHERE 1=1 $where
     GROUP BY u.structure_id, str.label
     ORDER BY count DESC, label
     LIMIT 10",
    $params
);

// ── Top niveaux ───────────────────────────────────────────
$topNiveaux = DB::all(
    "SELECT COALESCE(NULLIF(u.niveau, ''), '(Aucun)') AS label,
            COUNT(*) AS count
     FROM bookings b
     JOIN slots s ON s.id = b.slot_id
     JOIN users u ON u.id = b.user_id
     WHERE 1=1 $where
     GROUP BY label
     ORDER BY count DESC, label
     LIMIT 10",
    $params
);

// ── Pointage détaillé ─────────────────────────────────────
$pointage = [
    'present'   => $presentN,
    'absent'    => $absentN,
    'untracked' => $untrackedN,
];

// ── Périodes disponibles pour le dropdown filtre ──────────
$periodsList = DB::all(
    "SELECT id, label, date_start, date_end, exercice_id
     FROM periods
     WHERE service_id = ? AND state = 'actif'
     ORDER BY date_start IS NULL, date_start, id",
    [$serviceId]
);

json_response([
    'ok' => true,
    'filters_applied' => [
        'type'        => $type,
        'period_id'   => $periodId,
        'exercice_id' => $exerciceId,
        'date_from'   => $dateFrom,
        'date_to'     => $dateTo,
    ],
    'kpis' => [
        'total_bookings'       => $totalBookings,
        'distinct_users'       => $distinctUsers,
        'pending'              => $pending,
        'fill_rate_pct'        => $fillRatePct,
        'present'              => $presentN,
        'absent'               => $absentN,
        'untracked'            => $untrackedN,
        'total_enfants'        => $totalEnf,
        'total_accompagnants'  => $totalAcc,
    ],
    'service_meta' => [
        'has_validation' => $hasValidation,
        'has_pointage'   => $hasPointage,
        'has_gauge'      => $hasGauge,
    ],
    'by_period'       => $byPeriod,
    'by_day'          => $byDayRows,
    'evolution'       => $evolution,
    'by_slot_fill'    => $bySlotFill,
    'top_structures'  => $topStructures,
    'top_niveaux'     => $topNiveaux,
    'pointage'        => $pointage,
    'periods_list'    => $periodsList,
]);
