-- AlterTable
ALTER TABLE "User" ADD COLUMN "handle" TEXT;

-- CreateTable
CREATE TABLE "AvailabilityRange" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "dayOfWeek" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    CONSTRAINT "AvailabilityRange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- CreateIndex
CREATE INDEX "AvailabilityRange_userId_dayOfWeek_idx" ON "AvailabilityRange"("userId", "dayOfWeek");
