
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
