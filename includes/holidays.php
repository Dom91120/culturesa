<?php
// Calcul des jours fériés français

function _easter(int $year): \DateTimeImmutable {
    $a = $year % 19;
    $b = intdiv($year, 100);
    $c = $year % 100;
    $d = intdiv($b, 4);
    $e = $b % 4;
    $f = intdiv($b + 8, 25);
    $g = intdiv($b - $f + 1, 3);
    $h = (19 * $a + $b - $d - $g + 15) % 30;
    $i = intdiv($c, 4);
    $k = $c % 4;
    $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7;
    $m = intdiv($a + 11 * $h + 22 * $l, 451);
    $month = intdiv($h + $l - 7 * $m + 114, 31);
    $day   = (($h + $l - 7 * $m + 114) % 31) + 1;
    return new \DateTimeImmutable(sprintf('%04d-%02d-%02d', $year, $month, $day));
}

function french_holidays(int $year): array {
    $e = _easter($year);
    return [
        "$year-01-01"                          => "Jour de l'An",
        $e->modify('+1 day')->format('Y-m-d')  => "Lundi de Pâques",
        "$year-05-01"                          => "Fête du Travail",
        "$year-05-08"                          => "Victoire 1945",
        $e->modify('+39 days')->format('Y-m-d') => "Ascension",
        $e->modify('+50 days')->format('Y-m-d') => "Lundi de Pentecôte",
        "$year-07-14"                          => "Fête Nationale",
        "$year-08-15"                          => "Assomption",
        "$year-11-01"                          => "Toussaint",
        "$year-11-11"                          => "Armistice",
        "$year-12-25"                          => "Noël",
    ];
}

/**
 * Retourne les jours fériés français dans la plage [date_start, date_end].
 * @return array [['date' => 'YYYY-MM-DD', 'label' => '...'], ...]
 */
function holidays_in_range(string $date_start, string $date_end): array {
    $start = new \DateTimeImmutable($date_start);
    $end   = new \DateTimeImmutable($date_end);
    $all   = [];
    for ($y = (int)$start->format('Y'); $y <= (int)$end->format('Y'); $y++) {
        $all = array_merge($all, french_holidays($y));
    }
    ksort($all);
    $result = [];
    foreach ($all as $date => $label) {
        $d = new \DateTimeImmutable($date);
        if ($d >= $start && $d <= $end) {
            $result[] = ['date' => $date, 'label' => $label];
        }
    }
    return $result;
}

/**
 * Récupère les vacances scolaires depuis data.education.gouv.fr (Opendatasoft v2.1)
 * pour une zone (A/B/C) et une plage d'années. Remplace les entrées de la zone
 * dans school_holidays. Retourne le nombre de périodes insérées.
 */
function refresh_school_holidays(string $zone, int $yearStart, int $yearEnd): int {
    $zone = strtoupper($zone);
    if (!in_array($zone, ['A','B','C'], true)) {
        throw new \InvalidArgumentException('Zone invalide');
    }
    $base = 'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records';
    $where = sprintf('zones="Zone %s" AND start_date>="%d-01-01" AND end_date<="%d-12-31"',
        $zone, $yearStart, $yearEnd);
    $url = $base . '?' . http_build_query([
        'where'  => $where,
        'limit'  => 100,
        'select' => 'description,start_date,end_date,zones,population',
    ]);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_HTTPHEADER     => ['Accept: application/json'],
    ]);
    $body = curl_exec($ch);
    $http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($body === false || $http >= 400) {
        throw new \RuntimeException('Erreur API data.gouv.fr (HTTP ' . $http . ($err ? ' — ' . $err : '') . ')');
    }
    $data = json_decode($body, true);
    if (!isset($data['results']) || !is_array($data['results'])) {
        throw new \RuntimeException('Réponse data.gouv.fr invalide');
    }

    DB::run('DELETE FROM school_holidays WHERE zone=?', [$zone]);
    $count = 0;
    $seen = [];
    foreach ($data['results'] as $row) {
        $start = substr((string)($row['start_date'] ?? ''), 0, 10);
        $end   = substr((string)($row['end_date']   ?? ''), 0, 10);
        $label = (string)($row['description'] ?? '');
        if (!$start || !$end) continue;
        // Dédupliquer si plusieurs populations (Élèves/Enseignants) pour même période
        $key = $start.'|'.$end.'|'.$label;
        if (isset($seen[$key])) continue;
        $seen[$key] = true;
        DB::run(
            'INSERT INTO school_holidays (zone,date_start,date_end,label) VALUES (?,?,?,?)',
            [$zone, $start, $end, mb_substr($label, 0, 255)]
        );
        $count++;
    }
    return $count;
}

/**
 * Retourne un set [date => label] des jours en vacances scolaires
 * dans la plage donnée pour une zone.
 *
 * Convention data.education.gouv.fr :
 *   start_date = soir du dernier jour d'école (fin des cours après les cours)
 *                → ce jour est encore un jour d'école → on commence à start_date + 1
 *   end_date   = soir du dernier jour de vacances (la reprise est le lendemain)
 *                → on inclut end_date
 */
function school_holiday_dates(string $zone, string $date_start, string $date_end): array {
    $zone = strtoupper($zone);
    if (!in_array($zone, ['A','B','C'], true)) return [];
    $rows = DB::all(
        'SELECT date_start, date_end, label FROM school_holidays
         WHERE zone=? AND date_end>=? AND date_start<=?',
        [$zone, $date_start, $date_end]
    );
    $result = [];
    $rangeStart = new \DateTimeImmutable($date_start);
    $rangeEnd   = new \DateTimeImmutable($date_end);
    foreach ($rows as $row) {
        // start_date est le soir du dernier jour d'école → premier jour de vacances = +1
        $rawStart  = (new \DateTimeImmutable($row['date_start']))->modify('+1 day');
        $rawEnd    = new \DateTimeImmutable($row['date_end']);
        $s = max($rawStart, $rangeStart);
        $e = min($rawEnd,   $rangeEnd);
        $cur = $s;
        while ($cur <= $e) {
            $result[$cur->format('Y-m-d')] = $row['label'];
            $cur = $cur->modify('+1 day');
        }
    }
    return $result;
}

function refresh_period_holidays(int $period_id): void {
    $period = DB::one('SELECT date_start, date_end FROM periods WHERE id=?', [$period_id]);
    DB::run('DELETE FROM period_holidays WHERE period_id=?', [$period_id]);
    if (!$period || !$period['date_start'] || !$period['date_end']) return;
    foreach (holidays_in_range($period['date_start'], $period['date_end']) as $h) {
        DB::run(
            'INSERT IGNORE INTO period_holidays (period_id, date, label) VALUES (?,?,?)',
            [$period_id, $h['date'], $h['label']]
        );
    }
}
