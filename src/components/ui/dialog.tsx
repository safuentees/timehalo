"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

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

    const inertEls = document.querySelectorAll(
      "[inert], [data-base-ui-inert]",
    )
    log(`inert elements in document: ${inertEls.length}`, [...inertEls])

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
  const popupRef = React.useRef<HTMLDivElement | null>(null)
  useDialogDebug(popupRef)

  return (
    <DialogPortal>
      <DialogOverlay />
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
