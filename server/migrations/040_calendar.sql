-- The centre's calendar. Decision 154.
-- The weekly timetable comes from the batches themselves (days, start and end time, helpers). This table holds what
-- is not a regular class: holidays, exam days, events and parent meetings, on one day or across several, for the
-- whole centre (batch_id NULL) or one batch. Tests and homework due days are shown from their own tables.
CREATE TABLE IF NOT EXISTS calendar_events (
  id CHAR(36) NOT NULL PRIMARY KEY,
  institute_id CHAR(36) NOT NULL,
  title VARCHAR(120) NOT NULL,
  kind ENUM('holiday','exam','event','meeting') NOT NULL DEFAULT 'event',
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  batch_id CHAR(36) NULL,
  notes VARCHAR(500) NOT NULL DEFAULT '',
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_calendar_events_range (institute_id, starts_on, ends_on),
  CONSTRAINT fk_calendar_events_institute FOREIGN KEY (institute_id) REFERENCES institutes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
