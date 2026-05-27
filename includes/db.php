<?php
// ============================================================
//  CultuRézo — Connexion PDO singleton
// ============================================================

require_once __DIR__ . '/config.php';

class DB {
    private static ?PDO $pdo = null;

    public static function get(): PDO {
        if (self::$pdo === null) {
            $dsn = sprintf(
                'mysql:host=%s;port=%d;dbname=%s;charset=%s',
                DB_HOST, DB_PORT, DB_NAME, DB_CHARSET
            );
            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ];
            self::$pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
            // Migrations automatiques
            try {
            $col = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'default_duration'"
            )->fetchColumn();
            if ($col) {
                self::$pdo->exec("ALTER TABLE services CHANGE COLUMN default_duration ponct_duration INT NOT NULL DEFAULT 60");
            }
            $col = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'ponct_duration'"
            )->fetchColumn();
            if (!$col) {
                self::$pdo->exec("ALTER TABLE services ADD COLUMN ponct_duration INT NOT NULL DEFAULT 60");
            }
            $col2 = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'morning_start'"
            )->fetchColumn();
            if (!$col2) {
                self::$pdo->exec("ALTER TABLE services ADD COLUMN morning_start   VARCHAR(8) NOT NULL DEFAULT '09:00'");
                self::$pdo->exec("ALTER TABLE services ADD COLUMN morning_end     VARCHAR(8) NOT NULL DEFAULT '12:00'");
                self::$pdo->exec("ALTER TABLE services ADD COLUMN afternoon_start VARCHAR(8) NOT NULL DEFAULT '14:00'");
                self::$pdo->exec("ALTER TABLE services ADD COLUMN afternoon_end   VARCHAR(8) NOT NULL DEFAULT '18:00'");
            }
            $col3 = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'theme_mode'"
            )->fetchColumn();
            // theme_mode supprimé (remplacé par service_demandeur_settings.themes)
            $col4 = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'icon'"
            )->fetchColumn();
            if (!$col4) {
                self::$pdo->exec("ALTER TABLE services ADD COLUMN icon VARCHAR(16) NULL DEFAULT NULL");
            }
            // Confirmation d'email
            $col5 = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email_confirmed'"
            )->fetchColumn();
            if (!$col5) {
                // DEFAULT 1 : les comptes existants restent actifs
                self::$pdo->exec("ALTER TABLE users ADD COLUMN email_confirmed TINYINT(1) NOT NULL DEFAULT 1");
            }
            self::$pdo->exec("CREATE TABLE IF NOT EXISTS email_confirmations (
                token      VARCHAR(128) NOT NULL,
                user_id    INT          NOT NULL,
                expires_at DATETIME     NOT NULL,
                PRIMARY KEY (token),
                KEY fk_conf_user (user_id),
                CONSTRAINT fk_conf_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
            self::$pdo->exec("CREATE TABLE IF NOT EXISTS email_change_requests (
                token      VARCHAR(128) NOT NULL,
                user_id    INT          NOT NULL,
                new_email  VARCHAR(180) NOT NULL,
                expires_at DATETIME     NOT NULL,
                PRIMARY KEY (token),
                KEY fk_ecr_user (user_id),
                CONSTRAINT fk_ecr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
            // Table niveaux (demandeur_id ajouté plus loin une fois la table demandeurs créée)
            self::$pdo->exec("
                CREATE TABLE IF NOT EXISTS niveaux (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    label VARCHAR(50) NOT NULL,
                    position INT NOT NULL DEFAULT 0
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");
            $hasNiveaux = (int)self::$pdo->query("SELECT COUNT(*) FROM niveaux")->fetchColumn();
            if (!$hasNiveaux) {
                $labels = ['Petit','Moyen','Grand','CP','CE1','CE2','CM1','CM2'];
                foreach ($labels as $i => $label) {
                    self::$pdo->prepare("INSERT INTO niveaux (label, position) VALUES (?, ?)")
                              ->execute([$label, $i]);
                }
            }
            // Jauge par service — nettoyage des colonnes obsolètes.
            // La jauge globale (ponct_gauge_value / recur_gauge_value) a été supprimée :
            // seule subsiste la jauge par-demandeur via service_demandeur_settings.jauge.
            // Le rename historique gauge_enabled → ponct_gauge_enabled est conservé pour
            // permettre le drop propre ci-dessous sur les anciennes bases.
            $colGauge = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'gauge_enabled'"
            )->fetchColumn();
            if ($colGauge) {
                self::$pdo->exec("ALTER TABLE services CHANGE COLUMN gauge_enabled ponct_gauge_enabled TINYINT(1) NOT NULL DEFAULT 0");
            }
            // Drop ponct_gauge_enabled (legacy flag)
            $hasPonctGaugeEnabled = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='services' AND COLUMN_NAME='ponct_gauge_enabled'"
            )->fetchColumn();
            if ($hasPonctGaugeEnabled) {
                self::$pdo->exec("ALTER TABLE services DROP COLUMN ponct_gauge_enabled");
            }
            // Drop ponct_gauge_value et recur_gauge_value (valeurs jauge globales obsolètes)
            foreach (['ponct_gauge_value', 'recur_gauge_value', 'gauge_value'] as $obsoleteCol) {
                $exists = self::$pdo->query(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='services' AND COLUMN_NAME='$obsoleteCol'"
                )->fetchColumn();
                if ($exists) {
                    self::$pdo->exec("ALTER TABLE services DROP COLUMN `$obsoleteCol`");
                }
            }
            // Suppression de gauge_value par créneau (remplacé par SUM(enfants+accompagnants) depuis les réservations)
            $colSlotGauge = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'slots' AND COLUMN_NAME = 'gauge_value'"
            )->fetchColumn();
            if ($colSlotGauge) {
                self::$pdo->exec("ALTER TABLE slots DROP COLUMN gauge_value");
            }
            // Table de configuration applicative
            self::$pdo->exec("CREATE TABLE IF NOT EXISTS app_config (
                cfg_key   VARCHAR(64)  NOT NULL,
                cfg_value TEXT         NULL,
                PRIMARY KEY (cfg_key)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
            // Migration trimestres → périodes
            self::$pdo->exec("CREATE TABLE IF NOT EXISTS periods (
                id         INT          NOT NULL AUTO_INCREMENT,
                service_id VARCHAR(64)  NULL DEFAULT NULL,
                label      VARCHAR(128) NOT NULL,
                date_start DATE         NULL,
                date_end   DATE         NULL,
                color      VARCHAR(16)  NOT NULL DEFAULT '#6dceaa',
                position   INT          NOT NULL DEFAULT 0,
                PRIMARY KEY (id),
                KEY fk_period_service (service_id),
                CONSTRAINT fk_period_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            $hasPeriods = (int)self::$pdo->query("SELECT COUNT(*) FROM periods")->fetchColumn();
            if (!$hasPeriods) {
                self::$pdo->exec("INSERT INTO periods (id,service_id,label,date_start,date_end,color,position) VALUES
                    (1,NULL,'Période 1','2024-09-01','2024-12-31','#6dceaa',1),
                    (2,NULL,'Période 2','2025-01-01','2025-03-31','#e8a45a',2),
                    (3,NULL,'Période 3','2025-04-01','2025-06-30','#a07dd4',3)");
            }
            // Migrer slot_capacities : trimester → period_id (idempotent)
            $hasOldPeriodCol = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='slot_capacities' AND COLUMN_NAME='trimester'"
            )->fetchColumn();
            if ($hasOldPeriodCol) {
                $hasPidCap = self::$pdo->query(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='slot_capacities' AND COLUMN_NAME='period_id'"
                )->fetchColumn();
                if (!$hasPidCap) {
                    self::$pdo->exec("ALTER TABLE slot_capacities ADD COLUMN period_id INT NULL AFTER slot_id");
                }
                self::$pdo->exec("UPDATE slot_capacities SET period_id=1 WHERE trimester='t1' AND (period_id IS NULL OR period_id=0)");
                self::$pdo->exec("UPDATE slot_capacities SET period_id=2 WHERE trimester='t2' AND (period_id IS NULL OR period_id=0)");
                self::$pdo->exec("UPDATE slot_capacities SET period_id=3 WHERE trimester='t3' AND (period_id IS NULL OR period_id=0)");
                // Supprimer les lignes sans period_id valide (sécurité)
                self::$pdo->exec("DELETE FROM slot_capacities WHERE period_id IS NULL OR period_id=0");
                self::$pdo->exec("ALTER TABLE slot_capacities MODIFY COLUMN period_id INT NOT NULL");
                self::$pdo->exec("ALTER TABLE slot_capacities DROP PRIMARY KEY");
                self::$pdo->exec("ALTER TABLE slot_capacities ADD PRIMARY KEY (slot_id,period_id,day_key)");
                self::$pdo->exec("ALTER TABLE slot_capacities DROP COLUMN trimester");
                // Ajouter la FK seulement si elle n'existe pas
                $hasFkCap = self::$pdo->query(
                    "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='slot_capacities' AND CONSTRAINT_NAME='fk_cap_period'"
                )->fetchColumn();
                if (!$hasFkCap) {
                    self::$pdo->exec("ALTER TABLE slot_capacities ADD CONSTRAINT fk_cap_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE");
                }
            }
            // Migrer bookings : trimester → period_id (idempotent)
            $hasOldBkCol = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings' AND COLUMN_NAME='trimester'"
            )->fetchColumn();
            if ($hasOldBkCol) {
                $hasPidBk = self::$pdo->query(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings' AND COLUMN_NAME='period_id'"
                )->fetchColumn();
                if (!$hasPidBk) {
                    self::$pdo->exec("ALTER TABLE bookings ADD COLUMN period_id INT NULL AFTER slot_id");
                }
                self::$pdo->exec("UPDATE bookings SET period_id=1 WHERE trimester='t1' AND (period_id IS NULL OR period_id=0)");
                self::$pdo->exec("UPDATE bookings SET period_id=2 WHERE trimester='t2' AND (period_id IS NULL OR period_id=0)");
                self::$pdo->exec("UPDATE bookings SET period_id=3 WHERE trimester='t3' AND (period_id IS NULL OR period_id=0)");
                self::$pdo->exec("DELETE FROM bookings WHERE period_id IS NULL OR period_id=0");
                self::$pdo->exec("ALTER TABLE bookings MODIFY COLUMN period_id INT NOT NULL");
                // Reconstruire l'index unique seulement si nécessaire
                $hasOldIdx = self::$pdo->query(
                    "SELECT COUNT(*) FROM information_schema.STATISTICS
                     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings' AND INDEX_NAME='uq_recurring'
                     AND COLUMN_NAME='trimester'"
                )->fetchColumn();
                if ($hasOldIdx) {
                    self::$pdo->exec("ALTER TABLE bookings DROP INDEX uq_recurring");
                    self::$pdo->exec("ALTER TABLE bookings ADD UNIQUE KEY uq_recurring (user_id,service_id,slot_id,period_id,day_key)");
                }
                self::$pdo->exec("ALTER TABLE bookings DROP COLUMN trimester");
                $hasFkBk = self::$pdo->query(
                    "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings' AND CONSTRAINT_NAME='fk_bk_period'"
                )->fetchColumn();
                if (!$hasFkBk) {
                    self::$pdo->exec("ALTER TABLE bookings ADD CONSTRAINT fk_bk_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE");
                }
            }
            // Migration : period_id sur les créneaux récurrents (chaque période a ses propres créneaux)
            $hasPeriodIdSlot = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='slots' AND COLUMN_NAME='period_id'"
            )->fetchColumn();
            if (!$hasPeriodIdSlot) {
                self::$pdo->exec("ALTER TABLE slots ADD COLUMN period_id INT NULL DEFAULT NULL");
                // Dupliquer chaque créneau récurrent existant (sans period_id) pour chaque période
                $periods  = self::$pdo->query("SELECT id FROM periods ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);
                $oldSlots = self::$pdo->query(
                    "SELECT * FROM slots WHERE slot_type='recurring' AND period_id IS NULL"
                )->fetchAll(PDO::FETCH_ASSOC);
                foreach ($oldSlots as $sl) {
                    foreach ($periods as $p) {
                        $newId = 'sl_' . substr(md5(uniqid()), 0, 8);
                        self::$pdo->prepare(
                            "INSERT INTO slots (id,service_id,slot_type,period_id,start_time,end_time,slot_date,capacity)
                             VALUES (?,?,?,?,?,?,?,?)"
                        )->execute([
                            $newId, $sl['service_id'], 'recurring', (int)$p['id'],
                            $sl['start_time'], $sl['end_time'],
                            $sl['slot_date'] ?: null, (int)$sl['capacity']
                        ]);
                        // Copier les capacités pour cette période
                        $caps = self::$pdo->prepare(
                            "SELECT day_key, capacity FROM slot_capacities WHERE slot_id=? AND period_id=?"
                        );
                        $caps->execute([$sl['id'], (int)$p['id']]);
                        foreach ($caps->fetchAll(PDO::FETCH_ASSOC) as $cap) {
                            self::$pdo->prepare(
                                "INSERT IGNORE INTO slot_capacities (slot_id,period_id,day_key,capacity) VALUES (?,?,?,?)"
                            )->execute([$newId, (int)$p['id'], $cap['day_key'], (int)$cap['capacity']]);
                        }
                        // Mettre à jour les réservations de cette période vers le nouveau créneau
                        self::$pdo->prepare(
                            "UPDATE bookings SET slot_id=? WHERE slot_id=? AND period_id=?"
                        )->execute([$newId, $sl['id'], (int)$p['id']]);
                    }
                    // Supprimer l'ancien créneau global (CASCADE supprime slot_capacities)
                    self::$pdo->prepare("DELETE FROM slots WHERE id=?")->execute([$sl['id']]);
                }
            }
            // Migration : ajout colonne etiquette sur periods (idempotent)
            $hasEtiquette = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='periods' AND COLUMN_NAME='etiquette'"
            )->fetchColumn();
            if (!$hasEtiquette) {
                self::$pdo->exec("ALTER TABLE periods ADD COLUMN etiquette VARCHAR(32) NULL DEFAULT NULL AFTER label");
            }
            $hasAccompagnants = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='accompagnants'"
            )->fetchColumn();
            if (!$hasAccompagnants) {
                self::$pdo->exec("ALTER TABLE users ADD COLUMN accompagnants SMALLINT NOT NULL DEFAULT 0 AFTER enfants");
            }
            // Enfants + accompagnants dans les réservations (mode jauge)
            $hasBkEnf = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings' AND COLUMN_NAME='enfants'"
            )->fetchColumn();
            $hasDefCap = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='services' AND COLUMN_NAME='default_capacity'"
            )->fetchColumn();
            if ($hasDefCap) {
                self::$pdo->exec("ALTER TABLE services CHANGE COLUMN default_capacity ponct_capacity INT NOT NULL DEFAULT 1");
            }
            $hasDefCap = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='services' AND COLUMN_NAME='ponct_capacity'"
            )->fetchColumn();
            if (!$hasDefCap) {
                self::$pdo->exec("ALTER TABLE services ADD COLUMN ponct_capacity INT NOT NULL DEFAULT 1 AFTER ponct_duration");
            }
            // Validation bloquante
            $hasVB = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='services' AND COLUMN_NAME='validation_bloquante'"
            )->fetchColumn();
            if (!$hasVB) {
                self::$pdo->exec("ALTER TABLE services ADD COLUMN validation_bloquante TINYINT(1) NOT NULL DEFAULT 1");
            }
            // Champs récurrents
            $hasRecur = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='services' AND COLUMN_NAME='recur_duration'"
            )->fetchColumn();
            if (!$hasRecur) {
                self::$pdo->exec("ALTER TABLE services ADD COLUMN recur_duration      INT        NOT NULL DEFAULT 60 AFTER ponct_capacity");
                self::$pdo->exec("ALTER TABLE services ADD COLUMN recur_capacity      INT        NOT NULL DEFAULT 1  AFTER recur_duration");
                // recur_gauge_value n'est plus créé (jauge globale supprimée).
                // Le drop sur bases existantes est géré par la boucle plus haut.
            }
            // Suppression du flag service-wide recur_gauge_enabled : la jauge est désormais
            // gérée par-demandeur via service_demandeur_settings.jauge.
            $hasRecurGaugeEnabled = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='services' AND COLUMN_NAME='recur_gauge_enabled'"
            )->fetchColumn();
            if ($hasRecurGaugeEnabled) {
                self::$pdo->exec("ALTER TABLE services DROP COLUMN recur_gauge_enabled");
            }
            // Migrations historiques sur bookings_unique : skipées si la table a été fusionnée dans `bookings`
            $hasBkUniqueLegacy = (int)self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings_unique'"
            )->fetchColumn();
            if ($hasBkUniqueLegacy && !$hasBkEnf) {
                self::$pdo->exec("ALTER TABLE bookings        ADD COLUMN enfants       SMALLINT NOT NULL DEFAULT 0 AFTER theme_label");
                self::$pdo->exec("ALTER TABLE bookings        ADD COLUMN accompagnants SMALLINT NOT NULL DEFAULT 0 AFTER enfants");
                self::$pdo->exec("ALTER TABLE bookings_unique ADD COLUMN enfants       SMALLINT NOT NULL DEFAULT 0 AFTER theme_label");
                self::$pdo->exec("ALTER TABLE bookings_unique ADD COLUMN accompagnants SMALLINT NOT NULL DEFAULT 0 AFTER enfants");
            }
            if ($hasBkUniqueLegacy) {
                // Lien réservations ponctuelles → réservation récurrente source
                $hasRecBkId = self::$pdo->query(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings_unique' AND COLUMN_NAME='recurring_booking_id'"
                )->fetchColumn();
                if (!$hasRecBkId) {
                    self::$pdo->exec("ALTER TABLE bookings_unique ADD COLUMN recurring_booking_id INT NULL DEFAULT NULL");
                    self::$pdo->exec("ALTER TABLE bookings_unique ADD KEY idx_bku_recurring (recurring_booking_id)");
                }
                // Soft-delete des réservations ponctuelles
                $hasCancelled = self::$pdo->query(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings_unique' AND COLUMN_NAME='cancelled'"
                )->fetchColumn();
                if (!$hasCancelled) {
                    self::$pdo->exec("ALTER TABLE bookings_unique ADD COLUMN cancelled    TINYINT(1) NOT NULL DEFAULT 0");
                    self::$pdo->exec("ALTER TABLE bookings_unique ADD COLUMN cancelled_at DATETIME   NULL DEFAULT NULL");
                }
            }
            // Lien créneaux uniques → créneau récurrent parent
            $hasParentSlot = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='slots' AND COLUMN_NAME='parent_slot_id'"
            )->fetchColumn();
            if (!$hasParentSlot) {
                self::$pdo->exec("ALTER TABLE slots ADD COLUMN parent_slot_id VARCHAR(64) NULL DEFAULT NULL");
                self::$pdo->exec("ALTER TABLE slots ADD KEY idx_slots_parent (parent_slot_id)");
            }
            if ($hasBkUniqueLegacy) {
                // Pointage des réservations ponctuelles
                $hasPointage = self::$pdo->query(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings_unique' AND COLUMN_NAME='pointage'"
                )->fetchColumn();
                if (!$hasPointage) {
                    self::$pdo->exec("ALTER TABLE bookings_unique ADD COLUMN pointage ENUM('present','absent') NULL DEFAULT NULL");
                }
            }
            // Ouverture les jours fériés
            $hasOpenHolidays = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='services' AND COLUMN_NAME='open_on_holidays'"
            )->fetchColumn();
            if (!$hasOpenHolidays) {
                self::$pdo->exec("ALTER TABLE services ADD COLUMN open_on_holidays TINYINT(1) NOT NULL DEFAULT 0");
            }
            // Cache des vacances scolaires (par zone, source data.education.gouv.fr)
            $hasSchoolHolidays = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='school_holidays'"
            )->fetchColumn();
            if (!$hasSchoolHolidays) {
                self::$pdo->exec("
                    CREATE TABLE school_holidays (
                        id         INT          NOT NULL AUTO_INCREMENT,
                        zone       CHAR(1)      NOT NULL,
                        date_start DATE         NOT NULL,
                        date_end   DATE         NOT NULL,
                        label      VARCHAR(255) NOT NULL DEFAULT '',
                        PRIMARY KEY (id),
                        KEY idx_zone_dates (zone, date_start, date_end)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                ");
            }
            // Table des jours fériés par période
            $hasHolidays = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='period_holidays'"
            )->fetchColumn();
            if (!$hasHolidays) {
                self::$pdo->exec("
                    CREATE TABLE period_holidays (
                        id        INT          NOT NULL AUTO_INCREMENT,
                        period_id INT          NOT NULL,
                        date      DATE         NOT NULL,
                        label     VARCHAR(128) NOT NULL DEFAULT '',
                        PRIMARY KEY (id),
                        UNIQUE KEY uq_period_date (period_id, date),
                        CONSTRAINT fk_ph_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                ");
            }
            // Suppression des colonnes obsolètes (remplacées par service_demandeur_settings)
            foreach (['recurring_mode', 'validation_mode', 'ab_week_mode', 'theme_mode'] as $_obsolete) {
                $exists = self::$pdo->query(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='services' AND COLUMN_NAME='$_obsolete'"
                )->fetchColumn();
                if ($exists) self::$pdo->exec("ALTER TABLE services DROP COLUMN $_obsolete");
            }
            // Colonne qui indique les semaines applicables d'un créneau (mode Semaine A/B).
            // Historiquement nommée week_ab VARCHAR(2) avec valeurs 'A' ou 'B'.
            // Modèle "un slot, N semaines" : la colonne est renommée en `weeks` VARCHAR(8)
            // et accepte aussi des listes (ex. 'A,B') pour qu'un même créneau s'applique
            // à plusieurs semaines sans dédoubler la ligne.
            $hasSlotWeekAb = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='slots' AND COLUMN_NAME='week_ab'"
            )->fetchColumn();
            $hasSlotWeeks = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='slots' AND COLUMN_NAME='weeks'"
            )->fetchColumn();
            if ($hasSlotWeekAb && !$hasSlotWeeks) {
                // Renommer + élargir : 'A'/'B' restent valides, 'A,B' devient possible
                self::$pdo->exec("ALTER TABLE slots CHANGE COLUMN week_ab weeks VARCHAR(8) NULL DEFAULT NULL");
            } elseif (!$hasSlotWeekAb && !$hasSlotWeeks) {
                self::$pdo->exec("ALTER TABLE slots ADD COLUMN weeks VARCHAR(8) NULL DEFAULT NULL");
            }

            // Modèle "un slot, N semaines" : la table bookings doit porter la semaine
            // (sinon impossible de différencier un booking semaine A d'un booking semaine B
            // sur un même slot 'A,B').
            $hasBookingWeek = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings' AND COLUMN_NAME='week'"
            )->fetchColumn();
            if (!$hasBookingWeek) {
                self::$pdo->exec("ALTER TABLE bookings ADD COLUMN week VARCHAR(2) NOT NULL DEFAULT '' AFTER day_key");
                // Backfill : récupérer la semaine depuis le slot (mono-valeur 'A' ou 'B' uniquement).
                // Les bookings sur des slots multi-semaines (qui n'existaient pas avant cette migration
                // car l'ancien modèle dédoublait les slots) restent à '' (= "toutes les semaines").
                self::$pdo->exec(
                    "UPDATE bookings b
                     JOIN slots s ON s.id = b.slot_id
                     SET b.week = s.weeks
                     WHERE b.week = '' AND s.weeks IN ('A','B')"
                );
                // Reconstruire l'index unique pour inclure la semaine
                $hasOldUq = self::$pdo->query(
                    "SELECT COUNT(*) FROM information_schema.STATISTICS
                     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings' AND INDEX_NAME='uq_recurring'"
                )->fetchColumn();
                if ($hasOldUq) {
                    self::$pdo->exec("ALTER TABLE bookings DROP INDEX uq_recurring");
                }
                self::$pdo->exec(
                    "ALTER TABLE bookings ADD UNIQUE KEY uq_recurring (user_id, service_id, slot_id, period_id, day_key, week)"
                );
            }
            // Table de correspondance service × demandeur — rename legacy
            $hasSCS = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='service_category_settings'"
            )->fetchColumn();
            if ($hasSCS) {
                self::$pdo->exec("RENAME TABLE service_category_settings TO service_demandeur_settings");
                self::$pdo->exec("ALTER TABLE service_demandeur_settings CHANGE COLUMN categorie_id demandeur_id INT NOT NULL");
            }
            // Migration : categories → demandeurs (table). RENAME met à jour les FK pointantes.
            $hasCategoriesTable = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='categories'"
            )->fetchColumn();
            if ($hasCategoriesTable) {
                self::$pdo->exec("SET FOREIGN_KEY_CHECKS=0");
                self::$pdo->exec("RENAME TABLE categories TO demandeurs");
                self::$pdo->exec("SET FOREIGN_KEY_CHECKS=1");
            }
            // Création / seed demandeurs
            self::$pdo->exec("
                CREATE TABLE IF NOT EXISTS demandeurs (
                    id    INT AUTO_INCREMENT PRIMARY KEY,
                    label VARCHAR(100) NOT NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");
            $hasDem = (int)self::$pdo->query("SELECT COUNT(*) FROM demandeurs")->fetchColumn();
            if (!$hasDem) {
                foreach (['Ecole','Accueil de loisir','Assistante maternelle'] as $lbl) {
                    self::$pdo->prepare("INSERT INTO demandeurs (label) VALUES (?)")->execute([$lbl]);
                }
            }
            // Migration : niveaux.demandeur_id (rattachement au demandeur correspondant)
            $hasNivDem = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='niveaux' AND COLUMN_NAME='demandeur_id'"
            )->fetchColumn();
            if (!$hasNivDem) {
                self::$pdo->exec("ALTER TABLE niveaux ADD COLUMN demandeur_id INT NULL DEFAULT NULL AFTER label");
                self::$pdo->exec("ALTER TABLE niveaux ADD KEY fk_niv_dem (demandeur_id)");
                self::$pdo->exec("ALTER TABLE niveaux ADD CONSTRAINT fk_niv_dem FOREIGN KEY (demandeur_id) REFERENCES demandeurs(id) ON DELETE SET NULL");
                // Backfill : Petit/Moyen/Grand → Ecole maternelle ; CP/CE1/CE2/CM1/CM2 → Ecole élémentaire.
                // Utiliser le label exact du demandeur pour ne pas dépendre de l'ID auto-incrémenté.
                self::$pdo->exec("
                    UPDATE niveaux n
                    JOIN demandeurs d ON d.label='Ecole maternelle'
                    SET n.demandeur_id = d.id
                    WHERE n.label IN ('Petit','Moyen','Grand')
                ");
                self::$pdo->exec("
                    UPDATE niveaux n
                    JOIN demandeurs d ON d.label='Ecole élémentaire'
                    SET n.demandeur_id = d.id
                    WHERE n.label IN ('CP','CE1','CE2','CM1','CM2')
                ");
            }
            // Migration : structures.categorie_id → demandeur_id (+ FK rename fk_str_cat → fk_str_dem)
            $hasStrCat = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='structures' AND COLUMN_NAME='categorie_id'"
            )->fetchColumn();
            if ($hasStrCat) {
                $hasOldFk = self::$pdo->query(
                    "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='structures' AND CONSTRAINT_NAME='fk_str_cat'"
                )->fetchColumn();
                if ($hasOldFk) {
                    self::$pdo->exec("ALTER TABLE structures DROP FOREIGN KEY fk_str_cat");
                    self::$pdo->exec("ALTER TABLE structures DROP INDEX fk_str_cat");
                }
                self::$pdo->exec("ALTER TABLE structures CHANGE COLUMN categorie_id demandeur_id INT NOT NULL");
                self::$pdo->exec("ALTER TABLE structures ADD KEY fk_str_dem (demandeur_id)");
                self::$pdo->exec("ALTER TABLE structures ADD CONSTRAINT fk_str_dem FOREIGN KEY (demandeur_id) REFERENCES demandeurs(id) ON DELETE CASCADE");
            }
            // Création table structures (fresh install)
            self::$pdo->exec("
                CREATE TABLE IF NOT EXISTS structures (
                    id           INT AUTO_INCREMENT PRIMARY KEY,
                    demandeur_id INT NOT NULL,
                    label        VARCHAR(150) NOT NULL,
                    KEY fk_str_dem (demandeur_id),
                    CONSTRAINT fk_str_dem FOREIGN KEY (demandeur_id) REFERENCES demandeurs(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");
            // Création/correspondance service_demandeur_settings (fresh install)
            self::$pdo->exec("
                CREATE TABLE IF NOT EXISTS service_demandeur_settings (
                    service_id   VARCHAR(64)  NOT NULL,
                    demandeur_id INT          NOT NULL,
                    recurrent    TINYINT(1)   NOT NULL DEFAULT 0,
                    semaine_ab   TINYINT(1)   NOT NULL DEFAULT 0,
                    validation   TINYINT(1)   NOT NULL DEFAULT 0,
                    themes       TINYINT(1)   NOT NULL DEFAULT 0,
                    jauge        TINYINT(1)   NOT NULL DEFAULT 0,
                    PRIMARY KEY (service_id, demandeur_id),
                    CONSTRAINT fk_sds_service FOREIGN KEY (service_id)   REFERENCES services(id)    ON DELETE CASCADE,
                    CONSTRAINT fk_sds_dem     FOREIGN KEY (demandeur_id) REFERENCES demandeurs(id)  ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");
            // Migration : FK service_demandeur_settings (fk_scs_cat → fk_sds_dem)
            $hasOldFkScsCat = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='service_demandeur_settings' AND CONSTRAINT_NAME='fk_scs_cat'"
            )->fetchColumn();
            if ($hasOldFkScsCat) {
                self::$pdo->exec("ALTER TABLE service_demandeur_settings DROP FOREIGN KEY fk_scs_cat");
                self::$pdo->exec("ALTER TABLE service_demandeur_settings ADD CONSTRAINT fk_sds_dem FOREIGN KEY (demandeur_id) REFERENCES demandeurs(id) ON DELETE CASCADE");
            }
            // Migration : users.categorie_id → demandeur_id
            $hasUsrCat = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='categorie_id'"
            )->fetchColumn();
            if ($hasUsrCat) {
                self::$pdo->exec("ALTER TABLE users CHANGE COLUMN categorie_id demandeur_id INT NULL DEFAULT NULL");
            }
            $colDemUser = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='demandeur_id'"
            )->fetchColumn();
            if (!$colDemUser) {
                self::$pdo->exec("ALTER TABLE users ADD COLUMN demandeur_id INT NULL DEFAULT NULL");
            }
            $colStrUser = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='structure_id'"
            )->fetchColumn();
            if (!$colStrUser) {
                self::$pdo->exec("ALTER TABLE users ADD COLUMN structure_id INT NULL DEFAULT NULL");
            }
            // Table cycle_events (journal des changements d'exercice — pour l'undo).
            self::$pdo->exec("
                CREATE TABLE IF NOT EXISTS cycle_events (
                    id         INT NOT NULL AUTO_INCREMENT,
                    service_id VARCHAR(64) DEFAULT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    data       JSON NOT NULL,
                    PRIMARY KEY (id),
                    KEY idx_cycle_service (service_id, created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");
            // Migration : ajout colonne state sur slots (3 états : actif, desactive, archive)
            $hasSlotState = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='slots' AND COLUMN_NAME='state'"
            )->fetchColumn();
            if (!$hasSlotState) {
                self::$pdo->exec("ALTER TABLE slots ADD COLUMN state ENUM('actif','desactive','archive') NOT NULL DEFAULT 'actif'");
            }
            // Migration : ajout colonne active sur periods (TINYINT(1), défaut 1 = active)
            // — étape 1, conservée pour les anciennes installations (puis transformée en state ci-dessous).
            $hasPeriodActive = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='periods' AND COLUMN_NAME='active'"
            )->fetchColumn();
            if (!$hasPeriodActive) {
                $hasPeriodState = self::$pdo->query(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='periods' AND COLUMN_NAME='state'"
                )->fetchColumn();
                if (!$hasPeriodState) {
                    self::$pdo->exec("ALTER TABLE periods ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1");
                }
            }
            // Migration : transformation periods.active (TINYINT) → periods.state ENUM('actif','desactive','archive')
            $hasPeriodActive = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='periods' AND COLUMN_NAME='active'"
            )->fetchColumn();
            $hasPeriodState = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='periods' AND COLUMN_NAME='state'"
            )->fetchColumn();
            if ($hasPeriodActive && !$hasPeriodState) {
                self::$pdo->exec("ALTER TABLE periods ADD COLUMN state ENUM('actif','desactive','archive') NOT NULL DEFAULT 'actif' AFTER active");
                self::$pdo->exec("UPDATE periods SET state = IF(active=1, 'actif', 'desactive')");
                self::$pdo->exec("ALTER TABLE periods DROP COLUMN active");
            }
            // Migration : suppression du soft-delete sur bookings (hard-delete unifié)
            $hasBkCancelled = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings' AND COLUMN_NAME='cancelled'"
            )->fetchColumn();
            if ($hasBkCancelled) {
                self::$pdo->exec("ALTER TABLE bookings DROP COLUMN cancelled");
            }
            $hasBkCancelledAt = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings' AND COLUMN_NAME='cancelled_at'"
            )->fetchColumn();
            if ($hasBkCancelledAt) {
                self::$pdo->exec("ALTER TABLE bookings DROP COLUMN cancelled_at");
            }
            // Migration : suppression de slots.position (ordre désormais déduit de start_time)
            $hasSlotPos = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='slots' AND COLUMN_NAME='position'"
            )->fetchColumn();
            if ($hasSlotPos) {
                self::$pdo->exec("ALTER TABLE slots DROP COLUMN position");
            }
            // Migration : suppression de la colonne ecole (remplacée par demandeur_id/structure_id)
            $hasEcole = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='ecole'"
            )->fetchColumn();
            if ($hasEcole) {
                self::$pdo->exec("ALTER TABLE users DROP COLUMN ecole");
            }
            // Migration : suppression de slot_capacities (remplacée par colonnes cap_* sur slots)
            $hasSlotCapTable = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='slot_capacities'"
            )->fetchColumn();
            if ($hasSlotCapTable) {
                self::$pdo->exec("DROP TABLE slot_capacities");
            }
            // ============================================================
            // Unification bookings + bookings_unique (discriminator booking_type)
            // ============================================================
            $hasBkUniqueTable = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings_unique'"
            )->fetchColumn();
            if ($hasBkUniqueTable) {
                $hasBookingType = self::$pdo->query(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings' AND COLUMN_NAME='booking_type'"
                )->fetchColumn();
                if (!$hasBookingType) {
                    self::$pdo->exec("ALTER TABLE bookings
                        ADD COLUMN booking_type ENUM('recurring','unique') NOT NULL DEFAULT 'recurring' AFTER id,
                        ADD COLUMN parent_booking_id INT NULL AFTER day_key,
                        ADD COLUMN cancelled TINYINT(1) NOT NULL DEFAULT 0,
                        ADD COLUMN cancelled_at DATETIME NULL,
                        ADD COLUMN pointage ENUM('present','absent') NULL");
                    self::$pdo->exec("ALTER TABLE bookings ADD KEY idx_bk_parent (parent_booking_id)");
                }
                // Drop FK sur period_id (period_id=0 sentinelle pour les bookings 'unique' violerait la FK)
                $hasFkBkPeriod = self::$pdo->query(
                    "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings' AND CONSTRAINT_NAME='fk_bk_period'"
                )->fetchColumn();
                if ($hasFkBkPeriod) {
                    self::$pdo->exec("ALTER TABLE bookings DROP FOREIGN KEY fk_bk_period");
                }
                self::$pdo->exec("ALTER TABLE bookings MODIFY COLUMN period_id INT NOT NULL DEFAULT 0");
                self::$pdo->exec("ALTER TABLE bookings MODIFY COLUMN day_key VARCHAR(8) NOT NULL DEFAULT ''");
                // Copier les données de bookings_unique → bookings
                self::$pdo->exec("INSERT INTO bookings
                    (booking_type, user_id, service_id, slot_id, period_id, day_key,
                     parent_booking_id, theme_label, enfants, accompagnants,
                     validated, cancelled, cancelled_at, pointage, created_at)
                    SELECT 'unique', user_id, service_id, slot_id, 0, '',
                           recurring_booking_id, theme_label, enfants, accompagnants,
                           validated, cancelled, cancelled_at, pointage, created_at
                    FROM bookings_unique");
                self::$pdo->exec("DROP TABLE bookings_unique");
            }
            // ============================================================
            // Table exercice + colonne periods.exercice_id (FK)
            // ============================================================
            $hasExerciceTable = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='exercice'"
            )->fetchColumn();
            if (!$hasExerciceTable) {
                self::$pdo->exec("
                    CREATE TABLE exercice (
                        id         INT          NOT NULL AUTO_INCREMENT,
                        label      VARCHAR(32)  NOT NULL,
                        created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                ");
            }
            $hasExerciceCol = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='periods' AND COLUMN_NAME='exercice_id'"
            )->fetchColumn();
            if (!$hasExerciceCol) {
                self::$pdo->exec("ALTER TABLE periods ADD COLUMN exercice_id INT NULL DEFAULT NULL AFTER service_id");
                self::$pdo->exec("ALTER TABLE periods ADD KEY fk_period_exercice (exercice_id)");
                self::$pdo->exec("ALTER TABLE periods ADD CONSTRAINT fk_period_exercice
                                  FOREIGN KEY (exercice_id) REFERENCES exercice(id) ON DELETE SET NULL");
            }
            // Backfill periods.exercice_id : groupe par (service_id, state).
            // Label = "YYYY" si min/max sur la même année, sinon "YYYY-YYYY".
            // Idempotent grâce à WHERE exercice_id IS NULL.
            $groups = self::$pdo->query(
                "SELECT service_id, state,
                        MIN(YEAR(date_start)) AS ys,
                        MAX(YEAR(date_end))   AS ye
                 FROM periods
                 WHERE exercice_id IS NULL
                   AND date_start IS NOT NULL
                   AND date_end   IS NOT NULL
                 GROUP BY service_id, state"
            )->fetchAll(\PDO::FETCH_ASSOC);
            foreach ($groups as $g) {
                $ys = (int)$g['ys'];
                $ye = (int)$g['ye'];
                $label = ($ys === $ye) ? (string)$ys : "$ys-$ye";
                $stmt = self::$pdo->prepare("SELECT id FROM exercice WHERE label=?");
                $stmt->execute([$label]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                if ($row) {
                    $exId = (int)$row['id'];
                } else {
                    $stmt = self::$pdo->prepare("INSERT INTO exercice (label) VALUES (?)");
                    $stmt->execute([$label]);
                    $exId = (int)self::$pdo->lastInsertId();
                }
                if ($g['service_id'] === null) {
                    $stmt = self::$pdo->prepare(
                        "UPDATE periods SET exercice_id=? WHERE service_id IS NULL AND state=? AND exercice_id IS NULL"
                    );
                    $stmt->execute([$exId, $g['state']]);
                } else {
                    $stmt = self::$pdo->prepare(
                        "UPDATE periods SET exercice_id=? WHERE service_id=? AND state=? AND exercice_id IS NULL"
                    );
                    $stmt->execute([$exId, $g['service_id'], $g['state']]);
                }
            }
            // ============================================================
            // Renommage hide_previous_exercices → show_previous_exercices
            // (label UI inversé : "Afficher" au lieu de "Masquer"). Les valeurs
            // sont inversées (1↔0) et le DEFAULT passe à 0 (= ne pas afficher).
            // ============================================================
            $hasOldHide = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='services' AND COLUMN_NAME='hide_previous_exercices'"
            )->fetchColumn();
            if ($hasOldHide) {
                self::$pdo->exec("ALTER TABLE services CHANGE COLUMN hide_previous_exercices show_previous_exercices TINYINT(1) NOT NULL DEFAULT 0");
                self::$pdo->exec("UPDATE services SET show_previous_exercices = 1 - show_previous_exercices");
            }
            // Table slot_demandeurs : restreint un créneau à un sous-ensemble de demandeurs.
            // Liste vide = aucune restriction (créneau visible par tous les demandeurs du service).
            // Les miroirs (slot_type='unique' avec parent_slot_id) héritent de la liste du parent récurrent.
            self::$pdo->exec("CREATE TABLE IF NOT EXISTS slot_demandeurs (
                slot_id      VARCHAR(64) NOT NULL,
                demandeur_id INT         NOT NULL,
                PRIMARY KEY (slot_id, demandeur_id),
                KEY idx_sd_dem (demandeur_id),
                CONSTRAINT fk_sd_slot FOREIGN KEY (slot_id)      REFERENCES slots(id)      ON DELETE CASCADE,
                CONSTRAINT fk_sd_dem  FOREIGN KEY (demandeur_id) REFERENCES demandeurs(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci");
            // ============================================================
            // Thèmes par service : mode (libre/liste) + table service_themes
            // ============================================================
            $hasThemesMode = self::$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='services' AND COLUMN_NAME='themes_mode'"
            )->fetchColumn();
            if (!$hasThemesMode) {
                self::$pdo->exec("ALTER TABLE services ADD COLUMN themes_mode ENUM('libre','liste') NOT NULL DEFAULT 'libre'");
            }
            self::$pdo->exec("CREATE TABLE IF NOT EXISTS service_themes (
                id         INT          NOT NULL AUTO_INCREMENT,
                service_id VARCHAR(64)  NOT NULL,
                label      VARCHAR(255) NOT NULL,
                position   INT          NOT NULL DEFAULT 0,
                PRIMARY KEY (id),
                KEY idx_st_service (service_id),
                CONSTRAINT fk_st_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci");
            } catch (\Throwable $e) {
                // La migration a échoué mais on laisse la connexion continuer
                error_log('[CultuRézo migration] ' . $e->getMessage());
            }
        }
        return self::$pdo;
    }

    /** Exécute une requête préparée et retourne le statement */
    public static function run(string $sql, array $params = []): PDOStatement {
        $stmt = self::get()->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    /** Retourne toutes les lignes */
    public static function all(string $sql, array $params = []): array {
        return self::run($sql, $params)->fetchAll();
    }

    /** Retourne une seule ligne */
    public static function one(string $sql, array $params = []): ?array {
        $row = self::run($sql, $params)->fetch();
        return $row ?: null;
    }

    /** Retourne le dernier ID inséré */
    public static function lastId(): string {
        return self::get()->lastInsertId();
    }
}
