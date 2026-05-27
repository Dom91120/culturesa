-- ============================================================
--  Migration RGPD — Self-service deletion (article 17)
--
--  Ajoute la table account_deletion_requests qui stocke les
--  demandes de suppression de compte initiées par les utilisateurs
--  eux-mêmes depuis "Mon compte". La suppression effective n'a
--  lieu qu'après confirmation par clic sur le lien email (24h).
--
--  À exécuter une seule fois sur une base existante.
-- ============================================================

CREATE TABLE IF NOT EXISTS `account_deletion_requests` (
  `token`      VARCHAR(128) NOT NULL,
  `user_id`    INT          NOT NULL,
  `expires_at` DATETIME     NOT NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`token`),
  KEY `fk_adr_user` (`user_id`),
  CONSTRAINT `fk_adr_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
