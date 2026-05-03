import { NextResponse } from "next/server";
import { auth } from "./auth";

const REF_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/;
const REF_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

export const proxy = auth((req) => {
  const isLoggedIn = !!req.auth;
  const pathname = req.nextUrl.pathname;
  const isHostPage = pathname.startsWith("/h/");
  const isInvitationLink = pathname.startsWith("/invitations/");
  const isEmbed =
    pathname === "/embed.js" || pathname.startsWith("/embed/");
  const isPlayground =
    pathname === "/playground" || pathname.startsWith("/playground/");

  const isPublic =
    ["/login", "/register"].includes(pathname) ||
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
