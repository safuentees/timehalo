-- CreateTable
CREATE TABLE "EventType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationMins" INTEGER NOT NULL DEFAULT 15,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EventType_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventTypeHost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventTypeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isFixed" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 2,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "recentAssignments" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventTypeHost_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventType" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventTypeHost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
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
    "eventTypeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    CONSTRAINT "Booking_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Booking_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Booking_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventType" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("createdAt", "deleted", "deletedAt", "hostId", "id", "idempotencyKey", "publicUid", "question", "referrer", "rescheduledFromUid", "slotEnd", "slotStart", "visitorEmail", "visitorName", "visitorTimezone", "workspaceId") SELECT "createdAt", "deleted", "deletedAt", "hostId", "id", "idempotencyKey", "publicUid", "question", "referrer", "rescheduledFromUid", "slotEnd", "slotStart", "visitorEmail", "visitorName", "visitorTimezone", "workspaceId" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE UNIQUE INDEX "Booking_publicUid_key" ON "Booking"("publicUid");
CREATE UNIQUE INDEX "Booking_idempotencyKey_key" ON "Booking"("idempotencyKey");
CREATE INDEX "Booking_hostId_slotStart_deleted_idx" ON "Booking"("hostId", "slotStart", "deleted");
CREATE INDEX "Booking_deleted_deletedAt_idx" ON "Booking"("deleted", "deletedAt");
CREATE INDEX "Booking_workspaceId_slotStart_idx" ON "Booking"("workspaceId", "slotStart");
CREATE INDEX "Booking_eventTypeId_slotStart_idx" ON "Booking"("eventTypeId", "slotStart");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "EventType_workspaceId_idx" ON "EventType"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "EventType_workspaceId_slug_key" ON "EventType"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "EventTypeHost_userId_idx" ON "EventTypeHost"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EventTypeHost_eventTypeId_userId_key" ON "EventTypeHost"("eventTypeId", "userId");

-- Backfill: every existing User with a handle gets a singleton
-- EventType in their primary owned workspace (the same workspace
-- every existing booking is keyed against per the workspace-aware-
-- bookings migration). The host themselves is the only EventTypeHost,
-- isFixed=true so the round-robin algorithm always picks them. New
-- bookings against /h/<handle> resolve to this singleton row; future
-- multi-host event types are an explicit caller-mints-rows action.
--
-- Deterministic ids ('et-<userId>' / 'eth-<userId>') so the migration
-- is idempotent against re-runs and the singleton row is easy to
-- find from later migrations or scripts.
--
-- WHERE NOT EXISTS guards: re-applying the migration is a no-op.

INSERT INTO "EventType" ("id", "workspaceId", "slug", "name", "durationMins", "createdAt", "updatedAt")
SELECT
  'et-' || u."id",
  w."id",
  u."handle",
  COALESCE(u."name", u."handle"),
  15,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
JOIN "Workspace" w ON w."ownerId" = u."id"
WHERE u."handle" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "EventType" e WHERE e."id" = 'et-' || u."id");

INSERT INTO "EventTypeHost" ("id", "eventTypeId", "userId", "isFixed", "priority", "weight", "recentAssignments", "createdAt")
SELECT
  'eth-' || u."id",
  'et-' || u."id",
  u."id",
  1,                                     -- isFixed=true (SQLite int)
  2,                                     -- default priority (matches schema default)
  1,                                     -- default weight
  0,                                     -- recentAssignments
  CURRENT_TIMESTAMP
FROM "User" u
WHERE u."handle" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "EventType" e WHERE e."id" = 'et-' || u."id")
  AND NOT EXISTS (SELECT 1 FROM "EventTypeHost" eth WHERE eth."id" = 'eth-' || u."id");

-- Stamp existing Booking rows with the host's singleton EventType so
-- the new eventTypeId column isn't all-null on existing data. Bookings
-- against handles that no longer exist (e.g. deleted users) keep
-- eventTypeId=null — the FK is SetNull so that's a stable state.
UPDATE "Booking"
SET "eventTypeId" = 'et-' || "hostId"
WHERE "eventTypeId" IS NULL
  AND EXISTS (SELECT 1 FROM "EventType" e WHERE e."id" = 'et-' || "hostId");
