-- Sign-in with Google, Apple and email, next to the WhatsApp code. A person is still one users row (with a verified
-- mobile number); each way they can sign in is an identity pointing at it.

ALTER TABLE users
  ADD COLUMN email VARCHAR(254) NULL,
  ADD COLUMN email_verified_at DATETIME(3) NULL,
  ADD UNIQUE KEY uq_users_email (email);

-- provider + subject is the stable id the provider gives (Google/Apple "sub"; for email, the address itself).
CREATE TABLE IF NOT EXISTS auth_identities (
  provider ENUM('google','apple','email') NOT NULL,
  subject VARCHAR(255) NOT NULL,
  user_id CHAR(36) NOT NULL,
  email VARCHAR(254) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_used_at DATETIME(3) NULL,
  PRIMARY KEY (provider, subject),
  KEY ix_identities_user (user_id),
  CONSTRAINT fk_identities_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sign-in codes sent by email. Same rules as otp_codes: stored as hashes, one minute apart, five tries.
CREATE TABLE IF NOT EXISTS email_codes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  consumed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_email_codes (email, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One-time tickets: "oauth" carries a Google/Apple sign-in from the browser back to the app (two minutes);
-- "signup" holds a new Google/Apple/email identity while the person verifies their mobile number (fifteen minutes).
CREATE TABLE IF NOT EXISTS auth_tickets (
  id CHAR(36) NOT NULL PRIMARY KEY,
  token_hash CHAR(64) NOT NULL,
  kind ENUM('oauth','signup') NOT NULL,
  payload TEXT NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_tickets_hash (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
