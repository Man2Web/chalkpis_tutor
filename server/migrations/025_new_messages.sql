-- Two more parent messages: a welcome when a student is added, and a note when today's class is cancelled (a holiday
-- marked for today). Both follow the master switch and can be turned off on their own, like the others.
ALTER TABLE messages
  MODIFY type ENUM('absent','late','fee_due','fee_overdue','payment_received','fee_reminder','fee_link','parent_link',
                   'student_welcome','class_cancelled') NOT NULL;

ALTER TABLE notify_settings
  ADD COLUMN student_welcome TINYINT(1) NOT NULL DEFAULT 1 AFTER payment_received,
  ADD COLUMN class_cancelled TINYINT(1) NOT NULL DEFAULT 1 AFTER student_welcome;

-- Messages from Chalkpis to a centre's own people: the owner (welcome, trial ending, plan active) and a new helper
-- (invite). Like parent messages, each is queued in the same transaction as its event and sent by the worker with
-- retries. (institute_id, type, ref) is unique, so the same event never queues twice: ref is '' for the welcome, the
-- trial's end date, the payment id, or the helper's user id. The number is read from the user at send time.
ALTER TABLE centre_messages
  MODIFY type ENUM('centre_welcome','trial_ending','plan_active','helper_invite') NOT NULL,
  ADD COLUMN ref VARCHAR(64) NOT NULL DEFAULT '' AFTER type,
  ADD COLUMN user_id CHAR(36) NOT NULL DEFAULT '' AFTER ref,
  ADD COLUMN vars TEXT NULL AFTER to_last4,
  MODIFY status ENUM('queued','sending','sent','failed','skipped') NOT NULL DEFAULT 'queued',
  ADD COLUMN reason VARCHAR(40) NULL AFTER status,
  ADD COLUMN attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN next_attempt_at DATETIME(3) NULL,
  ADD COLUMN claim CHAR(36) NULL,
  ADD COLUMN claimed_at DATETIME(3) NULL,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (institute_id, type, ref),
  ADD KEY ix_centre_messages_queue (status, next_attempt_at);
