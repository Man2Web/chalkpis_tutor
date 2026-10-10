-- The tutor's own UPI id: parents pay the tutor directly; the server never touches that money.
ALTER TABLE institutes ADD COLUMN upi_id VARCHAR(80) NOT NULL DEFAULT '' AFTER phone;
