import { DangerSection } from "./components/danger-section";

// No prefetch — the delete-account dialog only fires its destroy
// mutation on confirm. No hydrated cache needed.
export default function SettingsDangerPage() {
  return <DangerSection />;
}
