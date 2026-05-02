# Edge-case discovery playbook

QA pass 2026-05-02 surfaced a class of bugs that manual happy-path
testing misses by construction: race conditions, post-delete orphans,
post-rename URL stability, cache invalidation timing. This doc is
the canonical playbook for finding them programmatically.

The playbook is intentionally narrow — three patterns, each with a
concrete trigger ("use this when…") and a single reference test. New
items in `docs/qa-pass-*.md` should pick a pattern from here, not
invent a new one.

## Pattern 1 — Property-based testing (`fast-check` + Vitest)

**Use when**: a contract has a clear invariant the existing example-
based tests can only spot-check. Idempotency contracts, slot-
generation determinism, schema round-trips, anything where the
phrase "for any input X, property P holds" describes the contract.

**Cost**: ~30s of test time per property at 50 runs. The CI gates
on `pnpm test:run`; one new property file extends wall time by ~3s.

**Setup**:

- Deps: `fast-check` (the engine) + `@fast-check/vitest` (the
  connector). Both are devDependencies. The connector is what gives
  you `test.prop({ ... }, { numRuns })(...)` — without it you fall
  back to wrapping `fc.assert` inside an `it()`, which works but
  loses Vitest's lifecycle integration.

```ts
import { test, fc } from "@fast-check/vitest";

test.prop(
  { key: fc.uuid({ version: 4 }), n: fc.integer({ min: 2, max: 8 }) },
  { numRuns: 25 },
)("for any key + N concurrent submits, exactly one row exists", async ({
  key,
  n,
}) => {
  // ... assertion ...
});
```

**Reference test**: `src/trpc/__tests__/bookings-create.property.test.ts`
extends the existing `bookings.create` idempotency contract from
"works for N=1, 2, 3" (the example-based tests in
`bookings-create.test.ts`) to "works for any UUID + any N in [2, 8]."
Reads on an interim run as `(idempotencyKey: "xxx", submitCount: K)
→ pass`; on a regression, fast-check shrinks to the minimum K that
fails. Run with `pnpm test:run` like every other contract.

**Generator choices that matter**:

- `fc.uuid({ version: 4 })` over `fc.uuid()` — the system produces
  v4 UUIDs at runtime via `crypto.randomUUID()`; fuzzing other
  versions exposes schema validation, not the contract under test.
- Bound `fc.integer({ min, max })` against real-world rate limits
  (e.g. `bookings.create` is rate-limited at 10/min/IP, so capping
  N at 8 keeps the test inside the safe envelope).
- Re-randomize visitor identifiers per iteration so iteration N+1
  doesn't accidentally hit iteration N's deduplication path.

**When property-based fails the cost-benefit**:

- Contract is purely tabular (e.g. handle slug → URL). Use a
  parameterized example-based test with `it.each([...])`.
- Contract requires multi-step UI choreography (drawer opens, user
  picks date, then time, then submits). Use a Playwright invariant
  spec (Pattern 2).
- Contract is observable only through a side-effect timeline
  (webhook fan-out, email queue). Use a deterministic example test
  with explicit ordering — fast-check's iteration model fights you.

## Pattern 2 — Cross-cutting Playwright invariant flows

**Use when**: a property holds across navigation / time / state
transitions, not within a single procedure call. "After a workspace
rename, no stale slug responds with 200." "After a user deletes
their account, no orphan member rows show up in any other workspace's
member list." "After a Stripe webhook fires, the billing badge
re-renders within 5s without a manual reload."

**Cost**: each spec adds ~3-10s to `pnpm exec playwright test`. The
suite is gated on `workers: 1` (see `.claude/rules/testing.md` —
required to keep the dev-server compilation race + the shared
`dev.db` from flaking the suite). Budget ~30s of wall time per new
invariant; run `pnpm exec playwright test --grep @invariant` locally
before committing.

**Tag pattern**: prefix the test name with `@invariant` so it
participates in the optional grep filter:

```ts
test("@invariant after workspace rename, old slug 404s and history alias redirects", async ({ page }) => {
  // ...
});
```

**Reference test**: `e2e/embed.spec.ts` (B.PT85) is the closest
example we have today. It's not strictly an "invariant flow" — it's
a single-flow smoke — but its shape (file:// parent + cross-origin
iframe + assertion across the postMessage boundary) is the canonical
shape for cross-context invariants. When we add a true invariant
spec (e.g. "after rename, old slug history works for ALL three
sub-paths"), structure it the same way: one `test()` block, the full
flow inline, no shared state across specs.

**When Playwright invariant fails the cost-benefit**:

- Invariant is purely server-side (procedure → database → procedure).
  Use a Vitest contract test or a property test (Pattern 1).
- Invariant involves a third-party service (Stripe, Calendar API).
  Use `vi.stubGlobal('fetch', ...)` in a Vitest contract test —
  Playwright would either need a real Stripe round-trip (flaky,
  rate-limited) or a fake server (heavyweight).

## Pattern 3 — Mutation testing (Stryker) — DEFERRED

**Use when**: you need to know how good your existing test suite
actually is. Mutation testing flips operators (`<` to `<=`, `&&` to
`||`, etc.), runs the suite, and reports which mutations were
caught vs which slipped through ("survived" mutations indicate
under-tested code paths).

**Why deferred**: Stryker re-runs the entire test suite per mutation
— with 374+ Vitest tests and a SQLite-backed contract layer, each
mutation run takes ~30-60s. A 50-mutation run is 25-50 minutes. The
existing suite's caught-bugs ratio is high enough (the §10.1
production primitives have explicit contract tests; the
`c2fe653` race condition was caught by an example test, not by
mutation testing) that the cost-benefit doesn't land yet.

**When to revisit**: when the project has >500 contract tests AND a
domain expert can't trace a recently-shipped subtle behavior to a
specific test asserting it. Until then, the existing tests + the
two patterns above cover the value mutation testing would deliver.

## Decision matrix

| Concern | Pattern | Example |
|---|---|---|
| "For any input X in space S, P(X) holds" | Property-based (Pattern 1) | `bookings-create.property.test.ts` |
| "After multi-step user action A, invariant Q holds" | Playwright invariant (Pattern 2) | `embed.spec.ts` (B.PT85) |
| "Did our existing tests miss a class of subtle bugs?" | Mutation testing (Pattern 3) | DEFERRED |
| "Procedure X with input Y returns Z" | Existing example-based contract | every `bookings-*.test.ts` file |
| "Page X hydrates without React errors" | Existing hydration smoke | `hydration.spec.ts` / `hydration-stress.spec.ts` |

## Adding a new edge-case finding

1. Open `docs/qa-pass-*.md` for the relevant pass; pick the OPEN row
   that motivates the new test.
2. Identify the shape of the invariant (per the table above) — pick
   the matching pattern.
3. Author the test next to its peers — property tests live in
   `src/trpc/__tests__/<domain>.property.test.ts`, Playwright
   invariants in `e2e/<flow>.spec.ts` with `@invariant` in the name.
4. Run all gates: `pnpm tsc --noEmit && pnpm lint && pnpm test:run
   && pnpm exec playwright test`.
5. Commit as a `B.PT##` row referencing the QA item it answers.

## Tooling status as of B.PT86

- `fast-check@^4` (engine) + `@fast-check/vitest@^0.4` (connector)
  are devDependencies. Vitest 4.1.5 + Node 22 are tested
  combinations.
- Stryker is NOT installed. If/when adopted, prefer Stryker over
  custom-rolled mutation tooling — the ecosystem is mature and the
  reporters integrate with both Vitest and CI badges.

## Anti-patterns

- ❌ Using `fc.anything()` or `fc.string()` without bounds. Wide
  generators produce useless edge cases (1MB strings, NaN, Symbols)
  that don't match real input shapes. Always pick a generator
  matched to the runtime origin (e.g. `fc.uuid({ version: 4 })`,
  `fc.integer({ min, max })`, `fc.constantFrom("FREE", "PRO")`).
- ❌ Writing one giant property test that asserts five invariants in
  the body. Each property = one invariant; if four invariants share
  the same setup, share a helper, not a body.
- ❌ Treating Playwright invariant specs as a substitute for unit
  tests. If the contract is server-side, Vitest catches it cheaper
  AND with finer-grained shrinking. Reach for Playwright only when
  the invariant genuinely spans the browser ↔ server boundary.
- ❌ Lowering `numRuns` below 25 to "make the test fast" without
  documenting why. Fast-check's shrinking quality scales with run
  count; below 25 you're rolling a 2d8 and calling it coverage. If
  the test is too slow, narrow the generators or split the property,
  don't dilute the fuzzer.
