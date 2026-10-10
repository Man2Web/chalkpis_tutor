-- Admin dashboard: the platform owner (numbers in ADMIN_PHONES) can see every login and block, sign out or extend.
-- A blocked user cannot sign in, and every request with an old token is refused at once.
ALTER TABLE users
  ADD COLUMN blocked_at DATETIME(3) NULL,
  ADD COLUMN blocked_reason VARCHAR(200) NOT NULL DEFAULT '',
  ADD COLUMN last_login_at DATETIME(3) NULL;

-- Every admin action, who did it and to whom. Kept when the target account is deleted.
CREATE TABLE IF NOT EXISTS admin_audit (
  id CHAR(36) NOT NULL PRIMARY KEY,
  admin_user_id CHAR(36) NULL,
  admin_phone VARCHAR(16) NOT NULL,
  action VARCHAR(40) NOT NULL,
  target_user_id CHAR(36) NULL,
  target_phone VARCHAR(16) NOT NULL DEFAULT '',
  target_institute_id CHAR(36) NULL,
  detail VARCHAR(300) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
