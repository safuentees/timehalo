-- Backfill: insert one default 1h-reminder workflow row for every
-- existing User that has zero Workflow rows. New users get this seed
-- automatically via auth.register + bootstrapUserWorkspace; this
-- catches accounts created before A4 landed.
--
-- Once this lands, every booking flow's hardcoded reminder enqueue
-- can be safely suppressed (via hasMatchingReminderWorkflow) without
-- losing reminder emails for legacy users — the workflows engine
-- picks up the slack.
--
-- Idempotent: filtered on "users with zero workflows." Re-running is
-- a no-op.
--
-- The cuid() function isn't available in SQLite; we synthesize an id
-- using a hex hash of (userId || 'default-reminder') to keep the
-- migration deterministic + collision-free across re-runs.

INSERT INTO "Workflow" (
  "id",
  "userId",
  "name",
  "trigger",
  "offsetMinutes",
  "action",
  "template",
  "active",
  "createdAt",
  "updatedAt"
)
SELECT
  'def-rem-' || u."id",                  -- deterministic id, prefix-namespaced
  u."id",
  '1h reminder',
  'BEFORE_EVENT',
  60,
  'EMAIL_VISITOR',
  'booking-reminder',
  1,                                     -- SQLite stores boolean as int
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
WHERE NOT EXISTS (
  SELECT 1 FROM "Workflow" w WHERE w."userId" = u."id"
);
