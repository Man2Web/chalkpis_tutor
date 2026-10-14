-- The dues that were open when the parent said "I've paid". Confirming pays only these, so a report the tutor confirms
-- late (after next month's fee was added, or after recording the payment by hand) never marks a newer fee paid.
ALTER TABLE payment_reports ADD COLUMN due_ids TEXT NULL AFTER amount;
