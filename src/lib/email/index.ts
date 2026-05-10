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

// Branch-prefixed dev subjects so a Vercel preview deploy doesn't
// look like prod in the inbox. dub uses VERCEL_GIT_COMMIT_REF; we
// pick up the same env so a preview branch lands as `[branch] subject`.
function devSubjectPrefix(): string {
  const isProd = process.env.VERCEL_ENV === "production";
  const branch = process.env.VERCEL_GIT_COMMIT_REF;
  if (isProd || !branch) return "";
  return `[${branch}] `;
}

// Dev sink — same trick as dub's send-via-resend.ts:30. In dev /
// preview, every send routes to Resend's dev address by default so
// we never surprise a real user with a test send.
//
// Opt-in override: `EMAIL_DEV_REDIRECT` in .env can route dev sends to
// a developer's own inbox instead of the Resend sink — useful while
// walking the features-and-tests checklist (booking reminders,
// workspace invites, magic links) and wanting to actually see the
// rendered email arrive somewhere clickable. Production
// (`VERCEL_ENV=production`) always uses the real recipient regardless.
function resolveRecipient(to: string): string {
  if (process.env.VERCEL_ENV === "production") return to;
  const devRedirect = process.env.EMAIL_DEV_REDIRECT;
  if (devRedirect) return devRedirect;
  return "delivered@resend.dev";
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; reason: "no-key" | "send-failed"; error?: unknown };

/**
 * Public input shape — every template's props minus `recipientEmail`,
 * which `sendEmail()` auto-injects from `opts.to`. Means callers
 * never need to repeat the address. The shared `OhEmailLayout`
 * footer reads it on render to surface "this email was sent to X"
 * (dub.co's pattern, applied universally).
 */
export type TemplateInput<T extends TemplateName> = Omit<
  TemplatePropsMap[T],
  "recipientEmail"
>;

/**
 * Send a templated email synchronously via Resend.
 *
 * Most call sites should NOT use this directly — enqueue a Task row
 * via `scheduleEmailSend()` instead. The cron processor calls this.
 *
 * Graceful skip when RESEND_API_KEY is unset: returns
 * `{ ok: false, reason: "no-key" }` so the cron can mark the task
 * succeeded (we don't want to retry forever on a config gap).
 */
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

  // Inject `recipientEmail` from `to` so the layout's footer can
  // render "this email was sent to X" without callers repeating
  // themselves at every callsite.
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
