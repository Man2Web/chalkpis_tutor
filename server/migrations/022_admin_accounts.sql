-- The admin dashboard gets its own sign-in, separate from the tutor app: email + password + a code emailed at
-- every sign-in. Who may be an admin is the ADMIN_EMAILS setting; rows here hold the password and lockout state.
CREATE TABLE IF NOT EXISTS admin_accounts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  -- scrypt, salted and peppered with a server secret; NULL until set with "Forgot password"
  password_hash VARCHAR(255) NULL,
  password_set_at DATETIME(3) NULL,
  failed_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME(3) NULL,
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_admin_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Codes emailed to an admin: at sign-in (after the password, bound to that attempt) and to reset the password.
CREATE TABLE IF NOT EXISTS admin_codes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  admin_id CHAR(36) NOT NULL,
  purpose ENUM('login','reset') NOT NULL,
  code_hash CHAR(64) NOT NULL,
  -- sign-in only: the hash of the secret the browser got after the right password
  challenge_hash CHAR(64) NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME(3) NOT NULL,
  consumed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_admin_codes (admin_id, purpose, created_at),
  CONSTRAINT fk_admin_codes FOREIGN KEY (admin_id) REFERENCES admin_accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- An admin session: a random token (only its hash is kept), 8 hours at most, ended after 30 idle minutes.
CREATE TABLE IF NOT EXISTS admin_sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  admin_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  ip VARCHAR(45) NOT NULL DEFAULT '',
  user_agent VARCHAR(200) NOT NULL DEFAULT '',
  expires_at DATETIME(3) NOT NULL,
  last_seen_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_admin_session (token_hash),
  KEY ix_admin_sessions (admin_id),
  CONSTRAINT fk_admin_sessions FOREIGN KEY (admin_id) REFERENCES admin_accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Admins are now identified by email in the audit log, notes and announcements.
ALTER TABLE admin_audit MODIFY admin_phone VARCHAR(254) NOT NULL;
ALTER TABLE admin_notes MODIFY author_phone VARCHAR(254) NOT NULL;
ALTER TABLE announcements MODIFY created_by VARCHAR(254) NOT NULL;
