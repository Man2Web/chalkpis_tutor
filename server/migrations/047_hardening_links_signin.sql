-- Hardening batch "sign-in, links and admin" (security audit run 1, 9 Nov 2026).
--
-- students.link_version: part of the signature of the parent's "I've paid" link (/f/<token>). It goes up when the
--   parent's number changes or the student is deactivated, so links sent before stop working. 0 signs exactly as the
--   links already sent, so nothing changes for anyone until their number changes.
-- users.plan_session_epoch: the billing page (/plan) cookie carries it; "Sign out" raises it, so every earlier cookie
--   of that person stops working, not just the one in that browser.
-- refresh_tokens.grace_used: an already-used refresh token gets one extra pair inside the 10-second retry window,
--   once; before, it could be swapped any number of times in that window.
-- idempotency_keys.req_hash: the exact address (method, URL with ids) a key was first used for; the same key for
--   another record is refused instead of replaying the first record's answer. NULL for rows from before.
ALTER TABLE students ADD COLUMN IF NOT EXISTS link_version INT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_session_epoch INT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS grace_used TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS req_hash CHAR(64) NULL;
