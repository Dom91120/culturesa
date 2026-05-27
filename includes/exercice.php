<?php
// Helpers de gestion de la table exercice (label + cleanup orphelins)

/**
 * Calcule le libellé d'un exercice à partir d'une plage de dates.
 *   - null si l'une des dates est manquante
 *   - "YYYY"        si début et fin sont sur la même année
 *   - "YYYY-YYYY"   sinon (année du début → année de la fin)
 */
function compute_exercice_label(?string $dateStart, ?string $dateEnd): ?string {
    if (!$dateStart || !$dateEnd) return null;
    $ys = (int)substr($dateStart, 0, 4);
    $ye = (int)substr($dateEnd,   0, 4);
    return $ys === $ye ? (string)$ys : "$ys-$ye";
}

/** Cherche un exercice par libellé, le crée s'il n'existe pas. Retourne son id. */
function find_or_create_exercice(string $label): int {
    $row = DB::one('SELECT id FROM exercice WHERE label=?', [$label]);
    if ($row) return (int)$row['id'];
    DB::run('INSERT INTO exercice (label) VALUES (?)', [$label]);
    return (int)DB::lastId();
}

/**
 * Renvoie l'id du dernier exercice du service (= max(exercice_id) parmi ses périodes).
 * Renvoie null si le service n'a aucune période rattachée à un exercice.
 */
function latest_exercice_id_for_service(?string $serviceId): ?int {
    $svcCond = $serviceId === null ? 'service_id IS NULL' : 'service_id=?';
    $params  = $serviceId === null ? [] : [$serviceId];
    $row = DB::one(
        "SELECT MAX(exercice_id) AS mx FROM periods WHERE $svcCond AND exercice_id IS NOT NULL",
        $params
    );
    return ($row && $row['mx'] !== null) ? (int)$row['mx'] : null;
}

/** Supprime les exercices qui ne sont plus référencés par aucune période. */
function cleanup_orphan_exercices(): void {
    DB::run(
        'DELETE FROM exercice
         WHERE id NOT IN (SELECT exercice_id FROM periods WHERE exercice_id IS NOT NULL)'
    );
}

/**
 * Recalcule le libellé d'un exercice à partir des dates min/max de ses périodes.
 * No-op si l'exercice n'a aucune période avec des dates.
 */
function recompute_exercice_label(int $exerciceId): void {
    $row = DB::one(
        'SELECT MIN(YEAR(date_start)) AS ys, MAX(YEAR(date_end)) AS ye
         FROM periods WHERE exercice_id=? AND date_start IS NOT NULL AND date_end IS NOT NULL',
        [$exerciceId]
    );
    if (!$row || $row['ys'] === null) return;
    $ys = (int)$row['ys'];
    $ye = (int)$row['ye'];
    $label = ($ys === $ye) ? (string)$ys : "$ys-$ye";
    DB::run('UPDATE exercice SET label=? WHERE id=?', [$label, $exerciceId]);
}

/**
 * Vérifie qu'une période (proposée ou modifiée) est compatible avec son exercice :
 *   - les dates de toutes les périodes de l'exercice tiennent sur ≤ 2 années contigües ;
 *   - aucune autre période du même service dans l'exercice ne chevauche celle proposée.
 * Renvoie null si OK, sinon un message d'erreur.
 */
function validate_period_in_exercice(int $exerciceId, ?string $serviceId, ?string $dateStart, ?string $dateEnd, ?int $excludePeriodId = null): ?string {
    if (!$dateStart || !$dateEnd) return null;
    if ($dateStart > $dateEnd) return 'La date de début doit être avant la date de fin.';

    // Plage d'années : tous services confondus (le libellé d'exercice couvre l'ensemble).
    $sql    = 'SELECT date_start, date_end FROM periods
               WHERE exercice_id=? AND date_start IS NOT NULL AND date_end IS NOT NULL';
    $params = [$exerciceId];
    if ($excludePeriodId) { $sql .= ' AND id != ?'; $params[] = $excludePeriodId; }
    $rangeRows = DB::all($sql, $params);
    $allYs = (int)substr($dateStart, 0, 4);
    $allYe = (int)substr($dateEnd,   0, 4);
    foreach ($rangeRows as $r) {
        $allYs = min($allYs, (int)substr($r['date_start'], 0, 4));
        $allYe = max($allYe, (int)substr($r['date_end'],   0, 4));
    }
    if ($allYe - $allYs > 1) {
        return "Les périodes d'un exercice doivent être sur la même année ou sur 2 années contigües.";
    }

    // Chevauchement : uniquement contre les périodes du MÊME service de l'exercice.
    $svcCond = $serviceId === null ? 'service_id IS NULL' : 'service_id=?';
    $params  = [$exerciceId];
    if ($serviceId !== null) $params[] = $serviceId;
    $sql = "SELECT date_start, date_end FROM periods
            WHERE exercice_id=? AND $svcCond AND date_start IS NOT NULL AND date_end IS NOT NULL";
    if ($excludePeriodId) { $sql .= ' AND id != ?'; $params[] = $excludePeriodId; }
    foreach (DB::all($sql, $params) as $o) {
        if (!($dateEnd < $o['date_start'] || $dateStart > $o['date_end'])) {
            return "La période chevauche une autre période de l'exercice (" . $o['date_start'] . ' → ' . $o['date_end'] . ').';
        }
    }
    return null;
}
