-- Today's tasks (the tutor's own to-do list), student date of birth and gender, and the tutor's own payment link.
CREATE TABLE IF NOT EXISTS tasks (
  id CHAR(36) NOT NULL PRIMARY KEY,
  institute_id CHAR(36) NOT NULL,
  title VARCHAR(200) NOT NULL,
  due_on DATE NOT NULL,
  done TINYINT(1) NOT NULL DEFAULT 0,
  done_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_tasks_inst_due (institute_id, due_on),
  CONSTRAINT fk_tasks_institute FOREIGN KEY (institute_id) REFERENCES institutes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE students
  ADD COLUMN dob DATE NULL AFTER class,
  ADD COLUMN gender ENUM('','male','female','other') NOT NULL DEFAULT '' AFTER dob;

-- When set, fee reminders send this link (the tutor's own gateway) instead of the UPI QR.
ALTER TABLE institutes ADD COLUMN payment_link VARCHAR(300) NOT NULL DEFAULT '' AFTER upi_id;
