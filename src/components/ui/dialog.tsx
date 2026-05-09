"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

// Click-routing debug instrumentation. Always on in development —
// no flag, no URL param. Logs everything that could be
// intercepting clicks on the popup. Logs are namespaced with
// `[oh-dialog-debug]` so they're easy to filter in DevTools
// (just type `oh-dialog-debug` into the console filter).
//
// MutationObserver pattern (not a ref-callback or state) — a
// previous version took the popup element as a function parameter
// AND used it as a useEffect dependency, which Turbopack/React-
// Compiler in Next 16 rewrote into a closure that read the
// parameter before its compiler-generated init shim ran, throwing
// `can't access lexical declaration 'popupEl' before initialization`
// at runtime. The current pattern avoids any parameter at all:
//   1. Mount one persistent observer that watches `document.body`
//      for any element with `data-slot="dialog-content"`.
//   2. When one appears, run the snapshot + ancestor-walk + paint-
//      order check ONCE per element (idempotent via
//      `dataset.ohDebugged`).
//   3. Document-level capture listeners log every pointerdown +
//      click, and at log time look up the popup from the DOM —
//      so the closure never holds a stale or pre-init reference.
//
// Drops to a no-op in production via the NODE_ENV check.
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
      // Print each inert element's identity individually so the
      // collapsed Array dump in DevTools doesn't hide which one it
      // is. Tag, classes, parent path — enough to pinpoint without
      // expanding the object inspector.
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

      // Re-check the popup state after the open animation should
      // have completed. Initial snapshot fires at first paint where
      // `data-starting-style` keeps opacity at 0 — if the animation
      // isn't running (tw-animate-css missing under Tailwind v4 +
      // Turbopack, missing transition target, broken @starting-style
      // support), the popup stays invisible and the user thinks
      // clicks aren't working when actually the modal isn't paint-
      // visible. A 250ms delay covers the canonical 150ms duration
      // plus animation-frame slop.
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

    // Snapshot any popup that's already mounted at hook-mount time.
    const existing = getPopup()
    if (existing) snapshot(existing)

    // Watch for the popup attaching after dialog-open via Portal.
    const observer = new MutationObserver(() => {
      const popup = getPopup()
      if (popup) snapshot(popup)
    })
    observer.observe(document.body, { childList: true, subtree: true })

    // Document-level capture listeners — log every pointer event so
    // the routing is visible. Look up the popup at log time (not
    // closure-captured) so we always have the live element.
    function describe(target: Element | null) {
      if (!target) return null
      // Closest interactive ancestor — that's what the user was
      // trying to "click" even when the literal target was a
      // non-interactive child span/icon. If this is null, the
      // user is clicking a label/decoration with no handler
      // attached.
      const interactive = target.closest(
        "button, a, input, textarea, select, [role='button'], [tabindex]:not([tabindex='-1']), [onclick]",
      ) as HTMLElement | null
      return {
        target,
        targetTag: target.tagName.toLowerCase(),
        interactive,
        interactiveTag: interactive?.tagName.toLowerCase() ?? null,
        interactiveDisabled:
          interactive != null &&
          (interactive.hasAttribute("disabled") ||
            interactive.getAttribute("aria-disabled") === "true"),
        interactiveType: interactive?.getAttribute("type") ?? null,
        interactiveText: interactive?.textContent
          ?.trim()
          .slice(0, 40),
      }
    }

    function logPointerDown(event: Event) {
      const popup = getPopup()
      const target = event.target as Element | null
      const insidePopup =
        popup !== null && target !== null && popup.contains(target)
      log("pointerdown", {
        ...describe(target),
        insidePopup,
        defaultPrevented: event.defaultPrevented,
      })
    }
    function logClick(event: Event) {
      const popup = getPopup()
      const target = event.target as Element | null
      const insidePopup =
        popup !== null && target !== null && popup.contains(target)
      const desc = describe(target)
      log("click", {
        ...desc,
        insidePopup,
        defaultPrevented: event.defaultPrevented,
      })
      if (desc?.interactive == null && insidePopup) {
        log(
          "  ⚠️  CLICK ON NON-INTERACTIVE TARGET inside popup — no button/link/input ancestor",
        )
      } else if (desc?.interactiveDisabled) {
        log(
          `  ⚠️  CLICK ON DISABLED ${desc.interactiveTag?.toUpperCase()} — handler won't fire`,
        )
      }
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
  ref,
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  /**
   * Forwarded to Base UI's `Dialog.Popup`. ResponsiveModal uses
   * this to capture the popup element so nested popovers/menus
   * (time picker, duration picker, etc.) can portal INTO the
   * popup rather than to `document.body`. Body-portal popovers
   * become inert siblings of the dialog's `FloatingFocusManager`
   * modal=true scope and clicks stop registering — confirmed
   * against Base UI dialog source: `dialog/popup/DialogPopup.js`
   * passes `modal: true` to FloatingFocusManager which marks
   * outside-tree elements as inert.
   */
  ref?: React.Ref<HTMLDivElement>
}) {
  // Debug instrumentation — always on in development, no flag.
  // Watches the DOM for the dialog-content popup and logs paint-
  // order + ancestor chain + every pointer/click event so the
  // actual click-routing is visible. Filter DevTools console by
  // `oh-dialog-debug` to see only these lines.
  useDialogDebug()

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
          ref={ref}
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
