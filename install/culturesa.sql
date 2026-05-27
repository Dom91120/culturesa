-- ============================================================
--  CultuRésa — Schéma de base de données MySQL
--  Compatible MySQL 8.0+
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = '+01:00';

-- ============================================================
--  Tables
-- ============================================================

-- ──────────────────────────────────────────────
-- Table : services
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `services` (
  `id`                       VARCHAR(64)  NOT NULL,
  `label`                    VARCHAR(128) NOT NULL,
  `validation_bloquante`     TINYINT(1)   NOT NULL DEFAULT 0,
  `max_reservations`         INT          NOT NULL DEFAULT 1,
  `max_reservations_period`    INT          NOT NULL DEFAULT 1,
  `active_days`              VARCHAR(64)  NOT NULL DEFAULT 'lun,mar,mer,jeu,ven',
  `position`                 INT          NOT NULL DEFAULT 0,
  `created_at`               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ponct_duration`           INT          NOT NULL DEFAULT 60,
  `ponct_capacity`           INT          NOT NULL DEFAULT 1,
  `recur_duration`           INT          NOT NULL DEFAULT 60,
  `recur_capacity`           INT          NOT NULL DEFAULT 1,
  `morning_start`            VARCHAR(8)   NOT NULL DEFAULT '09:00',
  `morning_end`              VARCHAR(8)   NOT NULL DEFAULT '12:00',
  `afternoon_start`          VARCHAR(8)   NOT NULL DEFAULT '14:00',
  `afternoon_end`            VARCHAR(8)   NOT NULL DEFAULT '18:00',
  `icon`                     VARCHAR(16)  DEFAULT NULL,
  `booking_delay`            INT          NOT NULL DEFAULT 0,
  `open_on_holidays`         TINYINT(1)   NOT NULL DEFAULT 0,
  `show_previous_exercices`  TINYINT(1)   NOT NULL DEFAULT 0,
  `themes_mode`              ENUM('libre','liste') NOT NULL DEFAULT 'libre',
  -- Délai d'auto-validation des réservations, en minutes signées :
  --   0      = jamais (pas d'auto-validation)
  --   -120   = 2h ouvrées avant la séance
  --   -1440  = 1 jour ouvré avant
  --   -2880  = 2 jours ouvrés
  --   -4320  = 3 jours ouvrés
  --   +10080 = 1 semaine calendaire après la résa
  --   +20160 = 2 semaines calendaires
  `auto_validation_delay`    INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ──────────────────────────────────────────────
-- Table : slots (créneaux récurrents + enfants datés via parent_slot_id)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `slots` (
  `id`             VARCHAR(64)  NOT NULL,
  `service_id`     VARCHAR(64)  NOT NULL,
  `slot_type`      ENUM('recurring','unique') NOT NULL DEFAULT 'recurring',
  `start_time`     VARCHAR(8)   NOT NULL DEFAULT '09:00',
  `end_time`       VARCHAR(8)   NOT NULL DEFAULT '10:30',
  `slot_date`      DATE         DEFAULT NULL,
  `capacity`       INT          DEFAULT NULL,
  `cap_lun`        INT          DEFAULT NULL,
  `cap_mar`        INT          DEFAULT NULL,
  `cap_mer`        INT          DEFAULT NULL,
  `cap_jeu`        INT          DEFAULT NULL,
  `cap_ven`        INT          DEFAULT NULL,
  `cap_sam`        INT          DEFAULT NULL,
  `cap_dim`        INT          DEFAULT NULL,
  `period_id`      INT          DEFAULT NULL,
  `parent_slot_id` VARCHAR(64)  DEFAULT NULL,
  `weeks`          VARCHAR(8)   DEFAULT NULL,
  `state`          ENUM('actif','desactive','archive') NOT NULL DEFAULT 'actif',
  PRIMARY KEY (`id`),
  KEY `fk_slot_service` (`service_id`),
  KEY `idx_slots_parent` (`parent_slot_id`),
  KEY `idx_slots_period` (`period_id`),
  CONSTRAINT `fk_slot_service` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE CASCADE
  -- FK slots.period_id -> periods(id) ajoutee plus bas via ALTER TABLE
  -- (forward reference : la table `periods` est creee apres `slots`).
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ──────────────────────────────────────────────
-- Table : exercice (libellé d'un exercice annuel — ex. "2025" ou "2025-2026")
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `exercice` (
  `id`         INT          NOT NULL AUTO_INCREMENT,
  `label`      VARCHAR(32)  NOT NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ──────────────────────────────────────────────
-- Table : periods
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `periods` (
  `id`           INT          NOT NULL AUTO_INCREMENT,
  `service_id`   VARCHAR(64)  DEFAULT NULL,
  `exercice_id`  INT          DEFAULT NULL,
  `label`        VARCHAR(128) NOT NULL,
  `etiquette`    VARCHAR(32)  DEFAULT NULL,
  `date_start`   DATE         DEFAULT NULL,
  `date_end`     DATE         DEFAULT NULL,
  `color`        VARCHAR(16)  NOT NULL DEFAULT '#6dceaa',
  `position`     INT          NOT NULL DEFAULT 0,
  `state`        ENUM('actif','desactive','archive') NOT NULL DEFAULT 'actif',
  PRIMARY KEY (`id`),
  KEY `fk_period_service` (`service_id`),
  KEY `fk_period_exercice` (`exercice_id`),
  CONSTRAINT `fk_period_service`  FOREIGN KEY (`service_id`)  REFERENCES `services`(`id`)  ON DELETE CASCADE,
  CONSTRAINT `fk_period_exercice` FOREIGN KEY (`exercice_id`) REFERENCES `exercice`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- FK forward depuis slots vers periods (cf. note dans CREATE TABLE slots ci-dessus).
ALTER TABLE `slots`
  ADD CONSTRAINT `fk_slots_period` FOREIGN KEY (`period_id`) REFERENCES `periods`(`id`) ON DELETE CASCADE;

-- ──────────────────────────────────────────────
-- Table : cycle_events (journal des changements d'exercice — pour l'undo)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `cycle_events` (
  `id`         INT          NOT NULL AUTO_INCREMENT,
  `service_id` VARCHAR(64)  DEFAULT NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `data`       JSON         NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_cycle_service` (`service_id`,`created_at`),
  CONSTRAINT `fk_cycle_service` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ──────────────────────────────────────────────
-- Table : period_holidays (jours fériés/fermés par période)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `period_holidays` (
  `id`        INT          NOT NULL AUTO_INCREMENT,
  `period_id` INT          NOT NULL,
  `date`      DATE         NOT NULL,
  `label`     VARCHAR(128) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_period_date` (`period_id`,`date`),
  CONSTRAINT `fk_ph_period` FOREIGN KEY (`period_id`) REFERENCES `periods`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ──────────────────────────────────────────────
-- Table : school_holidays (vacances scolaires zones A/B/C)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `school_holidays` (
  `id`         INT          NOT NULL AUTO_INCREMENT,
  `zone`       CHAR(1)      NOT NULL,
  `date_start` DATE         NOT NULL,
  `date_end`   DATE         NOT NULL,
  `label`      VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  KEY `idx_zone_dates` (`zone`,`date_start`,`date_end`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ──────────────────────────────────────────────
-- Table : demandeurs (typologies de demandeur)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `demandeurs` (
  `id`                        INT          NOT NULL AUTO_INCREMENT,
  `label`                     VARCHAR(100) NOT NULL,
  `open_on_school_holidays`   TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ──────────────────────────────────────────────
-- Table : structures (rattachées à un demandeur)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `structures` (
  `id`           INT          NOT NULL AUTO_INCREMENT,
  `demandeur_id` INT          NOT NULL,
  `label`        VARCHAR(150) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_str_dem` (`demandeur_id`),
  CONSTRAINT `fk_str_dem` FOREIGN KEY (`demandeur_id`) REFERENCES `demandeurs`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ──────────────────────────────────────────────
-- Table : niveaux (référentiel scolaire)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `niveaux` (
  `id`           INT         NOT NULL AUTO_INCREMENT,
  `label`        VARCHAR(50) NOT NULL,
  `demandeur_id` INT         DEFAULT NULL,
  `position`     INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `fk_niv_dem` (`demandeur_id`),
  CONSTRAINT `fk_niv_dem` FOREIGN KEY (`demandeur_id`) REFERENCES `demandeurs`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ──────────────────────────────────────────────
-- Table : slot_demandeurs (restriction d'un créneau à un sous-ensemble de demandeurs)
-- Liste vide = aucune restriction. Les miroirs héritent du parent récurrent.
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `slot_demandeurs` (
  `slot_id`      VARCHAR(64) NOT NULL,
  `demandeur_id` INT         NOT NULL,
  PRIMARY KEY (`slot_id`, `demandeur_id`),
  KEY `idx_sd_dem` (`demandeur_id`),
  CONSTRAINT `fk_sd_slot` FOREIGN KEY (`slot_id`)      REFERENCES `slots`(`id`)      ON DELETE CASCADE,
  CONSTRAINT `fk_sd_dem`  FOREIGN KEY (`demandeur_id`) REFERENCES `demandeurs`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ──────────────────────────────────────────────
-- Table : service_themes (liste de thèmes prédéfinis par service)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `service_themes` (
  `id`         INT          NOT NULL AUTO_INCREMENT,
  `service_id` VARCHAR(64)  NOT NULL,
  `label`      VARCHAR(255) NOT NULL,
  `position`   INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_st_service` (`service_id`),
  CONSTRAINT `fk_st_service` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ──────────────────────────────────────────────
-- Table : service_demandeur_settings (config service × demandeur)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `service_demandeur_settings` (
  `service_id`   VARCHAR(64) NOT NULL,
  `demandeur_id` INT         NOT NULL,
  `recurrent`    TINYINT(1)  NOT NULL DEFAULT 0,
  `semaine_ab`   TINYINT(1)  NOT NULL DEFAULT 0,
  `validation`   TINYINT(1)  NOT NULL DEFAULT 0,
  `themes`       TINYINT(1)  NOT NULL DEFAULT 0,
  `jauge`        TINYINT(1)  NOT NULL DEFAULT 0,
  PRIMARY KEY (`service_id`,`demandeur_id`),
  KEY `fk_sds_dem` (`demandeur_id`),
  CONSTRAINT `fk_scs_service` FOREIGN KEY (`service_id`)   REFERENCES `services`(`id`)   ON DELETE CASCADE,
  CONSTRAINT `fk_sds_dem`     FOREIGN KEY (`demandeur_id`) REFERENCES `demandeurs`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ──────────────────────────────────────────────
-- Table : users (comptes)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id`              INT          NOT NULL AUTO_INCREMENT,
  `email`           VARCHAR(180) NOT NULL,
  `password`        VARCHAR(255) NOT NULL,
  `prenom`          VARCHAR(80)  NOT NULL DEFAULT '',
  `nom`             VARCHAR(80)  NOT NULL DEFAULT '',
  `tel`             VARCHAR(30)  NOT NULL DEFAULT '',
  `niveau`          VARCHAR(60)  NOT NULL DEFAULT '',
  `enfants`         SMALLINT     NOT NULL DEFAULT 0,
  `accompagnants`   SMALLINT     NOT NULL DEFAULT 0,
  `role`            ENUM('utilisateur','gestionnaire','administrateur') NOT NULL DEFAULT 'utilisateur',
  `rgpd_ok`         TINYINT(1)   NOT NULL DEFAULT 0,
  `services`        TEXT         DEFAULT NULL,
  `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `email_confirmed` TINYINT(1)   NOT NULL DEFAULT 1,
  `demandeur_id`    INT          DEFAULT NULL,
  `structure_id`    INT          DEFAULT NULL,
  `last_login_at`            DATETIME DEFAULT NULL,
  `anonymized_at`            DATETIME DEFAULT NULL,
  `deletion_notice_sent_at`  DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_email` (`email`),
  KEY `idx_users_demandeur` (`demandeur_id`),
  KEY `idx_users_structure` (`structure_id`),
  CONSTRAINT `fk_users_demandeur` FOREIGN KEY (`demandeur_id`) REFERENCES `demandeurs`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_structure` FOREIGN KEY (`structure_id`) REFERENCES `structures`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ──────────────────────────────────────────────
-- Table : rgpd_log (journal d'audit RGPD)
--   action          : ex. 'anonymize', 'export', 'self_delete'
--   target_user_id  : sujet de l'action (NULL pour les actions globales)
--   actor_user_id   : utilisateur ayant déclenché l'action (NULL = système)
--   details         : JSON optionnel pour contexte spécifique à l'action
--                     (PAS de données nominatives — défaut "minimisation")
--   ip              : adresse IP du client au moment de l'action
-- Pas de FK : on conserve le log même si l'utilisateur est anonymisé/supprimé.
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `rgpd_log` (
  `id`             INT          NOT NULL AUTO_INCREMENT,
  `action`         VARCHAR(64)  NOT NULL,
  `target_user_id` INT          DEFAULT NULL,
  `actor_user_id`  INT          DEFAULT NULL,
  `details`        TEXT         DEFAULT NULL,
  `ip`             VARCHAR(45)  DEFAULT NULL,
  `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rgpd_action`  (`action`),
  KEY `idx_rgpd_target`  (`target_user_id`),
  KEY `idx_rgpd_actor`   (`actor_user_id`),
  KEY `idx_rgpd_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ──────────────────────────────────────────────
-- Table : bookings (réservations unifiées récurrentes + ponctuelles)
--   booking_type='recurring' : période + jour de la semaine (day_key)
--   booking_type='unique'    : un slot daté (period_id=0, day_key='' sentinelles)
--   parent_booking_id        : pour un miroir 'unique' issu d'un parent 'recurring'
--   Suppression : hard-delete (DELETE direct, pas de soft-delete).
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `bookings` (
  `id`                INT          NOT NULL AUTO_INCREMENT,
  `booking_type`      ENUM('recurring','unique') NOT NULL DEFAULT 'recurring',
  `user_id`           INT          NOT NULL,
  `service_id`        VARCHAR(64)  NOT NULL,
  `slot_id`           VARCHAR(64)  NOT NULL,
  `period_id`         INT          NOT NULL DEFAULT 0,
  `day_key`           VARCHAR(8)   NOT NULL DEFAULT '',
  `week`              VARCHAR(2)   NOT NULL DEFAULT '',
  `parent_booking_id` INT          DEFAULT NULL,
  `theme_label`       VARCHAR(255) NOT NULL DEFAULT '',
  `enfants`           SMALLINT     NOT NULL DEFAULT 0,
  `accompagnants`     SMALLINT     NOT NULL DEFAULT 0,
  `validated`         TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Timestamp depuis lequel le délai d'auto-validation est compté.
  -- Initialisé à created_at à la création, mis à jour à NOW() sur un move.
  `auto_validate_from` DATETIME    NULL,
  `pointage`          ENUM('present','absent') DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_recurring` (`user_id`,`service_id`,`slot_id`,`period_id`,`day_key`,`week`),
  KEY `fk_bk_user` (`user_id`),
  KEY `fk_bk_service` (`service_id`),
  KEY `fk_bk_period` (`period_id`),
  KEY `idx_bk_slot` (`slot_id`),
  KEY `idx_bk_parent` (`parent_booking_id`),
  CONSTRAINT `fk_bk_user`    FOREIGN KEY (`user_id`)    REFERENCES `users`(`id`)    ON DELETE CASCADE,
  CONSTRAINT `fk_bk_service` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bk_slot`    FOREIGN KEY (`slot_id`)    REFERENCES `slots`(`id`)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ──────────────────────────────────────────────
-- Table : sessions (auth côté serveur)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `sessions` (
  `token`      VARCHAR(128) NOT NULL,
  `user_id`    INT          NOT NULL,
  `expires_at` DATETIME     NOT NULL,
  `ip`         VARCHAR(45)  DEFAULT NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`token`),
  KEY `fk_sess_user` (`user_id`),
  CONSTRAINT `fk_sess_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ──────────────────────────────────────────────
-- Table : auth_attempts (rate-limiting des tentatives de login + password reset)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `auth_attempts` (
  `id`           INT          NOT NULL AUTO_INCREMENT,
  `kind`         VARCHAR(32)  NOT NULL,
  `email`        VARCHAR(255) NOT NULL DEFAULT '',
  `ip`           VARCHAR(45)  NOT NULL DEFAULT '',
  `succeeded`    TINYINT(1)   NOT NULL DEFAULT 0,
  `attempted_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_kind_time`       (`kind`, `attempted_at`),
  KEY `idx_email_kind_time` (`email`, `kind`, `attempted_at`),
  KEY `idx_ip_kind_time`    (`ip`, `kind`, `attempted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ──────────────────────────────────────────────
-- Table : email_confirmations (validation d'inscription)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `email_confirmations` (
  `token`      VARCHAR(128) NOT NULL,
  `user_id`    INT          NOT NULL,
  `expires_at` DATETIME     NOT NULL,
  PRIMARY KEY (`token`),
  KEY `fk_conf_user` (`user_id`),
  CONSTRAINT `fk_conf_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ──────────────────────────────────────────────
-- Table : email_change_requests (changement d'adresse e-mail)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `email_change_requests` (
  `token`      VARCHAR(128) NOT NULL,
  `user_id`    INT          NOT NULL,
  `new_email`  VARCHAR(180) NOT NULL,
  `expires_at` DATETIME     NOT NULL,
  PRIMARY KEY (`token`),
  KEY `fk_ecr_user` (`user_id`),
  CONSTRAINT `fk_ecr_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ──────────────────────────────────────────────
-- Table : account_deletion_requests (suppression self-service RGPD art. 17)
--   Demande émise par l'utilisateur depuis "Mon compte" — validation par
--   clic sur le lien envoyé par mail dans les 24h, sinon expire.
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `account_deletion_requests` (
  `token`      VARCHAR(128) NOT NULL,
  `user_id`    INT          NOT NULL,
  `expires_at` DATETIME     NOT NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`token`),
  KEY `fk_adr_user` (`user_id`),
  CONSTRAINT `fk_adr_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ──────────────────────────────────────────────
-- Table : password_reset_requests (mot de passe oublié + reset admin)
--   Token unique envoyé par mail à l'utilisateur ; expire en 1h
--   (les liens de reset de mot de passe doivent être plus courts qu'une
--   confirmation classique pour limiter la fenêtre d'attaque).
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `password_reset_requests` (
  `token`      VARCHAR(128) NOT NULL,
  `user_id`    INT          NOT NULL,
  `expires_at` DATETIME     NOT NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`token`),
  KEY `fk_prr_user` (`user_id`),
  CONSTRAINT `fk_prr_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ──────────────────────────────────────────────
-- Table : app_config (paramètres applicatifs clé/valeur)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `app_config` (
  `cfg_key`   VARCHAR(64) NOT NULL,
  `cfg_value` TEXT,
  PRIMARY KEY (`cfg_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
--  Données par défaut
-- ============================================================

-- Demandeurs
INSERT IGNORE INTO `demandeurs` (`id`,`label`) VALUES
(1,'Ecole maternelle'),
(2,'Ecole élémentaire'),
(3,'Accueil de loisir maternel'),
(4,'Accueil de loisir élémentaire'),
(5,'Assistante maternelle');

-- Niveaux scolaires
INSERT IGNORE INTO `niveaux` (`id`,`label`,`demandeur_id`,`position`) VALUES
(1,'Petit',1,0),
(2,'Moyen',1,1),
(3,'Grand',1,2),
(4,'CP',  2,3),
(5,'CE1', 2,4),
(6,'CE2', 2,5),
(7,'CM1', 2,6),
(8,'CM2', 2,7);

-- Vacances scolaires (zone C — ajuster selon l'académie)
INSERT IGNORE INTO `school_holidays` (`id`,`zone`,`date_start`,`date_end`,`label`) VALUES
(19,'C','2025-04-11','2025-04-27','Vacances de Printemps'),
(20,'C','2026-02-20','2026-03-08','Vacances d\'Hiver'),
(21,'C','2026-04-17','2026-05-03','Vacances de Printemps'),
(22,'C','2027-02-05','2027-02-21','Vacances d\'Hiver'),
(23,'C','2027-07-02','2027-07-02','Début des Vacances d\'Été'),
(24,'C','2025-07-04','2025-08-31','Vacances d\'Été'),
(25,'C','2025-12-19','2026-01-04','Vacances de Noël'),
(26,'C','2026-07-03','2026-08-30','Vacances d\'Été'),
(27,'C','2026-10-16','2026-11-01','Vacances de la Toussaint'),
(28,'C','2026-12-18','2027-01-03','Vacances de Noël'),
(29,'C','2027-04-02','2027-04-18','Vacances de Printemps'),
(30,'C','2025-02-14','2025-03-02','Vacances d\'Hiver'),
(31,'C','2025-07-04','2025-08-28','Vacances d\'Été'),
(32,'C','2025-10-17','2025-11-02','Vacances de la Toussaint'),
(33,'C','2026-07-03','2026-08-31','Vacances d\'Été');

-- Périodes par défaut (année scolaire 2025-2026)
INSERT IGNORE INTO `periods` (`id`,`service_id`,`label`,`date_start`,`date_end`,`color`,`position`) VALUES
(1, NULL, 'Période 1', '2025-09-01', '2025-12-31', '#6dceaa', 1),
(2, NULL, 'Période 2', '2026-01-01', '2026-03-31', '#e8a45a', 2),
(3, NULL, 'Période 3', '2026-04-01', '2026-06-30', '#a07dd4', 3);

-- Services de démonstration
INSERT IGNORE INTO `services` (`id`,`label`,`max_reservations`,`max_reservations_period`,`active_days`,`position`) VALUES
('svc_001', 'Visite guidée',   1, 1, 'lun,mar,mer,jeu,ven', 1),
('svc_002', 'Atelier créatif', 1, 1, 'lun,mar,mer,jeu,ven', 2);

-- Créneaux récurrents par défaut
INSERT IGNORE INTO `slots` (`id`,`service_id`,`slot_type`,`start_time`,`end_time`) VALUES
('matin',  'svc_001', 'recurring', '09:30', '11:00'),
('aprem',  'svc_001', 'recurring', '14:00', '15:30'),
('matin2', 'svc_002', 'recurring', '09:30', '11:00'),
('aprem2', 'svc_002', 'recurring', '14:00', '15:30');

-- Compte administrateur par défaut (mot de passe : Admin1234!)
-- Hash généré via password_hash('Admin1234!', PASSWORD_DEFAULT)
INSERT IGNORE INTO `users` (`email`,`password`,`prenom`,`nom`,`role`,`rgpd_ok`,`email_confirmed`) VALUES
('admin@culturesa.fr', '$2y$10$UhPWgPH2mpK1wQAX67PQ7..BmN1wg6v3Ww2.WNQG.I8BVtFV0FqmO', 'Admin', 'CultuRésa', 'administrateur', 1, 1);
