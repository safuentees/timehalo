"use client";

import { useState, type ReactElement, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  ResponsiveModal,
  ResponsiveModalBody,
  ResponsiveModalContent,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  ResponsiveModalTrigger,
} from "@/components/ui/responsive-modal";

// One affordance for "are you sure?" — replaces native window.confirm
// (breaks the brutalist palette and mobile-hostile) and the
// click-and-pray destructive buttons that ship with no confirmation
// at all. Both flagged in the audit (§5.4 + §5.5). Sits on top of
// ResponsiveModal so the OS-level form-factor swap (Drawer on
// mobile, Dialog on desktop) carries through automatically.
//
// Pending state comes from `pending` prop (consumer drives it from
// their mutation hook). The confirm button shows the pending label
// while running, then the modal closes on resolve. The promise
// returned by onConfirm is awaited so the close-on-resolve behaviour
// works whether the consumer uses await/then or fires-and-forgets.

type ConfirmDialogProps = {
  /** The clickable element that opens the dialog (rendered inside ResponsiveModalTrigger asChild). */
  trigger: ReactElement;
  title: string;
  description: ReactNode;
  /** Default: "Confirm". */
  confirmLabel: string;
  /** Label rendered while the onConfirm promise is in flight. Default: confirmLabel + "…". */
  pendingLabel?: string;
  /** Default: "Cancel". */
  cancelLabel: string;
  /** Pending state from the consumer's mutation hook. Disables both buttons + swaps the confirm label. */
  pending?: boolean;
  /** Awaited; the dialog closes on resolve. Throw to keep it open (e.g. for inline error display). Return value (if any) is ignored. */
  onConfirm: () => unknown | Promise<unknown>;
  /**
   * Visual weight of the confirm button. "primary" (default) uses the
   * brutalist filled variant — same affordance as Save / Submit elsewhere.
   * Currently the only supported tone; a "destructive" variant would slot
   * in here if/when the brutalist palette grows a danger token.
   */
  tone?: "primary";
};

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel,
  pending = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);

  async function handleConfirm() {
    try {
      await onConfirm();
      setOpen(false);
    } catch {
      // Consumer chose to keep the dialog open (e.g. they want to
      // surface an inline error). Swallow here; the consumer's hook
      // is responsible for the error toast / inline message.
    }
  }

  return (
    <ResponsiveModal open={open} onOpenChange={setOpen}>
      <ResponsiveModalTrigger asChild>{trigger}</ResponsiveModalTrigger>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>{title}</ResponsiveModalTitle>
        </ResponsiveModalHeader>
        <ResponsiveModalBody>
          {typeof description === "string" ? (
            <p className="oh-description">{description}</p>
          ) : (
            description
          )}
          <ResponsiveModalFooter>
            <Button
              type="button"
              variant="ohGhost"
              size="oh"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant="oh"
              size="oh"
              onClick={handleConfirm}
              disabled={pending}
            >
              {pending ? (pendingLabel ?? `${confirmLabel}…`) : confirmLabel}
            </Button>
          </ResponsiveModalFooter>
        </ResponsiveModalBody>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
