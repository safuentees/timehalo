-- Backfill: any "personal-<userId>" Workspace.slug minted before
-- src/lib/workspaces.ts:personalWorkspaceSlugFor() landed has length 34
-- (9-char prefix + 25-char cuid). The workspaces.* zod schemas enforce
-- max(30) — so calling any slug-keyed procedure (workspaces.apiKeys.list,
-- workspaces.get, etc.) for those rows fails with a Zod "Too big" error
-- and the API keys section can't load.
--
-- Truncate to 30 chars. Cuid v2 is all lowercase alnum, so the trailing
-- char is always alphanumeric (matches WORKSPACE_SLUG_REGEX's last-char
-- anchor). Output equals what the new helper would produce going forward,
-- so we don't drift from new sign-ups.
--
-- Idempotent by construction (no-op when length(slug) <= 30).

UPDATE "Workspace"
SET "slug" = SUBSTR("slug", 1, 30)
WHERE LENGTH("slug") > 30;
