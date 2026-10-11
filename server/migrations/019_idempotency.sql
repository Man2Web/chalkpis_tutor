-- Safe retries. The app sends an Idempotency-Key with every create / money request; the same key from the same
-- person gets the first answer back instead of doing the work twice (a double tap, a retry after a timeout).
CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id CHAR(36) NOT NULL,
  idem_key VARCHAR(100) NOT NULL,
  route VARCHAR(200) NOT NULL,
  -- NULL while the first request is still running
  status SMALLINT NULL,
  body MEDIUMTEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, idem_key),
  KEY ix_idem_created (created_at),
  CONSTRAINT fk_idem_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- An OAuth state may be used once (a replayed callback is refused); its nonce is remembered here until it expires.
ALTER TABLE auth_tickets MODIFY kind ENUM('oauth','signup','state') NOT NULL;
