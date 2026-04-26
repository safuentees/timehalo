"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, isLocale } from "./locales";

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
