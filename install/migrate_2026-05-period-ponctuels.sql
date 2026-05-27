-- ============================================================
-- Migration CultuRézo — 2026-05 : rattachement explicite des ponctuels à une période
-- ============================================================
-- Objectif : unifier le modèle. Avant : les créneaux/réservations ponctuels
-- avaient period_id NULL/0 (la période était dérivée à la volée par date-range
-- côté UI). Après : period_id est rempli pour tous les ponctuels et la
-- création d'un ponctuel hors de toute période active est refusée (cf. api/slots.php).
--
-- À exécuter UNE SEULE FOIS sur les bases déjà déployées.
-- Les nouvelles installations via install/culturezo.sql n'ont rien à faire (la logique
-- vit côté API qui remplit le champ à la création).
--
-- Usage :
--   mysql -u root -p culturezo < install/migrate_2026-05-period-ponctuels.sql
--
-- Pré-requis : sauvegarde de la base recommandée avant exécution.
-- ============================================================

-- ------------------------------------------------------------
-- ÉTAPE 1 : audit (lecture seule) — combien d'orphelins et de candidats ?
-- ------------------------------------------------------------
SELECT 'slots ponctuels manuels avec period_id NULL' AS info, COUNT(*) AS n
FROM slots
WHERE slot_type = 'unique' AND parent_slot_id IS NULL AND period_id IS NULL;

SELECT 'bookings ponctuels avec period_id = 0' AS info, COUNT(*) AS n
FROM bookings
WHERE booking_type = 'unique' AND period_id = 0;

-- Ponctuels dont la date NE TOMBE DANS AUCUNE période active du service :
-- ils resteront NULL (impossible à backfill automatiquement). Le filtre les
-- comptera comme "hors période" jusqu'à correction manuelle.
SELECT 'slots ponctuels orphelins (date hors période)' AS info, COUNT(*) AS n
FROM slots s
LEFT JOIN periods p
  ON p.service_id = s.service_id
 AND p.state = 'actif'
 AND p.date_start IS NOT NULL AND p.date_end IS NOT NULL
 AND s.slot_date BETWEEN p.date_start AND p.date_end
WHERE s.slot_type = 'unique'
  AND s.parent_slot_id IS NULL
  AND s.slot_date IS NOT NULL
  AND p.id IS NULL;

-- ------------------------------------------------------------
-- ÉTAPE 2 : backfill slots.period_id sur les ponctuels manuels
-- ------------------------------------------------------------
-- Stratégie : pour chaque ponctuel avec slot_date, on cherche une période active
-- du MÊME service dont l'intervalle contient la date. En cas de chevauchement
-- (plusieurs périodes éligibles, ne devrait pas exister), on prend la plus
-- ancienne (MIN(p.id)) — déterministe.
UPDATE slots s
JOIN (
  SELECT s2.id AS slot_id, MIN(p.id) AS picked_period_id
  FROM slots s2
  JOIN periods p
    ON p.service_id = s2.service_id
   AND p.state = 'actif'
   AND p.date_start IS NOT NULL AND p.date_end IS NOT NULL
   AND s2.slot_date BETWEEN p.date_start AND p.date_end
  WHERE s2.slot_type = 'unique'
    AND s2.parent_slot_id IS NULL
    AND s2.slot_date IS NOT NULL
    AND s2.period_id IS NULL
  GROUP BY s2.id
) AS picks ON picks.slot_id = s.id
SET s.period_id = picks.picked_period_id;

-- ------------------------------------------------------------
-- ÉTAPE 3 : backfill bookings.period_id à partir du slot
-- ------------------------------------------------------------
-- S'applique aux ponctuels (booking_type='unique', period_id=0 par défaut en
-- base) dont le slot a maintenant un period_id.
UPDATE bookings b
JOIN slots s ON s.id = b.slot_id
SET b.period_id = s.period_id
WHERE b.booking_type = 'unique'
  AND b.period_id = 0
  AND s.period_id IS NOT NULL;

-- ------------------------------------------------------------
-- ÉTAPE 4 : audit post-migration (info)
-- ------------------------------------------------------------
SELECT 'slots ponctuels manuels SANS period_id (post-migration)' AS info, COUNT(*) AS n
FROM slots
WHERE slot_type = 'unique' AND parent_slot_id IS NULL AND period_id IS NULL;

SELECT 'bookings ponctuels SANS period_id (post-migration)' AS info, COUNT(*) AS n
FROM bookings
WHERE booking_type = 'unique' AND period_id = 0;
