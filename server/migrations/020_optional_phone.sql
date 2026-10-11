-- Sign in with Apple no longer asks for a mobile number (App Store guideline 4.8 / 5.1.1): such an account starts
-- without one and can add it later from Account. Unique still holds for every number that is set.
ALTER TABLE users MODIFY phone VARCHAR(16) NULL;
