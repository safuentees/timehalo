import { createEvent } from "ics";
import { prisma } from "@/lib/prisma";

// GET /api/bookings/:uid/calendar — returns an RFC 5545 .ics file
// for a single booking. The visitor's confirmation page button
// already links here; clicking it downloads `officehours.ics`, which
// the OS hands off to Apple Calendar / Outlook / Google Calendar with
// the slot pre-filled.
//
// Pattern reference: rallly's apps/web/src/app/api/event/[...route]/route.ts
// `app.get("/:eventId/ics", ...)` handler. Same shape — fetch the row,
// call ics.createEvent({...}), return text/calendar with a filename
// in Content-Disposition.
//
// Auth: public-by-design. publicUid is a cuid (cryptographically
// random); whoever has the URL is treated as authorized to download
// the calendar attachment. Same model rallly uses.

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

  // ics.createEvent expects start/end as [year, month-1-indexed-month,
  // day, hour, minute] arrays. Using getUTC* + startInputType:"utc"
  // matches rallly's pattern (apps/web/src/utils/ics.ts:55-90) and
  // produces a calendar entry that's correct in every timezone.
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
      // Don't cache — booking details could change (cancel, reschedule).
      "Cache-Control": "no-store",
    },
  });
}
