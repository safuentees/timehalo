-- Email-OTP token store for register-flow verification (B.PT-otp).
-- Sibling to `VerificationToken` (which Auth.js owns for magic-link
-- sends). Lazy User creation: the User row only exists after the OTP
-- verifies, so this table holds the pre-verification state — no half-
-- baked unverified accounts accumulate. Reference: dub.co
-- EmailVerificationToken (packages/prisma/schema/token.prisma).

CREATE TABLE "EmailOtpToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("identifier", "token")
);

-- Lookup by email (sendOtp deletes prior tokens for the address before
-- inserting a fresh one — eager rotation, one active code per email).
CREATE INDEX "EmailOtpToken_identifier_idx" ON "EmailOtpToken"("identifier");

-- Cleanup index — sweep expired rows on a schedule (or rely on
-- opportunistic delete-on-verify; this index lets either approach
-- scan the small expired tail without a table scan).
CREATE INDEX "EmailOtpToken_expires_idx" ON "EmailOtpToken"("expires");
