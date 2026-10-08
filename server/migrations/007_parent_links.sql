-- Private read-only links for parents. Only the SHA-256 of the 256-bit token is stored: the token itself exists only in
-- the link the tutor shares. A link belongs to one student of one institute (composite foreign key).

CREATE TABLE IF NOT EXISTS parent_links (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  institute_id CHAR(36) NOT NULL,
  student_id CHAR(36) NOT NULL,
  created_by CHAR(36) NOT NULL,
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_links_student (institute_id, student_id, revoked),
  CONSTRAINT fk_links_student FOREIGN KEY (institute_id, student_id) REFERENCES students (institute_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
