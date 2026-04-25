import { auth } from "@/auth";
import { redirect } from "next/navigation";

// Settings stub — Phase 2 covers timezone, password change, account
// deletion, and webhook tokens. For now it's a marker so the route
// resolves and the sidebar nav doesn't 404.
export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main className="bru-main">
      <div className="mx-auto w-full max-w-[760px] px-4 py-10 sm:px-6 sm:py-14">
        <div className="border-b-2 border-bru-line-strong pb-6">
          <p className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase opacity-55">
            Host · Settings
          </p>
          <h1 className="mt-3 text-bru-h2 font-black uppercase tracking-tight">
            Account
          </h1>
        </div>
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
      </div>
    </main>
  );
}
