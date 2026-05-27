-- ============================================================
--  Migration RGPD — Journal d'audit
--
--  Ajoute la table rgpd_log qui trace chaque action RGPD :
--    - anonymisation d'un compte
--    - (futur) export de données, suppression self-service, etc.
--
--  Pas de FK vers users : le log doit subsister même si un compte
--  est anonymisé ou supprimé (principe d'auditabilité).
--
--  Pas de données nominatives dans le journal lui-même (principe de
--  minimisation) — seulement les identifiants des comptes concernés.
--
--  À exécuter une seule fois sur une base existante (phpMyAdmin ou
--  ligne de commande mysql).
-- ============================================================

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
