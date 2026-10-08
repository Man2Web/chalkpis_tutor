-- Which scheduled job already ran for which day/hour. The scheduler claims a (job, run_key) row with INSERT IGNORE before
-- running, so two servers (or a restart) can never run the same daily job twice.
CREATE TABLE IF NOT EXISTS job_runs (
  job VARCHAR(40) NOT NULL,
  run_key VARCHAR(40) NOT NULL,
  ran_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (job, run_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
