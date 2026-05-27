-- ============================================================
-- Migration CultuRézo — 2026-05 : ajout des FK manquantes
-- ============================================================
-- À exécuter UNE SEULE FOIS sur les bases déjà déployées
-- (les nouvelles installations via install/culturezo.sql ont déjà ces FK).
--
-- Usage :
--   mysql -u root -p culturezo < install/migrate_2026-05-fk.sql
--
-- Pré-requis : sauvegarde de la base recommandée avant exécution.
-- ============================================================

-- ------------------------------------------------------------
-- ÉTAPE 1 : audit des orphelins (informatif, n'écrit rien)
-- ------------------------------------------------------------
-- Lignes qui empêcheraient la création des FK. Si une valeur > 0 apparaît,
-- l'ALTER TABLE correspondant échouera tant qu'on ne les a pas nettoyées.

SELECT 'bookings_orphan_slot_id' AS metric, COUNT(*) AS value
FROM bookings b LEFT JOIN slots s ON s.id = b.slot_id
WHERE s.id IS NULL;

SELECT 'slots_orphan_period_id' AS metric, COUNT(*) AS value
FROM slots s
WHERE s.period_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM periods p WHERE p.id = s.period_id);

SELECT 'users_orphan_demandeur_id' AS metric, COUNT(*) AS value
FROM users u
WHERE u.demandeur_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM demandeurs d WHERE d.id = u.demandeur_id);

SELECT 'users_orphan_structure_id' AS metric, COUNT(*) AS value
FROM users u
WHERE u.structure_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM structures s WHERE s.id = u.structure_id);

SELECT 'cycle_events_orphan_service_id' AS metric, COUNT(*) AS value
FROM cycle_events c
WHERE c.service_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM services sv WHERE sv.id = c.service_id);

-- ------------------------------------------------------------
-- ÉTAPE 2 : nettoyage des orphelins
-- ------------------------------------------------------------
-- Suppression des références cassées. Choix par défaut :
--  - bookings sans slot           : DELETE (la réservation ne pointe plus nulle part)
--  - slots avec period_id orphelin: SET NULL (le slot existe toujours)
--  - users avec dem/struct cassé  : SET NULL (le compte existe toujours)
--  - cycle_events sans service    : DELETE (event obsolète)

DELETE b FROM bookings b LEFT JOIN slots s ON s.id = b.slot_id WHERE s.id IS NULL;

UPDATE slots s SET s.period_id = NULL
WHERE s.period_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM periods p WHERE p.id = s.period_id);

UPDATE users u SET u.demandeur_id = NULL
WHERE u.demandeur_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM demandeurs d WHERE d.id = u.demandeur_id);

UPDATE users u SET u.structure_id = NULL
WHERE u.structure_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM structures s WHERE s.id = u.structure_id);

DELETE c FROM cycle_events c LEFT JOIN services sv ON sv.id = c.service_id
WHERE c.service_id IS NOT NULL AND sv.id IS NULL;

-- ------------------------------------------------------------
-- ÉTAPE 3 : ajout des index + FK
-- ------------------------------------------------------------

-- bookings.slot_id -> slots.id (CASCADE : supprimer un slot supprime ses bookings)
ALTER TABLE bookings
  ADD KEY idx_bk_slot (slot_id),
  ADD CONSTRAINT fk_bk_slot FOREIGN KEY (slot_id) REFERENCES slots(id) ON DELETE CASCADE;

-- slots.period_id -> periods.id (CASCADE : supprimer une période supprime ses slots)
ALTER TABLE slots
  ADD KEY idx_slots_period (period_id),
  ADD CONSTRAINT fk_slots_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE;

-- users.demandeur_id -> demandeurs.id (SET NULL : conserver le compte si la typologie disparaît)
ALTER TABLE users
  ADD KEY idx_users_demandeur (demandeur_id),
  ADD CONSTRAINT fk_users_demandeur FOREIGN KEY (demandeur_id) REFERENCES demandeurs(id) ON DELETE SET NULL;

-- users.structure_id -> structures.id (SET NULL : idem)
ALTER TABLE users
  ADD KEY idx_users_structure (structure_id),
  ADD CONSTRAINT fk_users_structure FOREIGN KEY (structure_id) REFERENCES structures(id) ON DELETE SET NULL;

-- cycle_events.service_id -> services.id (CASCADE)
ALTER TABLE cycle_events
  ADD CONSTRAINT fk_cycle_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE;

-- ------------------------------------------------------------
-- ÉTAPE 4 : vérification
-- ------------------------------------------------------------
SELECT 'fk_added' AS metric, COUNT(*) AS value
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND CONSTRAINT_NAME IN ('fk_bk_slot','fk_slots_period','fk_users_demandeur','fk_users_structure','fk_cycle_service');
-- Doit afficher : 5
