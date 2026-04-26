import "server-only";
import { renderEmail } from "./render";
import { resend, EMAIL_FROM } from "./resend";
import {
  type TemplateName,
  type TemplatePropsMap,
  getSubject,
  renderTemplateElement,
} from "./templates";

export type { TemplateName, TemplatePropsMap } from "./templates";

function devSubjectPrefix(): string {
  const isProd = process.env.VERCEL_ENV === "production";
  const branch = process.env.VERCEL_GIT_COMMIT_REF;
  if (isProd || !branch) return "";
  return `[${branch}] `;
}

function resolveRecipient(to: string): string {
  if (process.env.VERCEL_ENV === "production") return to;
  return "delivered@resend.dev";
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; reason: "no-key" | "send-failed"; error?: unknown };

export async function sendEmail<T extends TemplateName>(opts: {
  to: string;
  template: T;
  props: TemplatePropsMap[T];
}): Promise<SendEmailResult> {
  if (!resend) {
    console.info(
      "[email] RESEND_API_KEY not set — skipping send (template=%s, to=%s)",
      opts.template,
      opts.to,
    );
    return { ok: false, reason: "no-key" };
  }

  const subject = `${devSubjectPrefix()}${getSubject(
    opts.template,
    opts.props,
  )}`;
  const element = renderTemplateElement(opts.template, opts.props);
  const { html, text } = await renderEmail(element);

  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to: resolveRecipient(opts.to),
      subject,
      html,
      text,
    });
    if (result.error) {
      console.error("[email] Resend returned error:", result.error);
      return { ok: false, reason: "send-failed", error: result.error };
    }
    return { ok: true, id: result.data?.id ?? "unknown" };
  } catch (error) {
    console.error("[email] Send threw:", error);
    return { ok: false, reason: "send-failed", error };
  }
}
