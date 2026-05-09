-- B.PT278 — backfill durationMinsList so empty truly means "host has no
-- bookable durations" instead of being a fallback path that papers over
-- the unconfigured state.
--
-- Before: B.PT158 added the column as TEXT NOT NULL DEFAULT '[]'.
-- `resolveDurationChoices` then collapsed `[]` → `[durationMins]` server-
-- side, so /h/[handle] always rendered at least the default chip even
-- when the host hadn't configured anything in /profile. Adding the first
-- chip in /profile then APPEARED to remove the implicit default — the
-- visitor's chip count went from 1 (the fallback) to 1 (the new value),
-- not 1 → 2 as the host expected.
--
-- After: every EventType row's list is the source of truth. Existing
-- rows (single-duration hosts) get backfilled with `[durationMins]` so
-- their on-disk shape matches what the visitor sees. New EventType rows
-- (created via setHandle's bootstrap path) seed `[durationMins]` at
-- create time. `resolveDurationChoices` returns the parsed list as-is —
-- empty list means "no bookable durations", visitor sees the placeholder
-- and `bookings.create` refuses to mint a booking.
--
-- SQLite `||` is string concatenation. `'[' || 15 || ']'` = `'[15]'`.

UPDATE "EventType"
SET "durationMinsList" = '[' || "durationMins" || ']'
WHERE "durationMinsList" = '[]' OR "durationMinsList" IS NULL;
