-- B.PT43 — onboarding checklist state on the User row.
-- Move dismissal + manually-marked-done step set off localStorage
-- (client-only, unreadable during SSR → causes hard-refresh flashes
-- as the post-hydration values snap in) onto the User row so
-- `users.me` (already prefetched in `(host)/layout.tsx` post-B.PT41)
-- carries the truth into SSR and hydration.

ALTER TABLE "User" ADD COLUMN "onboardingDismissed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "onboardingManualSteps" TEXT NOT NULL DEFAULT '[]';
