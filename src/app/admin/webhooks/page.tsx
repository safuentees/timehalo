import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminHandle } from "@/lib/admin";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";

export default async function AdminWebhooksPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { handle: true },
  });
  if (!isAdminHandle(me?.handle)) redirect("/bookings");

  const trpc = await createPrivateSSRHelper();
  const [subs, failed] = await Promise.all([
    trpc.admin.webhooks.listAll.fetch(),
    trpc.admin.webhooks.failedDeliveries.fetch(),
  ]);

  return (
    <section className="flex flex-col gap-10">
      <div>
        <p className="oh-legend">
          Subscriptions ({subs.length})
        </p>
        <ul role="list" className="mt-5 flex flex-col gap-3">
          {subs.map((s) => (
            <li
              key={s.id}
              className="border-2 border-oh-line-strong p-5"
            >
              <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <div className="min-w-0">
                  <p className="oh-eyebrow">
                    @{s.user.handle ?? "no-handle"}
                  </p>
                  <p className="mt-1 font-[family-name:var(--oh-mono)] text-[11px] opacity-65">
                    {s.user.email}
                  </p>
                  <h2 className="mt-2 truncate text-[15px] font-bold">
                    {s.subscriberUrl}
                  </h2>
                </div>
                <span
                  className={[
                    "font-[family-name:var(--oh-mono)] text-[11px] font-extrabold tracking-[2px] uppercase",
                    s.active ? "text-oh-content" : "opacity-55",
                  ].join(" ")}
                >
                  {s.active ? "ACTIVE" : "INACTIVE"}
                </span>
              </header>
              <p className="mt-3 font-[family-name:var(--oh-mono)] text-[11px] tracking-[1.5px] opacity-65">
                {s.events}
              </p>
            </li>
          ))}
          {subs.length === 0 ? (
            <p className="text-[13px] opacity-65">No subscriptions yet.</p>
          ) : null}
        </ul>
      </div>

      <div>
        <p className="oh-legend">
          Permanently failed deliveries ({failed.length})
        </p>
        <ul role="list" className="mt-5 flex flex-col gap-3">
          {failed.map((t) => (
            <li
              key={t.id}
              className="border-[1.5px] border-oh-line p-4"
            >
              <p className="oh-legend">
                Task #{t.id} ({t.attempts}/{t.maxAttempts} attempts)
              </p>
              <p className="mt-1 font-[family-name:var(--oh-mono)] text-[12px] opacity-90">
                {t.referenceUid ?? "(no ref)"}
              </p>
              {t.lastError ? (
                <p className="mt-2 text-[12px] leading-[1.45] opacity-75">
                  {t.lastError}
                </p>
              ) : null}
            </li>
          ))}
          {failed.length === 0 ? (
            <p className="text-[13px] opacity-65">
              No permanently failed deliveries.
            </p>
          ) : null}
        </ul>
        <p className="mt-4 oh-eyebrow">
          Retry via admin.webhooks.retry({"{"} taskId {"}"})
        </p>
      </div>
    </section>
  );
}
