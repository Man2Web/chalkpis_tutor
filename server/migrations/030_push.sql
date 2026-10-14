-- Push notifications to the app (Expo push service). One row per device token; a token belongs to the user who last
-- signed in on that device. push_log keeps each notification's key, so a job run twice (or two servers) sends once.
CREATE TABLE IF NOT EXISTS push_tokens (
  token VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  platform ENUM('ios','android') NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_push_user (user_id),
  CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS push_log (
  push_key VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  sent_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
