-- B.PT158 — multi-duration per host. The chip row on /h/[handle] used
-- to render four hardcoded durations (15/25/30/60) but every booking
-- collapsed to the single `EventType.durationMins` value. Add an
-- explicit allow-list so hosts pick which durations visitors can
-- choose from.
--
-- Stored as a JSON-stringified Int[] (SQLite has no native array type;
-- mirrors `User.onboardingManualSteps`). Empty `[]` keeps the legacy
-- single-duration behavior — the booker shows just `durationMins`,
-- the chip surface degrades to a one-row chip strip.

ALTER TABLE "EventType" ADD COLUMN "durationMinsList" TEXT NOT NULL DEFAULT '[]';
