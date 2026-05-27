-- ============================================================
-- Migration CultuRézo — 2026-05 : renommage "trimestre" -> "période"
-- ============================================================
-- Sur demande utilisateur : alignement terminologique. Les organisations
-- qui utilisent CultuRézo ne suivent pas forcement un decoupage trimestriel,
-- d'où le passage à "période" partout.
--
-- À exécuter UNE SEULE FOIS sur les bases déjà déployées.
--
-- Usage :
--   mysql -u root -p culturezo < install/migrate_2026-05-rename-period.sql
--
-- Pré-requis : sauvegarde recommandée avant exécution.
-- Coordonner avec le déploiement frontend : le nouveau code attend
-- max_reservations_period, l'ancien code attend max_reservations_trim.
-- ============================================================

-- 1. Renommer la colonne services.max_reservations_trim -> max_reservations_period
ALTER TABLE services
  CHANGE COLUMN max_reservations_trim max_reservations_period INT NOT NULL DEFAULT 1;

-- 2. Renommer les libellés par défaut des périodes héritées de l'install initial.
--    Ne touche que les labels littéraux "Trimestre N" (laisse les autres tels quels).
UPDATE periods SET label = REPLACE(label, 'Trimestre', 'Période')
WHERE label REGEXP '^Trimestre [0-9]+$';

-- Vérification
SELECT 'column_renamed' AS metric, COUNT(*) AS value
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'services'
  AND COLUMN_NAME = 'max_reservations_period';
-- Doit afficher : 1

SELECT 'labels_renamed' AS metric, COUNT(*) AS value FROM periods
WHERE label LIKE 'Période %';
