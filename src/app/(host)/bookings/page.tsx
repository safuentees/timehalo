import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function BookingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main className="bru-main">
      <div className="mx-auto w-full max-w-[760px] px-4 py-10 sm:px-6 sm:py-14">
        <div className="border-b-2 border-bru-line-strong pb-6">
          <p className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase opacity-55">
            Host · Bookings
          </p>
          <h1 className="mt-3 text-bru-h2 font-black uppercase tracking-tight">
            Pending bookings
          </h1>
        </div>
        <p className="mt-8 text-[14px] leading-[1.55] opacity-65 max-w-prose">
          Visitors who have booked a slot will show up here. You&apos;ll be
          able to confirm them, cancel them, or jump to a per-booking detail
          view. The list lights up once the first visitor books.
        </p>
        <p className="mt-3 font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2.5px] uppercase opacity-45">
          Coming next · listForHost · confirm/cancel mutations
        </p>
      </div>
    </main>
  );
}
