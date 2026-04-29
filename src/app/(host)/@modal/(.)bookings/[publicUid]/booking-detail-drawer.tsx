"use client";

import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import BookingDetail from "@/app/(host)/bookings/[publicUid]/components/booking-detail";

export default function BookingDetailDrawer({
  publicUid,
}: {
  publicUid: string;
}) {
  const router = useRouter();
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) router.back();
      }}
    >
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-xl"
      >
        <SheetTitle className="sr-only">Booking</SheetTitle>
        <SheetDescription className="sr-only">
          Full booking detail with audit history and actions.
        </SheetDescription>
        <BookingDetail publicUid={publicUid} variant="drawer" />
      </SheetContent>
    </Sheet>
  );
}
