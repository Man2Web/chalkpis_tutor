-- Brothers and sisters. Decision 155.
-- Children of one family share a family_id: a plain group id, set only when the owner links them (the app suggests it
-- when a parent's mobile number is already in use, but a shared number alone never links anyone). One parent link then
-- opens every child of the family.
ALTER TABLE students ADD COLUMN family_id CHAR(36) NULL AFTER parent_phone;
CREATE INDEX ix_students_family ON students (institute_id, family_id);
