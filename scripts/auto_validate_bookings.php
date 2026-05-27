<?php
// ============================================================
//  CultuRésa — Cron auto-validation des réservations
// ============================================================
//  À lancer toutes les ~15 min via crontab :
//    */15 * * * * /usr/bin/php /var/www/culturesa/scripts/auto_validate_bookings.php >> /var/log/culturesa/auto_validate.log 2>&1
//
//  Logique :
//  Pour chaque service ayant services.auto_validation_delay != 0, on parcourt
//  les bookings en attente (validated=0, parent_booking_id IS NULL) et on valide
//  ceux dont le délai depuis bookings.auto_validate_from est écoulé, à condition
//  que la séance ne soit pas déjà passée.
//
//  Encodage du délai (services.auto_validation_delay) :
//    0         → désactivé (skip)
//    -120      → 2h ouvrées
//    -1440     → 1 jour ouvré
//    -2880     → 2 jours ouvrés
//    -4320     → 3 jours ouvrés
//    +10080    → 1 semaine calendaire
//    +20160    → 2 semaines calendaires
//
//  Heures ouvrées = jours actifs du service (services.active_days) + plages
//  horaires (morning_start..morning_end + afternoon_start..afternoon_end).
//
//  Notifications :
//   - mail au propriétaire de la résa (template identique à validation manuelle)
//   - mail à tous les gestionnaires affectés au service
// ============================================================

declare(strict_types=1);

// Bootstrap minimal sans require_auth etc.
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/mailer.php';

// Helpers de formatage FR partagés avec api/bookings.php (mail récap + cancel + validate).
// On ne peut pas inclure bookings.php directement (il déclencherait les routes API), donc
// on re-déclare les helpers ici. Volontairement minimal — synchroniser si évolution majeure.
function av_day_name_fr(string $dk): string {
    static $map = ['lun'=>'Lundi','mar'=>'Mardi','mer'=>'Mercredi','jeu'=>'Jeudi','ven'=>'Vendredi','sam'=>'Samedi','dim'=>'Dimanche'];
    return $map[$dk] ?? $dk;
}
function av_format_date_fr(?string $ymd): string {
    if (!$ymd) return '';
    $t = strtotime($ymd . ' 12:00:00');
    if ($t === false) return $ymd;
    static $MONTHS = ['','janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    $dk = ['dim','lun','mar','mer','jeu','ven','sam'][(int)date('w', $t)];
    return av_day_name_fr($dk) . ' ' . (int)date('j', $t) . ' ' . $MONTHS[(int)date('n', $t)] . ' ' . date('Y', $t);
}
function av_format_hours(?string $start, ?string $end): string {
    $s = $start ? substr($start, 0, 5) : '';
    $e = $end   ? substr($end,   0, 5) : '';
    if ($s === '' && $e === '') return 'Journée entière';
    return trim($s . ' – ' . $e, ' –');
}
function av_format_booking_line(array $bk): string {
    if ($bk['booking_type'] === 'recurring') {
        $parts = [
            av_day_name_fr($bk['day_key'] ?? ''),
            av_format_hours($bk['start_time'] ?? '', $bk['end_time'] ?? ''),
            !empty($bk['week']) ? 'Semaine ' . $bk['week'] : '',
            $bk['period_label'] ?? '',
            !empty($bk['theme_label']) ? '« ' . $bk['theme_label'] . ' »' : '',
        ];
    } else {
        $parts = [
            av_format_date_fr($bk['slot_date'] ?? null),
            av_format_hours($bk['start_time'] ?? '', $bk['end_time'] ?? ''),
            !empty($bk['theme_label']) ? '« ' . $bk['theme_label'] . ' »' : '',
        ];
    }
    return implode(' · ', array_filter($parts, fn($p) => $p !== ''));
}

/**
 * Calcule la date/heure à laquelle on aura atteint $minutesNeeded *minutes ouvrées*
 * en partant de $from, selon les jours actifs et plages horaires du service.
 *
 * Heures ouvrées = (jour actif) ∩ (plage matin OU plage après-midi).
 * Si $from tombe hors plage, le décompte démarre à la prochaine plage utile.
 *
 * @param string $from         "YYYY-MM-DD HH:MM:SS"
 * @param int    $minutesNeeded minutes ouvrées à parcourir (>0)
 * @param array  $activeDayKeys ['lun','mar',…]
 * @param string $mStart        ex "09:00"
 * @param string $mEnd          ex "12:00"
 * @param string $aStart        ex "14:00"
 * @param string $aEnd          ex "18:00"
 * @return string deadline "YYYY-MM-DD HH:MM:SS"
 */
function av_business_deadline(string $from, int $minutesNeeded, array $activeDayKeys, string $mStart, string $mEnd, string $aStart, string $aEnd): string {
    static $dowToKey = [0=>'dim',1=>'lun',2=>'mar',3=>'mer',4=>'jeu',5=>'ven',6=>'sam'];
    $cursor = strtotime($from);
    if ($cursor === false) return $from;
    $remaining = max(1, $minutesNeeded);
    // Bornes en minutes depuis minuit pour les 2 plages.
    $mS = (int)substr($mStart,0,2)*60 + (int)substr($mStart,3,2);
    $mE = (int)substr($mEnd,  0,2)*60 + (int)substr($mEnd,  3,2);
    $aS = (int)substr($aStart,0,2)*60 + (int)substr($aStart,3,2);
    $aE = (int)substr($aEnd,  0,2)*60 + (int)substr($aEnd,  3,2);
    $hasMorning   = $mE > $mS;
    $hasAfternoon = $aE > $aS;

    // Garde-fou : si plages dégénérées, on retombe en calendaire pour éviter une boucle infinie.
    if (!$hasMorning && !$hasAfternoon) return date('Y-m-d H:i:s', $cursor + $remaining * 60);

    $MAX_ITER = 365; // 1 an de jours, garde-fou
    while ($remaining > 0 && $MAX_ITER-- > 0) {
        $dow = (int)date('w', $cursor);
        $dk  = $dowToKey[$dow];
        if (!in_array($dk, $activeDayKeys, true)) {
            // Sauter au début du jour suivant.
            $cursor = strtotime('+1 day', strtotime(date('Y-m-d 00:00:00', $cursor)));
            continue;
        }
        $minOfDay = (int)date('H', $cursor) * 60 + (int)date('i', $cursor);
        // Choix de la fenêtre active.
        $winStart = null; $winEnd = null;
        if ($hasMorning && $minOfDay < $mE) {
            $winStart = max($minOfDay, $mS);
            $winEnd   = $mE;
        } elseif ($hasAfternoon && $minOfDay < $aE) {
            $winStart = max($minOfDay, $aS);
            $winEnd   = $aE;
        } else {
            // Plus de fenêtre aujourd'hui → demain matin.
            $cursor = strtotime('+1 day', strtotime(date('Y-m-d 00:00:00', $cursor)));
            continue;
        }
        if ($winStart >= $winEnd) {
            // Avant la fenêtre → on saute au début.
            $cursor = strtotime(date('Y-m-d 00:00:00', $cursor)) + $winStart * 60;
            continue;
        }
        $available = $winEnd - $winStart; // minutes utiles dans cette fenêtre
        if ($remaining <= $available) {
            // Done.
            return date('Y-m-d H:i:s', strtotime(date('Y-m-d 00:00:00', $cursor)) + ($winStart + $remaining) * 60);
        }
        $remaining -= $available;
        // Sortir de la fenêtre (= début de la prochaine ou jour suivant).
        $cursor = strtotime(date('Y-m-d 00:00:00', $cursor)) + $winEnd * 60;
    }
    // Garde-fou : on retourne un timestamp lointain plutôt qu'une boucle infinie.
    return date('Y-m-d H:i:s', strtotime($from) + ($minutesNeeded * 60 * 5));
}

/**
 * La séance d'une résa est-elle déjà passée ?
 *  - unique : slot.slot_date < today
 *  - recurring : period.date_end < today
 */
function av_is_session_past(array $bk): bool {
    $today = date('Y-m-d');
    if ($bk['booking_type'] === 'unique') {
        return !empty($bk['slot_date']) && $bk['slot_date'] < $today;
    }
    return !empty($bk['period_date_end']) && $bk['period_date_end'] < $today;
}

/**
 * Envoie le mail "votre réservation a été validée" à l'utilisateur (auto-validation).
 */
function av_send_user_mail(array $bk): void {
    if (empty($bk['email'])) return;
    $esc = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
    $userName = trim(($bk['prenom'] ?? '') . ' ' . ($bk['nom'] ?? ''));
    if ($userName === '') $userName = (string)$bk['email'];
    $svcLabel = $bk['service_label'] ?? '';
    $line = av_format_booking_line($bk);
    $subject = '[CultuRésa] Votre réservation a été validée - ' . $svcLabel;
    $html =
        '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:1.5em;color:#222">'
        . '<h2 style="font-size:18px;color:#222;margin:0 0 .8em">Réservation validée</h2>'
        . '<p style="font-size:13px;color:#444;margin:.4em 0">Bonjour ' . $esc($userName) . ',</p>'
        . '<p style="font-size:13px;color:#444;margin:.4em 0">Votre réservation a été <strong>validée automatiquement</strong> par le système après écoulement du délai de validation.</p>'
        . '<p style="font-size:13px;color:#222;margin:1em 0 .2em;font-weight:600">' . $esc($svcLabel) . '</p>'
        . '<ul style="padding-left:1.2em;margin:.2em 0 .6em;font-size:13px;color:#222">'
        . '<li style="margin:.2rem 0">' . $esc($line) . '</li>'
        . '</ul>'
        . '<p style="font-size:11px;color:#999;margin-top:2em;border-top:1px solid #eee;padding-top:.6em">Cet e-mail a été envoyé automatiquement par CultuRésa.</p>'
        . '</div>';
    try {
        send_mail($bk['email'], $subject, $html);
    } catch (Throwable $e) {
        fwrite(STDERR, "[av] user mail error: " . $e->getMessage() . "\n");
    }
}

/**
 * Envoie le mail "auto-validation effectuée" aux gestionnaires affectés au service.
 */
function av_send_managers_mail(string $serviceId, array $bk): void {
    $esc = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
    $svcLabel = $bk['service_label'] ?? '';
    $userFull = trim(($bk['prenom'] ?? '') . ' ' . ($bk['nom'] ?? ''));
    $line = av_format_booking_line($bk);
    $subject = '[CultuRésa] Auto-validation d\'une réservation - ' . $svcLabel;
    $html =
        '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:1.5em;color:#222">'
        . '<h2 style="font-size:18px;color:#222;margin:0 0 .8em">Auto-validation effectuée</h2>'
        . '<p style="font-size:13px;color:#444;margin:.4em 0">Le système a validé automatiquement une réservation après écoulement du délai configuré.</p>'
        . '<p style="font-size:13px;color:#222;margin:1em 0 .2em;font-weight:600">' . $esc($svcLabel) . '</p>'
        . '<ul style="padding-left:1.2em;margin:.2em 0 .6em;font-size:13px;color:#222">'
        . '<li style="margin:.2rem 0"><strong>Demandeur :</strong> ' . $esc($userFull) . ' &lt;' . $esc($bk['email'] ?? '') . '&gt;</li>'
        . '<li style="margin:.2rem 0"><strong>Créneau :</strong> ' . $esc($line) . '</li>'
        . '</ul>'
        . '<p style="font-size:11px;color:#999;margin-top:2em;border-top:1px solid #eee;padding-top:.6em">Cet e-mail a été envoyé automatiquement par CultuRésa.</p>'
        . '</div>';

    // Gestionnaires affectés à ce service : services JSON contient l'id.
    // Pas d'utilisation de JSON_SEARCH ici pour compat MySQL plus large : on lit tous
    // les gestionnaires et on filtre en PHP.
    $mgrs = DB::all(
        "SELECT email, services FROM users WHERE role = 'gestionnaire' AND email IS NOT NULL AND email != ''"
    );
    foreach ($mgrs as $m) {
        $svcs = json_decode($m['services'] ?? '[]', true);
        if (!is_array($svcs) || !in_array($serviceId, $svcs, true)) continue;
        try {
            send_mail($m['email'], $subject, $html);
        } catch (Throwable $e) {
            fwrite(STDERR, "[av] manager mail error (" . $m['email'] . "): " . $e->getMessage() . "\n");
        }
    }
}

/**
 * Logique principale : itère sur les services, valide les bookings éligibles.
 */
function av_run(): array {
    $stats = ['services' => 0, 'candidates' => 0, 'validated' => 0, 'skipped_past' => 0, 'not_yet' => 0];

    $services = DB::all(
        "SELECT id, label, auto_validation_delay, active_days,
                morning_start, morning_end, afternoon_start, afternoon_end
         FROM services
         WHERE auto_validation_delay <> 0"
    );
    foreach ($services as $svc) {
        $stats['services']++;
        $delay = (int)$svc['auto_validation_delay'];
        $isOuvre = $delay < 0;
        $delayMinutes = abs($delay);
        $activeDays = array_filter(array_map('trim', explode(',', $svc['active_days'] ?? 'lun,mar,mer,jeu,ven')));

        // Candidats : bookings en attente, miroirs exclus.
        $cands = DB::all(
            "SELECT b.id, b.booking_type, b.user_id, b.slot_id, b.period_id, b.day_key, b.week,
                    b.theme_label, b.auto_validate_from,
                    u.email, u.prenom, u.nom,
                    s.start_time, s.end_time, s.slot_date,
                    p.label AS period_label, p.date_end AS period_date_end,
                    ? AS service_label
             FROM bookings b
             JOIN users u   ON u.id = b.user_id
             JOIN slots s   ON s.id = b.slot_id
             LEFT JOIN periods p ON p.id = b.period_id
             WHERE b.service_id = ?
               AND b.validated = 0
               AND b.parent_booking_id IS NULL
               AND b.auto_validate_from IS NOT NULL",
            [$svc['label'], $svc['id']]
        );
        $stats['candidates'] += count($cands);

        foreach ($cands as $bk) {
            // Skip si séance déjà passée.
            if (av_is_session_past($bk)) { $stats['skipped_past']++; continue; }

            // Calcul du délai.
            $from = $bk['auto_validate_from'];
            if ($isOuvre) {
                $deadline = av_business_deadline(
                    $from, $delayMinutes, $activeDays,
                    $svc['morning_start']   ?? '09:00',
                    $svc['morning_end']     ?? '12:00',
                    $svc['afternoon_start'] ?? '14:00',
                    $svc['afternoon_end']   ?? '18:00'
                );
            } else {
                $deadline = date('Y-m-d H:i:s', strtotime($from) + $delayMinutes * 60);
            }
            if (strtotime($deadline) > time()) { $stats['not_yet']++; continue; }

            // Valider en base.
            DB::run("UPDATE bookings SET validated = 1 WHERE id = ?", [$bk['id']]);
            if ($bk['booking_type'] === 'recurring') {
                // Propage aux miroirs (booking ponctuels descendants).
                DB::run("UPDATE bookings SET validated = 1 WHERE parent_booking_id = ?", [$bk['id']]);
            }
            $stats['validated']++;

            // Mails.
            av_send_user_mail($bk);
            av_send_managers_mail($svc['id'], $bk);

            // Petit log par booking pour la trace.
            fwrite(STDOUT, sprintf(
                "[%s] auto-validated booking #%d (service=%s, user=%s, type=%s)\n",
                date('Y-m-d H:i:s'), $bk['id'], $svc['id'], $bk['email'] ?? '?', $bk['booking_type']
            ));
        }
    }
    return $stats;
}

// ── Entrée CLI ────────────────────────────────────────────
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    echo "This script must be run from CLI.\n";
    exit(1);
}

$start = microtime(true);
$stats = av_run();
$elapsed = round((microtime(true) - $start) * 1000);
fwrite(STDOUT, sprintf(
    "[%s] auto_validate done in %dms : services=%d candidates=%d validated=%d skipped_past=%d not_yet=%d\n",
    date('Y-m-d H:i:s'), $elapsed,
    $stats['services'], $stats['candidates'], $stats['validated'], $stats['skipped_past'], $stats['not_yet']
));
