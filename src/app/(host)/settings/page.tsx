import { redirect } from "next/navigation";

// Settings is now a hub of sub-routes (general / workflows / calendars /
// developer / billing / danger). Hitting /settings lands on the
// canonical default — General — which carries the smallest payload
// (timezone + language + theme, all backed by the already-prefetched
// users.me query).
export default function SettingsIndexPage() {
  redirect("/settings/general");
}
