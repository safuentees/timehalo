-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "offsetMinutes" INTEGER NOT NULL DEFAULT 0,
    "action" TEXT NOT NULL,
    "template" TEXT,
    "webhookEvent" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Workflow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Workflow_userId_active_idx" ON "Workflow"("userId", "active");

-- CreateIndex
CREATE INDEX "Workflow_trigger_active_idx" ON "Workflow"("trigger", "active");
