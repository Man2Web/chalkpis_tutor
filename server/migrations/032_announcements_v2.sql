-- Announcements as a proper communication tool: a category and a priority, a call-to-action (a web link or a screen in
-- the app), targeting by role, plan and kind of centre, the in-app banner and the push as separate channels, a push that
-- can be scheduled (and waits out the night), and what happened to each one (who saw, clicked, dismissed, opened it).
ALTER TABLE announcements
  ADD COLUMN category ENUM('update','feature','maintenance','billing','tip','policy') NOT NULL DEFAULT 'update' AFTER body,
  ADD COLUMN priority ENUM('normal','important','critical') NOT NULL DEFAULT 'normal' AFTER category,
  ADD COLUMN cta_label VARCHAR(30) NOT NULL DEFAULT '' AFTER link,
  ADD COLUMN screen VARCHAR(20) NOT NULL DEFAULT '' AFTER cta_label,
  ADD COLUMN plan_filter ENUM('any','trial','paid','ended') NOT NULL DEFAULT 'any' AFTER audience,
  ADD COLUMN centre_category VARCHAR(20) NOT NULL DEFAULT '' AFTER plan_filter,
  ADD COLUMN show_banner TINYINT(1) NOT NULL DEFAULT 1 AFTER centre_category,
  ADD COLUMN push TINYINT(1) NOT NULL DEFAULT 0 AFTER show_banner,
  ADD COLUMN push_status ENUM('none','scheduled','sending','sent','cancelled') NOT NULL DEFAULT 'none' AFTER push,
  ADD COLUMN push_at DATETIME(3) NULL AFTER push_status,
  ADD COLUMN push_sent_at DATETIME(3) NULL AFTER push_at,
  ADD COLUMN push_phones INT UNSIGNED NOT NULL DEFAULT 0 AFTER push_sent_at,
  ADD COLUMN push_sent INT UNSIGNED NOT NULL DEFAULT 0 AFTER push_phones,
  ADD COLUMN audience_size INT UNSIGNED NULL AFTER push_sent,
  ADD KEY ix_announcements_push (push_status, push_at);

CREATE TABLE IF NOT EXISTS announcement_events (
  announcement_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  seen_at DATETIME(3) NULL,
  clicked_at DATETIME(3) NULL,
  dismissed_at DATETIME(3) NULL,
  opened_at DATETIME(3) NULL,
  PRIMARY KEY (announcement_id, user_id),
  KEY ix_ann_events_user (user_id),
  CONSTRAINT fk_ann_events_announcement FOREIGN KEY (announcement_id) REFERENCES announcements (id) ON DELETE CASCADE,
  CONSTRAINT fk_ann_events_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
