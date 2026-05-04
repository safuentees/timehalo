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
  trigger?: ReactElement;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  cancelLabel: string;
  pending?: boolean;
  onConfirm: () => unknown | Promise<unknown>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
  open: openProp,
  onOpenChange,
}: ConfirmDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) onOpenChange?.(next);
    else setInternalOpen(next);
  };

  async function handleConfirm() {
    try {
      await onConfirm();
      setOpen(false);
    } catch {
    }
  }

  return (
    <ResponsiveModal open={open} onOpenChange={setOpen}>
      {trigger ? (
        <ResponsiveModalTrigger asChild>{trigger}</ResponsiveModalTrigger>
      ) : null}
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
