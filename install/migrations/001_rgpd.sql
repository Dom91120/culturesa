-- ============================================================
--  Migration RGPD — 2026-05
--  Ajoute :
--    - users.last_login_at   : horodatage de la dernière connexion réussie
--    - users.anonymized_at   : horodatage de l'anonymisation RGPD
--    - app_config.rgpd_retention_years : durée (années) au-delà de laquelle
--      un compte inactif est proposé à l'anonymisation (défaut : 2)
--
--  À exécuter une seule fois sur une base existante (via phpMyAdmin
--  ou ligne de commande mysql). Les bases nouvellement installées
--  via install/culturezo.sql contiennent déjà ces colonnes.
-- ============================================================

ALTER TABLE `users`
  ADD COLUMN `last_login_at` DATETIME DEFAULT NULL AFTER `structure_id`,
  ADD COLUMN `anonymized_at` DATETIME DEFAULT NULL AFTER `last_login_at`;

INSERT IGNORE INTO `app_config` (`cfg_key`, `cfg_value`) VALUES ('rgpd_retention_years', '2');
