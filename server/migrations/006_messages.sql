-- Parent messages (WhatsApp). One table is both the queue and the log. A message is queued in the same transaction
-- as the event that caused it (attendance saved, payment recorded), so it can never be lost or sent for something that
-- was rolled back; a worker sends it afterwards, with retries. (institute_id, dedupe_key) is unique, so the same event
-- can never queue twice. The parent's number is NOT copied here (only its last 4 digits, for the log): the worker reads
-- the student's current number at send time. `vars` (the template values) is cleared once the message is final.

CREATE TABLE IF NOT EXISTS notify_settings (
  institute_id CHAR(36) NOT NULL PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  absent TINYINT(1) NOT NULL DEFAULT 1,
  late TINYINT(1) NOT NULL DEFAULT 1,
  fee_due TINYINT(1) NOT NULL DEFAULT 1,
  fee_due_days_before TINYINT UNSIGNED NOT NULL DEFAULT 2,
  fee_overdue TINYINT(1) NOT NULL DEFAULT 1,
  overdue_every_days TINYINT UNSIGNED NOT NULL DEFAULT 7,
  payment_received TINYINT(1) NOT NULL DEFAULT 1,
  language ENUM('en','hi') NOT NULL DEFAULT 'en',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_notify_institute FOREIGN KEY (institute_id) REFERENCES institutes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id CHAR(36) NOT NULL PRIMARY KEY,
  institute_id CHAR(36) NOT NULL,
  student_id CHAR(36) NOT NULL,
  type ENUM('absent','late','fee_due','fee_overdue','payment_received') NOT NULL,
  dedupe_key VARCHAR(120) NOT NULL,
  lang ENUM('en','hi') NOT NULL,
  to_last4 CHAR(4) NOT NULL,
  vars TEXT NULL,
  status ENUM('queued','sending','sent','failed','skipped') NOT NULL DEFAULT 'queued',
  reason VARCHAR(40) NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  claim CHAR(36) NULL,
  claimed_at DATETIME(3) NULL,
  channel VARCHAR(20) NULL,
  template_id VARCHAR(40) NULL,
  provider_id VARCHAR(80) NULL,
  error VARCHAR(60) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  sent_at DATETIME(3) NULL,
  UNIQUE KEY uq_messages_dedupe (institute_id, dedupe_key),
  KEY ix_messages_queue (status, next_attempt_at),
  KEY ix_messages_claim (claim),
  KEY ix_messages_inst (institute_id, created_at),
  CONSTRAINT fk_messages_student FOREIGN KEY (institute_id, student_id) REFERENCES students (institute_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
