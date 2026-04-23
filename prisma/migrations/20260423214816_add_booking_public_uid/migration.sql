/*
  Warnings:

  - The required column `publicUid` was added to the `Booking` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Booking_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("createdAt", "hostId", "id", "publicUid", "question", "slotEnd", "slotStart", "visitorEmail", "visitorName")
SELECT
    "createdAt",
    "hostId",
    "id",
    'bk_' || lower(hex(randomblob(12))),
    "question",
    "slotEnd",
    "slotStart",
    "visitorEmail",
    "visitorName"
FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE UNIQUE INDEX "Booking_publicUid_key" ON "Booking"("publicUid");
CREATE INDEX "Booking_hostId_slotStart_idx" ON "Booking"("hostId", "slotStart");
CREATE UNIQUE INDEX "Booking_hostId_slotStart_key" ON "Booking"("hostId", "slotStart");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
