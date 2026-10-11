-- Per-centre logs for the admin dashboard: how each sign-in happened, and every change a centre makes.

-- WhatsApp / Google / Apple / email, and the phone it came from (ios / android). Empty for older rows.
ALTER TABLE login_events
  ADD COLUMN method VARCHAR(10) NULL,
  ADD COLUMN platform VARCHAR(10) NULL;

-- One row per successful change inside a centre: a student added, attendance saved, a fee recorded, a setting
-- changed... Who did it, what it was about ("Riya Sharma", "Class 10 Maths") and a short detail ("₹1,500").
CREATE TABLE IF NOT EXISTS activity_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  institute_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  action VARCHAR(40) NOT NULL,
  subject VARCHAR(120) NOT NULL DEFAULT '',
  detail VARCHAR(200) NOT NULL DEFAULT '',
  platform VARCHAR(10) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_activity_institute (institute_id, created_at),
  KEY ix_activity_created (created_at),
  CONSTRAINT fk_activity_institute FOREIGN KEY (institute_id) REFERENCES institutes (id) ON DELETE CASCADE,
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
