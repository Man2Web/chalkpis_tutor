-- Plans are sold monthly or yearly, on the website (Razorpay) and inside the store apps as auto-renewing Apple / Google
-- subscriptions (through RevenueCat). Decision 145.
--
-- subscriptions.cycle: how the running plan is paid (NULL: a trial, or a pack bought before monthly/yearly plans).
-- store*: set while an App Store / Google Play subscription decides the plan; it then runs to the store's expiry date.
-- banked_*: what was left of the trial or a website plan when the store subscription took over (and website payments
-- that arrive while it runs). Those days resume when the store subscription ends, so nobody loses paid days.
ALTER TABLE subscriptions
  ADD COLUMN cycle ENUM('month','year') NULL AFTER plan,
  ADD COLUMN store ENUM('app_store','play_store') NULL,
  ADD COLUMN store_product VARCHAR(100) NULL,
  ADD COLUMN store_will_renew TINYINT(1) NULL,
  ADD COLUMN store_issue ENUM('billing','paused') NULL,
  ADD COLUMN store_sandbox TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN banked_plan ENUM('trial','starter','standard','pro') NULL,
  ADD COLUMN banked_cycle ENUM('month','year') NULL,
  ADD COLUMN banked_ms BIGINT UNSIGNED NULL;

ALTER TABLE billing_orders ADD COLUMN cycle ENUM('month','year') NULL AFTER plan_id;

-- A store payment is in the currency it was paid in; net_amount is what is left after the store's tax and commission
-- (RevenueCat's estimate). Sandbox payments (App Review, TestFlight, licence testers) switch a plan on but are no revenue.
ALTER TABLE billing_events
  ADD COLUMN cycle ENUM('month','year') NULL AFTER plan_id,
  ADD COLUMN currency CHAR(3) NOT NULL DEFAULT 'INR' AFTER amount,
  ADD COLUMN net_amount BIGINT NULL AFTER currency,
  ADD COLUMN sandbox TINYINT(1) NOT NULL DEFAULT 0,
  MODIFY status ENUM('applied','rejected','refunded') NOT NULL;

-- RevenueCat webhook deliveries already handled (a retry has the same event id).
CREATE TABLE IF NOT EXISTS store_events (
  id VARCHAR(100) NOT NULL PRIMARY KEY,
  type VARCHAR(40) NOT NULL,
  institute_id CHAR(36) NULL,
  received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_store_events_institute (institute_id, received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
