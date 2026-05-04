"use client";

import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import BookingDetail from "@/app/(host)/bookings/[publicUid]/components/booking-detail";

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
