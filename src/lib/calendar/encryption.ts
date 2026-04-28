import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCMTypes,
} from "node:crypto";

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
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function isEncryptedEnvelope(value: string): boolean {
  return value.startsWith(ENVELOPE_PREFIX);
}
