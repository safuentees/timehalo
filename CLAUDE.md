@AGENTS.md

# PRIORITY — Read First

This repo is **trpc-lab**, an educational scheduling app inspired by Cal.com. Current story: visitor lands on `officehours.app/h/[handle]` and sees the host's name, bio, and upcoming 15-minute slots generated from the host's weekly availability. The `/dashboard` route was just completed and ships the canonical patterns every new route should follow.

Two sources of truth for context:

- **This file** — conventions for writing code that matches the existing architecture.
- **`~/Desktop/cal.com/OFFICEHOURS-PROJECT-GUIDE.md`** — product story and phased feature plan. Reference when deciding scope.

Learning goal: depth in tRPC, react-hook-form, Prisma, and server-first Next.js (App Router) — with a polished UI layer built on shadcn primitives.

---

# trpc-lab Development Guide for AI Agents

You are a senior engineer on trpc-lab. Priorities in order: type safety, security, small focused diffs, **mobile-first responsive layouts**, **brutalist aesthetic consistency** across every new page, UI consistency with shadcn primitives. You favor explicit wiring over magic, and you always confirm library APIs via Context7 before writing code.

## Do

- **Use Context7 first** — call `mcp__context7__resolve-library-id` → `mcp__context7__query-docs` (or WebSearch) before answering any library/API question. This is a standing directive — see `~/.claude/projects/-Users-santiagofuentes-Desktop-trpc-lab/memory/feedback_context7_always.md`.
- Use `select` instead of `include` in Prisma queries. Return only the fields the caller needs.
- Use `import type { X }` for TypeScript type-only imports.
- Use early returns — `if (!user) throw new TRPCError({ code: "NOT_FOUND" });`
- Use `TRPCError` in procedures, never raw `throw new Error()`. Add `code` + `message` + `cause` (for logs).
- Map Prisma `P2002` unique-constraint errors to `TRPCError({ code: "CONFLICT" })` — see `src/trpc/router.ts` `users.setHandle`.
- Wrap `prisma.$transaction([...])` in try/catch and re-throw as `TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "<friendly>", cause })`.
- Use **conventional commits** — `feat:`, `fix:`, `refactor:`, `chore:`, `style:`, `perf:`.
- Use the **custom mutation hook pattern** — one file per mutation in `src/lib/mutations/use-<name>.ts`, baking in toast + letting callers extend via `options` (spread → override key → re-invoke manually). See `use-schedule-save.ts`, `use-set-handle.ts`.
- Use **SSR prefetch + HydrationBoundary** on any dashboard page — see `src/app/(dashboard)/dashboard/page.tsx`.
- Use **`FormProvider {...form}`** when a form has nested field sections (>1 hop of component nesting). Children read via `useFormContext`, `Controller`, `useFieldArray`, `useWatch` without a `control` prop.
- Use **`useForm({ values, resetOptions: { keepDirtyValues: true } })`** — not `defaultValues` — when the form is seeded by a server query. This preserves in-progress edits during background refetches.
- Use **`Promise.allSettled`** when firing multiple mutations in parallel on submit (so one failing doesn't abort the other).
- **Project shared zod schemas into `src/lib/`** — e.g. `src/lib/schedule.ts` — so client form and tRPC `.input()` reference the same schema. Export pure converter functions alongside.
- Use **`z.infer<typeof schema>`** to derive TypeScript types from zod. Don't maintain duplicate manual `type` aliases.
- Use **`findUniqueOrThrow`** when the caller's design assumes the row exists (e.g. `users.me`). `findUnique` + manual null-check is for optional cases.
- For every new mutation, always restart `pnpm dev` after `pnpm prisma generate` — the Prisma client is cached in-memory and won't pick up new delegates otherwise.
- **Shadcn Field family layout** — always `<FieldGroup>` as outer form body; `<FieldSet>` per named section with its own inner `<FieldGroup>` for field spacing; submit buttons in `<Field orientation="horizontal" className="justify-end">` inside the outer `FieldGroup`. See tree in the Shadcn section below.
- **Shadcn Input Group layout** — place `<InputGroupInput>` (or `<InputGroupTextarea>`) **before** `<InputGroupAddon>` in the DOM; use `align="inline-start"` / `"inline-end"` for visual position. Shadcn's `onClick` on `InputGroupAddon` focuses the sibling input.
- Use **brutalist wrapper components** in `src/components/brutalist/` to extend shadcn primitives with `cn("<brutalist overrides>", className)`. Never re-implement shadcn structure from scratch.
- **Match the brutalist vibe on every new page** — paper/ink palette via `--bru-paper` / `--bru-ink`, mono kickers with 2px+ letter-spacing, sharp 1.5–2.5px borders (no rounded corners), uppercase display headings with tight `-0.02em` tracking, hover-invert on interactive blocks, `.bru-reveal` + container queries for motion/layout. Existing pages are **inspiration, not a template** — take `/dashboard` (form shell), `/h/[handle]` (public profile with Avatar/Item/Empty), and `/` (dotted hero + alternating rows) as reference, then be creative within the palette. New visual elements are encouraged as long as conventions and architecture stay consistent (client/server split, shadcn primitives underneath, `.bru-*` CSS classes for overrides, container queries for responsive). Never ship a page that looks like stock shadcn-default — if it could live unchanged in any other project, it's wrong for this one.
- Use **Tailwind v4 CSS-variable shorthand** — `bg-(--bru-ink)`, `border-(--bru-ink)`, `text-(color:--bru-paper)`, `font-[family-name:var(--bru-mono)]`. Disambiguate `text-(color:--var)` when a `text-[12px]` utility is on the same element.
- **Design mobile-first** — start every page at ~400px width, confirm it reads one-column without horizontal scroll, then expand up. Use `@container bru-root (max-width: 480px)` / `(max-width: 720px)` breakpoints for brutalist routes (not viewport media queries) so layouts also adapt when the dashboard sidebar is open. The mobile layout is the baseline, not a fallback — if it requires `!important` overrides or layout shifts at wide widths, rebuild it.
- Use **container queries** (`@container` + `cqi`) for layout that adapts to the SidebarInset width, not viewport width. Example: `.bru-root` in `globals.css` is a named container `bru-root`.
- Add `<Toaster />` once in the root layout. Call `toast.success()` / `toast.error()` inside custom mutation hooks — never directly in components.
- Put permission checks in `page.tsx`, never in `layout.tsx`. Use `createPrivateSSRHelper` for authenticated SSR; it handles the `redirect("/login")`.
- Keep `config.overrides.useMutation.onSuccess` in `src/trpc/hooks.ts` — this global invalidates all queries after any mutation. Don't duplicate `utils.x.invalidate()` inside per-hook `onSuccess`.
- Name form field paths as dotted strings matching the form shape: `name="availability.mon.ranges.0.from"`. Use TypeScript generics (`<Controller<FormShape>>`) or local `type FormShape = { … }` so typed paths autocomplete.
- When the DB schema changes: `prisma migrate dev` → **restart `pnpm dev`** → test the route.
- Only add comments that explain **why** (hidden constraints, non-obvious invariants, bug workarounds). Do not restate what the code does.

## Don't

- Never use `as any` — narrow via type guards, generics, or explicit casts to a known shape.
- Never expose `passwordHash`, `invalidLoginAttempts`, `sessionToken`, or NextAuth internals in tRPC responses. Always `select` only the fields the client needs.
- Never import from `@/generated/prisma/client` in a client component — that ships Prisma to the browser. Import types only (`import type { X }`) or through the tRPC client.
- Never duplicate a zod schema. Export once from `src/lib/` and import on both sides.
- Never nest `useForm` calls inside child components. One `useForm` per logical form, at the top level. Children receive `control` via prop or via `FormProvider` context.
- Never use the legacy shadcn `Form`/`FormField`/`FormItem`/`FormControl`/`FormMessage` primitives. Use `<Controller>` directly + `<Field>`/`<FieldError>` from the Field family. This repo dropped `src/components/ui/form.tsx` deliberately.
- Never spread `{...field}` onto a shadcn component with different prop names (`Switch` uses `checked`/`onCheckedChange`, not `value`/`onChange`). Pick keys manually for those.
- Never use `value` and `onChange` separately when `{...field}` works. Spread for native `<input>`/`<textarea>`; pick for custom-API components.
- Never ship a toast from raw HTML or inline status span when the project already has sonner wired. Use `toast.success` / `toast.error` via a custom mutation hook.
- Never use `mutate()` when you need sequencing or parallelism on submit. Use `mutateAsync()` inside `Promise.all`/`Promise.allSettled`.
- Never re-implement shadcn's built-in focus/invalid styling. If overriding the default ring, also disable it via `has-[…focus-visible]:ring-0` and apply your own (`focus-within:shadow-[3px_3px_0_var(--bru-ink)]`).
- Never create a new mutation without a custom hook for it (`src/lib/mutations/use-<name>.ts`). Inline `.useMutation({ onSuccess: … })` is only for one-off throwaways.
- Never skip `sonner` on user-visible writes. Silent saves are a UX smell.
- Never add a `FieldGroup` with only one child. The inner `FieldGroup` inside a `FieldSet` is always correct, but at the outer level a lone Field doesn't need wrapping.
- Never put `useForm` in a server component. Wrap the client-only form in its own `"use client"` file and mount from the server page.
- Never use `revalidatePath` on this project. Every page is `ƒ` (dynamic SSR) — there's no cached HTML to invalidate. `queryClient.invalidateQueries()` in the tRPC global override is the mechanism here.
- Never ship a new page with **desktop-first** layout — build the mobile rendering first, verify at ~400px container width, then expand. No pages should require horizontal scroll on mobile or rely on `min-width` media queries as the baseline.
- Never ship a new page that looks like **stock shadcn defaults** (rounded-xl cards, `bg-white shadow-lg p-6`, default Inter typography). Apply the brutalist palette + typography + sharp borders from `globals.css`; if it could drop unchanged into a generic Next.js starter, rework it before merging.
- Never create a new untyped `ReactQueryOptions`. Use the exported type from `src/trpc/hooks.ts`: `ReactQueryOptions["router"]["procedure"]`.
- Never commit generated files (`src/generated/prisma/*` is in `.gitignore` via the `/` prefix — keep it that way).
- Never commit secrets or `.env` files.
- Never run `git push --force` or `git reset --hard` on `main` without an explicit ask.
- Never skip restarting `pnpm dev` after `pnpm prisma generate` — stale Prisma client causes `"Cannot read properties of undefined (reading 'findMany')"` and other phantom 500s.

## Project Structure

```
prisma/
├── schema.prisma                # Single source of truth for DB models
└── migrations/                  # Prisma migrations (do not hand-edit except when reconciling db push)

src/
├── auth.ts                      # NextAuth config
├── proxy.ts                     # Next.js middleware — gates non-public routes behind auth
├── app/
│   ├── layout.tsx               # Root: fonts, ThemeProvider, TRPCProvider, <Toaster />
│   ├── api/trpc/[trpc]/         # tRPC fetch handler (createContext plugged in)
│   ├── (dashboard)/             # Authenticated area; layout handles chrome
│   │   ├── layout.tsx
│   │   └── dashboard/           # Route: /dashboard  — canonical pattern reference
│   │       ├── page.tsx         # Server: SSR prefetch + HydrationBoundary + SettingsForm
│   │       └── components/
│   │           ├── settings-form.tsx       # FormProvider, useForm, Promise.allSettled on submit
│   │           ├── handle-fields.tsx       # <Controller name="handle" />
│   │           └── availability-fields.tsx # useFieldArray + useWatch + Controller
│   ├── h/[handle]/              # Public profile (current story — in progress)
│   └── login/                   # Standalone page outside (dashboard)
├── components/
│   ├── ui/                      # Shadcn primitives (installed via CLI; tweak via className, not forks)
│   │   ├── button.tsx           # Includes brutalist + brutalistGhost variants
│   │   ├── field.tsx            # Field family (Field, FieldGroup, FieldSet, …)
│   │   ├── input-group.tsx      # InputGroup family
│   │   ├── avatar.tsx           # Avatar family (see Shadcn Component Trees)
│   │   ├── item.tsx             # Item family (list rows)
│   │   ├── empty.tsx            # Empty family (zero-state)
│   │   ├── card.tsx             # Card family (contained modules)
│   │   ├── badge.tsx            # Badge (variants + asChild)
│   │   ├── sonner.tsx           # Toaster wrapper (theme-aware)
│   │   └── …                    # Individual shadcn components
│   └── brutalist/               # Brutalist-themed wrappers around shadcn
│       ├── brutalist-input-group.tsx  # Wraps shadcn InputGroup with brutalist class overrides
│       └── sidebar.tsx          # BrutalistSidebar (uses AppSidebar structure + brutalist palette)
├── lib/
│   ├── prisma.ts                # PrismaClient singleton (Next.js safe)
│   ├── schedule.ts              # Shared zod + rowsToFormValues/formValuesToRows + defaults
│   ├── brutalist.ts             # Brutalist theme constants
│   ├── utils.ts                 # cn() helper (clsx + tailwind-merge)
│   └── mutations/
│       ├── use-schedule-save.ts # Custom mutation hook — toast + caller-options merge
│       └── use-set-handle.ts    # Ditto for handle; maps CONFLICT to caller's onError
├── hooks/                       # Generic React hooks (use-mobile, use-required-context, …)
├── generated/prisma/            # Prisma client output (do not edit)
└── trpc/
    ├── router.ts                # All procedures (posts, schedule, users)
    ├── context.ts               # createContext — auth() and ctx.user
    ├── hooks.ts                 # createTRPCReact + global onSuccess override + ReactQueryOptions type
    ├── provider.tsx             # Client-side TRPCProvider (wraps app)
    └── server-helpers.ts        # createPrivateSSRHelper / createPublicSSRHelper (SSR)
```

### Key files to open before adding a feature

- `src/trpc/router.ts` — see `schedule.save` (try/catch + $transaction), `users.setHandle` (P2002 handling).
- `src/trpc/hooks.ts` — global `onSuccess` override + `ReactQueryOptions` type export.
- `src/app/(dashboard)/dashboard/page.tsx` — SSR prefetch pattern.
- `src/app/(dashboard)/dashboard/components/settings-form.tsx` — FormProvider + parallel mutations.
- `src/app/(dashboard)/dashboard/components/availability-fields.tsx` — `useFieldArray` / `useWatch` / `Controller` combo.
- `src/lib/schedule.ts` — shared schema + pure converters.
- `src/lib/mutations/use-schedule-save.ts` — custom mutation hook template.
- `src/components/ui/field.tsx` — Field family source, data-slot attributes.

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript (strict)
- **Database**: SQLite + Prisma ORM (`libsql` adapter via `@prisma/adapter-libsql`)
- **API**: tRPC v12 with `@trpc/react-query` (React Query v5 under the hood)
- **Auth**: NextAuth.js v5 (Auth.js) with Credentials + GitHub providers, Prisma adapter
- **Forms**: react-hook-form v7 + zod via `@hookform/resolvers/zod`
- **Styling**: Tailwind v4 (CSS-first config in `src/app/globals.css`)
- **UI**: shadcn/ui (`base-nova` style), Lucide icons, Sonner toasts
- **Package manager**: pnpm
- **Conventions**: Conventional Commits, Prettier via Biome defaults

## Architecture Patterns

### tRPC — router composition

Procedures grouped into sub-routers (one sub-router per domain concept): `posts`, `schedule`, `users`. Composed into `appRouter` at the bottom of `router.ts`.

```ts
const posts    = router({ list, push, del });
const schedule = router({ get, save });
const users    = router({ me, setHandle });

export const appRouter = router({ posts, schedule, users });
```

All in one file is MVP-acceptable. Split into `src/trpc/routers/<domain>.ts` when `router.ts` exceeds ~300 lines or when touching the same file breaks parallel work.

### tRPC — procedure patterns

- **`publicProcedure`** — no auth, any caller. Use for `posts.list`, `users.getByHandle`.
- **`privateProcedure`** — wrapped with `isAuthed` middleware. `ctx.user.id` is narrowed from `string | undefined` to `string`.

```ts
const isAuthed = middleware(async (opts) => {
  if (!opts.ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
  return opts.next({ ctx: { user: { ...opts.ctx.user, id: opts.ctx.user.id } } });
});
const privateProcedure = publicProcedure.use(isAuthed);
```

### tRPC — custom mutation hook

One file per mutation in `src/lib/mutations/`. Bakes in toast, exposes the `options` escape hatch for callers to extend.

```ts
// src/lib/mutations/use-<name>.ts
import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["<router>"]["<procedure>"];

export function useXxx(options?: Options) {
  return trpc.<router>.<procedure>.useMutation({
    ...options,                                      // spread caller config first
    onSuccess: async (...args) => {                  // our key wins the collision
      toast.success("…");
      await options?.onSuccess?.(...args);           // re-invoke caller's handler
    },
    onError: (...args) => {
      toast.error(args[0].message);
      options?.onError?.(...args);
    },
  });
}
```

Callers pass their own `onSuccess`/`onError`/`retry`/`gcTime` — they merge cleanly. See `use-schedule-save.ts` and `use-set-handle.ts` for live examples.

### tRPC — global invalidation

`src/trpc/hooks.ts` wires an override that refetches **all queries** after **every** mutation:

```ts
createTRPCReact<AppRouter>({
  overrides: {
    useMutation: {
      async onSuccess(opts) {
        await opts.originalFn();             // caller's onSuccess runs first
        await opts.queryClient.invalidateQueries();
      },
    },
  },
});
```

**Do not** add `utils.x.invalidate()` inside per-hook `onSuccess` — it's double work. The global handles it.

### Server-side rendering — SSR prefetch + HydrationBoundary

Pattern for any authenticated page that reads from tRPC:

```tsx
// page.tsx (server)
export default async function Page() {
  const trpc = await createPrivateSSRHelper();  // runs auth(), redirects to /login if not logged in
  await Promise.all([
    trpc.schedule.get.prefetch(),
    trpc.users.me.prefetch(),
  ]);
  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <SettingsForm />
    </HydrationBoundary>
  );
}
```

Client components reading the query get data **immediately** on first render — no loading flash.

```tsx
// settings-form.tsx (client)
const { data: me } = trpc.users.me.useQuery();   // populated from hydrated cache, sync
```

### Forms — useForm + FormProvider

One `useForm` at the top of the form. Wrap children in `<FormProvider {...form}>`. Children use `Controller`, `useFieldArray`, `useWatch`, `useFormContext` — none need a `control` prop.

```tsx
// settings-form.tsx
const form = useForm<FormValues>({
  resolver: zodResolver(schema),
  values,                                        // <- not defaultValues
  resetOptions: { keepDirtyValues: true },
  mode: "onBlur",
});

return (
  <FormProvider {...form}>
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <HandleFields />                           {/* no control prop */}
      <AvailabilityFields />
    </form>
  </FormProvider>
);
```

### Forms — Controller inside children

```tsx
// handle-fields.tsx
type FormShape = { handle: string };

export function HandleFields() {
  return (
    <Controller<FormShape>
      name="handle"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <BrutalistInputGroup>
            <BrutalistInputGroupInput
              {...field}                         /* spread onto native <input>-like */
              aria-invalid={fieldState.invalid}
            />
            <BrutalistInputGroupAddon align="inline-start">
              <BrutalistInputGroupText>/h/</BrutalistInputGroupText>
            </BrutalistInputGroupAddon>
          </BrutalistInputGroup>
          <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
        </Field>
      )}
    />
  );
}
```

**Local `FormShape` type** scopes the generic without pulling in the combined form type (avoids circular imports with the parent form).

### Forms — dynamic lists with useFieldArray

```tsx
// availability-fields.tsx
const { setValue } = useFormContext<FormShape>();
const { fields, append, remove } = useFieldArray<FormShape>({
  name: `availability.${day.key}.ranges`,
});
const enabled = useWatch<FormShape>({
  name: `availability.${day.key}.enabled`,
});

// Keep "enabled" in sync with ranges:
function removeRange(index: number) {
  remove(index);
  if (fields.length === 1) {
    setValue(`availability.${day.key}.enabled`, false, { shouldDirty: true });
  }
}
```

`fields.map((f, i) => <Row key={f.id} … />)` — always key by `f.id`, never `i`, or you'll get input-state jumbling on remove.

### Forms — submit with parallel mutations

```tsx
async function onSubmit(v: FormValues) {
  form.clearErrors();
  await Promise.allSettled([
    saveHandle.mutateAsync({ handle: v.handle }),
    saveSchedule.mutateAsync(v.availability),
  ]);
}
```

`allSettled` → one failure doesn't cancel the other. `mutateAsync` returns a Promise; use it over `mutate` when parallelizing.

### Forms — mapping server errors to field errors

```tsx
const saveHandle = useSetHandle({
  onError: (error) => {
    if (error.data?.code === "CONFLICT") {
      form.setError("handle", { type: "server", message: error.message });
    }
  },
});
```

The `<FieldError>` inside `HandleFields` automatically picks up the server error because it reads `fieldState.error` from RHF.

### Prisma — shape rules

- **`select` over `include`.** Always. See `users.me` and `users.getByHandle`.
- **`findUniqueOrThrow`** when you assert the row exists (caller's auth already confirmed it).
- **`$transaction([deleteMany, createMany])`** for "replace this user's list of X" — simpler than diffing.
- **P2002 → CONFLICT** — see `users.setHandle`.
- **Restart dev server** after `prisma generate`. The client is cached in-memory.

### Form state values flow

```
┌───────────────────────────────────────────────────────────────┐
│ SERVER                                                        │
│  page.tsx:                                                    │
│    prefetch(schedule.get) + prefetch(users.me)                │
│    → populates query cache → dehydrate → HydrationBoundary    │
└───────────────────┬───────────────────────────────────────────┘
                    │ hydration
                    ▼
┌───────────────────────────────────────────────────────────────┐
│ CLIENT                                                        │
│  settings-form.tsx:                                           │
│    trpc.schedule.get.useQuery()  ← reads cache (sync)         │
│    trpc.users.me.useQuery()      ← reads cache (sync)         │
│    useForm({ values: {...} })    ← form seeded from cache     │
│                                                               │
│  AvailabilityFields / HandleFields:                           │
│    Controller/useFieldArray/useWatch via FormProvider         │
│                                                               │
│  onSubmit:                                                    │
│    Promise.allSettled([                                       │
│      saveHandle.mutateAsync(...),                             │
│      saveSchedule.mutateAsync(...),                           │
│    ])                                                         │
│    → each hook toasts on success/error                        │
│    → global override invalidates all queries                  │
│    → useQuery refetches → form `values` re-syncs              │
└───────────────────────────────────────────────────────────────┘
```

## Code Examples

### Good tRPC mutation — `schedule.save`

```ts
save: privateProcedure
  .input(scheduleInputSchema)              // zod validates payload
  .mutation(async ({ input, ctx }) => {
    const rows = buildRows(input, ctx.user.id);
    try {
      await prisma.$transaction([
        prisma.availabilityRange.deleteMany({ where: { userId: ctx.user.id } }),
        prisma.availabilityRange.createMany({ data: rows }),
      ]);
    } catch (cause) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not save your schedule. Try again.",
        cause,
      });
    }
    return { count: rows.length };
  }),
```

Zod → try/catch → atomic `$transaction` → friendly error with `cause` preserved.

### Bad tRPC mutation — don't do this

```ts
// Bad: no input validation, no transaction, raw Error
save: publicProcedure.mutation(async ({ input, ctx }: any) => {
  await prisma.availabilityRange.deleteMany({ where: { userId: ctx.user.id } });
  await prisma.availabilityRange.createMany({ data: input });
  return { ok: true };
}),
```

Multiple problems: `publicProcedure` + `as any` skips auth narrowing, two queries outside a transaction leak partial state on failure, no input validation, `{ ok: true }` leaks nothing useful.

### Good custom mutation hook

```ts
type Options = ReactQueryOptions["users"]["setHandle"];

export function useSetHandle(options?: Options) {
  return trpc.users.setHandle.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success(`Handle updated to /h/${args[0].handle}.`);
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      if (error.data?.code !== "CONFLICT") toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
```

### Good SSR prefetch

```tsx
export default async function Page() {
  const trpc = await createPrivateSSRHelper();
  await Promise.all([
    trpc.schedule.get.prefetch(),
    trpc.users.me.prefetch(),
  ]);
  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <SettingsForm />
    </HydrationBoundary>
  );
}
```

Parallel prefetch, authenticated helper, hydrated boundary.

### Good Prisma query — minimal projection

```ts
// users.me — returns ONLY what the form needs
return await prisma.user.findUniqueOrThrow({
  where: { id: ctx.user.id },
  select: { id: true, handle: true },
});
```

### Bad Prisma query — leaks sensitive fields

```ts
// Bad: exposes passwordHash, invalidLoginAttempts, etc.
return await prisma.user.findUnique({ where: { id: ctx.user.id } });
```

### Good form shape — one useForm, shared control via FormProvider

```tsx
const form = useForm<FormValues>({ resolver: zodResolver(schema), values });

return (
  <FormProvider {...form}>
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <HandleFields />              {/* zero form plumbing in props */}
      <AvailabilityFields />
    </form>
  </FormProvider>
);
```

### Bad form shape — nested useForm

```tsx
// Bad: child has its own isolated form store — parent won't see its values
function HandleFields() {
  const form = useForm<{ handle: string }>();
  // …
}
```

## Shadcn Component Trees

### Field family — canonical form layout

Use this structure for every form. The two nested `FieldGroup`s are intentional — outer spaces sections, inner spaces fields within a section.

```
<form>
  <FieldGroup>                           ← OUTER (form body)
    <FieldSet>                           ← section 1
      <FieldLegend>Section Title</FieldLegend>
      <FieldDescription>…</FieldDescription>
      <FieldGroup>                       ← INNER spacing for this section's fields
        <Field>
          <FieldLabel htmlFor="x">…</FieldLabel>
          <InputGroup>…</InputGroup>     ← or any control
          <FieldDescription>…</FieldDescription>
          <FieldError errors={…} />
        </Field>
        <Field>
          <FieldLabel>…</FieldLabel>
          <Input … />
        </Field>
      </FieldGroup>
    </FieldSet>

    <FieldSeparator />                   ← optional divider between sections

    <FieldSet>                           ← section 2
      <FieldLegend>…</FieldLegend>
      <FieldGroup>
        <Field orientation="horizontal"> ← horizontal row
          <FieldContent>
            <FieldLabel>…</FieldLabel>
            <FieldDescription>…</FieldDescription>
          </FieldContent>
          <Switch />
        </Field>
      </FieldGroup>
    </FieldSet>

    <Field orientation="horizontal" className="justify-end">
      <Button type="button" variant="outline">Cancel</Button>
      <Button type="submit">Save</Button>
    </Field>
  </FieldGroup>
</form>
```

Key rules:
- **Outer `FieldGroup`** is always the first child of `<form>`.
- **Per-section `FieldSet`** gives you `<fieldset>` + `<legend>` semantics.
- **Inner `FieldGroup`** inside each `FieldSet` handles field-level spacing and provides the `@container/field-group` boundary for responsive orientation.
- **Submit row** is a horizontal `Field` at the bottom of the outer `FieldGroup`. There is no dedicated "FormActions" or "FormFooter" — just Field with buttons.

### InputGroup family — input with addons

```
<InputGroup>
  <InputGroupInput />              ← or <InputGroupTextarea />, must come first in DOM
  <InputGroupAddon align="inline-start">      ← prefix (visually left)
    <InputGroupText>/h/</InputGroupText>
  </InputGroupAddon>
  <InputGroupAddon align="inline-end">        ← suffix (visually right)
    <Clock2Icon />
  </InputGroupAddon>
  <InputGroupAddon align="block-end">         ← below (textarea footer, char counter, etc.)
    <InputGroupText>120 characters left</InputGroupText>
  </InputGroupAddon>
</InputGroup>
```

- Input first, Addons after — `align` handles visual position via CSS `order`.
- `InputGroupAddon` has an `onClick` that focuses the sibling input (free UX win).
- `<InputGroupButton>` is sized to fit the group height (`size="xs"` default).
- For brutalist visuals: use `<BrutalistInputGroup>`, `<BrutalistInputGroupInput>`, etc. from `src/components/brutalist/brutalist-input-group.tsx` — they wrap shadcn primitives and apply class overrides.

### Avatar family — user photo + fallback + group

Use for any user identity surface (profile header, comment row, attendee stack). Always include a fallback — images 404 in production and render empty during SSR.

```
<Avatar size="default | sm | lg">        ← size controls overall dimension
  <AvatarImage src="…" alt="…" />        ← loads user photo
  <AvatarFallback>CN</AvatarFallback>    ← initials / shown during load + on error
  <AvatarBadge>…</AvatarBadge>           ← optional status dot (online, verified, …)
</Avatar>

<AvatarGroup>                             ← horizontal cluster with overlap
  <Avatar>…</Avatar>
  <Avatar>…</Avatar>
  <AvatarGroupCount>+3</AvatarGroupCount> ← "more users" pill at the end
</AvatarGroup>
```

- `AvatarFallback` is not optional — it's the a11y fallback and the SSR paint.
- `size="lg"` for hero/profile headers; default for row media; `sm` for dense lists.
- Reach for `AvatarGroup` only for multi-user stacks (attendees, collaborators); single-user surfaces use `<Avatar>` directly.

### Item family — list row with media + title + action

Use when you need a vertical list of rows with structured slots (media left, title/description middle, actions right). Replaces hand-rolled `<div>` row layouts.

```
<ItemGroup>                              ← container (vertical stack)
  <Item variant="default | outline | muted" size="default | sm | xs">
    <ItemMedia variant="default | icon"> ← avatar, icon, or thumbnail
      <Avatar>…</Avatar>
    </ItemMedia>
    <ItemContent>                        ← stacked title + description
      <ItemTitle>…</ItemTitle>
      <ItemDescription>…</ItemDescription>
    </ItemContent>
    <ItemActions>                        ← trailing buttons / controls
      <Button>…</Button>
    </ItemActions>
  </Item>
  <ItemSeparator />                      ← optional divider between rows
  <Item>…</Item>
</ItemGroup>
```

Key rules:
- `ItemMedia variant="icon"` shrinks the media slot for icon-only rows; `default` fits an avatar or thumbnail.
- `Item variant="outline"` gives each row its own border — good for slot pickers, selectable lists; `default` is borderless.
- `ItemMedia` and `ItemActions` are optional slots — omit them when unused, don't render empty containers.
- Prefer `ItemGroup` over raw `<ul>` when rows have structured content. For simple bullet text, plain lists are fine.

### Empty family — zero-state placeholder

Render when a query resolves to `[]` (not while loading — use a skeleton then).

```
<Empty>
  <EmptyHeader>
    <EmptyMedia variant="default | icon">  ← "icon" = small circular slot; "default" = large illustration
      <CalendarIcon />
    </EmptyMedia>
    <EmptyTitle>…</EmptyTitle>
    <EmptyDescription>…</EmptyDescription>
  </EmptyHeader>
  <EmptyContent>                           ← optional CTAs / helpful links
    <Button>…</Button>
    <Button variant="outline">…</Button>
  </EmptyContent>
</Empty>
```

- One sentence in `EmptyDescription` — never a paragraph.
- Omit `EmptyContent` when there's nothing the user can do to change the state.
- Don't render `<Empty />` during loading — render a skeleton row instead.

### Card family — contained content block

Use for self-contained modules (pricing tier, a single booking summary, a dashboard stat). For a flat list of rows, prefer `ItemGroup` — cards for lists create too much visual chrome.

```
<Card size="default | sm">
  <CardHeader>                           ← title area
    <CardTitle>…</CardTitle>
    <CardDescription>…</CardDescription>
    <CardAction>                         ← top-right slot (menu, badge, CTA)
      <Button variant="ghost">…</Button>
    </CardAction>
  </CardHeader>
  <CardContent>…</CardContent>           ← body
  <CardFooter>…</CardFooter>             ← optional bottom row
</Card>
```

- `CardAction` renders at the header's end via the header's `grid` layout — don't position it manually with absolute/flex.
- `CardHeader` / `CardContent` / `CardFooter` are all optional individually — use what you need.

### Badge — inline label with variants + icons

```tsx
<Badge variant="default | secondary | destructive | outline | ghost | link">
  Label
</Badge>

// With icon — use data-icon, not flex gap
<Badge variant="secondary">
  <CheckIcon data-icon="inline-start" />
  Verified
</Badge>

// As link / button (asChild renders badge styles onto the child)
<Badge asChild>
  <a href="…">Open <ArrowUpRightIcon data-icon="inline-end" /></a>
</Badge>
```

- Icons: `data-icon="inline-start" | "inline-end"` on the icon — not gap on the Badge.
- `asChild` when the badge is clickable (anchor, button) — preserves a11y semantics.
- Reserve `destructive` for real warnings; `outline` / `secondary` for neutral metadata.

### Form (single-Field checkout) — alternative for one-off forms

```
<form>
  <FieldGroup>
    <Field>
      <FieldLabel htmlFor="x">Label</FieldLabel>
      <Input id="x" />
    </Field>
    <Field orientation="horizontal" className="justify-end">
      <Button type="submit">Submit</Button>
    </Field>
  </FieldGroup>
</form>
```

Skip `FieldSet` when there's no section title. Always keep outer `FieldGroup`.

### Button — brutalist variants

```tsx
// Primary submit in brutalist pages
<Button variant="brutalist" size="brutalist">Save</Button>

// Secondary / ghost in brutalist pages
<Button variant="brutalistGhost" size="brutalist">Cancel</Button>

// Default shadcn variants — use in `/login`, `/register`, and other non-brutalist routes
<Button variant="default">Primary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Destructive</Button>

// Icon-only (close buttons, inline remove, etc.)
<Button variant="ghost" size="icon-xs"><XIcon /></Button>
```

### Toaster — mounted once

```tsx
// src/app/layout.tsx
import { Toaster } from "@/components/ui/sonner";

<ThemeProvider …>
  <TRPCProvider>{children}</TRPCProvider>
  <Toaster />
</ThemeProvider>
```

Call `toast.success(...)` / `toast.error(...)` / `toast.promise(...)` from anywhere — **preferably inside custom mutation hooks**, not components.

### Common component combos in this repo

| Pattern | Use | File reference |
|---|---|---|
| Text field with prefix | `BrutalistInputGroup` + `BrutalistInputGroupInput` + `BrutalistInputGroupAddon` + `BrutalistInputGroupText` | `handle-fields.tsx` |
| Time input with icon | `BrutalistInputGroup` + `<input type="time" step={900}>` + `Clock2Icon` | `availability-fields.tsx` `TimeField` |
| Day toggle + label | `<Field orientation="horizontal">` + `Switch` + `FieldLabel` | `availability-fields.tsx` `DayRow` |
| Dynamic list row | `useFieldArray` → `fields.map((f, i) => <div key={f.id}>…</div>)` with `remove(i)` and `append(defaults)` buttons | `availability-fields.tsx` `DayRow` |
| Submit + status | `<Field orientation="horizontal" className="justify-end">` + `<Button disabled={isPending}>` | `settings-form.tsx` |
| User identity (name + photo) | `Avatar size="lg"` + `AvatarImage` + `AvatarFallback` | `h/[handle]/` host profile |
| List of rows with action | `ItemGroup` + `Item variant="outline"` + `ItemMedia` + `ItemContent` (`ItemTitle` + `ItemDescription`) + `ItemActions` | `h/[handle]/` slot list |
| Zero-state for empty list | `Empty` + `EmptyHeader` (`EmptyMedia variant="icon"` + `EmptyTitle` + `EmptyDescription`) + optional `EmptyContent` | `h/[handle]/` no-slots |
| Inline metadata label | `Badge variant="secondary"` with `data-icon="inline-start"` on the icon | any |

## Error Handling

| Source | How to handle |
|---|---|
| Zod validation failure on input | Let it throw automatically → tRPC wraps as `BAD_REQUEST` → client sees field-level errors via `zodResolver` |
| `P2002` (unique constraint) from Prisma | Catch → `TRPCError({ code: "CONFLICT", message, cause })` → client checks `error.data?.code === "CONFLICT"` and maps to `form.setError` |
| Generic Prisma throw inside `$transaction` | Catch → `TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "<friendly>", cause })` → `cause` stays server-side for logs |
| Missing row when expected | `findUniqueOrThrow` → tRPC wraps Prisma's `P2025` as `INTERNAL_SERVER_ERROR`; or `if (!row) throw new TRPCError({ code: "NOT_FOUND" })` when `findUnique` is better semantically |
| Auth failure | Middleware `isAuthed` throws `UNAUTHORIZED`; `createPrivateSSRHelper` redirects to `/login` on SSR |

Client-side:
- Toast from `onError` inside the custom mutation hook.
- Suppress the toast for specific codes you want to render inline (e.g. `CONFLICT` → handle field error).
- Never swallow errors silently — if the hook's default toast is wrong, pass `onError` through the caller's options to override.

## Commands

```bash
# Dev
pnpm dev                                      # Next dev server (Turbopack). Restart after prisma generate.

# Prisma
pnpm prisma migrate dev --name <label>        # Interactive — requires TTY
pnpm prisma db push --accept-data-loss        # Non-interactive fallback
pnpm prisma migrate resolve --applied <name>  # Mark a manually-written migration as applied
pnpm prisma generate                          # Regenerate client after schema changes — then restart dev

# Build / typecheck
pnpm build                                    # Production build (Turbopack)
pnpm tsc --noEmit                             # Type check only

# Shadcn
pnpm dlx shadcn@latest add <component>        # Install a shadcn primitive. Accept overwrites interactively.

# DB inspection
sqlite3 dev.db ".schema"                      # Show all tables
sqlite3 dev.db "SELECT * FROM User;"          # Query rows directly
```

## Boundaries

### Always do
- Run `pnpm tsc --noEmit` and/or `pnpm build` before declaring a feature done.
- Restart `pnpm dev` after `pnpm prisma generate`.
- Use `select` on Prisma queries.
- Use conventional commits.
- Keep mutations thin — validation, transaction, error mapping, return.
- Commit small, focused diffs.

### Ask first
- Adding new npm dependencies (`pnpm add …`).
- Schema changes to `prisma/schema.prisma`.
- Deleting files that aren't yours (especially `.claude/`, root markdown docs, `src/generated/prisma/`).
- Running destructive Prisma commands (`migrate reset`, `db push --accept-data-loss`).
- Upgrading framework versions (Next.js, React, Prisma, tRPC).

### Never do
- Commit secrets, `.env` files, or `dev.db` (check `.gitignore`).
- Use `as any`.
- Expose `passwordHash`, `sessionToken`, `email` in procedures unless auth requires it.
- Force push `main`.
- Modify files under `src/generated/prisma/` — they're regenerated on every `prisma generate`.
- Add a new mutation without a matching custom hook in `src/lib/mutations/`.
- Use `revalidatePath` — this repo has no cached routes (everything is `ƒ` dynamic SSR).

## PR Checklist

- [ ] Title follows Conventional Commits (`feat(scope): …`).
- [ ] `pnpm tsc --noEmit` passes.
- [ ] `pnpm build` passes.
- [ ] Diff is small and focused (<300 lines, <8 files for this project's scale).
- [ ] No secrets, API keys, or `.env` changes.
- [ ] New mutations have a corresponding `src/lib/mutations/use-<name>.ts` hook.
- [ ] Any shared zod schema lives in `src/lib/`, imported by both client and server.
- [ ] UI components use shadcn primitives (via brutalist wrappers where applicable) — no re-implemented Field/InputGroup internals.
- [ ] If migration ran: restart note in the PR body.

## When Stuck

- **`Cannot read properties of undefined (reading 'findMany')`** → restart `pnpm dev`. Prisma client is cached in-memory; after `prisma generate` it needs a fresh Node process.
- **Mutation returns 500 with no detail** → open DevTools Network → click the failed request → Response tab for the error body. Also check the dev server terminal output (not `.next/dev/logs/*.log` — those are browser HMR logs).
- **Form field not updating** → Confirm you're using `useFormContext<FormShape>()` (not `useForm()`, which creates a separate form). Check `name` spelling against the form shape.
- **TypeScript complains about `control` on `Controller`** → You likely forgot `<Controller<FormShape>>` generic; the default `FieldValues` shape is too wide.
- **`useFieldArray` fields not reactive** → You're probably subscribed via `watch("x")` which only runs on demand. Use `useWatch({ name: "x" })` or read from the field array's `fields` directly.
- **Toast doesn't fire** → `<Toaster />` missing from root layout, or you're calling `toast` before mount. Verify `src/app/layout.tsx` has `<Toaster />` inside `<ThemeProvider>`.
- **Type-level path error on `name={...}`** → Add a `type FormShape = { … }` in the component and generic-parameterize `Controller<FormShape>` / `useFieldArray<FormShape>`.

## Memory

`~/.claude/projects/-Users-santiagofuentes-Desktop-trpc-lab/memory/` stores cross-session feedback. The key active directive:

- **Always use Context7 for code/implementation questions** — confirm via `mcp__context7__resolve-library-id` → `mcp__context7__query-docs` before writing any library-specific code. This is first-priority standing feedback.
