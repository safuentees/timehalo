-- Two-way calendar write (B2). Adds two nullable columns to
-- Booking that track the external provider event we wrote on
-- create. Reschedule updates the same event id; cancel deletes it.
-- onDelete: SetNull on the credential FK so disconnecting the
-- calendar doesn't cascade-wipe the booking history — the
-- externalCalendarEventId stays as a forensic record of what was
-- written to the now-disconnected account.

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
    "externalCalendarEventId" TEXT,
    "externalCalendarCredentialId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    CONSTRAINT "Booking_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Booking_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Booking_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventType" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Booking_externalCalendarCredentialId_fkey" FOREIGN KEY ("externalCalendarCredentialId") REFERENCES "CalendarCredential" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("createdAt", "deleted", "deletedAt", "eventTypeId", "hostId", "id", "idempotencyKey", "publicUid", "question", "referrer", "rescheduledFromUid", "slotEnd", "slotStart", "visitorEmail", "visitorName", "visitorTimezone", "workspaceId") SELECT "createdAt", "deleted", "deletedAt", "eventTypeId", "hostId", "id", "idempotencyKey", "publicUid", "question", "referrer", "rescheduledFromUid", "slotEnd", "slotStart", "visitorEmail", "visitorName", "visitorTimezone", "workspaceId" FROM "Booking";
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
