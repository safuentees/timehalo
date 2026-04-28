import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCMTypes,
} from "node:crypto";

// Read process.env directly (not via the @t3-oss validator) because
// the validator parses at module import and caches — vitest's
// `process.env.X = ...` per-test wouldn't reach a cached snapshot.
// The validator still gates server boot via src/env.ts; this module
// re-checks at every encrypt/decrypt for tests + for fail-loud-on-
// missing semantics that are easier to assert against directly.

// AES-256-GCM at-rest encryption for CalendarCredential.accessToken
// and refreshToken. Pattern reference: cal.com encrypts via Prisma
// middleware; Prisma 7 dropped middleware in favour of $extends, but
// the call surface is bounded (one model, two fields, ~12 sites)
// so we wrap explicitly at write/read time instead of intercepting
// every query.
//
// Envelope:
//   v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>
//
// `v1:` namespaces the algorithm. If we ever rotate to GCM-SIV or
// XChaCha20-Poly1305, callers detect the prefix and decrypt with the
// matching primitive.
//
// Plaintext fallback on decrypt:
// `decryptToken("plain-string-with-no-v1-prefix")` returns the input
// unchanged. This is **deliberate**, not lazy. It lets the existing
// plaintext rows in dev.db keep working until the one-shot migration
// script (scripts/encrypt-calendar-tokens.ts) re-encrypts them in
// place. After the migration, every column value starts with `v1:`;
// the plaintext branch becomes dead code in steady state.

const ENVELOPE_PREFIX = "v1:";
const ALGORITHM: CipherGCMTypes = "aes-256-gcm";
const IV_LEN_BYTES = 12; // GCM standard
const KEY_LEN_BYTES = 32; // AES-256
const AUTH_TAG_LEN_BYTES = 16;

function loadKey(): Buffer {
  const hex = process.env.CALENDAR_TOKEN_KEY;
  if (!hex || hex.length === 0) {
    throw new Error(
      "CALENDAR_TOKEN_KEY is required to encrypt calendar tokens. " +
        "Generate one with: node -e 'console.log(require(\"crypto\").randomBytes(32).toString(\"hex\"))'",
    );
  }
  if (hex.length !== KEY_LEN_BYTES * 2) {
    throw new Error(
      `CALENDAR_TOKEN_KEY must be ${KEY_LEN_BYTES * 2} hex characters (${KEY_LEN_BYTES} bytes). Got ${hex.length}.`,
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptToken(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LEN_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    ENVELOPE_PREFIX.replace(":", ""),
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptToken(envelope: string): string {
  // Plaintext fallback — covers pre-migration rows. Once
  // scripts/encrypt-calendar-tokens.ts has run against the DB, every
  // value starts with `v1:` and this branch never executes.
  if (!envelope.startsWith(ENVELOPE_PREFIX)) {
    return envelope;
  }

  const parts = envelope.split(":");
  if (parts.length !== 4) {
    throw new Error("Calendar token envelope is malformed (expected 4 parts).");
  }
  const [, ivB64, authTagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  if (iv.length !== IV_LEN_BYTES) {
    throw new Error(`Calendar token IV is ${iv.length} bytes; expected ${IV_LEN_BYTES}.`);
  }
  if (authTag.length !== AUTH_TAG_LEN_BYTES) {
    throw new Error(
      `Calendar token auth tag is ${authTag.length} bytes; expected ${AUTH_TAG_LEN_BYTES}.`,
    );
  }

  const key = loadKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  // .final() throws when the auth tag doesn't verify — that's the
  // tamper detection. Caller sees a thrown Error; calendar adapter
  // surfaces it as a connection failure and the user is asked to
  // reconnect.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// Useful in the migration script and in tests to detect "is this row
// already encrypted?". Cheaper than try/catch on decrypt.
export function isEncryptedEnvelope(value: string): boolean {
  return value.startsWith(ENVELOPE_PREFIX);
}
