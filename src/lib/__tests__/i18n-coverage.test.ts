import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import { describe, expect, it } from "vitest";

const CLEAN_DIRS = [
  "src/components/calendar", // B.PT91 — visitor booking surface
  "src/app/login", // B.PT26 + B.PT92 — login page + form sub-components
  "src/app/register", // B.PT26 + B.PT92 — register page + form
  "src/app/(host)/availability", // B.PT26B — availability form chrome
  "src/app/(host)/profile", // B.PT93 — profile-form + handle-fields
  "src/app/(host)/workspaces/[slug]/event-types", // B.PT103 — event-types panel + 3 dialogs
] as const;

const CLEAN_FILES = [
  "src/app/(host)/error.tsx", // B.PT93 — host segment-level error boundary
  "src/components/oh/oh-app-sidebar.tsx", // B.PT101 — sidebar nav labels + aria
  "src/app/h/[handle]/booked/[bookingUid]/booking-confirmation.tsx", // B.PT101 — visitor booking receipt
  "src/components/oh/oh-dashboard-bar.tsx", // B.PT102 — dashboard top bar (workspace switcher + chrome icon links)
  "src/components/oh/oh-menu-trigger.tsx", // B.PT102 — mobile menu hamburger trigger
  "src/components/oh/onboarding-checklist.tsx", // B.PT102 — getting-started checklist
  "src/app/not-found.tsx", // B.PT102 — global 404
  "src/app/error.tsx", // B.PT102 — global error boundary
] as const;

const VISIBLE_ATTRS = [
  "aria-label",
  "title",
  "placeholder",
  "alt",
  "aria-description",
] as const;

const ALLOW_LIST: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /^GitHub$/i, reason: "brand" },
  { pattern: /^Google$/i, reason: "brand" },
  { pattern: /^Microsoft$/i, reason: "brand" },
  { pattern: /^Outlook$/i, reason: "brand" },
  { pattern: /^Stripe$/i, reason: "brand" },
  { pattern: /^Officehours$/i, reason: "brand" },
  { pattern: /^Resend$/i, reason: "brand" },
  { pattern: /^officehours\.app\/h\/$/, reason: "domain prefix chrome" },
  { pattern: /^\/h\/$/, reason: "URL routing prefix chrome" },
  { pattern: /^Alex$/, reason: "neutral name placeholder" },
  { pattern: /^[\s\p{P}\p{S}…—–·]+$/u, reason: "punctuation only" },
  { pattern: /^[A-Z]{1,3}$/, reason: "short-caps abbreviation" },
  { pattern: /^\S+@example\.com$/, reason: "RFC 2606 example email" },
  { pattern: /^[0-9:.\s/-]+$/, reason: "numeric / format placeholder" },
  { pattern: /^(en|es|fr|de|it|pt|ja|zh|ar|ru)$/i, reason: "locale code" },
  { pattern: /^(true|false|on|off|none|auto|inherit|initial)$/, reason: "css/aria value" },
];

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  ".turbo",
  "coverage",
  "__tests__",
]);

function* walkTsx(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // dir doesn't exist; skip silently (test will report)
  }
  for (const entry of entries) {
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

function isAllowListed(text: string): boolean {
  for (const { pattern } of ALLOW_LIST) {
    if (pattern.test(text)) return true;
  }
  return false;
}

function findViolations(
  source: string,
): Array<{ line: number; snippet: string }> {
  const violations: Array<{ line: number; snippet: string }> = [];
  const lines = source.split("\n");

  const inComment = new Array<boolean>(lines.length).fill(false);
  let blockOpen = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (blockOpen) {
      inComment[i] = true;
      const closeIdx = line.indexOf("*/");
      if (closeIdx !== -1) {
        blockOpen = false;
      }
      continue;
    }
    const openIdx = line.indexOf("/*");
    if (openIdx !== -1 && line.indexOf("*/", openIdx) === -1) {
      blockOpen = true;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (inComment[i]) continue;
    let line = lines[i];
    const lineNum = i + 1;

    const lineCommentIdx = line.indexOf("//");
    if (lineCommentIdx !== -1) line = line.slice(0, lineCommentIdx);
    line = line.replace(/\/\*[^*]*\*\//g, "");

    for (const attr of VISIBLE_ATTRS) {
      const attrRegex = new RegExp(`${attr}=["']([^"']+)["']`, "g");
      let m: RegExpExecArray | null;
      while ((m = attrRegex.exec(line)) !== null) {
        const text = m[1].trim();
        if (
          text.length >= 2 &&
          text.length <= 120 &&
          /[a-zA-Z]/.test(text) &&
          !isAllowListed(text)
        ) {
          violations.push({ line: lineNum, snippet: `${attr}="${text}"` });
        }
      }
    }

    const textRegex = /(?<!=)>\s*([^<>{}\n]+?)\s*</g;
    let m: RegExpExecArray | null;
    while ((m = textRegex.exec(line)) !== null) {
      const text = m[1].trim();
      if (
        text.length >= 2 &&
        text.length <= 120 &&
        /[a-zA-Z]/.test(text) &&
        !text.startsWith("...") &&
        !isAllowListed(text)
      ) {
        violations.push({ line: lineNum, snippet: text });
      }
    }
  }

  const textOnlyRegex = /^[^<>{};=]+$/;
  for (let i = 0; i < lines.length; i++) {
    if (inComment[i]) continue;
    const raw = lines[i];
    const stripped = raw
      .replace(/\/\*[^*]*\*\//g, "")
      .replace(/\/\/.*/, "")
      .trim();
    if (!stripped) continue;
    if (!textOnlyRegex.test(stripped)) continue;
    if (!/[a-zA-Z]/.test(stripped)) continue;
    if (/^(import|export|const|let|var|return|if|else|function|async)\b/.test(stripped))
      continue;
    if (/[?:]/.test(stripped) && /[()]/.test(stripped)) continue;

    let prev = "";
    for (let j = i - 1; j >= 0; j--) {
      if (inComment[j]) continue;
      const line = lines[j].replace(/\/\*[^*]*\*\//g, "").replace(/\/\/.*/, "").trim();
      if (!line) continue;
      prev = line;
      break;
    }
    if (!prev.endsWith(">") || prev.endsWith("/>")) continue;

    let next = "";
    for (let j = i + 1; j < lines.length; j++) {
      if (inComment[j]) continue;
      const line = lines[j].replace(/\/\*[^*]*\*\//g, "").replace(/\/\/.*/, "").trim();
      if (!line) continue;
      next = line;
      break;
    }
    if (!next.startsWith("<")) continue;

    if (stripped.length < 2 || stripped.length > 120) continue;
    if (isAllowListed(stripped)) continue;

    violations.push({ line: i + 1, snippet: stripped });
  }

  return violations;
}

describe("i18n — no hardcoded English in localized dirs", () => {
  const repoRoot = resolve(__dirname, "../../..");

  it("detector catches both JSX text + visible-attr violations", () => {
    const synthetic = [
      'export function Foo() {',
      '  return (',
      '    <div>',
      '      <button aria-label="Open menu">',
      '        Click me',
      '      </button>',
      '    </div>',
      '  );',
      '}',
    ].join("\n");
    const violations = findViolations(synthetic);
    const snippets = violations.map((v) => v.snippet);
    expect(snippets).toContain('aria-label="Open menu"');
    expect(snippets).toContain("Click me");
  });

  it("detector skips translated source (curly-brace expressions)", () => {
    const synthetic = [
      'export function Foo() {',
      '  const t = useTranslations("Foo");',
      '  return (',
      '    <div>',
      '      <button aria-label={t("openMenu")}>',
      '        {t("clickMe")}',
      '      </button>',
      '    </div>',
      '  );',
      '}',
    ].join("\n");
    expect(findViolations(synthetic)).toEqual([]);
  });

  it("detector respects allow-list (brand names, domain prefix, RFC 2606 emails)", () => {
    const synthetic = [
      'export function Foo() {',
      '  return (',
      '    <>',
      '      <span>GitHub</span>',
      '      <span>officehours.app/h/</span>',
      '      <input placeholder="you@example.com" />',
      '      <span>Alex</span>',
      '    </>',
      '  );',
      '}',
    ].join("\n");
    expect(findViolations(synthetic)).toEqual([]);
  });

  for (const cleanDir of CLEAN_DIRS) {
    it(`${cleanDir} — no hardcoded English`, () => {
      const dirPath = join(repoRoot, cleanDir);
      const offenders: string[] = [];

      for (const file of walkTsx(dirPath)) {
        const content = readFileSync(file, "utf8");
        const violations = findViolations(content);
        for (const v of violations) {
          const rel = relative(repoRoot, file);
          offenders.push(`${rel}:${v.line}: ${v.snippet}`);
        }
      }

      expect(
        offenders,
        `Hardcoded English found in localized dir.\nViolations:\n${offenders.join(
          "\n",
        )}\n\nFix paths:\n  - Wrap the string with t("...") from useTranslations\n  - Add a key to messages/en.json + messages/es.json\n  - If the string is intentionally not-translated (brand name, RFC 2606 email, etc.) extend ALLOW_LIST in this test with a justification.`,
      ).toEqual([]);
    });
  }

  for (const cleanFile of CLEAN_FILES) {
    it(`${cleanFile} — no hardcoded English`, () => {
      const filePath = join(repoRoot, cleanFile);
      const content = readFileSync(filePath, "utf8");
      const violations = findViolations(content);
      const offenders = violations.map(
        (v) => `${cleanFile}:${v.line}: ${v.snippet}`,
      );
      expect(
        offenders,
        `Hardcoded English found in localized file.\nViolations:\n${offenders.join(
          "\n",
        )}`,
      ).toEqual([]);
    });
  }
});
