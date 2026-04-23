/*
  Warnings:

  - You are about to drop the column `date` on the `Booking` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `Booking` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `Booking` table. All the data in the column will be lost.
  - You are about to drop the column `readTime` on the `Booking` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Booking` table. All the data in the column will be lost.
  - Added the required column `hostId` to the `Booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slotEnd` to the `Booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slotStart` to the `Booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `visitorEmail` to the `Booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `visitorName` to the `Booking` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Booking" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "hostId" TEXT NOT NULL,
    "visitorName" TEXT NOT NULL,
    "visitorEmail" TEXT NOT NULL,
    "question" TEXT,
    "slotStart" DATETIME NOT NULL,
    "slotEnd" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Booking_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("id") SELECT "id" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE INDEX "Booking_hostId_slotStart_idx" ON "Booking"("hostId", "slotStart");
CREATE UNIQUE INDEX "Booking_hostId_slotStart_key" ON "Booking"("hostId", "slotStart");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
