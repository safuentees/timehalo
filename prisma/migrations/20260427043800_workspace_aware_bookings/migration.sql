-- Workspace-aware bookings (B1 follow-up). Three structural concerns:
--
--   1. Booking.workspaceId becomes a non-null column — every booking
--      belongs to a workspace. The denormalized FK lets booking reads
--      scope to a workspace without joining through User.
--   2. Every existing User without a Workspace gets one (named
--      "Personal", slug derived from handle or a `personal-${id}`
--      fallback) plus an OWNER Membership.
--   3. Existing Booking rows are stamped with the host's primary
--      Workspace.id before the column is locked to NOT NULL.
--
-- SQLite can't ALTER a column from nullable → NOT NULL in place; the
-- final step uses Prisma's standard RedefineTables dance to rebuild
-- the Booking table with the new constraint.

-- Step 1 — add workspaceId as nullable so existing rows don't trip.
ALTER TABLE "Booking" ADD COLUMN "workspaceId" TEXT;

-- Step 2 — backfill missing Workspace + OWNER Membership for every
-- User who doesn't already own one. The id columns are TEXT cuid()s
-- in normal use; for backfill we synthesize random hex IDs (still
-- 24 chars, still unique) since SQLite has no cuid() builtin.
--
-- Slug derivation:
--   • hosts with a non-null handle → use the handle as the slug,
--     guarded by an existence check (a previous run might have used
--     it). The lower() + regex of `[a-z0-9-]{3,30}` is enforced by
--     the app layer; existing handles already pass that filter.
--   • everyone else → `personal-<userId>` which is guaranteed unique.
--
-- The ownerId-not-in-workspace filter is the idempotency guard —
-- re-running this migration on an already-migrated DB is a no-op.
INSERT INTO "Workspace" ("id", "slug", "name", "ownerId", "createdAt", "updatedAt")
SELECT
    lower(hex(randomblob(12))),
    CASE
        WHEN "User"."handle" IS NOT NULL
             AND NOT EXISTS (
                 SELECT 1 FROM "Workspace" "w2"
                 WHERE "w2"."slug" = "User"."handle"
             )
        THEN "User"."handle"
        ELSE 'personal-' || "User"."id"
    END,
    'Personal',
    "User"."id",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User"
WHERE "User"."id" NOT IN (
    SELECT "ownerId" FROM "Workspace"
);

-- Mint OWNER Memberships for the workspaces we just created. The
-- assignedBy column stays NULL — there's no assigner at workspace-
-- creation time (matches the schema comment + workspaces.create).
INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "assignedAt", "assignedBy")
SELECT
    lower(hex(randomblob(12))),
    "Workspace"."id",
    "Workspace"."ownerId",
    'OWNER',
    CURRENT_TIMESTAMP,
    NULL
FROM "Workspace"
WHERE NOT EXISTS (
    SELECT 1 FROM "Membership" "m"
    WHERE "m"."workspaceId" = "Workspace"."id"
      AND "m"."userId" = "Workspace"."ownerId"
);

-- Step 3 — backfill workspaceId on every existing Booking. Every
-- host now owns at least one Workspace (Step 2). Pick the oldest
-- one to match the bookings.create lookup that follows.
UPDATE "Booking"
SET "workspaceId" = (
    SELECT "w"."id"
    FROM "Workspace" "w"
    WHERE "w"."ownerId" = "Booking"."hostId"
    ORDER BY "w"."createdAt" ASC
    LIMIT 1
)
WHERE "workspaceId" IS NULL;

-- Step 4 — rebuild Booking with workspaceId NOT NULL. SQLite's
-- standard column-redefine dance: copy → drop → rename, plus index
-- recreation. Foreign-key deferral keeps the in-flight rebuild
-- consistent.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Booking" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "publicUid" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "visitorName" TEXT NOT NULL,
    "visitorEmail" TEXT NOT NULL,
    "question" TEXT,
    "slotStart" DATETIME NOT NULL,
    "slotEnd" DATETIME NOT NULL,
    "visitorTimezone" TEXT,
    "rescheduledFromUid" TEXT,
    "referrer" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    CONSTRAINT "Booking_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Booking_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("createdAt", "deleted", "deletedAt", "hostId", "id", "idempotencyKey", "publicUid", "question", "referrer", "rescheduledFromUid", "slotEnd", "slotStart", "visitorEmail", "visitorName", "visitorTimezone", "workspaceId") SELECT "createdAt", "deleted", "deletedAt", "hostId", "id", "idempotencyKey", "publicUid", "question", "referrer", "rescheduledFromUid", "slotEnd", "slotStart", "visitorEmail", "visitorName", "visitorTimezone", "workspaceId" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE UNIQUE INDEX "Booking_publicUid_key" ON "Booking"("publicUid");
CREATE UNIQUE INDEX "Booking_idempotencyKey_key" ON "Booking"("idempotencyKey");
CREATE INDEX "Booking_hostId_slotStart_deleted_idx" ON "Booking"("hostId", "slotStart", "deleted");
CREATE INDEX "Booking_deleted_deletedAt_idx" ON "Booking"("deleted", "deletedAt");
CREATE INDEX "Booking_workspaceId_slotStart_idx" ON "Booking"("workspaceId", "slotStart");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
