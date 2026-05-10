import "server-only";
import { randomInt } from "crypto";
import { OTP_CODE_LENGTH, OTP_TTL_SECONDS } from "./otp";

// Server-only OTP helpers (B.PT-otp). The `server-only` guard +
// `node:crypto` import live here so the client bundle stays clean —
// constants live in `./otp.ts` and are importable from anywhere.
//
// Pattern reference: dub.co `apps/web/lib/auth/utils.ts` `generateOTP`.

/**
 * Generates a fresh decimal OTP using `crypto.randomInt` for
 * cryptographic randomness (avoids `Math.random` PRNG predictability).
 * Pads with leading zeros so the code is always exactly
 * `OTP_CODE_LENGTH` characters.
 */
export function generateOtpCode(): string {
  const max = 10 ** OTP_CODE_LENGTH;
  return randomInt(0, max).toString().padStart(OTP_CODE_LENGTH, "0");
}

/** Returns the absolute expiry for a fresh code minted at `now()`. */
export function otpExpiresAt(): Date {
  return new Date(Date.now() + OTP_TTL_SECONDS * 1000);
}
