-- PhonePe Standard Checkout for plan purchases. The order's link_id is our merchantOrderId; a payment is recorded
-- under PhonePe's transaction id, so the same payment can still only be applied once.
ALTER TABLE billing_orders MODIFY provider ENUM('razorpay','phonepe','mock') NOT NULL;
ALTER TABLE billing_events MODIFY provider ENUM('razorpay','phonepe','mock') NOT NULL;
