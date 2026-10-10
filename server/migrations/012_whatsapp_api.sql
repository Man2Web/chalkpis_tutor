-- Every parent message goes through the WhatsApp API: fee reminders the tutor sends now (with the UPI QR as a picture,
-- or the tutor's payment link), the private parent page link, and receipts sent again on request.
-- `manual` = the tutor pressed Send for this one: it goes out even when automatic messages are switched off.
-- `media_url` = public picture for a template with an image header (the signed UPI QR link).
ALTER TABLE messages
  MODIFY type ENUM('absent','late','fee_due','fee_overdue','payment_received','fee_reminder','fee_link','parent_link') NOT NULL,
  ADD COLUMN manual TINYINT(1) NOT NULL DEFAULT 0 AFTER lang,
  ADD COLUMN media_url VARCHAR(600) NULL AFTER vars,
  MODIFY template_id VARCHAR(80) NULL;

-- Messages are English only now.
UPDATE notify_settings SET language = 'en';
