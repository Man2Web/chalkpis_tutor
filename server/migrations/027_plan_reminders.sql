-- Reminders to a centre's owner with the centre's own pay link: before its free trial or paid plan ends
-- (plan_ending) and on the day it ended (plan_ended). Both carry an image header, the kind of WhatsApp template that
-- is delivered. The ref is the plan's end date, so each end date is reminded about once.
ALTER TABLE centre_messages
  MODIFY type ENUM('centre_welcome','trial_ending','plan_active','helper_invite','plan_ending','plan_ended') NOT NULL;
