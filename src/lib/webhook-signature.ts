// HMAC SHA-256 signing for outbound webhook bodies — ported almost
// verbatim from dub.co's apps/web/lib/webhook/signature.ts. Uses
// Web Crypto (crypto.subtle) so the same code works in Node, edge,
// and worker runtimes without a node:crypto import.
//
// Convention: receiver verifies by:
//   1. Reading the raw request body as a string (NOT parsed JSON —
//      whitespace differences break the hash).
//   2. Computing HMAC SHA-256 with their copy of `secret`.
//   3. Comparing in constant time against the X-Officehours-Signature
//      header value.
//
// Header name `X-Officehours-Signature` — matches the dub `Dub-Signature`
// / cal `X-Cal-Signature-256` convention of `<vendor>-Signature`.

export async function signWebhookBody(
  secret: string,
  body: string,
): Promise<string> {
  if (!secret) {
    throw new Error("Webhook secret is empty — refusing to sign");
  }

  const keyData = new TextEncoder().encode(secret);
  const messageData = new TextEncoder().encode(body);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
