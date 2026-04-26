import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminHandle } from "@/lib/admin";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";

export default async function AdminFeatureFlagsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { handle: true },
  });
  if (!isAdminHandle(me?.handle)) redirect("/bookings");

  const trpc = await createPrivateSSRHelper();
  const flags = await trpc.admin.featureFlags.list.fetch();

  return (
    <section>
      <p className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.2px] uppercase opacity-55">
        Feature flags · {flags.length} known
      </p>
      <ul role="list" className="mt-5 flex flex-col gap-3">
        {flags.map((f) => (
          <li
            key={f.slug}
            className="border-2 border-bru-line-strong p-5"
          >
            <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <div className="min-w-0">
                <p className="font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2px] uppercase opacity-55">
                  {f.type} · {f.hasRow ? "DB row" : "default"}
                </p>
                <h2 className="mt-2 text-[18px] font-black leading-tight">
                  {f.slug}
                </h2>
              </div>
              <span
                className={[
                  "font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2px] uppercase",
                  f.enabled ? "text-bru-content" : "opacity-55",
                ].join(" ")}
              >
                {f.enabled ? "ON" : "OFF"}
              </span>
            </header>
            {f.description ? (
              <p className="mt-3 text-[13px] leading-[1.5] opacity-75">
                {f.description}
              </p>
            ) : null}
            <p className="mt-3 font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[1.5px] uppercase opacity-55">
              {f.assignments.length === 0
                ? "Globally on (no assignment scoping)"
                : `Scoped to ${f.assignments.length} user(s)`}
            </p>
            {f.assignments.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {f.assignments.map((a) => (
                  <li
                    key={a.handle}
                    className="border border-bru-line px-2 py-1 font-[family-name:var(--bru-mono)] text-[11px]"
                  >
                    @{a.handle}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-6 font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[1.5px] uppercase opacity-55">
        Mutations live on admin.featureFlags.{"{"}setEnabled, assign, unassign{"}"}
      </p>
    </section>
  );
}
