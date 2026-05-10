
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
