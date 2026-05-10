import "server-only";
import { randomInt } from "crypto";
import { OTP_CODE_LENGTH, OTP_TTL_SECONDS } from "./otp";

export function generateOtpCode(): string {
  const max = 10 ** OTP_CODE_LENGTH;
  return randomInt(0, max).toString().padStart(OTP_CODE_LENGTH, "0");
}

export function otpExpiresAt(): Date {
  return new Date(Date.now() + OTP_TTL_SECONDS * 1000);
}
