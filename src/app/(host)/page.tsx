import { redirect } from "next/navigation";

// Apple HIG / dub.co / cal.com / rallly all do the same: the root host
// route is never a screen with content. Logged-in users land on their
// primary task surface (bookings); unauthenticated users get bounced
// to /login by `proxy.ts` before they ever hit this redirect.
export default function HostRoot() {
  redirect("/bookings");
}
