"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function HandleForm() {
  const [handle, setHandle] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        alert(`Would save handle: ${handle}`);
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex items-stretch border-[1.5px] border-[var(--bru-ink)] bg-[var(--bru-paper)] focus-within:shadow-[3px_3px_0_var(--bru-ink)] transition-shadow duration-75 [transition-timing-function:steps(1)]">
        <span className="flex items-center px-2.5 bg-[var(--bru-ink)] text-[var(--bru-paper)] font-[family:var(--bru-mono)] text-[10px] font-extrabold uppercase tracking-[1.5px]">
          /h/
        </span>
        <input
          type="text"
          placeholder="alex"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          className="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-[15px] text-[var(--bru-ink)] outline-none placeholder:text-[var(--bru-placeholder)]"
        />
      </div>

      <Button
        type="submit"
        variant="brutalist"
        size="brutalist"
        className="w-full sm:w-auto sm:self-end"
      >
        Save
      </Button>
    </form>
  );
}
