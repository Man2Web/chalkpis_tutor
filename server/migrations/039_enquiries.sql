-- Enquiries and admissions. Decision 153.
-- Someone asks about classes (walk-in, a call, WhatsApp, a referral...): the centre notes the child, the contact
-- number, what they want and where they heard, then moves the enquiry along New → Follow-up → Trial class → Joined
-- (or Not interested), with a next follow-up day and a running list of notes. Joining makes a real student
-- (student_id). The batch they asked about is kept without a foreign key: archiving or deleting a batch must not
-- touch the enquiry, and a composite key could only be cleared together with institute_id.
CREATE TABLE IF NOT EXISTS enquiries (
  id CHAR(36) NOT NULL PRIMARY KEY,
  institute_id CHAR(36) NOT NULL,
  name VARCHAR(80) NOT NULL,
  parent_name VARCHAR(80) NOT NULL DEFAULT '',
  phone VARCHAR(20) NOT NULL,
  class VARCHAR(30) NOT NULL DEFAULT '',
  interest VARCHAR(120) NOT NULL DEFAULT '',
  batch_id CHAR(36) NULL,
  source ENUM('walk_in','phone','whatsapp','referral','social','poster','other') NOT NULL DEFAULT 'walk_in',
  status ENUM('new','follow_up','trial','joined','lost') NOT NULL DEFAULT 'new',
  next_follow_up DATE NULL,
  lost_reason VARCHAR(200) NOT NULL DEFAULT '',
  student_id CHAR(36) NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_enquiries_inst_id (institute_id, id),
  KEY ix_enquiries_status (institute_id, status, next_follow_up),
  KEY ix_enquiries_created (institute_id, created_at),
  CONSTRAINT fk_enquiries_institute FOREIGN KEY (institute_id) REFERENCES institutes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS enquiry_notes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  institute_id CHAR(36) NOT NULL,
  enquiry_id CHAR(36) NOT NULL,
  note VARCHAR(1000) NOT NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_enquiry_notes (institute_id, enquiry_id, created_at),
  CONSTRAINT fk_enquiry_notes FOREIGN KEY (institute_id, enquiry_id) REFERENCES enquiries (institute_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
