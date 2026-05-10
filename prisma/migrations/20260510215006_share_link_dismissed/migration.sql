-- Server-side flag for the share-link pill's dismissed state
-- (B.PT-share-flash). Moved off localStorage onto the User row so
-- SSR can render the pill's visibility correctly on first paint —
-- without this, the pill server-renders unconditionally then snaps
-- closed once the client effect reads localStorage, producing a
-- visible flash.

ALTER TABLE "User" ADD COLUMN "shareLinkDismissed" BOOLEAN NOT NULL DEFAULT 0;
