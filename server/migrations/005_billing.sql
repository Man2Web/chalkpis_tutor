-- Plan purchases. An order is created by us when the owner asks for a payment link; the webhook is matched against
-- OUR order (never trusting plan or institute named in the webhook itself). billing_events.payment_id is the
-- provider's payment id and the primary key, so a webhook that is delivered twice can only ever be applied once.

CREATE TABLE IF NOT EXISTS billing_orders (
  id CHAR(36) NOT NULL PRIMARY KEY,
  institute_id CHAR(36) NOT NULL,
  plan_id ENUM('starter','standard','pro') NOT NULL,
  amount BIGINT UNSIGNED NOT NULL,
  provider ENUM('razorpay','mock') NOT NULL,
  link_id VARCHAR(80) NOT NULL,
  url VARCHAR(255) NOT NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_orders_link (provider, link_id),
  KEY ix_orders_institute (institute_id, created_at),
  CONSTRAINT fk_orders_institute FOREIGN KEY (institute_id) REFERENCES institutes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS billing_events (
  payment_id VARCHAR(80) NOT NULL PRIMARY KEY,
  provider ENUM('razorpay','mock') NOT NULL,
  order_id CHAR(36) NULL,
  institute_id CHAR(36) NULL,
  plan_id VARCHAR(20) NULL,
  amount BIGINT UNSIGNED NOT NULL,
  status ENUM('applied','rejected') NOT NULL,
  reason VARCHAR(40) NULL,
  expires_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_events_institute (institute_id, created_at),
  CONSTRAINT fk_events_institute FOREIGN KEY (institute_id) REFERENCES institutes (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
