-- Foundation: users, institutes (the tenant), who belongs to which institute, and the plan.
-- Money is stored as integer paise elsewhere; times are UTC DATETIME(3); ids are UUIDs.

CREATE TABLE users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  phone VARCHAR(16) NOT NULL,
  name VARCHAR(80) NOT NULL DEFAULT '',
  language ENUM('en','hi') NOT NULL DEFAULT 'en',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_users_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE institutes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  owner_user_id CHAR(36) NOT NULL,
  logo_path VARCHAR(255) NULL,
  address VARCHAR(255) NOT NULL DEFAULT '',
  phone VARCHAR(20) NOT NULL DEFAULT '',
  receipt_prefix VARCHAR(6) NOT NULL DEFAULT 'TD',
  next_receipt_no INT UNSIGNED NOT NULL DEFAULT 1,
  timezone VARCHAR(40) NOT NULL DEFAULT 'Asia/Kolkata',
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_institutes_owner FOREIGN KEY (owner_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A user belongs to at most one institute for now (owner today, staff later).
CREATE TABLE memberships (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  institute_id CHAR(36) NOT NULL,
  role ENUM('owner','staff') NOT NULL,
  onboarding_done TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_memberships_institute (institute_id),
  CONSTRAINT fk_memberships_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_memberships_institute FOREIGN KEY (institute_id) REFERENCES institutes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE subscriptions (
  institute_id CHAR(36) NOT NULL PRIMARY KEY,
  plan ENUM('trial','starter','standard','pro') NOT NULL,
  status ENUM('active','expired') NOT NULL,
  starts_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  student_limit INT UNSIGNED NULL,
  batch_limit INT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY ix_subscriptions_expiry (status, expires_at),
  CONSTRAINT fk_subscriptions_institute FOREIGN KEY (institute_id) REFERENCES institutes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
