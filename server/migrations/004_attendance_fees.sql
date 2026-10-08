-- Attendance (one row per batch per day, one row per student mark) and fees (dues + an append-only payment ledger).
-- Every child row repeats institute_id and uses composite foreign keys, so the database itself refuses any link
-- that crosses institutes. Dates are plain DATE (Indian calendar day); money is integer paise.

CREATE TABLE IF NOT EXISTS attendance_days (
  id CHAR(36) NOT NULL PRIMARY KEY,
  institute_id CHAR(36) NOT NULL,
  batch_id CHAR(36) NOT NULL,
  day DATE NOT NULL,
  holiday ENUM('holiday','cancelled') NULL,
  marked_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_att_days_inst_id (institute_id, id),
  UNIQUE KEY uq_att_days_batch_day (institute_id, batch_id, day),
  KEY ix_att_days_inst_day (institute_id, day),
  CONSTRAINT fk_att_days_batch FOREIGN KEY (institute_id, batch_id) REFERENCES batches (institute_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance_marks (
  institute_id CHAR(36) NOT NULL,
  day_id CHAR(36) NOT NULL,
  student_id CHAR(36) NOT NULL,
  mark ENUM('P','A','L') NOT NULL,
  PRIMARY KEY (day_id, student_id),
  KEY ix_att_marks_student (institute_id, student_id),
  CONSTRAINT fk_att_marks_day FOREIGN KEY (institute_id, day_id) REFERENCES attendance_days (institute_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_att_marks_student FOREIGN KEY (institute_id, student_id) REFERENCES students (institute_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- due_key is set only for the regular fee of a period ("<student>_<period>"), so generating dues twice can never
-- create a second one. One-off charges leave it NULL and may repeat.
CREATE TABLE IF NOT EXISTS fee_dues (
  id CHAR(36) NOT NULL PRIMARY KEY,
  institute_id CHAR(36) NOT NULL,
  student_id CHAR(36) NOT NULL,
  batch_id CHAR(36) NULL,
  period CHAR(7) NOT NULL,
  amount BIGINT UNSIGNED NOT NULL,
  discount BIGINT UNSIGNED NOT NULL DEFAULT 0,
  paid BIGINT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('pending','partial','paid','waived') NOT NULL DEFAULT 'pending',
  due_date DATE NOT NULL,
  description VARCHAR(120) NOT NULL,
  kind ENUM('regular','charge') NOT NULL DEFAULT 'regular',
  due_key VARCHAR(80) NULL,
  waived_note VARCHAR(200) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_dues_inst_id (institute_id, id),
  UNIQUE KEY uq_dues_key (institute_id, due_key),
  KEY ix_dues_student (institute_id, student_id, due_date),
  KEY ix_dues_status_date (institute_id, status, due_date),
  KEY ix_dues_period (institute_id, period),
  CONSTRAINT fk_dues_student FOREIGN KEY (institute_id, student_id) REFERENCES students (institute_id, id) ON DELETE CASCADE,
  CONSTRAINT chk_dues_discount CHECK (discount <= amount),
  CONSTRAINT chk_dues_paid CHECK (CAST(paid AS SIGNED) <= CAST(amount AS SIGNED) - CAST(discount AS SIGNED) OR status = 'waived')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Payments are never edited or deleted: a correction is a second, negative row pointing at the original.
-- (institute_id, reversal_of) is unique, so a payment can be reversed at most once even under a race.
CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  institute_id CHAR(36) NOT NULL,
  student_id CHAR(36) NOT NULL,
  due_id CHAR(36) NOT NULL,
  batch_id CHAR(36) NULL,
  amount BIGINT NOT NULL,
  mode ENUM('cash','upi','bank','other') NOT NULL,
  paid_at DATETIME(3) NOT NULL,
  receipt_no VARCHAR(20) NULL,
  note VARCHAR(200) NOT NULL DEFAULT '',
  recorded_by CHAR(36) NOT NULL,
  balance_after BIGINT UNSIGNED NULL,
  reversal_of CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_pay_inst_id (institute_id, id),
  UNIQUE KEY uq_pay_receipt (institute_id, receipt_no),
  UNIQUE KEY uq_pay_reversal (institute_id, reversal_of),
  KEY ix_pay_student (institute_id, student_id, paid_at),
  KEY ix_pay_date (institute_id, paid_at),
  KEY ix_pay_due (institute_id, due_id),
  CONSTRAINT fk_pay_due FOREIGN KEY (institute_id, due_id) REFERENCES fee_dues (institute_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_pay_student FOREIGN KEY (institute_id, student_id) REFERENCES students (institute_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
