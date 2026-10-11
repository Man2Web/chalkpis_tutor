-- Customer-success tools in the admin dashboard: internal notes and tags on a centre. Never shown to tutors.
CREATE TABLE IF NOT EXISTS admin_notes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  institute_id CHAR(36) NOT NULL,
  author_phone VARCHAR(16) NOT NULL,
  body VARCHAR(1000) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_admin_notes_inst (institute_id, created_at),
  CONSTRAINT fk_admin_notes_inst FOREIGN KEY (institute_id) REFERENCES institutes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_tags (
  institute_id CHAR(36) NOT NULL,
  tag VARCHAR(24) NOT NULL,
  PRIMARY KEY (institute_id, tag),
  CONSTRAINT fk_admin_tags_inst FOREIGN KEY (institute_id) REFERENCES institutes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
