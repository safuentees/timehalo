-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "referrer" TEXT;

-- CreateTable
CREATE TABLE "Feature" (
    "slug" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'RELEASE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserFeatures" (
    "userId" TEXT NOT NULL,
    "featureSlug" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,

    PRIMARY KEY ("userId", "featureSlug"),
    CONSTRAINT "UserFeatures_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserFeatures_featureSlug_fkey" FOREIGN KEY ("featureSlug") REFERENCES "Feature" ("slug") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Feature_enabled_idx" ON "Feature"("enabled");

-- CreateIndex
CREATE INDEX "UserFeatures_featureSlug_idx" ON "UserFeatures"("featureSlug");
