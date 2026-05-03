import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { getTranslations, getFormatter } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OhPageShell } from "@/components/oh/page-shell";
import { createPublicSSRHelper } from "@/trpc/server-helpers";

// B.PT62b — team booking confirmation page. Per branch 5, this is
// the FIRST surface where the visitor learns which host they were
// assigned to. The picked host's name + avatar reveal here; the
// flow up to this point only showed event-type metadata + workspace
// avatars stack.

export default async function TeamBookingConfirmationPage({
  params,
}: {
  params: Promise<{ slug: string; eventTypeSlug: string; uid: string }>;
}) {
  const { slug, eventTypeSlug, uid } = await params;
  const trpc = await createPublicSSRHelper();
  const t = await getTranslations("TeamBooking");
  const format = await getFormatter();

  let booking;
  try {
    booking = await trpc.workspaces.publicGetTeamConfirmation.fetch({
      slug,
      eventTypeSlug,
      bookingUid: uid,
    });
  } catch (err) {
    if (err instanceof TRPCError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  // The procedure's WHERE clause filters on eventType existence, so
  // a non-null booking implies eventType is present. tsc can't infer
  // that across the DB join — narrow defensively here so the JSX
  // below can read `eventType.name` directly.
  if (!booking.eventType) notFound();
  const eventType = booking.eventType;

  const start = new Date(booking.slotStart);
  const end = new Date(booking.slotEnd);
  const hostName =
    booking.host.name ?? booking.host.handle ?? t("yourHost");
  const initials = hostName
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <main className="min-h-screen bg-oh-bg" id="top">
      <OhPageShell tight>
        <header className="flex flex-col items-center gap-4 text-center">
          <CheckCircle2
            aria-hidden
            strokeWidth={1.5}
            className="size-10 text-[color:var(--oh-content-muted)]"
          />
          <span className="oh-eyebrow opacity-100">{t("confirmed")}</span>
          <h1 className="text-[clamp(28px,1rem+3vw,40px)] font-black leading-[1.1] tracking-tight">
            {t("confirmedTitle")}
          </h1>
          <p className="oh-description text-center">
            {t("confirmedBody", {
              eventType: eventType.name,
              hostName,
            })}
          </p>
        </header>

        <section className="mt-12 flex items-center gap-4 rounded-(--oh-r-sm) border border-oh-line bg-oh-bg p-4 sm:p-5">
          <Avatar size="default">
            <AvatarImage
              src={booking.host.image ?? undefined}
              alt={hostName}
            />
            <AvatarFallback className="bg-[color:var(--oh-tint)] font-[family-name:var(--oh-mono)] text-[10px] font-extrabold uppercase tracking-[1px]">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col leading-tight">
            <span className="text-[15px] font-semibold">{hostName}</span>
            <span className="oh-eyebrow tabular-nums">
              {booking.host.handle ? `@${booking.host.handle}` : null}
            </span>
          </div>
        </section>

        <section className="mt-6 flex flex-col gap-3 border-t border-oh-line pt-6">
          <div className="flex items-baseline justify-between gap-4">
            <span className="oh-eyebrow opacity-100">{t("when")}</span>
            <span className="text-[15px] font-semibold tabular-nums">
              {format.dateTime(start, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="oh-eyebrow opacity-100">{t("time")}</span>
            <span className="text-[15px] font-semibold tabular-nums">
              {format.dateTime(start, {
                hour: "numeric",
                minute: "2-digit",
              })}
              –
              {format.dateTime(end, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="oh-eyebrow opacity-100">{t("duration")}</span>
            <span className="text-[15px] font-semibold tabular-nums">
              {t("durationMinutes", {
                minutes: eventType.durationMins,
              })}
            </span>
          </div>
        </section>

        <p className="mt-12 text-center text-[13px] opacity-65">
          {t("confirmationEmailSent")}
        </p>
      </OhPageShell>
    </main>
  );
}
