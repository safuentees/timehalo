"use client";

import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import BookingDetail from "@/app/(host)/bookings/[publicUid]/components/booking-detail";

// Right-side Sheet that wraps the existing BookingDetail in
// drawer mode. Closing the drawer pops the URL via router.back(),
// which makes the intercepted route stop matching and the slot
// reverts to default.tsx (null).
//
// SheetTitle + SheetDescription are visually hidden but required
// for the Base UI Dialog primitive's accessibility contract.
// BookingDetail itself renders a visible heading inside the body.
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
