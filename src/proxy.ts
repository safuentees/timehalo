import { NextResponse } from "next/server";
import { auth } from "./auth";

// Allowed shape for the ?ref= value — a-z, 0-9, dash, underscore, dot.
// Keeps cookie-injection / header-injection vectors out by construction.
// 64 chars is plenty for "twitter", "newsletter-jul", "a/b-test-2", etc.
const REF_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/;
const REF_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

const GATE_COOKIE = "oh_private_gate";
const GATE_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

const GATE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Officehours — Private alpha</title>
<style>
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#eee7d5;color:#0a0a0a;font-family:'Space Grotesk','SF Pro Text',-apple-system,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
body{min-height:100vh;display:grid;place-items:center;padding:2rem}
main{max-width:30rem;width:100%}
.eyebrow{font-family:'JetBrains Mono','SF Mono',monospace;font-size:11px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;opacity:0.55;margin:0 0 1.5rem}
.dot{display:inline-block;width:6px;height:6px;border-radius:999px;background:#0a0a0a;margin-right:8px;vertical-align:middle;transform:translateY(-1px)}
h1{font-size:clamp(2rem,1rem+4vw,3rem);font-weight:800;letter-spacing:-0.03em;line-height:1;margin:0 0 1rem}
p{font-size:0.9375rem;line-height:1.55;opacity:0.7;margin:0 0 1.25rem}
.hint{font-family:'JetBrains Mono','SF Mono',monospace;font-size:0.75rem;opacity:0.45;margin-top:2.5rem}
code{font-family:inherit;background:rgba(10,10,10,0.06);padding:1px 6px;border-radius:3px}
</style>
</head>
<body>
<main>
<p class="eyebrow"><span class="dot"></span>Officehours</p>
<h1>Private alpha.</h1>
<p>This deployment is closed while it's being polished. Public launch is coming.</p>
<p class="hint">If you have an invite, append <code>?gate=&lt;token&gt;</code> to the URL.</p>
</main>
</body>
</html>`;

export const proxy = auth((req) => {
  const pathname = req.nextUrl.pathname;

  // Private-alpha gate. When PRIVATE_GATE_PASSWORD is set in env, every
  // page request must carry the gate cookie OR a matching ?gate= query
  // string (which sets the cookie + redirects to the clean URL). Edge
  // runtime reads process.env directly. API routes are excluded by the
  // matcher below, so Stripe / cron / OAuth callbacks are unaffected.
  // Unset env (local dev) → no-op.
  const gateSecret = process.env.PRIVATE_GATE_PASSWORD;
  if (gateSecret) {
    const queryGate = req.nextUrl.searchParams.get("gate");
    if (queryGate === gateSecret) {
      const cleanUrl = new URL(req.nextUrl);
      cleanUrl.searchParams.delete("gate");
      const response = NextResponse.redirect(cleanUrl);
      response.cookies.set(GATE_COOKIE, gateSecret, {
        path: "/",
        maxAge: GATE_COOKIE_MAX_AGE_SEC,
        sameSite: "lax",
        httpOnly: true,
        secure: req.nextUrl.protocol === "https:",
      });
      return response;
    }
    if (req.cookies.get(GATE_COOKIE)?.value !== gateSecret) {
      return new NextResponse(GATE_HTML, {
        status: 403,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }
  }

  const isLoggedIn = !!req.auth;
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
  // B.PT121 — `(dev)/playground/*` is gated to non-prod via
  // `notFound()` in `src/app/(dev)/layout.tsx`, so in production the
  // route 404s regardless of whether the proxy lets it through. In
  // dev, the proxy MUST let it through anonymously — the playground
  // exists explicitly to render UI without auth, against seeded mock
  // data, for visual regression + animation iteration. Adding it here
  // does not change production behavior (still 404s in prod), only
  // unblocks the dev-only debug surface.
  const isPlayground =
    pathname === "/playground" || pathname.startsWith("/playground/");

  // Public routes — accessible without auth
  const isPublic =
    ["/login", "/register"].includes(pathname) ||
    isHostPage ||
    isInvitationLink ||
    isEmbed ||
    isPlayground;

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
