import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import { describe, expect, it } from "vitest";

// Hard rule from `.claude/rules/oh-ui.md` *Copy*: no mid-dot
// separators (` · `) in user-facing copy. The character reads as
// filler — drop the separator and audit each half against "does this
// carry data the user can't read elsewhere on this screen." Apple
// HIG-aligned. Memory entry: `feedback_no_dot_separator.md`.
//
// Pre-CI grep was the original enforcement plan; a Vitest guard runs
// on the same gate (`pnpm test:run`) and gives a precise file:line
// failure instead of a shell exit-code. New violations fail loudly
// during development, not after a CI round-trip.

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  ".turbo",
  "coverage",
]);

function* walkTsx(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      yield* walkTsx(path);
    } else if (entry.endsWith(".tsx")) {
      yield path;
    }
  }
}

describe("UI copy — no mid-dot separators", () => {
  it("no ` · ` literal in any *.tsx under src/", () => {
    const repoRoot = resolve(__dirname, "../../..");
    const srcDir = join(repoRoot, "src");

    const offenders: string[] = [];
    const needle = " · "; // U+00B7 MIDDLE DOT, padded by spaces

    for (const file of walkTsx(srcDir)) {
      const content = readFileSync(file, "utf8");
      const lines = content.split("\n");
      lines.forEach((line, idx) => {
        if (line.includes(needle)) {
          const rel = relative(repoRoot, file);
          offenders.push(`${rel}:${idx + 1}: ${line.trim()}`);
        }
      });
    }

    expect(
      offenders,
      `Mid-dot separators are forbidden in user-facing copy.\nViolations:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
