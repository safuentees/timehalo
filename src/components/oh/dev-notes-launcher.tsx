"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NotebookPenIcon, ClipboardCopyIcon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResponsiveModal,
  ResponsiveModalBody,
  ResponsiveModalContent,
} from "@/components/ui/responsive-modal";

const STORAGE_KEY = "oh-dev-notes-v1";
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
  }
}

export function DevNotesLauncher() {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<string>(() => readNotes());
  const [showSaved, setShowSaved] = useState(false);
  const [copied, setCopied] = useState(false);

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

  useEffect(() => {
    if (!showSaved) return;
    const id = setTimeout(() => setShowSaved(false), 1500);
    return () => clearTimeout(id);
  }, [showSaved]);

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
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open dev notes"
        className="fixed top-14 left-[5rem] z-30 inline-flex size-12 items-center justify-center rounded-full border-2 border-oh-line-strong bg-oh-bg text-oh-content shadow-lg transition-colors duration-150 ease-oh hover:bg-oh-content hover:text-oh-bg sm:top-16 sm:left-[6rem]"
      >
        <NotebookPenIcon className="size-5" strokeWidth={1.75} />
      </button>

      <ResponsiveModalContent desktopClassName="sm:max-w-2xl">
        <ResponsiveModalBody>
          <div className="flex h-full flex-col gap-3">
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
              className="min-h-[60vh] max-h-[80vh] resize-none overflow-y-auto rounded-(--oh-r-xs) bg-transparent p-3 font-[family-name:var(--oh-mono)] text-[14px] leading-[1.55] text-[color:var(--oh-ink)] placeholder:text-[color:var(--oh-placeholder)] focus:outline-none [field-sizing:content]"
            />
          </div>
        </ResponsiveModalBody>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
