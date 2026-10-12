-- WhatsApp messages from Chalkpis to a centre itself (not to a parent): the welcome when a centre is created.
-- One row per centre and kind, so a message is never sent twice; the admin dashboard shows how it went.
CREATE TABLE IF NOT EXISTS centre_messages (
  institute_id CHAR(36) NOT NULL,
  type ENUM('welcome') NOT NULL,
  to_last4 CHAR(4) NOT NULL,
  status ENUM('sending','sent','failed') NOT NULL DEFAULT 'sending',
  provider_id VARCHAR(80) NULL,
  error VARCHAR(80) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  sent_at DATETIME(3) NULL,
  PRIMARY KEY (institute_id, type),
  CONSTRAINT fk_centre_messages_institute FOREIGN KEY (institute_id) REFERENCES institutes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
