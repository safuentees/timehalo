"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, isLocale } from "./locales";

// Server action — flips the user's `oh_locale` cookie. Called from the
// language picker on /settings. Cookie is HttpOnly + 1 year — long
// enough to outlast a typical "I picked Spanish once" intent without
// being permanent.
//
// The repo's standing rule is "no revalidatePath for normal write
// flows" but locale is a meta-state that touches every server-rendered
// page; without revalidation, the next render reuses the cached
// pre-locale-change tree. This is exactly the case the rule's "normal
// write flows" carve-out anticipates.
export async function setLocaleAction(value: unknown) {
  if (!isLocale(value)) {
    throw new Error("Invalid locale");
  }
  const store = await cookies();
  store.set(LOCALE_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  return { ok: true as const, locale: value };
}
