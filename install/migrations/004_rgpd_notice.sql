-- ============================================================
--  Migration RGPD — Préavis d'anonymisation
--
--  Ajoute users.deletion_notice_sent_at : date d'envoi de l'e-mail
--  prévenant l'utilisateur que son compte sera anonymisé sous 30
--  jours s'il ne se reconnecte pas. Effacé automatiquement lors
--  du login (= reconnexion → annulation du préavis).
--
--  À exécuter une seule fois sur une base existante.
-- ============================================================

ALTER TABLE `users`
  ADD COLUMN `deletion_notice_sent_at` DATETIME DEFAULT NULL AFTER `anonymized_at`;
