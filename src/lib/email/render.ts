import "server-only";
import { render } from "@react-email/render";
import type { ReactElement } from "react";

// Render a React Email component to both HTML and plain-text in
// parallel. Resend accepts either; we send both so clients without
// HTML support (or that filter HTML for security) still see the
// message. Mirrors rallly's render.ts pattern (packages/emails/src/
// send-email.tsx:101-104).
export async function renderEmail(component: ReactElement): Promise<{
  html: string;
  text: string;
}> {
  const [html, text] = await Promise.all([
    render(component),
    render(component, { plainText: true }),
  ]);
  return { html, text };
}
