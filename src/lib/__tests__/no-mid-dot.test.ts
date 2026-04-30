import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import { describe, expect, it } from "vitest";

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
