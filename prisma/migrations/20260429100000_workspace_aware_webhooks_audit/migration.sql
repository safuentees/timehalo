-- Workspace-aware webhooks + audit (B1). Two structural concerns:
--
--   1. WebhookSubscription.workspaceId becomes a non-null column —
--      every webhook now belongs to a workspace. Members with the
--      `webhooks.write` scope manage them; the schema's userId
--      stays as the audit trail of who minted the row.
--   2. BookingAudit.workspaceId becomes a denormalized pointer to
--      Booking.workspaceId, with onDelete: SetNull. Nullable so
--      audit rows survive workspace deletion (User cascade →
--      Workspace cascade → would otherwise wipe the audit too) —
--      same forensic principle that keeps bookingUid an FK-less
--      plain string. Procedure writers always populate it; only
--      cascade-driven nullification reaches the column.
--
-- Same SQLite RedefineTables dance as the workspace-aware-bookings
-- migration (20260427043800).

-- Step 1 — add workspaceId nullable so existing rows don't trip
-- the NOT NULL guard during backfill.
ALTER TABLE "WebhookSubscription" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "BookingAudit" ADD COLUMN "workspaceId" TEXT;

-- Step 2 — backfill WebhookSubscription. Each row's userId already
-- has at least one owned Workspace post-20260427043800; pick the
-- oldest to match auth.register's pair-shape and the bookings.create
-- lookup.
UPDATE "WebhookSubscription"
SET "workspaceId" = (
    SELECT "w"."id"
    FROM "Workspace" "w"
    WHERE "w"."ownerId" = "WebhookSubscription"."userId"
    ORDER BY "w"."createdAt" ASC
    LIMIT 1
)
WHERE "workspaceId" IS NULL;

-- Step 3 — backfill BookingAudit. Each audit row points at a
-- bookingUid; resolve through Booking.workspaceId. Audit rows
-- whose Booking has been hard-deleted (cleanup cron past 30d)
-- can't be resolved — they're orphans and get dropped below.
UPDATE "BookingAudit"
SET "workspaceId" = (
    SELECT "b"."workspaceId"
    FROM "Booking" "b"
    WHERE "b"."publicUid" = "BookingAudit"."bookingUid"
    LIMIT 1
)
WHERE "workspaceId" IS NULL;

-- Step 4 — drop orphan WebhookSubscription rows whose creator
-- somehow has no owned workspace (shouldn't happen post-Unit-1,
-- but defensive). BookingAudit orphans are KEPT — the SetNull FK
-- is exactly so audit rows survive workspace deletion; an audit
-- row whose booking was hard-deleted (cleanup cron) before this
-- migration ran has no workspaceId resolvable, and its survival
-- is the desired forensic behavior.
DELETE FROM "WebhookSubscription" WHERE "workspaceId" IS NULL;

-- Step 5 — rebuild WebhookSubscription with workspaceId NOT NULL
-- + the workspace FK + the new compound index.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WebhookSubscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "publicUid" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "subscriberUrl" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WebhookSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WebhookSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WebhookSubscription" ("active", "createdAt", "events", "id", "publicUid", "secret", "subscriberUrl", "updatedAt", "userId", "workspaceId") SELECT "active", "createdAt", "events", "id", "publicUid", "secret", "subscriberUrl", "updatedAt", "userId", "workspaceId" FROM "WebhookSubscription";
DROP TABLE "WebhookSubscription";
ALTER TABLE "new_WebhookSubscription" RENAME TO "WebhookSubscription";
CREATE UNIQUE INDEX "WebhookSubscription_publicUid_key" ON "WebhookSubscription"("publicUid");
CREATE INDEX "WebhookSubscription_userId_active_idx" ON "WebhookSubscription"("userId", "active");
CREATE INDEX "WebhookSubscription_workspaceId_active_idx" ON "WebhookSubscription"("workspaceId", "active");

-- Step 6 — rebuild BookingAudit with the workspaceId column +
-- the SetNull FK + the new compound index. Column stays nullable
-- so audit rows survive workspace deletion (forensic invariant).
CREATE TABLE "new_BookingAudit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bookingUid" TEXT NOT NULL,
    "workspaceId" TEXT,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "operationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookingAudit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_BookingAudit" ("action", "actor", "bookingUid", "createdAt", "data", "id", "operationId", "workspaceId") SELECT "action", "actor", "bookingUid", "createdAt", "data", "id", "operationId", "workspaceId" FROM "BookingAudit";
DROP TABLE "BookingAudit";
ALTER TABLE "new_BookingAudit" RENAME TO "BookingAudit";
CREATE INDEX "BookingAudit_bookingUid_idx" ON "BookingAudit"("bookingUid");
CREATE INDEX "BookingAudit_operationId_idx" ON "BookingAudit"("operationId");
CREATE INDEX "BookingAudit_workspaceId_createdAt_idx" ON "BookingAudit"("workspaceId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
