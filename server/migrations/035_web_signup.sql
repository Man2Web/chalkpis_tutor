-- Centres set up on the website (tutor.chalkpis.com/start or /plan), not in the app. Decision 147.
-- signup_phone is the phone the owner said they will use the app on. An iPhone owner signs up before the iPhone app is
-- in the App Store, so their free trial waits: trial_on_first_app_use = 1 restarts it (full length) the first time they
-- sign in in the app, and no trial reminders go out before that. signup_source is the ad campaign (utm_* query string).
ALTER TABLE institutes
  ADD COLUMN IF NOT EXISTS signup_channel ENUM('app','web') NULL,
  ADD COLUMN IF NOT EXISTS signup_phone ENUM('android','ios') NULL,
  ADD COLUMN IF NOT EXISTS signup_source VARCHAR(400) NULL,
  ADD COLUMN IF NOT EXISTS trial_on_first_app_use TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_app_sign_in_at DATETIME(3) NULL;

-- every centre so far was set up in the app, which was also its first sign-in there
UPDATE institutes SET signup_channel = 'app', first_app_sign_in_at = created_at WHERE signup_channel IS NULL;
