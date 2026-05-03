import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

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
