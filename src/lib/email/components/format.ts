// Shared formatters for transactional emails. The previous template
// boilerplate copied `formatSlot()` into 4 files; centralized here so
// the format string is owned in ONE place.

/**
 * Formats a slot's start time as a single mono-friendly line:
 *   "FRI MAY 16 — 2:30 PM UTC"
 *
 * UTC explicit because emails are sent across timezones — the
 * recipient's mail client doesn't know the host's zone, so the
 * embedded ICS is what should drive their calendar. The visible
 * line stays unambiguous.
 */
export function formatSlotLine(iso: string): string {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
  const month = d.toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const day = d.getUTCDate();
  const hour24 = d.getUTCHours();
  const hour12 = ((hour24 + 11) % 12) + 1;
  const minute = String(d.getUTCMinutes()).padStart(2, "0");
  const suffix = hour24 < 12 ? "AM" : "PM";
  return `${weekday.toUpperCase()} ${month.toUpperCase()} ${day} — ${hour12}:${minute} ${suffix} UTC`;
}
