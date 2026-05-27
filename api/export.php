<?php
// ============================================================
//  CultuRézo — API /api/export.php
//  GET ?service_id=
//  Génère un export CSV des réservations (admin/gestionnaire).
//  Colonnes alignées sur la "Liste des réservations" de l'onglet Éditions :
//  Type, Structure, Niveau, Demandeur, Email, Téléphone, Enfants, Adultes,
//  Période, Créneau, Jour/Date, Thème, Statut, Date de réservation.
// ============================================================

require_once __DIR__ . '/../includes/api.php';

require_manager();

$serviceId = $_GET['service_id'] ?? '';
if (!$serviceId) json_response(['ok' => false, 'error' => 'service_id manquant'], 400);

$svc = DB::one('SELECT * FROM services WHERE id=?', [$serviceId]);
if (!$svc) json_response(['ok' => false, 'error' => 'Service introuvable'], 404);

$filename = 'reservations_' . preg_replace('/[^a-z0-9]/i', '_', $svc['label']) . '_' . date('Ymd');

$dayNames = [
    'lun' => 'Lundi', 'mar' => 'Mardi', 'mer' => 'Mercredi',
    'jeu' => 'Jeudi', 'ven' => 'Vendredi', 'sam' => 'Samedi', 'dim' => 'Dimanche',
];
$dowNames = [0=>'Dimanche',1=>'Lundi',2=>'Mardi',3=>'Mercredi',4=>'Jeudi',5=>'Vendredi',6=>'Samedi'];

// Récupère récurrents + ponctuels en une fois. Miroirs exclus (parent_booking_id IS NULL)
// pour ne pas doubler les récurrents avec leurs instances ponctuelles dérivées.
$rows = DB::all(
    "SELECT b.id,
            b.booking_type,
            u.nom, u.prenom, u.email, u.tel, u.niveau, u.enfants, u.accompagnants,
            str.label   AS structure_label,
            dem.label   AS demandeur_label,
            p.label     AS period_label,
            s.start_time, s.end_time, s.slot_date,
            b.day_key, b.theme_label, b.validated,
            b.created_at
     FROM bookings b
     JOIN users u ON u.id = b.user_id
     LEFT JOIN structures str ON str.id = u.structure_id
     LEFT JOIN demandeurs dem ON dem.id = u.demandeur_id
     JOIN slots  s ON s.id = b.slot_id
     LEFT JOIN periods p ON p.id = b.period_id
     WHERE b.service_id = ?
       AND b.parent_booking_id IS NULL
     ORDER BY b.booking_type, p.date_start IS NULL, p.date_start, s.slot_date,
              s.start_time, b.day_key, u.nom",
    [$serviceId]
);

$headers = [
    'Type', 'Structure', 'Niveau', 'Demandeur', 'Email', 'Téléphone',
    'Enfants', 'Adultes', 'Période', 'Créneau', 'Jour / Date',
    'Thème', 'Statut', 'Date de réservation',
];

$csvRows = array_map(function($r) use ($dayNames, $dowNames) {
    $isRec = ($r['booking_type'] === 'recurring');
    $typeLabel = $isRec ? 'Récurrente' : 'Ponctuelle';

    // Structure → fallback démandeur (cohérent avec l'UI).
    $structure = $r['structure_label'] ?: ($r['demandeur_label'] ?: '');

    // Demandeur = "Nom Prénom".
    $nom    = trim((string)($r['nom']    ?? ''));
    $prenom = trim((string)($r['prenom'] ?? ''));
    $demandeur = trim($nom . ' ' . $prenom);

    // Créneau : horaires HH:MM – HH:MM, ou "Journée entière".
    $start = $r['start_time'] ? substr($r['start_time'], 0, 5) : '';
    $end   = $r['end_time']   ? substr($r['end_time'],   0, 5) : '';
    $creneau = ($start && $end) ? ($start . ' – ' . $end) : 'Journée entière';

    // Jour / Date : pour rec → jour de semaine seul. Pour uniq → "Lundi 18/06/2026".
    $jourDate = '';
    if ($isRec) {
        $jourDate = $dayNames[$r['day_key']] ?? ($r['day_key'] ?? '');
    } elseif (!empty($r['slot_date'])) {
        $d = new DateTime($r['slot_date']);
        $jourDate = $dowNames[(int)$d->format('w')] . ' ' . $d->format('d/m/Y');
    }

    return [
        $typeLabel,
        $structure,
        $r['niveau'] ?? '',
        $demandeur ?: '',
        $r['email'] ?? '',
        $r['tel']   ?? '',
        $r['enfants'] ?? '',
        $r['accompagnants'] ?? '',
        $r['period_label'] ?? '',
        $creneau,
        $jourDate,
        $r['theme_label'] ?? '',
        $r['validated'] ? 'Validé' : 'En attente',
        $r['created_at'] ?? '',
    ];
}, $rows);

// ── Génération CSV avec BOM UTF-8 pour Excel ──────────────
header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $filename . '.csv"');
header('Pragma: no-cache');
header('Expires: 0');

$out = fopen('php://output', 'w');
// BOM UTF-8 pour qu'Excel détecte l'encodage.
fwrite($out, "\xEF\xBB\xBF");
fputcsv($out, $headers, ';');
foreach ($csvRows as $row) {
    fputcsv($out, $row, ';');
}
fclose($out);
exit;
