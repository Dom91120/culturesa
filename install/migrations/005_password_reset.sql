-- ============================================================
--  Migration — Mot de passe oublié (self-service + reset par admin)
--
--  Ajoute la table password_reset_requests qui stocke les tokens
--  envoyés par mail. Validité : 1 heure (plus court qu'une simple
--  confirmation pour limiter la fenêtre d'attaque).
--
--  À exécuter une seule fois sur une base existante.
-- ============================================================

CREATE TABLE IF NOT EXISTS `password_reset_requests` (
  `token`      VARCHAR(128) NOT NULL,
  `user_id`    INT          NOT NULL,
  `expires_at` DATETIME     NOT NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`token`),
  KEY `fk_prr_user` (`user_id`),
  CONSTRAINT `fk_prr_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
