import { NextResponse } from "next/server";
import { auth } from "./auth";

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
  if (pathname === "/guest") {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }
  const isHostPage = pathname.startsWith("/h/");
  const isInvitationLink = pathname.startsWith("/invitations/");
  const isEmbed =
    pathname === "/embed.js" || pathname.startsWith("/embed/");
  const isPlayground =
    pathname === "/playground" || pathname.startsWith("/playground/");

  // The landing page is public; host management routes remain private.
  const isPublic =
    ["/", "/login", "/register"].includes(pathname) ||
    pathname.startsWith("/legal/") ||
    isHostPage ||
    isInvitationLink ||
    isEmbed ||
    isPlayground;

  if (!isLoggedIn && !isPublic) {
    return Response.redirect(new URL("/login", req.nextUrl.origin));
  }

  if (isHostPage) {
    const ref = req.nextUrl.searchParams.get("ref");
    if (ref && REF_PATTERN.test(ref)) {
      const handle = pathname.split("/")[2];
      if (handle) {
        const cleanUrl = new URL(req.nextUrl);
        cleanUrl.searchParams.delete("ref");

        const response = NextResponse.redirect(cleanUrl);
        response.cookies.set(`oh_ref_${handle}`, ref, {
          path: "/",
          maxAge: REF_COOKIE_MAX_AGE_SEC,
          sameSite: "lax",
          httpOnly: true,
          secure: req.nextUrl.protocol === "https:",
        });
        return response;
      }
    }
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
