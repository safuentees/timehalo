import { NextResponse } from "next/server";
import { auth } from "./auth";

// Allowed shape for the ?ref= value — a-z, 0-9, dash, underscore, dot.
// Keeps cookie-injection / header-injection vectors out by construction.
// 64 chars is plenty for "twitter", "newsletter-jul", "a/b-test-2", etc.
const REF_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/;
const REF_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

export const proxy = auth((req) => {
  const isLoggedIn = !!req.auth;
  const pathname = req.nextUrl.pathname;
  const isHostPage = pathname.startsWith("/h/");
  // /invitations/<token> renders the workspace-invite preview without
  // requiring auth (invitations.preview is a publicProcedure). The
  // accept button itself prompts for sign-in when needed; letting the
  // route through unauth means the user sees the invite preview before
  // having to choose between sign-in and sign-up.
  const isInvitationLink = pathname.startsWith("/invitations/");
  // B.PT85 — embed loader script + the embed iframe page itself MUST
  // be reachable by anonymous visitors. The whole point of the C1
  // embed is that a third-party site loads /embed.js + /embed/<handle>
  // from a guest browser session — gating either behind auth defeats
  // the feature. Caught during QA-5 validation: the proxy was
  // redirecting both to /login, so the loader's iframe failed before
  // the React app ever mounted. Cal.com handles this with the
  // matcher excluding `/embed.*` outright; the equivalent here is
  // adding the prefix to `isPublic` so existing attribution-cookie
  // logic still gets to inspect the route.
  const isEmbed =
    pathname === "/embed.js" || pathname.startsWith("/embed/");

  // Public routes — accessible without auth
  const isPublic =
    ["/login", "/register"].includes(pathname) ||
    isHostPage ||
    isInvitationLink ||
    isEmbed;

  if (!isLoggedIn && !isPublic) {
    return Response.redirect(new URL("/login", req.nextUrl.origin));
  }

  // Attribution capture — port of dub.co's per-link cookie pattern
  // (apps/web/lib/middleware/utils/create-response-with-cookies.ts)
  // shrunk to single-host scope. When a visitor lands on
  // /h/<handle>?ref=<source>, set a namespaced cookie + redirect to
  // the clean URL so the share link doesn't stay in the address bar.
  // Cookie is HttpOnly + sent on every subsequent request including
  // /api/trpc/bookings.create — the booking handler reads it from the
  // request headers and stamps `referrer` on the row.
  if (isHostPage) {
    const ref = req.nextUrl.searchParams.get("ref");
    if (ref && REF_PATTERN.test(ref)) {
      // Extract `<handle>` from `/h/<handle>` or `/h/<handle>/...`.
      const handle = pathname.split("/")[2];
      if (handle) {
        // Strip ?ref= (and any other query params keep their order)
        // before redirecting. cleanUrl carries the rest of the path
        // and any preserved query.
        const cleanUrl = new URL(req.nextUrl);
        cleanUrl.searchParams.delete("ref");

        const response = NextResponse.redirect(cleanUrl);
        response.cookies.set(`oh_ref_${handle}`, ref, {
          // Path "/" so the cookie survives the visitor's nav from
          // /h/<handle> into the booking flow into /api/trpc/*. dub
          // does the same — broad-scope cookie, namespaced name.
          path: "/",
          maxAge: REF_COOKIE_MAX_AGE_SEC,
          // Lax — needed so the cookie attaches on cross-site
          // redirects (e.g. visitor clicks the share link from
          // Twitter, lands on us).
          sameSite: "lax",
          // HttpOnly — JS can't read it. No client coupling needed;
          // the booking handler reads it from request headers.
          httpOnly: true,
          // Match site protocol; in dev (http://localhost) we don't
          // want Secure or the cookie won't set.
          secure: req.nextUrl.protocol === "https:",
        });
        return response;
      }
    }
  }
});

export const config = {
  // Runs on all routes EXCEPT: API routes, static files, images, favicon
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
