-- Tests and marks. Decision 151.
-- A test ("Unit test 1", "Monthly test", "Belt grading") is given to one batch on one day, out of max_marks. Each
-- student's result is a row in exam_marks: the marks, or absent (so a 0 and a missed test never look alike), and an
-- optional remark for the parent. Marks may have halves (45.5), hence DECIMAL. A test belongs to its batch; removing
-- a student removes their marks.
CREATE TABLE IF NOT EXISTS exams (
  id CHAR(36) NOT NULL PRIMARY KEY,
  institute_id CHAR(36) NOT NULL,
  batch_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  subject VARCHAR(80) NOT NULL DEFAULT '',
  exam_date DATE NOT NULL,
  max_marks DECIMAL(7,2) NOT NULL,
  -- the share of max_marks needed to pass (35 for most Indian boards)
  pass_percent TINYINT UNSIGNED NOT NULL DEFAULT 35,
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_exams_inst_id (institute_id, id),
  KEY ix_exams_batch_date (institute_id, batch_id, exam_date),
  KEY ix_exams_date (institute_id, exam_date),
  CONSTRAINT fk_exams_batch FOREIGN KEY (institute_id, batch_id) REFERENCES batches (institute_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exam_marks (
  institute_id CHAR(36) NOT NULL,
  exam_id CHAR(36) NOT NULL,
  student_id CHAR(36) NOT NULL,
  marks DECIMAL(7,2) NULL,
  absent TINYINT(1) NOT NULL DEFAULT 0,
  remark VARCHAR(200) NOT NULL DEFAULT '',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (exam_id, student_id),
  KEY ix_marks_student (institute_id, student_id),
  CONSTRAINT fk_marks_exam FOREIGN KEY (institute_id, exam_id) REFERENCES exams (institute_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_marks_student FOREIGN KEY (institute_id, student_id) REFERENCES students (institute_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
