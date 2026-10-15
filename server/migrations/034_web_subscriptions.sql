-- Plans bought on the website renew automatically through Razorpay Subscriptions (UPI Autopay or a card mandate).
-- Decision 146. The owner approves a mandate; the first charge is taken when the trial or current plan ends (an
-- upgrade is charged at once), then every month or year. Each charge extends the plan by one cycle.

-- Razorpay plans (price per cycle), made through the API the first time one is needed.
CREATE TABLE IF NOT EXISTS razorpay_plans (
  plan_id ENUM('starter','standard','pro') NOT NULL,
  cycle ENUM('month','year') NOT NULL,
  amount BIGINT UNSIGNED NOT NULL,
  rp_plan_id VARCHAR(40) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (plan_id, cycle, amount)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per Razorpay subscription (sub_...). It renews while authenticated / active / pending and not set to stop at
-- the end of its cycle; created = the owner has not approved the mandate yet.
CREATE TABLE IF NOT EXISTS web_subscriptions (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  institute_id CHAR(36) NOT NULL,
  plan_id ENUM('starter','standard','pro') NOT NULL,
  cycle ENUM('month','year') NOT NULL,
  amount BIGINT UNSIGNED NOT NULL,
  rp_plan_id VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'created',
  cancel_at_cycle_end TINYINT(1) NOT NULL DEFAULT 0,
  start_at DATETIME(3) NULL,
  current_end DATETIME(3) NULL,
  charge_at DATETIME(3) NULL,
  short_url VARCHAR(255) NOT NULL DEFAULT '',
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY ix_web_subs_institute (institute_id, status),
  KEY ix_web_subs_charge (status, charge_at),
  CONSTRAINT fk_web_subs_institute FOREIGN KEY (institute_id) REFERENCES institutes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The subscription a charge came from (auto-renew payments have no order).
ALTER TABLE billing_events ADD COLUMN subscription_id VARCHAR(40) NULL AFTER order_id;
