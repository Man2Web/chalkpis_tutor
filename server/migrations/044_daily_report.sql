-- The daily report (decision 167): at 6 am Indian time every centre's owner gets yesterday's attendance and fees and
-- today's classes, pending fees and follow-ups on WhatsApp, from the Chalkpis number. It is queued in centre_messages
-- like the other owner messages, once per centre and day (the ref is the report's day). On by default; the owner can
-- turn it off in Messages, which is its own switch, apart from the parent messages' master switch.
ALTER TABLE centre_messages
  MODIFY type ENUM('centre_welcome','trial_ending','plan_active','helper_invite','plan_ending','plan_ended',
                   'daily_report') NOT NULL;

ALTER TABLE notify_settings
  ADD COLUMN daily_report TINYINT(1) NOT NULL DEFAULT 1 AFTER class_cancelled;
