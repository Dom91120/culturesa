-- ============================================================
-- Migration CultuRézo — 2026-05 : auto-validation des réservations
-- ============================================================
-- Ajoute :
--   services.auto_validation_delay (INT, défaut 0 = jamais)
--     Encodage en minutes signées :
--       0      → Jamais (pas d'auto-validation)
--       -120   → 2h ouvrées
--       -1440  → 1 jour ouvré
--       -2880  → 2 jours ouvrés
--       -4320  → 3 jours ouvrés
--       +10080 → 1 semaine calendaire
--       +20160 → 2 semaines calendaires
--
--   bookings.auto_validate_from (DATETIME NULL)
--     Timestamp depuis lequel le délai d'auto-validation est compté.
--     Initialisé à created_at à la création. Mis à jour à NOW() sur déplacement
--     (move). Inchangé sur update de thème ou de participants.
--
-- Usage : mysql -u root -p culturezo < install/migrate_2026-05-auto-validation.sql
-- ============================================================

ALTER TABLE services
  ADD COLUMN auto_validation_delay INT NOT NULL DEFAULT 0;

ALTER TABLE bookings
  ADD COLUMN auto_validate_from DATETIME NULL AFTER created_at;

-- Backfill : pour tous les bookings existants, on initialise auto_validate_from à created_at.
-- Le cron ne les auto-validera que si le service a un délai > 0 ET que la résa n'est
-- pas déjà validée ET que la séance n'est pas passée.
UPDATE bookings SET auto_validate_from = created_at WHERE auto_validate_from IS NULL;

-- Audit
SELECT 'services configurables pour auto-validation' AS info, COUNT(*) AS n FROM services;
SELECT 'bookings avec auto_validate_from rempli' AS info, COUNT(*) AS n FROM bookings WHERE auto_validate_from IS NOT NULL;
