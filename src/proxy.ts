import { auth } from "./auth";

export const proxy = auth((req) => {
  const isLoggedIn = !!req.auth;
  const pathname = req.nextUrl.pathname;

  // Public routes — accessible without auth
  const isPublic =
    ["/login", "/register"].includes(pathname) || pathname.startsWith("/h/");

  if (!isLoggedIn && !isPublic) {
    return Response.redirect(new URL("/login", req.nextUrl.origin));
  }
});

export const config = {
  // Runs on all routes EXCEPT: API routes, static files, images, favicon
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
