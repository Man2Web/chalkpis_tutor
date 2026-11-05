-- The admin team (decision 158). ADMIN_EMAILS stays the list of super admins (the product owner); everyone else on the
-- dashboard is a row here with a role the super admin picks on the Team page:
--   admin   - runs everything day to day (plans, payments, blocks, announcements), asks for deletions
--   support - customer support: looks people and centres up, helps with sign-in and messages, keeps notes
-- A removed member keeps the row (for the audit log) and loses access at once. Rows made for ADMIN_EMAILS have no role:
-- taken out of that setting, they have no access at all (as before).
ALTER TABLE admin_accounts
  ADD COLUMN role ENUM('admin','support') NULL AFTER email,
  ADD COLUMN name VARCHAR(80) NOT NULL DEFAULT '' AFTER role,
  ADD COLUMN added_by VARCHAR(254) NOT NULL DEFAULT '' AFTER name,
  ADD COLUMN removed_at DATETIME(3) NULL AFTER last_login_at;

-- The first team, as the owner asked on 5 Nov 2026. They set their own password with "First time? Set a password".
INSERT IGNORE INTO admin_accounts (id, email, role, name, added_by) VALUES
  (UUID(), 'vignesh@man2web.com', 'admin', 'Vignesh', 'hello@man2web.com'),
  (UUID(), 'sanjaykumar@man2web.com', 'support', 'Sanjay Kumar', 'hello@man2web.com');

-- Deleting test and dummy centres or people: anyone allowed asks, a 6-digit code goes to the super admin's email, and
-- only that code deletes. One request can hold several centres or several people (all of one kind).
CREATE TABLE IF NOT EXISTS admin_deletions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  requested_by CHAR(36) NOT NULL,
  requested_email VARCHAR(254) NOT NULL,
  kind ENUM('centre','person') NOT NULL,
  -- JSON array of institute or user ids
  targets TEXT NOT NULL,
  -- what goes, in words, for the email and the audit log
  summary VARCHAR(1000) NOT NULL,
  reason VARCHAR(200) NOT NULL DEFAULT '',
  code_hash CHAR(64) NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('pending','done','cancelled') NOT NULL DEFAULT 'pending',
  expires_at DATETIME(3) NOT NULL,
  done_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_admin_deletions_by (requested_by, created_at),
  CONSTRAINT fk_admin_deletions_by FOREIGN KEY (requested_by) REFERENCES admin_accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WhatsApp spend (decision 159). Every message the gateway accepts is counted here per Indian day, centre and kind
-- (login_code, absent, fee_reminder, centre_welcome, ...). Kept for good, with no link to the centre, so spend stays
-- known after messages are cleaned up or a centre is deleted. institute_id '' = no centre (a login code to someone who
-- has not set one up).
CREATE TABLE IF NOT EXISTS wa_usage (
  day DATE NOT NULL,
  institute_id CHAR(36) NOT NULL DEFAULT '',
  kind VARCHAR(30) NOT NULL,
  sent INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (day, institute_id, kind),
  KEY ix_wa_usage_institute (institute_id, day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- What was sent before metering began, from the message tables (login codes are not kept, so they start now).
INSERT INTO wa_usage (day, institute_id, kind, sent)
  SELECT DATE(CONVERT_TZ(sent_at, '+00:00', '+05:30')), institute_id, type, COUNT(*)
    FROM messages WHERE status = 'sent' AND sent_at IS NOT NULL
   GROUP BY 1, 2, 3
  ON DUPLICATE KEY UPDATE sent = sent + VALUES(sent);
INSERT INTO wa_usage (day, institute_id, kind, sent)
  SELECT DATE(CONVERT_TZ(sent_at, '+00:00', '+05:30')), institute_id, type, COUNT(*)
    FROM centre_messages WHERE status = 'sent' AND sent_at IS NOT NULL
   GROUP BY 1, 2, 3
  ON DUPLICATE KEY UPDATE sent = sent + VALUES(sent);

-- What the gateway charges per message, in paise (fractions allowed), by WhatsApp's category, plus which kinds of
-- message are not utility (JSON, e.g. {"centre_welcome":"marketing"}), and when to warn about the balance.
CREATE TABLE IF NOT EXISTS wa_billing (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  utility_paise DECIMAL(8,2) NOT NULL DEFAULT 20.00,
  authentication_paise DECIMAL(8,2) NOT NULL DEFAULT 20.00,
  marketing_paise DECIMAL(8,2) NOT NULL DEFAULT 95.00,
  categories VARCHAR(1000) NOT NULL DEFAULT '{}',
  warn_days TINYINT UNSIGNED NOT NULL DEFAULT 7,
  warn_below_paise INT UNSIGNED NOT NULL DEFAULT 50000,
  last_warned_at DATETIME(3) NULL,
  updated_by VARCHAR(254) NOT NULL DEFAULT '',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO wa_billing (id) VALUES (1);

-- The WhatsApp wallet at the gateway: recharges, and the balance as read on wa.adsme.in at a moment. The balance
-- shown is the newest reading, plus recharges after it, less the estimated spend since.
CREATE TABLE IF NOT EXISTS wa_wallet (
  id CHAR(36) NOT NULL PRIMARY KEY,
  kind ENUM('recharge','balance') NOT NULL,
  amount_paise BIGINT NOT NULL,
  -- a balance reading: the estimated spend of that Indian day up to the reading, already taken off at the gateway
  day_spent_paise DECIMAL(12,2) NOT NULL DEFAULT 0,
  note VARCHAR(200) NOT NULL DEFAULT '',
  at DATETIME(3) NOT NULL,
  created_by VARCHAR(254) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_wa_wallet_at (at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
