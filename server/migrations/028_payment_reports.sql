-- "I've paid": a parent says they paid a student's fees (straight to the tutor's UPI, which Chalkpis cannot see). The
-- tutor confirms it (the payment is recorded and the WhatsApp receipt goes out) or marks it not received. open_key is
-- the student id while the report is pending and NULL after, so a student has at most one pending report.
CREATE TABLE IF NOT EXISTS payment_reports (
  id CHAR(36) NOT NULL PRIMARY KEY,
  institute_id CHAR(36) NOT NULL,
  student_id CHAR(36) NOT NULL,
  amount BIGINT UNSIGNED NOT NULL,
  upi_ref VARCHAR(40) NOT NULL DEFAULT '',
  status ENUM('pending','confirmed','rejected') NOT NULL DEFAULT 'pending',
  open_key CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  decided_at DATETIME(3) NULL,
  decided_by CHAR(36) NULL,
  UNIQUE KEY uq_reports_open (open_key),
  KEY ix_reports_institute (institute_id, status, created_at),
  CONSTRAINT fk_reports_institute FOREIGN KEY (institute_id) REFERENCES institutes (id) ON DELETE CASCADE,
  CONSTRAINT fk_reports_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
