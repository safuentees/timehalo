-- Add public-profile bio to User. Optional; rendered on /h/<handle>
-- below the host's name. Length cap (500 chars) enforced by zod at
-- the procedure layer — Prisma SQLite has no native length
-- constraint, and zod's error path is friendlier on the form side.

ALTER TABLE "User" ADD COLUMN "bio" TEXT;
