-- Batches, students, and which students are in which batches.
-- (institute_id, id) is unique on both tables so the link table can use composite foreign keys:
-- the database itself refuses to link a student to a batch of another institute.

CREATE TABLE IF NOT EXISTS batches (
  id CHAR(36) NOT NULL PRIMARY KEY,
  institute_id CHAR(36) NOT NULL,
  name VARCHAR(60) NOT NULL,
  subject VARCHAR(60) NOT NULL,
  class VARCHAR(30) NOT NULL DEFAULT '',
  days VARCHAR(40) NOT NULL,
  start_time CHAR(5) NOT NULL,
  end_time CHAR(5) NOT NULL,
  default_fee BIGINT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_batches_inst_id (institute_id, id),
  KEY ix_batches_inst_status (institute_id, status, name),
  CONSTRAINT fk_batches_institute FOREIGN KEY (institute_id) REFERENCES institutes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS students (
  id CHAR(36) NOT NULL PRIMARY KEY,
  institute_id CHAR(36) NOT NULL,
  name VARCHAR(80) NOT NULL,
  phone VARCHAR(16) NOT NULL DEFAULT '',
  parent_name VARCHAR(80) NOT NULL DEFAULT '',
  parent_phone VARCHAR(16) NOT NULL,
  class VARCHAR(30) NOT NULL DEFAULT '',
  photo_path VARCHAR(255) NULL,
  joined_at DATETIME(3) NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  monthly_fee BIGINT UNSIGNED NOT NULL DEFAULT 0,
  fee_cycle ENUM('monthly','quarterly','one-time') NOT NULL DEFAULT 'monthly',
  due_day TINYINT UNSIGNED NOT NULL DEFAULT 1,
  discount BIGINT UNSIGNED NOT NULL DEFAULT 0,
  notify_parent TINYINT(1) NOT NULL DEFAULT 1,
  notes VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_students_inst_id (institute_id, id),
  KEY ix_students_inst_status_name (institute_id, status, name),
  KEY ix_students_inst_parent (institute_id, parent_phone),
  CONSTRAINT fk_students_institute FOREIGN KEY (institute_id) REFERENCES institutes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_batches (
  institute_id CHAR(36) NOT NULL,
  student_id CHAR(36) NOT NULL,
  batch_id CHAR(36) NOT NULL,
  PRIMARY KEY (student_id, batch_id),
  KEY ix_sb_batch (institute_id, batch_id),
  CONSTRAINT fk_sb_student FOREIGN KEY (institute_id, student_id) REFERENCES students (institute_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_sb_batch FOREIGN KEY (institute_id, batch_id) REFERENCES batches (institute_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
