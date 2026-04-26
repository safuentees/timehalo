import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminHandle } from "@/lib/admin";

export default async function AdminIndex() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { handle: true },
  });
  if (!isAdminHandle(me?.handle)) redirect("/bookings");

  return (
    <div className="text-[14px] leading-[1.55] opacity-75 max-w-prose">
      <p>
        Three operator surfaces live here. Pick one from the nav above.
        Audit trails are addressed per booking — paste a booking
        publicUid into the URL: <code>/admin/audit/&lt;uid&gt;</code>.
      </p>
    </div>
  );
}
