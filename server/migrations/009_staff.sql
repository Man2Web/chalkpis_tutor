-- Staff (helpers the owner invites by phone number). A staff member belongs to one institute through `memberships`
-- (role 'staff') and is assigned batches: they can take attendance for those batches only. Removing the membership
-- removes the assignments (cascade), so removing a helper ends all their access at once.
ALTER TABLE memberships ADD UNIQUE KEY uq_memberships_inst_user (institute_id, user_id);

CREATE TABLE IF NOT EXISTS staff_batches (
  institute_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  batch_id CHAR(36) NOT NULL,
  PRIMARY KEY (user_id, batch_id),
  KEY ix_staff_batches_batch (institute_id, batch_id),
  CONSTRAINT fk_sb_member FOREIGN KEY (institute_id, user_id) REFERENCES memberships (institute_id, user_id) ON DELETE CASCADE,
  CONSTRAINT fk_sb_staffbatch FOREIGN KEY (institute_id, batch_id) REFERENCES batches (institute_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
