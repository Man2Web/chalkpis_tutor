-- Admin dashboard, next level: a history of sign-ins (for charts) and announcements shown to tutors in the app.
CREATE TABLE IF NOT EXISTS login_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_login_events_created (created_at),
  KEY ix_login_events_user (user_id, created_at),
  CONSTRAINT fk_login_events_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A notice from Chalkpis to every tutor (new feature, maintenance...). Shown as a banner on Home while live.
CREATE TABLE IF NOT EXISTS announcements (
  id CHAR(36) NOT NULL PRIMARY KEY,
  title VARCHAR(80) NOT NULL,
  body VARCHAR(400) NOT NULL DEFAULT '',
  tone ENUM('info','success','warning') NOT NULL DEFAULT 'info',
  audience ENUM('all','owners','staff') NOT NULL DEFAULT 'all',
  link VARCHAR(300) NOT NULL DEFAULT '',
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NULL,
  created_by VARCHAR(16) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_announcements_live (starts_at, ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
