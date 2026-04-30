import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminHandle } from "@/lib/admin";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";

export default async function AdminAuditPage({
  params,
}: {
  params: Promise<{ bookingUid: string }>;
}) {
  const { bookingUid } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { handle: true },
  });
  if (!isAdminHandle(me?.handle)) redirect("/bookings");

  const trpc = await createPrivateSSRHelper();
  type AuditRow = {
    id: number;
    actor: string;
    action: string;
    data: unknown;
    operationId: string;
    createdAt: string | Date;
  };
  const trail = (await trpc.admin.audit.byBookingUid.fetch({
    bookingUid,
  })) as unknown as AuditRow[];

  function fmtCreatedAt(value: string | Date): string {
    return typeof value === "string" ? value : value.toISOString();
  }

  return (
    <section>
      <p className="oh-legend">
        Audit · {bookingUid}
      </p>
      {trail.length === 0 ? (
        <p className="mt-6 text-[13px] opacity-65">
          No audit rows for that booking uid.
        </p>
      ) : (
        <ol role="list" className="mt-6 flex flex-col gap-3">
          {trail.map((row) => {
            const stamp = fmtCreatedAt(row.createdAt);
            return (
              <li
                key={row.id}
                className="border-[1.5px] border-oh-line p-4"
              >
                <p className="font-[family-name:var(--oh-mono)] text-[11px] font-extrabold tracking-[1.5px] uppercase opacity-65">
                  {row.actor} · {row.action} ·{" "}
                  <time dateTime={stamp} className="opacity-90">
                    {stamp}
                  </time>
                </p>
                <p className="mt-1 font-[family-name:var(--oh-mono)] text-[10px] tracking-[1.5px] opacity-55">
                  op: {row.operationId}
                </p>
                <pre className="mt-3 overflow-x-auto bg-oh-bg-muted p-3 font-[family-name:var(--oh-mono)] text-[11px] leading-[1.45]">
                  {JSON.stringify(row.data, null, 2)}
                </pre>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
