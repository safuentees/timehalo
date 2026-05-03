import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

// B.PT90 — guard against duplicate top-level namespace keys in
// `messages/*.json`. JSON parsers (V8 included, per ECMA-404) keep
// the LAST value when a key is defined twice, so a duplicate block
// silently shadows the original — the keys it doesn't redefine
// vanish from the runtime catalog.
//
// B.PT26 hit this exact bug: a fresh `Invitations` block (only
// `skeletonEyebrow`) appended at EOF shadowed the canonical
// 20-key `Invitations` block higher up in the file. Symptom was a
// runtime `MISSING_MESSAGE` error on /invitations/<token> for
// `Invitations.notNow`. Caught manually by the user; this test
// catches future repeats at `pnpm test:run` time before they
// reach the browser.
//
// Pattern: matches `src/lib/__tests__/no-mid-dot.test.ts` (B.PT27)
// — single focused invariant, file-walk style, surfaces violations
// with file:line listings instead of a binary pass/fail.
//
// Scope: TOP-LEVEL keys only. Catches the namespace-collision
// shape (one `"Settings": { ... }` block shadowing another). A
// duplicate KEY within a namespace (e.g. two `"title"` lines
// inside `Settings`) is also a bug but requires real JSON parsing
// to detect cross-line — left for a follow-up if/when a real
// nested-dup bug surfaces. The B.PT26 regression was top-level.
//
// Implementation: regex against each line. The messages files are
// Prettier-formatted with 2-space indent, so `^  "([^"]+)":`
// reliably catches top-level keys without false positives from
// nested keys (4-space indent) or string contents.

const TOP_LEVEL_KEY = /^ {2}"([^"]+)":/;

function findDuplicateTopLevelKeys(
  text: string,
): Array<{ key: string; lines: number[] }> {
  const seen = new Map<string, number[]>();
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(TOP_LEVEL_KEY);
    if (!match) continue;
    const key = match[1];
    const existing = seen.get(key);
    if (existing) {
      existing.push(i + 1);
    } else {
      seen.set(key, [i + 1]);
    }
  }
  const dups: Array<{ key: string; lines: number[] }> = [];
  for (const [key, occurrences] of seen.entries()) {
    if (occurrences.length > 1) dups.push({ key, lines: occurrences });
  }
  return dups;
}

describe("i18n — no duplicate top-level namespace keys", () => {
  const repoRoot = resolve(__dirname, "../../..");
  const messagesDir = join(repoRoot, "messages");
  const files = readdirSync(messagesDir).filter((f) => f.endsWith(".json"));

  // Sanity: the suite assumes at least one locale file. If the
  // messages dir is empty / renamed, fail loudly with a useful
  // hint rather than silently passing on zero iterations.
  it("messages/ contains at least one *.json locale file", () => {
    expect(
      files,
      "expected at least one *.json file in messages/ — has the dir moved?",
    ).not.toEqual([]);
  });

  for (const file of files) {
    it(`messages/${file} has no duplicate top-level keys`, () => {
      const path = join(messagesDir, file);
      const text = readFileSync(path, "utf8");
      const dups = findDuplicateTopLevelKeys(text);
      const formatted = dups
        .map((d) => `  • "${d.key}" at lines ${d.lines.join(", ")}`)
        .join("\n");
      expect(
        dups,
        `messages/${file} has duplicate top-level keys:\n${formatted}\n` +
          `JSON parsers keep the LAST value for duplicate keys, so the ` +
          `earlier block is silently shadowed and any keys it defines that ` +
          `the later block doesn't redefine will go missing at runtime.\n` +
          `Merge the duplicate blocks into one, then re-run.`,
      ).toEqual([]);
    });
  }

  // Self-test: confirm the detector actually catches a planted
  // duplicate. Without this, a regex regression that always returns
  // [] would silently pass every catalog file.
  it("detector catches a planted duplicate in synthetic input", () => {
    const synthetic = [
      "{",
      '  "Foo": {',
      '    "a": "1"',
      "  },",
      '  "Bar": {',
      '    "b": "2"',
      "  },",
      '  "Foo": {',
      '    "c": "3"',
      "  }",
      "}",
    ].join("\n");
    const dups = findDuplicateTopLevelKeys(synthetic);
    expect(dups).toEqual([{ key: "Foo", lines: [2, 8] }]);
  });
});
