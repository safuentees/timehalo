-- Backfill Mon-Fri 9-5 default availability for every existing User
-- with zero AvailabilityRange rows. Pre-seeded users created via
-- auth.register / events.createUser already have ranges; this catches
-- accounts created before that seeding landed.
--
-- Idempotent by construction: filtered on "users with zero ranges".
-- Re-running is a no-op.
--
-- Pattern reference: cal.com seeds Mon-Fri 9-5 at user create
-- (UserRepository.create → schedules.create → availability.createMany);
-- this migration is the catch-up for our pre-seed accounts.

INSERT INTO "AvailabilityRange" ("userId", "dayOfWeek", "startTime", "endTime")
SELECT u."id", 'MONDAY', '09:00', '17:00' FROM "User" u
WHERE NOT EXISTS (SELECT 1 FROM "AvailabilityRange" ar WHERE ar."userId" = u."id");

INSERT INTO "AvailabilityRange" ("userId", "dayOfWeek", "startTime", "endTime")
SELECT u."id", 'TUESDAY', '09:00', '17:00' FROM "User" u
WHERE NOT EXISTS (SELECT 1 FROM "AvailabilityRange" ar WHERE ar."userId" = u."id");

INSERT INTO "AvailabilityRange" ("userId", "dayOfWeek", "startTime", "endTime")
SELECT u."id", 'WEDNESDAY', '09:00', '17:00' FROM "User" u
WHERE NOT EXISTS (SELECT 1 FROM "AvailabilityRange" ar WHERE ar."userId" = u."id");

INSERT INTO "AvailabilityRange" ("userId", "dayOfWeek", "startTime", "endTime")
SELECT u."id", 'THURSDAY', '09:00', '17:00' FROM "User" u
WHERE NOT EXISTS (SELECT 1 FROM "AvailabilityRange" ar WHERE ar."userId" = u."id");

INSERT INTO "AvailabilityRange" ("userId", "dayOfWeek", "startTime", "endTime")
SELECT u."id", 'FRIDAY', '09:00', '17:00' FROM "User" u
WHERE NOT EXISTS (SELECT 1 FROM "AvailabilityRange" ar WHERE ar."userId" = u."id");
