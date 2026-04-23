import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookingUid: string }> },
) {
  const { bookingUid } = await params;

  const booking = await prisma.booking.findUnique({
    where: { publicUid: bookingUid },
    select: {
      publicUid: true,
      slotStart: true,
      slotEnd: true,
      host: {
        select: {
          name: true,
          handle: true,
        },
      },
    },
  });

  if (!booking) {
    return new Response("Booking not found", { status: 404 });
  }

  const hostName = booking.host.name ?? booking.host.handle ?? "Host";
  const calendarBody = buildCalendarFile({
    uid: booking.publicUid,
    title: `Office hours with ${hostName}`,
    description: `Booked via Officehours. Reference ${booking.publicUid}.`,
    slotStart: booking.slotStart,
    slotEnd: booking.slotEnd,
  });

  return new Response(calendarBody, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="officehours-${booking.publicUid}.ics"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}

function buildCalendarFile({
  uid,
  title,
  description,
  slotStart,
  slotEnd,
}: {
  uid: string;
  title: string;
  description: string;
  slotStart: Date;
  slotEnd: Date;
}) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Officehours//Booking Receipt//EN",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(uid)}@officehours`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(slotStart)}`,
    `DTEND:${toIcsUtc(slotEnd)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

function toIcsUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
