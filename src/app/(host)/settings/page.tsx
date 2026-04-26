import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { BrutalistPageHeader } from "@/components/brutalist/page-header";
import { BrutalistPageShell } from "@/components/brutalist/page-shell";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main className="bru-main">
      <BrutalistPageShell>
        <BrutalistPageHeader title="Account" />
        <p className="mt-8 text-[14px] leading-[1.55] opacity-65 max-w-prose">
          Timezone, password, danger zone. Lands here once a story
          requires it. For now: edit your handle on{" "}
          <a
            href="/profile"
            className="underline underline-offset-4 hover:opacity-100 opacity-80"
          >
            /profile
          </a>{" "}
          and your weekly hours on{" "}
          <a
            href="/availability"
            className="underline underline-offset-4 hover:opacity-100 opacity-80"
          >
            /availability
          </a>
          .
        </p>
      </BrutalistPageShell>
    </main>
  );
}
