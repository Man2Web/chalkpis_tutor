-- What a centre teaches (tuition, coaching, abacus, karate, dance, yoga, sports or other). The app picks its words,
-- examples and poster texts from it. Centres made before this were all tuition.
ALTER TABLE institutes ADD COLUMN category VARCHAR(20) NOT NULL DEFAULT 'tuition' AFTER name;
