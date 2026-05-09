"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

// Click-routing debug instrumentation. Enabled when
// `window.__OH_DIALOG_DEBUG = true` (set in DevTools console)
// OR when the URL carries `?dialogDebug=1`. Logs everything that
// could be intercepting clicks on the popup:
//   • The popup element + computed pointer-events / position /
//     z-index at open time.
//   • `document.elementsFromPoint` at the popup's center —
//     reveals the ACTUAL paint-order stack at that pixel. If
//     anything is sitting on top of the popup (chrome, overlay,
//     phantom transition node), it shows up here.
//   • Every ancestor of the popup with non-default pointer-events.
//     A single `pointer-events: none` anywhere in the chain
//     blocks clicks on the popup's contents.
//   • Any element with `inert` set OR a `data-base-ui-inert`
//     attribute, since Base UI's FloatingFocusManager uses these
//     to gate focus on body siblings.
//   • Pointerdown / pointerup / click capture loggers that fire
//     when the user tries to click a form control inside the
//     popup — shows whether the events even reach the popup
//     subtree.
//
// Logs are namespaced with `[oh-dialog-debug]` so they're easy to
// grep in DevTools. Cleanup on unmount removes the capture
// listeners. Zero overhead when the debug flag isn't set.
function useDialogDebug(popupRef: React.RefObject<HTMLDivElement | null>) {
  React.useEffect(() => {
    if (typeof window === "undefined") return
    const enabled =
      (window as unknown as { __OH_DIALOG_DEBUG?: boolean })
        .__OH_DIALOG_DEBUG === true ||
      new URLSearchParams(window.location.search).get("dialogDebug") === "1"
    if (!enabled) return
    const popup = popupRef.current
    if (!popup) return

    const tag = "[oh-dialog-debug]"
    const log = (...args: unknown[]) =>
      // eslint-disable-next-line no-console
      console.log(tag, ...args)

    // Snapshot the popup + its computed style + z-index chain.
    const cs = window.getComputedStyle(popup)
    log("popup mounted", popup)
    log("popup computed", {
      pointerEvents: cs.pointerEvents,
      position: cs.position,
      zIndex: cs.zIndex,
      visibility: cs.visibility,
      opacity: cs.opacity,
      display: cs.display,
    })

    // What's actually painted at the popup's center?
    const rect = popup.getBoundingClientRect()
    const cx = Math.round(rect.left + rect.width / 2)
    const cy = Math.round(rect.top + rect.height / 2)
    log(`popup center (${cx},${cy}) rect`, rect)
    const stack = document.elementsFromPoint(cx, cy)
    log(
      `elementsFromPoint at center (top → bottom), ${stack.length} layers`,
      stack,
    )
    if (stack[0] !== popup && !popup.contains(stack[0])) {
      log(
        "⚠️  TOPMOST ELEMENT AT POPUP CENTER IS NOT THE POPUP OR ITS CHILD",
        { topmost: stack[0], popup },
      )
    }

    // Walk up the popup's ancestors, log non-default pointer-events.
    const ancestors: Array<{
      el: Element
      pointerEvents: string
      position: string
      zIndex: string
      inert: boolean
    }> = []
    let node: Element | null = popup
    while (node) {
      const acs = window.getComputedStyle(node)
      ancestors.push({
        el: node,
        pointerEvents: acs.pointerEvents,
        position: acs.position,
        zIndex: acs.zIndex,
        inert: (node as HTMLElement).inert === true,
      })
      node = node.parentElement
    }
    log("popup ancestor chain (popup → html)", ancestors)
    const blockers = ancestors.filter(
      (a) => a.pointerEvents === "none" || a.inert === true,
    )
    if (blockers.length > 0) {
      log("⚠️  ANCESTORS WITH pointer-events:none OR inert:", blockers)
    }

    // Any body-level inert / aria-hidden siblings? (Base UI
    // FloatingFocusManager sets aria-hidden on body siblings when
    // modal=true; if it accidentally inerts the popup container
    // itself, clicks die here.)
    const inertEls = document.querySelectorAll(
      "[inert], [data-base-ui-inert]",
    )
    log(`inert elements in document: ${inertEls.length}`, [...inertEls])

    // Live capture of pointer events anywhere on document so we
    // can see whether clicks even REACH the popup subtree (or
    // get swallowed by an ancestor / overlay).
    const popupEl: HTMLElement = popup
    function logPointerDown(event: Event) {
      const target = event.target as Element | null
      const insidePopup = target ? popupEl.contains(target) : false
      log("pointerdown", {
        target,
        insidePopup,
        defaultPrevented: event.defaultPrevented,
      })
    }
    function logClick(event: Event) {
      const target = event.target as Element | null
      const insidePopup = target ? popupEl.contains(target) : false
      log("click", {
        target,
        insidePopup,
        defaultPrevented: event.defaultPrevented,
      })
    }
    document.addEventListener("pointerdown", logPointerDown, true)
    document.addEventListener("click", logClick, true)

    return () => {
      document.removeEventListener("pointerdown", logPointerDown, true)
      document.removeEventListener("click", logClick, true)
    }
  }, [popupRef])
}

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-[200] bg-black/40 duration-150 supports-backdrop-filter:backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  // Debug instrumentation — opt-in via `?dialogDebug=1` URL param OR
  // `window.__OH_DIALOG_DEBUG = true` set in DevTools console. Logs
  // popup mount + paint-order at popup center + ancestor chain +
  // pointer-events blockers + every pointerdown/click on the
  // document so the actual click-routing is visible.
  const popupRef = React.useRef<HTMLDivElement | null>(null)
  useDialogDebug(popupRef)

  return (
    <DialogPortal>
      <DialogOverlay />
      {/*
        Base UI Dialog v1.4.0 anatomy (per the official docs) requires a
        `<Dialog.Viewport>` wrapper between `Portal` and `Popup`:

          <Dialog.Portal>
            <Dialog.Backdrop />
            <Dialog.Viewport>     ← required
              <Dialog.Popup />
            </Dialog.Viewport>
          </Dialog.Portal>

        Without Viewport, Base UI doesn't apply the
        `pointer-events: none ↔ auto` toggle that gates click-handling
        on the popup subtree (see
        `node_modules/@base-ui/react/dialog/viewport/DialogViewport.js`
        line 71 — `pointerEvents: !open ? 'none' : undefined`). Symptom
        on desktop: clicks on form inputs and buttons inside the popup
        registered on the popup element but never propagated to the
        underlying control because the missing layer left the subtree
        in an inconsistent pointer-events state. Mobile worked because
        vaul's Drawer follows a different anatomy (Overlay + Content,
        no Viewport) and doesn't depend on the same toggle.

        Viewport itself is `fixed inset-0` (covers the viewport) so its
        own pointer-events apply across the full surface — `auto` when
        open lets backdrop clicks through to the Backdrop sibling for
        outside-click-to-close, AND lets popup-area clicks reach the
        Popup child for normal interaction.
      */}
      <DialogPrimitive.Viewport
        data-slot="dialog-viewport"
        className="fixed inset-0 z-[201]"
      >
        <DialogPrimitive.Popup
          ref={popupRef}
          data-slot="dialog-content"
          className={cn(
            "fixed top-1/2 left-1/2 z-[202] grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 rounded-(--oh-r-sm) border border-border bg-background p-6 text-sm text-foreground duration-150 outline-none sm:max-w-md data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              render={
                <Button
                  variant="ghost"
                  className="absolute top-2 right-2"
                  size="icon-sm"
                />
              }
            >
              <XIcon
              />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-6 -mb-6 flex flex-col-reverse gap-2 border-t border-border bg-muted/30 p-6 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
