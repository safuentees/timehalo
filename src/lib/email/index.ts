import "server-only";
import { createLogger } from "@/lib/logger";
import { redactEmailString } from "@/lib/sentry-redact";
import { renderEmail } from "./render";
import { resend, EMAIL_FROM } from "./resend";
import {
  type TemplateName,
  type TemplatePropsMap,
  getSubject,
  renderTemplateElement,
} from "./templates";

const log = createLogger("email");

export type { TemplateName, TemplatePropsMap } from "./templates";

function devSubjectPrefix(): string {
  const isProd = process.env.VERCEL_ENV === "production";
  const branch = process.env.VERCEL_GIT_COMMIT_REF;
  if (isProd || !branch) return "";
  return `[${branch}] `;
}

function resolveRecipient(to: string): string {
  if (process.env.VERCEL_ENV === "production") return to;
  const devRedirect = process.env.EMAIL_DEV_REDIRECT;
  if (devRedirect) return devRedirect;
  return "delivered@resend.dev";
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; reason: "no-key" | "send-failed"; error?: unknown };

export type TemplateInput<T extends TemplateName> = Omit<
  TemplatePropsMap[T],
  "recipientEmail"
>;

export async function sendEmail<T extends TemplateName>(opts: {
  to: string;
  template: T;
  props: TemplateInput<T>;
}): Promise<SendEmailResult> {
  if (!resend) {
    log.warn("RESEND_API_KEY not set — skipping send", {
      template: opts.template,
      to: redactEmailString(opts.to),
    });
    return { ok: false, reason: "no-key" };
  }

  const fullProps = {
    ...opts.props,
    recipientEmail: opts.to,
  } as TemplatePropsMap[T];

  const subject = `${devSubjectPrefix()}${getSubject(
    opts.template,
    fullProps,
  )}`;
  const element = renderTemplateElement(opts.template, fullProps);
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
      log.error("resend returned error", {
        template: opts.template,
        to: redactEmailString(opts.to),
        error: serializeError(result.error),
      });
      return { ok: false, reason: "send-failed", error: result.error };
    }
    return { ok: true, id: result.data?.id ?? "unknown" };
  } catch (error) {
    log.error("resend send threw", {
      template: opts.template,
      to: redactEmailString(opts.to),
      error: serializeError(error),
    });
    return { ok: false, reason: "send-failed", error };
  }
}

function serializeError(err: unknown): {
  name?: string;
  message?: string;
  raw?: string;
} {
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  return { raw: typeof err === "string" ? err : JSON.stringify(err) };
}
