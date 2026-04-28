"use client";

import {
  createContext,
  useContext,
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

// Threshold = (--bru-modal-w) + 2 * (--bru-modal-edge) from globals.css
// (720 + 48 = 768). Below this width, the fixed-size desktop dialog
// would clip its own gutters, so we swap to a vaul Drawer instead.
// Keep this constant in lock-step with the CSS tokens.
const MOBILE_QUERY = "(max-width: 767px)";

// Responsive modal shell.
//
// Mobile  → vaul `Drawer` (bottom sheet). Existing brutalist drawer
//           classes (`bru-drawer-content` / `bru-drawer-head` /
//           `bru-drawer-title`) are still in CSS, so call sites pass them
//           through `mobileClassName` / `headerClassName` / `titleClassName`.
//
// Desktop → shadcn `Dialog` (centered card on top of a backdrop). No custom
//           brutalist treatment yet — the goal is just to make the
//           fallback render so we can iterate on the desktop look later.

type ModalCtx = {
  isMobile: boolean;
  nested: boolean;
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

type RootProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  /** Vaul nests via `Drawer.NestedRoot`; desktop dialogs nest natively. */
  nested?: boolean;
};

export function ResponsiveModal({
  open,
  onOpenChange,
  children,
  nested = false,
}: RootProps) {
  // `useMediaQuery` returns `false` on the server and on the first client
  // render, then flips to the real value in an effect. Render the Dialog
  // (desktop) branch in both cases so the trigger button appears in the
  // SSR HTML and survives hydration unchanged — no null → button flash.
  // On mobile the swap to Drawer happens silently after mount; the
  // trigger is a `<button>` either way and the portal content only
  // renders when `open === true`, so the swap is invisible to the user.
  // Pattern matches dub.co's modal (always-rendered trigger, controlled
  // open) and cal.com's CSS-first responsive Dialog.
  const isMobile = useMediaQuery(MOBILE_QUERY);

  const Root = isMobile
    ? nested
      ? DrawerPrimitive.NestedRoot
      : DrawerPrimitive.Root
    : null;

  return (
    <Ctx.Provider value={{ isMobile, nested }}>
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
  /** When true, the single child is used as the trigger element directly. */
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
  // child element through render when the caller asked for asChild.
  if (asChild) {
    return (
      <DialogTrigger render={children as ReactElement} {...(props as object)} />
    );
  }
  return <DialogTrigger {...(props as object)}>{children}</DialogTrigger>;
}

type ContentProps = {
  children: ReactNode;
  /** Class applied to the vaul `Drawer.Content` (mobile only). */
  mobileClassName?: string;
  /** Class applied to the shadcn `DialogContent` popup (desktop only). */
  desktopClassName?: string;
  /** Class applied to the vaul `Drawer.Overlay` (mobile only). */
  overlayClassName?: string;
  /** Whether to render the drag handle on mobile. */
  showHandle?: boolean;
  /**
   * Whether to render the shadcn-default close X on desktop. Off by default —
   * we ship a custom brutalist <ResponsiveModalClose /> that works on both
   * form factors (matches the dub.co pattern of "no built-in, expose a
   * primitive close so consumers control the look + placement").
   */
  showCloseButton?: boolean;
  /**
   * Auto-render a floating <ResponsiveModalClose /> at the top-right plus
   * a `.bru-modal-close-bar` spacer that reserves the equivalent vertical
   * space at the top of the content. New modals get the reservation
   * without any opt-in. Set false when the call site provides its own
   * inline close button (e.g. inside a custom title row).
   */
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
  const { isMobile } = useResponsiveModal();

  if (isMobile) {
    return (
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay
          className={cn("bru-drawer-overlay", overlayClassName)}
        />
        <DrawerPrimitive.Content
          className={cn("bru-drawer-content", mobileClassName)}
        >
          {showHandle ? (
            <DrawerPrimitive.Handle className="bru-drawer-handle" />
          ) : null}
          {defaultClose ? (
            <>
              <ResponsiveModalClose floating />
              <div className="bru-modal-close-bar" aria-hidden />
            </>
          ) : null}
          {children}
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    );
  }

  // Inline style wins the cascade no matter how many translate / position
  // utilities <DialogContent> stacks on. We use dub.co's centering pattern
  // (`inset:0 + margin:auto` with explicit width/height — see
  // https://github.com/dubinc/dub/blob/main/packages/ui/src/modal.tsx) and
  // null out only the Tailwind v4 individual `translate` property — the
  // one fighting us via `-translate-x-1/2 -translate-y-1/2`. We leave
  // `transform`/`scale` alone so the `data-open:zoom-in-95` open
  // animation still plays.
  return (
    <DialogContent
      className={cn("bru-modal-content", desktopClassName)}
      style={{
        position: "fixed",
        inset: 0,
        margin: "auto",
        translate: "none",
        width: "var(--bru-modal-w)",
        maxWidth: "calc(100vw - 2 * var(--bru-modal-edge))",
        height: "calc(100vh - 2 * var(--bru-modal-vinset))",
        maxHeight: "calc(100vh - 2 * var(--bru-modal-vinset))",
      }}
      showCloseButton={showCloseButton}
    >
      {defaultClose ? (
        <>
          <ResponsiveModalClose floating />
          <div className="bru-modal-close-bar" aria-hidden />
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

// Default padding so every dialog header sits the same inside its
// modal frame: 20px sides on mobile, 24px on sm+, 16px below the
// title (matching the body's 24px gap-5 rhythm starting from there).
// Consumers may still override.
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

// Brutalist dialog title default: 20px black-weight uppercase, tight
// tracking. Bakes the convention in so all four settings dialogs read
// the same — previous state had three different treatments (one
// override at 20px, two using the shadcn 16px medium default, one
// abusing it as a legend). Overrides via className still work via cn
// merging — pass any text-[…] / font-* / case-* you want and it wins.
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
  /** Optional override for the X icon (e.g. swap to a custom glyph). */
  children?: ReactNode;
  /**
   * Render the close button absolutely positioned at top-right. Off by
   * default — most call sites place it inside their own header layout.
   */
  floating?: boolean;
};

/**
 * Brutalist close button bound to the underlying `DrawerClose` /
 * `DialogClose` primitive. Using the primitive (rather than a manual
 * `onClick` that calls a parent `onClose`) is what makes ESC, focus-
 * return, and pointer-down-outside behave correctly on both form factors.
 */
export function ResponsiveModalClose({
  className,
  children,
  floating = false,
}: CloseProps) {
  const { isMobile } = useResponsiveModal();
  const baseClass = cn(
    "rounded-(--bru-r-xs)",
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
          variant="brutalistGhost"
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
          variant="brutalistGhost"
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

// Dialog action footer — the canonical row for cancel/confirm buttons
// at the bottom of a modal body. Stacks vertically on mobile (each
// button full-width via the surrounding Button.size flex), aligns
// inline-end on sm+ so the primary action sits at the bottom-right
// (the same position the OS-level keyboard "return" affordance lives
// in iOS/macOS dialogs). Audit on 2026-04-27 found this pattern
// repeated verbatim in four dialogs — single source of truth here.
//
// Consumers pass the buttons as children. No order is enforced;
// convention is cancel-on-the-left, primary-on-the-right (which
// becomes top/bottom on mobile after the flex-col stack).

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

/**
 * Hook escape-hatch for callers that need to branch on the active form
 * factor inside the modal subtree (e.g. swap a layout block when there's
 * extra horizontal room on desktop).
 */
export function useResponsiveModalForm() {
  return useResponsiveModal();
}
