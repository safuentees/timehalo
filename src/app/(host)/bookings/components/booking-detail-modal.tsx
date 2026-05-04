"use client";

import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import BookingDetail from "@/app/(host)/bookings/[publicUid]/components/booking-detail";

// Booking detail rendered inside the canonical ResponsiveModal
// (Dialog on desktop, vaul Drawer on mobile — same primitive the
// availability blocks editor uses).
//
// Replaces the prior intercepted-route approach
// (`@modal/(.)bookings/[publicUid]`). State-driven open keeps the
// transition synchronous, drops the [role="dialog"] ESC race
// workaround, and lets prev/next chevrons swap the booking in place
// without a router roundtrip. The standalone page route at
// `bookings/[publicUid]/page.tsx` stays as the deep-link / hard-
// refresh fallback.
//
// Title + Description are visually hidden — Base UI Dialog requires
// them for the a11y contract. BookingDetail renders its own visible
// heading inside the body.
export function BookingDetailModal({
  uid,
  onUidChange,
}: {
  uid: string | null;
  onUidChange: (uid: string | null) => void;
}) {
  const open = uid !== null;
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        if (!next) onUidChange(null);
      }}
    >
      <ResponsiveModalContent
        defaultClose
        desktopClassName="!h-auto max-h-[calc(100vh-2*var(--oh-modal-vinset))] overflow-y-auto"
      >
        <ResponsiveModalTitle className="sr-only">
          Booking
        </ResponsiveModalTitle>
        <ResponsiveModalDescription className="sr-only">
          Full booking detail with audit history and actions.
        </ResponsiveModalDescription>
        {uid ? (
          <BookingDetail
            publicUid={uid}
            variant="modal"
            onNavigate={(next) => onUidChange(next)}
            onClose={() => onUidChange(null)}
          />
        ) : null}
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
