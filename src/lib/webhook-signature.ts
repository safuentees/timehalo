
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
