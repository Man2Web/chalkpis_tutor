-- Plan payments the admin records by hand (cash, a bank transfer, a UPI payment straight to M2W): provider 'manual',
-- with how it was paid and a reference in `note`. They count in revenue and show in the centre's payments like any other.
ALTER TABLE billing_events MODIFY provider ENUM('razorpay','phonepe','cashfree','apple','google','manual','mock') NOT NULL;
ALTER TABLE billing_events ADD COLUMN note VARCHAR(120) NULL AFTER reason;
