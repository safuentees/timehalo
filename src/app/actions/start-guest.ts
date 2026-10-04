"use server";

import { AuthError } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/active-workspace";

export async function startGuest() {
  const session = await auth();
  if (session?.user?.id) redirect("/bookings");

  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_WORKSPACE_COOKIE);
  try {
    await signIn("guest", { redirectTo: "/bookings" });
    return { error: false };
  } catch (error) {
    if (error instanceof AuthError) return { error: true };
    // Preserve Next.js's successful sign-in redirect.
    throw error;
  }
}
