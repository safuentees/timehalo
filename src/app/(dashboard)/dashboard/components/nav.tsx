"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Availability = "idle" | "checking" | "available" | "taken" | "invalid";

const TAKEN = new Set(["admin", "root", "api", "santiago", "me", "test", "alex"]);

export default function HandleForm() {
  const [handle, setHandle] = useState("");
  const [availability, setAvailability] = useState<Availability>("idle");

  useEffect(() => {
    if (!handle) {
      setAvailability("idle");
      return;
    }
    if (handle.length < 3) {
      setAvailability("invalid");
      return;
    }
    setAvailability("checking");
    const id = setTimeout(() => {
      setAvailability(TAKEN.has(handle) ? "taken" : "available");
    }, 400);
    return () => clearTimeout(id);
  }, [handle]);

  const canSubmit = availability === "available";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        alert(`Would save handle: ${handle}`);
      }}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-stretch border-[1.5px] border-[var(--bru-ink)] bg-[var(--bru-paper)] focus-within:shadow-[3px_3px_0_var(--bru-ink)] transition-shadow duration-75 [transition-timing-function:steps(1)]">
          <span className="flex items-center px-2.5 bg-[var(--bru-ink)] text-[var(--bru-paper)] font-[family:var(--bru-mono)] text-[10px] font-extrabold uppercase tracking-[1.5px] whitespace-nowrap">
            /h/
          </span>
          <input
            id="handle"
            type="text"
            placeholder="alex"
            value={handle}
            onChange={(e) =>
              setHandle(
                e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
              )
            }
            maxLength={30}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 min-w-0 bg-transparent px-3 py-2.5 font-sans text-[15px] text-[var(--bru-ink)] outline-none placeholder:text-[var(--bru-placeholder)]"
          />
          <AvailabilityTag state={availability} />
        </div>

        <HandleHelp state={availability} />
      </div>

      <Button
        type="submit"
        variant="brutalist"
        size="brutalist"
        disabled={!canSubmit}
        className="w-full sm:w-auto sm:self-end"
      >
        Save
      </Button>
    </form>
  );
}

function AvailabilityTag({ state }: { state: Availability }) {
  const label =
    state === "checking"
      ? "…"
      : state === "available"
        ? "FREE"
        : state === "taken"
          ? "TAKEN"
          : state === "invalid"
            ? "3+"
            : null;
  if (!label) return null;
  const tone =
    state === "taken"
      ? "bg-[var(--bru-ink)] text-[var(--bru-paper)]"
      : "text-[var(--bru-ink)]";
  return (
    <span
      className={`flex items-center px-3 border-l-[1.5px] border-l-[var(--bru-ink)] font-[family:var(--bru-mono)] text-[10.5px] font-extrabold uppercase tracking-[2px] whitespace-nowrap ${tone}`}
    >
      {label}
    </span>
  );
}

function HandleHelp({ state }: { state: Availability }) {
  const text =
    state === "taken"
      ? "TAKEN · TRY ANOTHER"
      : state === "invalid"
        ? "MINIMUM 3 CHARACTERS"
        : state === "available"
          ? "AVAILABLE · YOU CAN CHANGE IT LATER"
          : "LOWERCASE · NUMBERS · HYPHENS";
  return (
    <p className="font-[family:var(--bru-mono)] text-[9.5px] font-bold uppercase tracking-[2.5px] opacity-55">
      {text}
    </p>
  );
}
