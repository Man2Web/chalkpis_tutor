-- Basic details of a centre's owner (decision 156): a contact email, where the centre is (city, state, PIN code) and
-- how they heard about Chalkpis. Asked at sign-up, in the app and on the website, and once of every older centre.
-- contact_email is only for reaching the owner. It is not users.email, which signs in: an unverified address there would
-- let whoever owns that mailbox sign in to the centre.
-- details_at is when the owner filled them in; NULL means the app still asks (centres made before this have NULL).
ALTER TABLE institutes
  ADD COLUMN IF NOT EXISTS contact_email VARCHAR(254) NULL,
  ADD COLUMN IF NOT EXISTS city VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS state VARCHAR(40) NULL,
  ADD COLUMN IF NOT EXISTS pincode CHAR(6) NULL,
  ADD COLUMN IF NOT EXISTS heard_from VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS heard_from_other VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS details_at DATETIME(3) NULL;
