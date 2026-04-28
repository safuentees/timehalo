import { describe, it, expect, beforeEach } from "vitest";
import {
  encryptToken,
  decryptToken,
  isEncryptedEnvelope,
} from "@/lib/calendar/encryption";

// CALENDAR_TOKEN_KEY is read at every encrypt/decrypt call via the env
// proxy. test/vitest.setup.ts loads .env, but for these tests we set
// a deterministic 32-byte key directly so the spec doesn't depend on
// a developer's local .env state.
const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

beforeEach(() => {
  process.env.CALENDAR_TOKEN_KEY = TEST_KEY;
});

describe("calendar token encryption", () => {
  it("round-trips a plaintext token through encrypt → decrypt", () => {
    const plain = "ya29.a0AfH6SMC...some-real-google-token";
    const envelope = encryptToken(plain);
    expect(envelope.startsWith("v1:")).toBe(true);
    expect(envelope).not.toContain(plain);
    expect(decryptToken(envelope)).toBe(plain);
  });

  it("produces a different envelope each call (random IV)", () => {
    const plain = "ya29.a0AfH6SMC";
    const a = encryptToken(plain);
    const b = encryptToken(plain);
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe(decryptToken(b));
  });

  it("decryptToken passes through plaintext when no v1: prefix (lazy migration)", () => {
    const plaintext = "ya29.unmigrated-row-from-pre-encryption-era";
    expect(decryptToken(plaintext)).toBe(plaintext);
  });

  it("isEncryptedEnvelope detects the prefix", () => {
    expect(isEncryptedEnvelope("v1:abc:def:ghi")).toBe(true);
    expect(isEncryptedEnvelope("plain-token")).toBe(false);
    expect(isEncryptedEnvelope("")).toBe(false);
  });

  it("rejects a tampered ciphertext (auth tag mismatch)", () => {
    const envelope = encryptToken("secret");
    const parts = envelope.split(":");
    // Flip a byte in the ciphertext — auth tag verification fails.
    const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3].slice(0, -2)}AA`;
    expect(() => decryptToken(tampered)).toThrow();
  });

  it("rejects a malformed envelope (wrong part count)", () => {
    expect(() => decryptToken("v1:only-two-parts")).toThrow(/malformed/i);
  });

  it("throws clearly when CALENDAR_TOKEN_KEY is missing", () => {
    delete process.env.CALENDAR_TOKEN_KEY;
    expect(() => encryptToken("anything")).toThrow(
      /CALENDAR_TOKEN_KEY is required/i,
    );
  });

  it("throws clearly when CALENDAR_TOKEN_KEY is the wrong length", () => {
    process.env.CALENDAR_TOKEN_KEY = "deadbeef"; // 8 chars — way too short
    expect(() => encryptToken("anything")).toThrow(/64 hex characters/);
  });
});
