"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function useDialogDebug() {
  React.useEffect(() => {
    if (typeof window === "undefined") return
    if (process.env.NODE_ENV === "production") return

    const tag = "[oh-dialog-debug]"
    const log = (...args: unknown[]) =>
      // eslint-disable-next-line no-console
      console.log(tag, ...args)

    function getPopup(): HTMLElement | null {
      return document.querySelector<HTMLElement>(
        '[data-slot="dialog-content"]',
      )
    }

    function snapshot(popup: HTMLElement) {
      if (popup.dataset.ohDebugged === "1") return
      popup.dataset.ohDebugged = "1"

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
      let cursor: Element | null = popup
      while (cursor) {
        const acs = window.getComputedStyle(cursor)
        ancestors.push({
          el: cursor,
          pointerEvents: acs.pointerEvents,
          position: acs.position,
          zIndex: acs.zIndex,
          inert: (cursor as HTMLElement).inert === true,
        })
        cursor = cursor.parentElement
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
      inertEls.forEach((el, i) => {
        const path: string[] = []
        let cursor: Element | null = el
        let depth = 0
        while (cursor && depth < 6) {
          path.unshift(
            `${cursor.tagName.toLowerCase()}${
              cursor.id ? `#${cursor.id}` : ""
            }${
              cursor.className && typeof cursor.className === "string"
                ? `.${cursor.className.split(/\s+/).slice(0, 2).join(".")}`
                : ""
            }`,
          )
          cursor = cursor.parentElement
          depth++
        }
        const containsPopup = el.contains(popup)
        const isAncestorOfPopup = el !== popup && el.contains(popup)
        log(
          `  inert[${i}]: ${path.join(" > ")}${
            isAncestorOfPopup
              ? "  ⚠️  IS AN ANCESTOR OF THE POPUP — clicks blocked"
              : containsPopup
                ? "  (contains popup)"
                : ""
          }`,
          el,
        )
      })

      window.setTimeout(() => {
        if (!document.contains(popup)) return
        const after = window.getComputedStyle(popup)
        log("popup computed AFTER 250ms (post-animation)", {
          pointerEvents: after.pointerEvents,
          opacity: after.opacity,
          visibility: after.visibility,
          transform: after.transform,
          dataStartingStyle: popup.getAttribute("data-starting-style"),
        })
        if (after.opacity === "0") {
          log(
            "⚠️  POPUP IS STILL OPACITY:0 AFTER 250ms — animation/transition didn't run, popup is invisible",
          )
        }
      }, 250)
    }

    const existing = getPopup()
    if (existing) snapshot(existing)

    const observer = new MutationObserver(() => {
      const popup = getPopup()
      if (popup) snapshot(popup)
    })
    observer.observe(document.body, { childList: true, subtree: true })

    function logPointerDown(event: Event) {
      const popup = getPopup()
      const target = event.target as Element | null
      const insidePopup =
        popup !== null && target !== null && popup.contains(target)
      log("pointerdown", {
        target,
        insidePopup,
        defaultPrevented: event.defaultPrevented,
      })
    }
    function logClick(event: Event) {
      const popup = getPopup()
      const target = event.target as Element | null
      const insidePopup =
        popup !== null && target !== null && popup.contains(target)
      log("click", {
        target,
        insidePopup,
        defaultPrevented: event.defaultPrevented,
      })
    }
    document.addEventListener("pointerdown", logPointerDown, true)
    document.addEventListener("click", logClick, true)

    return () => {
      observer.disconnect()
      document.removeEventListener("pointerdown", logPointerDown, true)
      document.removeEventListener("click", logClick, true)
    }
  }, [])
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
  useDialogDebug()

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Viewport
        data-slot="dialog-viewport"
        className="fixed inset-0 z-[201]"
      >
        <DialogPrimitive.Popup
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
