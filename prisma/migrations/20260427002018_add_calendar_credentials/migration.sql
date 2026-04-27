-- CreateTable
CREATE TABLE "CalendarCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "externalAccountEmail" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessTokenExpiresAt" DATETIME NOT NULL,
    "scope" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CalendarCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SelectedCalendar" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "credentialId" TEXT NOT NULL,
    "externalCalendarId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SelectedCalendar_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "CalendarCredential" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CalendarCredential_userId_idx" ON "CalendarCredential"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarCredential_userId_provider_externalAccountId_key" ON "CalendarCredential"("userId", "provider", "externalAccountId");

-- CreateIndex
CREATE INDEX "SelectedCalendar_credentialId_idx" ON "SelectedCalendar"("credentialId");

-- CreateIndex
CREATE UNIQUE INDEX "SelectedCalendar_credentialId_externalCalendarId_key" ON "SelectedCalendar"("credentialId", "externalCalendarId");
