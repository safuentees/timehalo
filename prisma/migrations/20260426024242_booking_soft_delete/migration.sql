-- CreateTable
CREATE TABLE "BookingAudit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bookingUid" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "operationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WebhookSubscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "publicUid" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriberUrl" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WebhookSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "succeededAt" DATETIME,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "lastFailedAttemptAt" DATETIME,
    "referenceUid" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Booking" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "publicUid" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "visitorName" TEXT NOT NULL,
    "visitorEmail" TEXT NOT NULL,
    "question" TEXT,
    "slotStart" DATETIME NOT NULL,
    "slotEnd" DATETIME NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    CONSTRAINT "Booking_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("createdAt", "hostId", "id", "idempotencyKey", "publicUid", "question", "slotEnd", "slotStart", "visitorEmail", "visitorName") SELECT "createdAt", "hostId", "id", "idempotencyKey", "publicUid", "question", "slotEnd", "slotStart", "visitorEmail", "visitorName" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE UNIQUE INDEX "Booking_publicUid_key" ON "Booking"("publicUid");
CREATE UNIQUE INDEX "Booking_idempotencyKey_key" ON "Booking"("idempotencyKey");
CREATE INDEX "Booking_hostId_slotStart_deleted_idx" ON "Booking"("hostId", "slotStart", "deleted");
CREATE INDEX "Booking_deleted_deletedAt_idx" ON "Booking"("deleted", "deletedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "BookingAudit_bookingUid_idx" ON "BookingAudit"("bookingUid");

-- CreateIndex
CREATE INDEX "BookingAudit_operationId_idx" ON "BookingAudit"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookSubscription_publicUid_key" ON "WebhookSubscription"("publicUid");

-- CreateIndex
CREATE INDEX "WebhookSubscription_userId_active_idx" ON "WebhookSubscription"("userId", "active");

-- CreateIndex
CREATE INDEX "Task_succeededAt_idx" ON "Task"("succeededAt");

-- CreateIndex
CREATE INDEX "Task_scheduledAt_succeededAt_idx" ON "Task"("scheduledAt", "succeededAt");

-- CreateIndex
CREATE UNIQUE INDEX "Task_referenceUid_type_key" ON "Task"("referenceUid", "type");
