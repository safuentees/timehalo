-- CreateTable
CREATE TABLE "WorkspaceSlugHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" TEXT NOT NULL,
    "oldSlug" TEXT NOT NULL,
    "replacedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceSlugHistory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceSlugHistory_oldSlug_key" ON "WorkspaceSlugHistory"("oldSlug");

-- CreateIndex
CREATE INDEX "WorkspaceSlugHistory_workspaceId_idx" ON "WorkspaceSlugHistory"("workspaceId");
