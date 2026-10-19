-- Yearly fees paid in instalments. Decision 148.
-- A centre that collects a year's fee (often in 2-4 parts) gives a student a fee plan: a title ("Yearly fee 2026-27"),
-- and parts with their own amount and due date. Each part is an ordinary due (kind 'instalment', plan_id set), so
-- collecting, receipts, reminders, reports and the parent page all work as for any other due. A student on a plan has
-- fee_cycle 'yearly' (monthly_fee then holds the year's total) and gets no automatic monthly dues.
ALTER TABLE students
  MODIFY fee_cycle ENUM('monthly','quarterly','one-time','yearly') NOT NULL DEFAULT 'monthly';

CREATE TABLE IF NOT EXISTS fee_plans (
  id CHAR(36) NOT NULL PRIMARY KEY,
  institute_id CHAR(36) NOT NULL,
  student_id CHAR(36) NOT NULL,
  title VARCHAR(60) NOT NULL,
  total BIGINT UNSIGNED NOT NULL,
  parts TINYINT UNSIGNED NOT NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_plans_inst_id (institute_id, id),
  -- the same plan twice for one student is a mistake (a double tap, or a batch applied twice)
  UNIQUE KEY uq_plans_student_title (institute_id, student_id, title),
  CONSTRAINT fk_plans_student FOREIGN KEY (institute_id, student_id) REFERENCES students (institute_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- No foreign key from the due to its plan: removing a plan deletes only its unpaid parts (fees/service.ts), and a
-- student's deletion already removes both through their own keys.
ALTER TABLE fee_dues
  MODIFY kind ENUM('regular','charge','instalment') NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS plan_id CHAR(36) NULL AFTER kind,
  ADD KEY IF NOT EXISTS ix_dues_plan (institute_id, plan_id);
