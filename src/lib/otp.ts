// Client-safe OTP constants (B.PT-otp). DELIBERATELY does NOT import
// `server-only` so the values can flow into the register-form client
// component (slot count, resend cooldown, ttl-in-copy). The helpers
// that read `node:crypto` live in `./otp-server.ts` with the
// `server-only` guard so the browser bundle never tries to import
// Node built-ins.

/** Code length — 6 digits. Matches every modern OTP UX (iOS 1Password
 *  + iOS keyboard + SMS autofill all specialize in 6). Decimal only;
 *  alphanumeric adds zero practical entropy at the lockout policy
 *  below. */
export const OTP_CODE_LENGTH = 6;

/** Time-to-live for a freshly-minted code, in seconds. 10 min — 2x
 *  dub's 5 min, half cal.com's 15 min. Email copy quotes this number
 *  back to the user so DON'T change one without the other. */
export const OTP_TTL_SECONDS = 10 * 60;

/** Send rate limit per (email, IP) pair, requests per minute. Pairs
 *  with the broader IP-keyed `auth.register` 5/min limit in
 *  `auth.ts`. */
export const OTP_SEND_RATE_LIMIT = 2;
/** Window for OTP_SEND_RATE_LIMIT. Format expected by
 *  `createRateLimitMiddleware`. */
export const OTP_SEND_RATE_WINDOW = "1 m";

/** Verify rate limit per (email, IP), requests per minute. Higher
 *  than send because legitimate users sometimes mistype. The
 *  per-attempt lockout below is the primary brute-force guard. */
export const OTP_VERIFY_RATE_LIMIT = 10;
export const OTP_VERIFY_RATE_WINDOW = "1 m";

/** Maximum failed verify attempts per email before lockout. Matches
 *  dub.co's `MAX_OTP_ATTEMPTS`. */
export const OTP_MAX_ATTEMPTS = 5;

/** Lockout duration after MAX_ATTEMPTS failed verifies. 24h —
 *  punishes brute-force without bricking a legitimate user
 *  forever. Matches dub.co's `OTP_LOCKOUT_DURATION`. */
export const OTP_LOCKOUT_WINDOW = "24 h";

/** UI-side resend cooldown in seconds. Lives on the client; the
 *  server's rate-limit is the actual enforcement. Matches dub.co's
 *  60s timer in `resend-otp.tsx`. */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
