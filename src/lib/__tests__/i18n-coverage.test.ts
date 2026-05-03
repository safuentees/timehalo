import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import { describe, expect, it } from "vitest";

// B.PT94 — i18n coverage guard. Catches NEW hardcoded English
// strings in dirs that have already been localized (B.PT26,
// B.PT26B, B.PT91, B.PT92). Failure mode: developer adds a new
// component / new line to a clean dir and forgets `useTranslations`
// → CI fails with `file:line: <text>` listing instead of the user
// finding it manually weeks later (the symptom that drove QA-5
// sub-B).
//
// Scope: TARGETED CLEAN DIRS ONLY. Walking the whole app would
// surface hundreds of pre-existing violations from un-localized
// dirs (page titles + section legends across (host)/ — tracked as
// B.PT93). The narrow scope means this test gives immediate
// regression-protection on the work we shipped without becoming
// a 500-line allow-list maintenance burden.
//
// Expand `CLEAN_DIRS` when a sweep lands. Each new entry is a
// commitment that EVERY hardcoded English string in that subtree
// is intentional + on the allow-list. Don't add dirs casually.
//
// Pattern reference: src/lib/__tests__/no-mid-dot.test.ts (B.PT27)
// + i18n-no-duplicate-keys.test.ts (B.PT90) — same file-walk,
// same file:line failure shape, same vitest contract surface.

// Dirs that have been localized + are commitments to STAY
// localized. Adding a hardcoded English string in any file under
// these paths fails CI.
const CLEAN_DIRS = [
  "src/components/calendar", // B.PT91 — visitor booking surface
  "src/app/login", // B.PT26 + B.PT92 — login page + form sub-components
  "src/app/register", // B.PT26 + B.PT92 — register page + form
  "src/app/(host)/availability", // B.PT26B — availability form chrome
  "src/app/(host)/profile", // B.PT93 — profile-form + handle-fields
  "src/app/(host)/workspaces/[slug]/event-types", // B.PT103 — event-types panel + 3 dialogs
] as const;

// Specific files (not whole dirs) that have been localized. Useful
// for one-off pages at a route-group root that we don't want to
// scan the whole dir for.
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

// User-visible JSX attributes — strings here render to the user
// (aria-readers, browser tooltips, form placeholders, image
// fallbacks) so they need translation.
const VISIBLE_ATTRS = [
  "aria-label",
  "title",
  "placeholder",
  "alt",
  "aria-description",
] as const;

// Strings that are NOT user-facing English even when they look
// like it. Each entry has a justification — adding one is a
// design decision, not a typo workaround.
const ALLOW_LIST: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  // Brand names — never translated.
  { pattern: /^GitHub$/i, reason: "brand" },
  { pattern: /^Google$/i, reason: "brand" },
  { pattern: /^Microsoft$/i, reason: "brand" },
  { pattern: /^Outlook$/i, reason: "brand" },
  { pattern: /^Stripe$/i, reason: "brand" },
  { pattern: /^Officehours$/i, reason: "brand" },
  { pattern: /^Resend$/i, reason: "brand" },
  // Domain prefix in the register form's handle picker — visual
  // chrome the user sees their handle suffixed against; not a
  // translatable label.
  { pattern: /^officehours\.app\/h\/$/, reason: "domain prefix chrome" },
  // URL routing prefix used as input-group chrome (handle field's
  // /h/ addon). Not English; identical across locales.
  { pattern: /^\/h\/$/, reason: "URL routing prefix chrome" },
  // Personal-name placeholders that are also brand-neutral
  // identifiers (visitor booking name field shows "Alex" as a
  // sample first name; locale-agnostic, name catalog is huge).
  { pattern: /^Alex$/, reason: "neutral name placeholder" },
  // Single character or pure punctuation / arrows / ellipsis.
  { pattern: /^[\s\p{P}\p{S}…—–·]+$/u, reason: "punctuation only" },
  // ALL-CAPS abbreviations of 1–3 chars (TZ, IATA, day-narrow).
  { pattern: /^[A-Z]{1,3}$/, reason: "short-caps abbreviation" },
  // Email-shaped placeholders ending in @example/example.com — the
  // english "example" is a recognized i18n placeholder convention
  // (RFC 2606) but we still flag any placeholder that isn't ICU
  // example shape.
  { pattern: /^\S+@example\.com$/, reason: "RFC 2606 example email" },
  // Time / date format examples that pass through to ICU at runtime.
  { pattern: /^[0-9:.\s/-]+$/, reason: "numeric / format placeholder" },
  // Short technical tokens / ISO codes / status flags / single words
  // that are stand-alone identifiers, not sentences.
  { pattern: /^(en|es|fr|de|it|pt|ja|zh|ar|ru)$/i, reason: "locale code" },
  // Truthy / boolean string identifiers used in data-* attrs.
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

// Scan a JSX-like source for hardcoded English. Returns
// `[{ line, snippet }]` for each suspected violation.
//
// Detection passes:
//   1. Per-line: visible attribute literals (`aria-label="text"`,
//      `placeholder="text"`, etc.) — string-literal value of any
//      attribute in VISIBLE_ATTRS.
//   2. Per-line: short JSX text nodes with `>text<` on the same
//      line (e.g. `<span>Hello</span>` collapsed onto one line).
//   3. Per-block: multi-line JSX text nodes — Prettier formats
//      JSX children on their own lines like
//        <button>
//          Click me
//        </button>
//      so the previous regex misses them. Pass 3 strips comments,
//      strips JS-shaped lines (imports / declarations), then for
//      each line that's pure text (no JSX angle brackets, no
//      curly braces, no dot-method call), checks if it's between
//      JSX brackets in the surrounding context.
//
// Skips:
//   - Lines inside multi-line comments (cheap state, no full
//     parser; doesn't handle comments-inside-strings, but our
//     source files don't do that)
//   - Strings the allow-list matches
//   - Strings shorter than 2 chars or >120 chars (latter is
//     almost certainly a JSX prop chain, not user-copy)
function findViolations(
  source: string,
): Array<{ line: number; snippet: string }> {
  const violations: Array<{ line: number; snippet: string }> = [];
  const lines = source.split("\n");

  // Pre-scan: classify each line as inside-block-comment or not,
  // so passes 1-3 can skip commented lines uniformly.
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
      // The opening-block-comment line still has source code BEFORE
      // /* — only the tail is commented. Mark it as PARTIAL: passes
      // 1-2 still scan the prefix but pass 3 (text-line) skips.
    }
  }

  // Pass 1+2 — line-scoped (attrs + same-line JSX text).
  for (let i = 0; i < lines.length; i++) {
    if (inComment[i]) continue;
    let line = lines[i];
    const lineNum = i + 1;

    // Strip trailing line comment.
    const lineCommentIdx = line.indexOf("//");
    if (lineCommentIdx !== -1) line = line.slice(0, lineCommentIdx);
    // Strip a single inline /* ... */ comment fully on this line.
    line = line.replace(/\/\*[^*]*\*\//g, "");

    // Pass 1 — visible attributes.
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

    // Pass 2 — JSX text nodes ON THE SAME LINE, e.g.
    // `<span>Hello</span>`.
    const textRegex = />\s*([^<>{}\n]+?)\s*</g;
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

  // Pass 3 — multi-line JSX text nodes. A line is a candidate if:
  //   (a) it's pure text (no JSX angle brackets, no curly-brace
  //       expression, no JS keyword, no semicolon, no dot-method)
  //   (b) the previous non-empty / non-comment line ends with `>`
  //       (closing a JSX opening tag — meaning we're now inside
  //       the children area)
  //   (c) it contains alpha chars
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
    // Ignore JS-shaped tokens that happen to match (rare since we
    // exclude `;` and `=`, but defensive).
    if (/^(import|export|const|let|var|return|if|else|function|async)\b/.test(stripped))
      continue;

    // Walk back to find the previous non-empty / non-comment line.
    let prev = "";
    for (let j = i - 1; j >= 0; j--) {
      if (inComment[j]) continue;
      const line = lines[j].replace(/\/\*[^*]*\*\//g, "").replace(/\/\/.*/, "").trim();
      if (!line) continue;
      prev = line;
      break;
    }
    // Must be inside a JSX tag's children — previous non-empty line
    // ends with `>` (closing the opening tag) and isn't a self-
    // closing `/>`.
    if (!prev.endsWith(">") || prev.endsWith("/>")) continue;

    // Walk forward to confirm the next non-empty line starts with
    // `<` (the closing tag) — protects against false positives on
    // single text nodes that happen to satisfy textOnlyRegex.
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

  // Self-test: synthetic fixture exercises both detection paths
  // (JSX text node + visible attr) so a regex regression that
  // always returns [] would fail this test loudly.
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

  // Per-clean-dir contract. Each dir under CLEAN_DIRS gets its own
  // test so a violation in one dir doesn't mask the others' results.
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

  // Per-clean-file contract. Single files we've localized but
  // haven't expanded the parent dir to CLEAN_DIRS for (avoiding
  // false-positive noise from sibling un-localized files).
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
