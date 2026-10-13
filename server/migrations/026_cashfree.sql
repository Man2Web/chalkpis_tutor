-- Cashfree Payment Links for plan purchases. The order's link_id is our order id; a payment is recorded under the
-- id of the Cashfree order that paid the link, so the same payment can still only be applied once.
ALTER TABLE billing_orders MODIFY provider ENUM('razorpay','phonepe','cashfree','mock') NOT NULL;
ALTER TABLE billing_events MODIFY provider ENUM('razorpay','phonepe','cashfree','mock') NOT NULL;
