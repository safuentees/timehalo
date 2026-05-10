// Shared PII redactor for Sentry beforeSend hooks (server + edge).
//
// E3 contract: visitor email, visitor name, booking notes, and any
// other field whose value is plausibly PII MUST NOT appear in Sentry
// events. The Replay integration handles browser inputs (E2's
// maskAllText). This module covers the server side: errors thrown
// inside tRPC procedures, cron-task failures, anywhere `extra`
// metadata might carry a visitor's row.
//
// Two redaction passes:
//   1. KEY-based — any key matching PII_KEY_PATTERN gets value
//      replaced with "<redacted>" regardless of its content.
//   2. VALUE-based — strings that look like email addresses get
//      partial-masked ("ma***@example.com") even when the key is
//      benign ("message", "subject", etc.) so a freeform error
//      message that happens to contain an address still scrubs.

const PII_KEY_PATTERN =
  /^(email|visitorEmail|visitorName|to|from|name|notes|question|password|passwordHash|secret|token)$/i;

const EMAIL_LIKE = /([^\s@,;<>"]{1,3})[^\s@,;<>"]*(@[^\s,;<>"]+)/g;

export function redactEmailString(value: string): string {
  return value.replace(EMAIL_LIKE, "$1***$2");
}

export function redactValue<T>(value: T): T {
  if (typeof value === "string") {
    return redactEmailString(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map(redactValue) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = PII_KEY_PATTERN.test(k) ? "<redacted>" : redactValue(v);
    }
    return out as unknown as T;
  }
  return value;
}

// Sentry's Event type lives in @sentry/core; rather than import it
// (and bump the dep graph) we accept the event positionally and view
// it through a Record<string, unknown> lens for the few fields we
// touch. The function is typed `<E>` so it accepts beforeSend's
// real ErrorEvent input and returns the same nominal type.
export function redactSentryEvent<E>(event: E): E {
  const e = event as unknown as Record<string, unknown>;
  const breadcrumbs = e.breadcrumbs;
  if (Array.isArray(breadcrumbs)) {
    e.breadcrumbs = breadcrumbs.map((crumb: Record<string, unknown>) => {
      const next: Record<string, unknown> = { ...crumb };
      if (crumb.data && typeof crumb.data === "object") {
        next.data = redactValue(crumb.data as Record<string, unknown>);
      }
      if (typeof crumb.message === "string") {
        next.message = redactEmailString(crumb.message);
      }
      return next;
    });
  }
  if (e.extra && typeof e.extra === "object") {
    e.extra = redactValue(e.extra);
  }
  if (e.contexts && typeof e.contexts === "object") {
    e.contexts = redactValue(e.contexts);
  }
  if (typeof e.message === "string") {
    e.message = redactEmailString(e.message);
  }
  const exception = e.exception as
    | { values?: Array<Record<string, unknown>> }
    | undefined;
  if (exception?.values && Array.isArray(exception.values)) {
    exception.values = exception.values.map((v: Record<string, unknown>) => ({
      ...v,
      value:
        typeof v.value === "string" ? redactEmailString(v.value) : v.value,
    }));
  }
  return event;
}
