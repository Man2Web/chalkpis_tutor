-- Free trials after the security audit (decided 9 Nov 2026):
-- 1. A trial allows up to 100 students (batches stay unlimited). Trials running now get the same limit; a centre that
--    already has more keeps them all and only cannot add more until it subscribes.
-- 2. One free trial per mobile number. used_trials keeps a keyed one-way hash (HMAC with the server's OTP_PEPPER) of
--    each number that has had a trial, never the number itself. It is written when a trial starts and again when an
--    owner deletes their account, and it is kept after deletion so the same number gets no second trial.
UPDATE subscriptions SET student_limit = 100 WHERE plan = 'trial' AND student_limit IS NULL;

CREATE TABLE used_trials (
  phone_hash CHAR(64) NOT NULL PRIMARY KEY,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
