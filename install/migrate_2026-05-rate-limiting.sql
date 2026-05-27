-- ============================================================
-- Migration CultuRézo — 2026-05 : rate limiting des tentatives d'auth
-- ============================================================
-- Ajoute la table auth_attempts pour tracer les tentatives de :
--   - login            (kind='login',         succeeded=0/1)
--   - password_reset   (kind='password_reset', succeeded=1 toujours, on compte tout)
--
-- Index couvrant (kind, attempted_at) + (email, kind, attempted_at) + (ip, kind, attempted_at)
-- pour des lookups O(log n) sur la fenêtre temporelle glissante.
--
-- Cleanup : géré inline dans Auth::recordAttempt (1% chance de DELETE > 1 jour).
-- Si vous préférez un cron : ajoutez `0 4 * * * mysql -e "DELETE FROM auth_attempts
-- WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 1 DAY)"`.
-- ============================================================

CREATE TABLE IF NOT EXISTS auth_attempts (
    id           INT          NOT NULL AUTO_INCREMENT,
    kind         VARCHAR(32)  NOT NULL,
    email        VARCHAR(255) NOT NULL DEFAULT '',
    ip           VARCHAR(45)  NOT NULL DEFAULT '',
    succeeded    TINYINT(1)   NOT NULL DEFAULT 0,
    attempted_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_kind_time       (kind, attempted_at),
    KEY idx_email_kind_time (email, kind, attempted_at),
    KEY idx_ip_kind_time    (ip, kind, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
