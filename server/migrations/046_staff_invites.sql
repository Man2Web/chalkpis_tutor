-- Helpers accept before they join (decided 9 Nov 2026, security audit). An owner's "add helper" no longer makes the
-- number a member at once: it makes an invite here and sends the WhatsApp invite. The person signs in, sees
-- "Join <centre>?" and accepts (the membership and batches are made then) or declines. Until then nothing ties them to
-- the centre, so they can still set up their own, and the owner's answer is the same whether or not the number is
-- in another centre (no way to find out who uses the app elsewhere). Helpers already added stay as they are.
-- user_id is the invited person's login (made bare, phone and name only, if they had none) so the WhatsApp invite
-- can be addressed like every other centre message. batch_ids is the comma-separated list chosen by the owner.
CREATE TABLE IF NOT EXISTS staff_invites (
  institute_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(80) NOT NULL DEFAULT '',
  batch_ids TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (institute_id, user_id),
  KEY ix_staff_invites_user (user_id),
  CONSTRAINT fk_staff_invites_institute FOREIGN KEY (institute_id) REFERENCES institutes (id) ON DELETE CASCADE,
  CONSTRAINT fk_staff_invites_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
