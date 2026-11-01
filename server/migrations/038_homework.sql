-- Homework. Decision 152.
-- A piece of homework is set for one batch (a title like "Exercise 4.2, Q1-10", the subject, optional details, the day
-- it was set and the day it is due). Checking it is one row per student in homework_checks: done or missing. No row
-- means not checked yet. Removing a batch removes its homework; removing a student removes their checks.
CREATE TABLE IF NOT EXISTS homework (
  id CHAR(36) NOT NULL PRIMARY KEY,
  institute_id CHAR(36) NOT NULL,
  batch_id CHAR(36) NOT NULL,
  title VARCHAR(160) NOT NULL,
  subject VARCHAR(80) NOT NULL DEFAULT '',
  details VARCHAR(2000) NOT NULL DEFAULT '',
  set_on DATE NOT NULL,
  due_on DATE NOT NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_homework_inst_id (institute_id, id),
  KEY ix_homework_batch_due (institute_id, batch_id, due_on),
  KEY ix_homework_due (institute_id, due_on),
  CONSTRAINT fk_homework_batch FOREIGN KEY (institute_id, batch_id) REFERENCES batches (institute_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS homework_checks (
  institute_id CHAR(36) NOT NULL,
  homework_id CHAR(36) NOT NULL,
  student_id CHAR(36) NOT NULL,
  status ENUM('done','missing') NOT NULL,
  checked_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (homework_id, student_id),
  KEY ix_hw_checks_student (institute_id, student_id),
  CONSTRAINT fk_hw_checks_homework FOREIGN KEY (institute_id, homework_id) REFERENCES homework (institute_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_hw_checks_student FOREIGN KEY (institute_id, student_id) REFERENCES students (institute_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
