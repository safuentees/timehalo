import { createEvent } from "ics";
import { prisma } from "@/lib/prisma";

const PRODUCT_ID = "-//Officehours//EN";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ uid: string }> },
) {
  const { uid } = await params;

  const booking = await prisma.booking.findUnique({
    where: { publicUid: uid },
    select: {
      publicUid: true,
      visitorName: true,
      visitorEmail: true,
      question: true,
      slotStart: true,
      slotEnd: true,
      host: {
        select: {
          name: true,
          email: true,
          handle: true,
        },
      },
    },
  });

  if (!booking) {
    return Response.json({ error: "Booking not found" }, { status: 404 });
  }

  const start = booking.slotStart;
  const end = booking.slotEnd;
  const hostName = booking.host.name ?? booking.host.handle ?? "Host";

  const { error, value } = createEvent({
    uid: `${booking.publicUid}@officehours.app`,
    productId: PRODUCT_ID,
    title: `Office hours with ${hostName}`,
    description: booking.question
      ? `Question: ${booking.question}\n\nReference: ${booking.publicUid}`
      : `Reference: ${booking.publicUid}`,
    startInputType: "utc",
    startOutputType: "utc",
    start: [
      start.getUTCFullYear(),
      start.getUTCMonth() + 1,
      start.getUTCDate(),
      start.getUTCHours(),
      start.getUTCMinutes(),
    ],
    end: [
      end.getUTCFullYear(),
      end.getUTCMonth() + 1,
      end.getUTCDate(),
      end.getUTCHours(),
      end.getUTCMinutes(),
    ],
    organizer: {
      name: hostName,
      email: booking.host.email,
    },
    attendees: [
      {
        name: booking.visitorName,
        email: booking.visitorEmail,
        rsvp: false,
        partstat: "ACCEPTED",
        role: "REQ-PARTICIPANT",
      },
    ],
    method: "PUBLISH",
    status: "CONFIRMED",
  });

  if (error || !value) {
    return Response.json(
      { error: "Failed to generate calendar file" },
      { status: 500 },
    );
  }

  return new Response(value, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="officehours.ics"',
      "Cache-Control": "no-store",
    },
  });
}
