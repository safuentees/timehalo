-- Relax BookingAudit.workspaceId from `NOT NULL + onDelete: Cascade`
-- to `nullable + onDelete: SetNull`. Audit rows must survive
-- workspace deletion (the User → Workspace cascade chain would
-- otherwise wipe the audit history when an account is deleted) —
-- same forensic invariant that keeps `bookingUid` an FK-less plain
-- string. Procedure writers always populate workspaceId on insert;
-- only the SetNull cascade nullifies it later.
--
-- Same SQLite RedefineTables dance as the previous migration. Data
-- is preserved verbatim; only the column shape and FK action change.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BookingAudit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bookingUid" TEXT NOT NULL,
    "workspaceId" TEXT,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "operationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookingAudit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_BookingAudit" ("action", "actor", "bookingUid", "createdAt", "data", "id", "operationId", "workspaceId") SELECT "action", "actor", "bookingUid", "createdAt", "data", "id", "operationId", "workspaceId" FROM "BookingAudit";
DROP TABLE "BookingAudit";
ALTER TABLE "new_BookingAudit" RENAME TO "BookingAudit";
CREATE INDEX "BookingAudit_bookingUid_idx" ON "BookingAudit"("bookingUid");
CREATE INDEX "BookingAudit_operationId_idx" ON "BookingAudit"("operationId");
CREATE INDEX "BookingAudit_workspaceId_createdAt_idx" ON "BookingAudit"("workspaceId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
