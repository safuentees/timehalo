"use client";

import {
  createContext,
  useContext,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import { XIcon } from "lucide-react";
import { Drawer as DrawerPrimitive } from "vaul";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

const MOBILE_QUERY = "(max-width: 767px)";

type ModalCtx = {
  isMobile: boolean;
  nested: boolean;
  mobilePortalContainer: HTMLElement | null;
  setMobilePortalContainer: (el: HTMLElement | null) => void;
};

const Ctx = createContext<ModalCtx | null>(null);

function useResponsiveModal() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "ResponsiveModal subcomponents must be used inside <ResponsiveModal>",
    );
  }
  return ctx;
}

export function useResponsiveModalPortalContainer(): HTMLElement | null {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  return ctx.isMobile ? ctx.mobilePortalContainer : null;
}

type RootProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  nested?: boolean;
};

export function ResponsiveModal({
  open,
  onOpenChange,
  children,
  nested = false,
}: RootProps) {
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [mobilePortalContainer, setMobilePortalContainer] =
    useState<HTMLElement | null>(null);

  const Root = isMobile
    ? nested
      ? DrawerPrimitive.NestedRoot
      : DrawerPrimitive.Root
    : null;

  return (
    <Ctx.Provider
      value={{
        isMobile,
        nested,
        mobilePortalContainer,
        setMobilePortalContainer,
      }}
    >
      {isMobile && Root ? (
        <Root open={open} onOpenChange={onOpenChange}>
          {children}
        </Root>
      ) : (
        <Dialog open={open} onOpenChange={onOpenChange}>
          {children}
        </Dialog>
      )}
    </Ctx.Provider>
  );
}

type TriggerProps = ComponentProps<typeof DrawerPrimitive.Trigger> & {
  asChild?: boolean;
};

export function ResponsiveModalTrigger({
  asChild,
  children,
  ...props
}: TriggerProps) {
  const { isMobile } = useResponsiveModal();
  if (isMobile) {
    return (
      <DrawerPrimitive.Trigger asChild={asChild} {...props}>
        {children}
      </DrawerPrimitive.Trigger>
    );
  }
  // @base-ui/react Dialog uses `render` instead of `asChild`. Pass the lone
  if (asChild) {
    return (
      <DialogTrigger render={children as ReactElement} {...(props as object)} />
    );
  }
  return <DialogTrigger {...(props as object)}>{children}</DialogTrigger>;
}

type ContentProps = {
  children: ReactNode;
  mobileClassName?: string;
  desktopClassName?: string;
  overlayClassName?: string;
  showHandle?: boolean;
  showCloseButton?: boolean;
  defaultClose?: boolean;
};

export function ResponsiveModalContent({
  children,
  mobileClassName,
  desktopClassName,
  overlayClassName,
  showHandle = true,
  showCloseButton = false,
  defaultClose = true,
}: ContentProps) {
  const { isMobile, setMobilePortalContainer } = useResponsiveModal();

  if (isMobile) {
    return (
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay
          className={cn("oh-drawer-overlay", overlayClassName)}
        />
        <DrawerPrimitive.Content
          ref={setMobilePortalContainer}
          className={cn("oh-drawer-content", mobileClassName)}
        >
          {showHandle ? (
            <DrawerPrimitive.Handle className="oh-drawer-handle" />
          ) : null}
          {defaultClose ? (
            <>
              <ResponsiveModalClose floating />
              <div className="oh-modal-close-bar" aria-hidden />
            </>
          ) : null}
          {children}
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    );
  }

  return (
    <DialogContent
      className={cn("oh-modal-content", desktopClassName)}
      style={{
        position: "fixed",
        inset: 0,
        margin: "auto",
        translate: "none",
        width: "var(--oh-modal-w)",
        maxWidth: "calc(100vw - 2 * var(--oh-modal-edge))",
        height: "calc(100vh - 2 * var(--oh-modal-vinset))",
        maxHeight: "calc(100vh - 2 * var(--oh-modal-vinset))",
      }}
      showCloseButton={showCloseButton}
    >
      {defaultClose ? (
        <>
          <ResponsiveModalClose floating />
          <div className="oh-modal-close-bar" aria-hidden />
        </>
      ) : null}
      {children}
    </DialogContent>
  );
}

type HeaderProps = {
  children: ReactNode;
  className?: string;
  mobileClassName?: string;
  desktopClassName?: string;
};

const BRU_DIALOG_HEADER = "px-5 pb-4 sm:px-6";

export function ResponsiveModalHeader({
  children,
  className,
  mobileClassName,
  desktopClassName,
}: HeaderProps) {
  const { isMobile } = useResponsiveModal();
  if (isMobile) {
    return (
      <div className={cn(BRU_DIALOG_HEADER, className, mobileClassName)}>
        {children}
      </div>
    );
  }
  return (
    <DialogHeader
      className={cn(BRU_DIALOG_HEADER, className, desktopClassName)}
    >
      {children}
    </DialogHeader>
  );
}

type TitleProps = {
  children: ReactNode;
  className?: string;
  mobileClassName?: string;
  desktopClassName?: string;
};

const BRU_DIALOG_TITLE = "text-[20px] font-black uppercase tracking-tight";

export function ResponsiveModalTitle({
  children,
  className,
  mobileClassName,
  desktopClassName,
}: TitleProps) {
  const { isMobile } = useResponsiveModal();
  if (isMobile) {
    return (
      <DrawerPrimitive.Title
        className={cn(BRU_DIALOG_TITLE, className, mobileClassName)}
      >
        {children}
      </DrawerPrimitive.Title>
    );
  }
  return (
    <DialogTitle
      className={cn(BRU_DIALOG_TITLE, className, desktopClassName)}
    >
      {children}
    </DialogTitle>
  );
}

type DescriptionProps = {
  children: ReactNode;
  className?: string;
  mobileClassName?: string;
  desktopClassName?: string;
};

export function ResponsiveModalDescription({
  children,
  className,
  mobileClassName,
  desktopClassName,
}: DescriptionProps) {
  const { isMobile } = useResponsiveModal();
  if (isMobile) {
    return (
      <DrawerPrimitive.Description
        className={cn(className, mobileClassName)}
      >
        {children}
      </DrawerPrimitive.Description>
    );
  }
  return (
    <DialogDescription className={cn(className, desktopClassName)}>
      {children}
    </DialogDescription>
  );
}

type CloseProps = {
  className?: string;
  children?: ReactNode;
  floating?: boolean;
};

export function ResponsiveModalClose({
  className,
  children,
  floating = false,
}: CloseProps) {
  const { isMobile } = useResponsiveModal();
  const baseClass = cn(
    "rounded-(--oh-r-xs)",
    floating &&
      "absolute top-3 right-3 z-10 [&]:translate-x-0 [&]:translate-y-0",
    className,
  );

  const icon = children ?? (
    <>
      <XIcon />
      <span className="sr-only">Close</span>
    </>
  );

  if (isMobile) {
    return (
      <DrawerPrimitive.Close asChild>
        <Button
          type="button"
          variant="ohGhost"
          size="icon-sm"
          aria-label="Close"
          className={baseClass}
        >
          {icon}
        </Button>
      </DrawerPrimitive.Close>
    );
  }

  return (
    <DialogClose
      render={
        <Button
          type="button"
          variant="ohGhost"
          size="icon-sm"
          aria-label="Close"
          className={baseClass}
        />
      }
    >
      {icon}
    </DialogClose>
  );
}

export const RESPONSIVE_MODAL_BODY_CLASS =
  "flex flex-col gap-5 px-5 pb-6 sm:px-6";

export function ResponsiveModalBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(RESPONSIVE_MODAL_BODY_CLASS, className)}>
      {children}
    </div>
  );
}

export function ResponsiveModalFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:justify-end",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function useResponsiveModalForm() {
  return useResponsiveModal();
}
