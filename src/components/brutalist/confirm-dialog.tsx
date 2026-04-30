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

type ConfirmDialogProps = {
  trigger: ReactElement;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  cancelLabel: string;
  pending?: boolean;
  onConfirm: () => unknown | Promise<unknown>;
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
              variant="brutalistGhost"
              size="brutalist"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant="brutalist"
              size="brutalist"
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
