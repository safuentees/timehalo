"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NotebookPenIcon, XIcon, ClipboardCopyIcon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResponsiveModal,
  ResponsiveModalBody,
  ResponsiveModalContent,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";

// Floating launcher for free-form dev notes (B.PT79). Sits at the
// top-left next to <DevChecklistLauncher />. Opening reveals a single
// tall textarea — append-style notes work fine in plain text, no need
// for separate "entries" rows or markdown rendering. Auto-saves to
// localStorage on change (debounced to once per ~600ms so a fast typer
// doesn't write 60×/sec). "Saved" pill confirms persistence; "Copy"
// button dumps the buffer to the clipboard so the host can paste into
// a real bug-tracker / commit message later.
//
// Storage key: `oh-dev-notes-v1`. Versioned so a future schema bump
// can detect + drop stale data without migrations.

const STORAGE_KEY = "oh-dev-notes-v1";
// Debounce window: 1.5s of typing-quiet before the save fires. Each
// keystroke restarts the timer (the useEffect on `notes` clears the
// prior timeout), so a fast typer never burns a write per keystroke;
// only the trailing pause triggers persistence. "Saved" pill
// confirms — the host knows their notes won't be lost if they tab
// away or close the modal.
const SAVE_DEBOUNCE_MS = 1500;

function readNotes(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeNotes(value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Quota / privacy mode — fail silently.
  }
}

export function DevNotesLauncher() {
  const [open, setOpen] = useState(false);
  // Lazy initializer pulls localStorage on first render. Same SSR-
  // safe pattern as `DevChecklistContent` — the textarea only mounts
  // after the modal opens (purely client render path), so no
  // hydration mismatch even though the value differs from server.
  const [notes, setNotes] = useState<string>(() => readNotes());
  const [showSaved, setShowSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  // Debounced auto-save. The pending timer ref makes a fresh keystroke
  // cancel the prior write — at most one localStorage hit per typing
  // burst regardless of speed. After the save lands, flip `showSaved`
  // true so the header pill flashes "Saved"; a separate effect fades
  // it after 1.5s.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      writeNotes(notes);
      setShowSaved(true);
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [notes]);

  // Fade the "Saved" pill after a brief moment so it doesn't read as
  // a permanent state; the empty pill on subsequent edits signals
  // pending writes are queued.
  useEffect(() => {
    if (!showSaved) return;
    const id = setTimeout(() => setShowSaved(false), 1500);
    return () => clearTimeout(id);
  }, [showSaved]);

  // Reset the "Copied" pill after 2s.
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  const handleCopy = useCallback(async () => {
    if (!notes.trim()) return;
    try {
      await navigator.clipboard.writeText(notes);
      setCopied(true);
    } catch {
      // Clipboard API blocked — surface nothing; the textarea is
      // selectable manually.
    }
  }, [notes]);

  const handleClear = useCallback(() => {
    if (!notes) return;
    if (typeof window === "undefined") return;
    if (
      window.confirm(
        "Clear all notes? This can't be undone (notes only live in your browser).",
      )
    ) {
      setNotes("");
    }
  }, [notes]);

  return (
    <ResponsiveModal open={open} onOpenChange={setOpen}>
      {/* FAB — sits to the right of the dev checklist FAB (B.PT79).
          Math (mobile): checklist `left-4` (16) + size-12 (48) = 64;
          this one at `left-[5rem]` (80) leaves a 16px gap. (sm+):
          checklist `left-6` (24) + 48 = 72; this at `left-[6rem]`
          (96) leaves a 24px gap. Arbitrary `[Nrem]` values rather
          than scale tokens (`left-20` / `left-22`) so the math is
          visible inline and JIT-stable across Tailwind versions —
          dynamic spacing tokens were producing overlap on first paint
          before HMR caught up. Same z-30 layer so dialog overlays
          still cover both FABs. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open dev notes"
        className="fixed top-14 left-[5rem] z-30 inline-flex size-12 items-center justify-center rounded-full border-2 border-oh-line-strong bg-oh-bg text-oh-content shadow-lg transition-colors duration-150 ease-oh hover:bg-oh-content hover:text-oh-bg sm:top-16 sm:left-[6rem]"
      >
        <NotebookPenIcon className="size-5" strokeWidth={1.75} />
      </button>

      <ResponsiveModalContent desktopClassName="sm:max-w-2xl">
        <ResponsiveModalHeader>
          <div className="flex items-center justify-between gap-3 pr-3">
            <ResponsiveModalTitle>Dev notes</ResponsiveModalTitle>
            <Button
              type="button"
              variant="ohGhost"
              size="icon-sm"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <XIcon className="size-4" />
            </Button>
          </div>
        </ResponsiveModalHeader>
        <ResponsiveModalBody>
          <div className="flex flex-col gap-3">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <p className="oh-eyebrow opacity-65 tabular-nums">
                {showSaved
                  ? "Saved"
                  : notes.length > 0
                    ? `${notes.length.toLocaleString()} chars`
                    : "Empty"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ohGhost"
                  size="icon-sm"
                  onClick={handleCopy}
                  disabled={!notes.trim()}
                  aria-label="Copy notes"
                >
                  {copied ? (
                    <CheckIcon className="size-4" />
                  ) : (
                    <ClipboardCopyIcon className="size-4" />
                  )}
                </Button>
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={!notes}
                  className="oh-eyebrow opacity-55 transition-opacity hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Clear
                </button>
              </div>
            </header>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Jot what's wrong, what to revisit, what to file. Markdown lives here too — copy out when you're ready to file or commit."
              spellCheck
              className="oh-input min-h-[60vh] resize-none font-[family-name:var(--oh-mono)] text-[13px] leading-[1.55] sm:min-h-[55vh]"
            />
          </div>
        </ResponsiveModalBody>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
