# Schedule-confirm form — code recipe

Spec: `docs/figma/spec-schedule-confirm.json` (23 nodes from Figma file
`oMqBS70mJBO6jBfWHRnbZt`, node `132:78`).
Anim: none captured (static form layout).
Targets: `src/components/calendar/booking-form.tsx` `CreateForm` (line ~56).

## What's in the spec

```
Frame 2  (382.5×250, vertical auto-layout, gap=20)
├─ name-input          (382.5×33)   row: label + input,  INNER_SHADOW r=3.5
├─ email-input         (382.5×33)   row: label + input,  INNER_SHADOW r=3.5
├─ text-field          (382.5×88)   Component 4 instance, DROP_SHADOW r=15
└─ confirm-button      (382.5×36)   button,                 DROP_SHADOW r=15
```

Outer `Frame 2` carries auto-layout `vPad=0 hPad=0 spc=20` — a clean
vertical stack with **20px gap** between rows. No outer fill, no outer
border, no outer shadow on the form itself (the surrounding modal
frame owns the inset paper-frame chrome — see
`docs/figma/recipe-schedule-chips.md`).

## Colors + effects (extracted, 1-to-1)

All colors map to existing project tokens — no raw hex needed.

| Element | Bg | Border | Text | Effect | cornerR |
|---|---|---|---|---|---|
| `name-input` row | `--oh-paper` `#EEE7D5` | — | — | `inset 0 0 3.5px rgba(0,0,0,0.25)` | 2 |
| `input#visitorName` (inside row) | (transparent over paper) | — | label `--oh-ink` | `0 4px 4px rgba(0,0,0,0.25)` | — |
| `email-input` row | `--oh-paper` | — | — | `inset 0 0 3.5px rgba(0,0,0,0.25)` | 2 |
| `input#visitorEmail` (inside row) | (transparent) | — | label `--oh-ink` | `0 4px 4px rgba(0,0,0,0.25)` | — |
| `text-field` instance (Component 4) | `--oh-paper` | 1px `--oh-ink` | placeholder `--oh-ink` | `0 0 15px rgba(0,0,0,0.25)` | 2 |
| `confirm-button` (inside row, the row has the shadow) | `--oh-ink` `#0A0A0A` | 1px `--oh-ink` | `--oh-paper` | `0 0 15px rgba(0,0,0,0.25)` | **10** |

### Subtleties

- Rows for name/email have `INNER_SHADOW radius=3.5` (subtle inset
  glow ~3.5px). Rounded to 4 reads identical to the eye:
  `box-shadow: inset 0 0 4px rgba(0,0,0,0.25)`.
- Input wrappers (`input#visitorName`, `input#visitorEmail`) carry a
  separate **outer** drop-shadow `0 4px 4px rgba(0,0,0,0.25)` — that's
  the "depressed" feel where the input sits below the label rail. The
  shadow has `offset.y=4`, so it's directional (down).
- Textarea (Component 4) and confirm-button both share
  `DROP_SHADOW radius=15 spread=0 offset=(0,0) #000@0.25` — same halo
  as the day chips (B.PT155-era). Use:
  `box-shadow: 0 0 15px rgba(0,0,0,0.25)`.
- Confirm button is the ONE element with `cornerRadius: 10` (not the
  project's `--oh-r-xs` 2px). It's a deliberate pill-ish CTA radius —
  use `rounded-[10px]` arbitrary or add an `--oh-r-cta` token.

## Layout (per row)

The name/email rows are **horizontal flex** with label LEFT, input
RIGHT — NOT the standard stacked `<label> / <input>`:

```
┌──────────────────────────────────────────┐  Row: paper bg, inner shadow,
│  [Name  ]  [   input field           ]   │  cornerRadius 2, padding 0.5
└──────────────────────────────────────────┘
   63×32       318.5×32 (drop-shadow)
```

Captured padding on the row: `hPad=0.5 vPad=0.5` — basically zero,
just a hairline. Inside the input section: `hPad=6 vPad=7` (the
text starts ~6px from the input's left edge).

Inside the label section: child TEXT `Name`/`Email` is `JetBrains
Mono ExtraBold 11px`, `--oh-ink`, vertically centered. **This is
exactly the project's `oh-legend` typography utility** (`globals.css`
line ~1646: mono 11px font-weight 800 letter-spacing 2.5px uppercase
opacity-55) — except spec opacity is 1.0 not 0.55. So either:
- compose `oh-legend opacity-100`, OR
- use the inline class string the spec implies (mono 11 ExtraBold,
  no letter-spacing visible in spec, not uppercase since text is
  `Name` / `Email` proper-case)

The spec shows `tracking` not captured. Using `oh-legend` adds
2.5px tracking — visually fine for caps but `Name` isn't caps.
**Recommendation**: use `font-mono text-[11px] font-extrabold
text-[color:var(--oh-ink)]` directly — closest 1-to-1.

## Confirm button

Row `confirm-button` (382.5×36) carries the drop-shadow. Inside:
`button.oh-focus-ring` (382.5×36, cornerR 10, ink fill, 1px ink
stroke, paper text, padding `hPad=22.5 vPad=16.5` — wait, that's a
big vertical pad on a 36-tall element, which doesn't fit. Re-read:
the captured padding is BEFORE the auto-layout fits children; with
button height fixed at 36 and text 19 tall, vertical pad collapses
to `(36-19)/2 ≈ 8.5`. The 16.5 captured value is a Figma
auto-layout intent, not the rendered px — trust the OUTER size and
the text size, don't trust the padding for tight elements. **In code,
just use** `h-9 px-6 inline-flex items-center justify-center`.

Text: `JetBrains Mono ExtraBold 13px`, `--oh-paper`, content
`Confirm booking →` (the arrow is a literal char).

## JSX recipe (style 1-to-1, structural cleanup)

### Current structural issues (CreateForm, line 56–207)

1. **`<FieldSet><FieldGroup>` per field** — `FieldSet` is a multi-
   field grouping primitive (used with `<legend>` for related fields
   like address-line-1/2/city/zip). Wrapping each individual field
   in its own FieldSet inverts the contract. Strip the inner FieldSet
   per field; keep the OUTER `<FieldGroup>` as the form-row container.
2. **Textarea breaks the InputGroup pattern** — `visitorName` /
   `visitorEmail` use `<OhInputGroup>` + label-as-addon; `question`
   reverts to raw `<label>` + `<textarea>`. Adopt one shape across all
   three fields. Three options (least → most invasive):
   - Keep textarea bare, drop OhInputGroup for name/email too →
     converges on raw label+input. **Loses the Figma label-LEFT-of-
     input pattern.**
   - Build `<OhInputGroupTextarea>` mirroring `OhInputGroupInput`
     wiring → all three fields use the same wrapper. **Best for
     1-to-1 fidelity.** ← recommended
   - Extract a `<BookingField name=... type=... placeholder=...>` helper
     that switches internally between input/textarea → tightest
     callsite, hides the wiring. **Best for code-review economy** but
     adds an indirection.
3. **Repeated Controller boilerplate** — same 4-line shape per field
   (`Field` + `Controller` + render-prop with field+fieldState +
   `FieldError`). After fixing #1 + #2, the boilerplate per field
   collapses to 6-7 lines. Extract `<BookingField>` helper if you
   want to go further; not required for the port.
4. **Question label** uses `<label className="oh-field-label">` with a
   tail `<span className="oh-field-label-opt">` for "(optional)".
   The Figma spec doesn't surface "(optional)" anywhere — drop the
   span when porting since the design doesn't carry it. (User's
   directive: 1-to-1 visual.)
5. **Submit button error** rendered as a raw `<p className="oh-field-
   error">` outside the FieldGroup. Move the error line ABOVE the
   button and reuse the `<FieldError>` shape for consistency.

### Target skeleton

```tsx
function CreateForm({ handle, slotStart }: { handle: string; slotStart: string }) {
  const t = useTranslations("BookingCalendar");
  const router = useRouter();
  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: { visitorName: "", visitorEmail: "", question: "" },
    mode: "onBlur",
  });
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const book = useBookingCreate({
    onSuccess: (booking) => {
      form.reset();
      router.push(`/h/${handle}/booked/${booking.publicUid}`);
    },
  });

  function onSubmit(values: BookingFormValues) {
    book.mutate({
      handle,
      slotStart,
      idempotencyKey,
      visitorName: values.visitorName,
      visitorEmail: values.visitorEmail,
      question: values.question,
      visitorTimezone: getBrowserTimezone(),
    });
  }

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="oh-booking-form flex flex-col gap-5" // 20px stack — matches Figma Frame 2 spc=20
      >
        <FieldGroup className="flex flex-col gap-5">
          <BookingTextField
            name="visitorName"
            label={t("fieldName")}
            placeholder={t("fieldNamePlaceholder")}
            autoComplete="name"
            autoCapitalize="words"
          />
          <BookingTextField
            name="visitorEmail"
            label={t("fieldEmail")}
            placeholder={t("fieldEmailPlaceholder")}
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <BookingTextareaField
            name="question"
            label={t("fieldQuestion")}
            placeholder={t("fieldQuestionPlaceholder")}
            rows={3}
            maxLength={500}
          />
        </FieldGroup>

        {book.error ? (
          <p className="oh-field-error" role="alert">
            {book.error.message}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="oh"
          size="oh"
          disabled={book.isPending}
          className={cn(
            "oh-book-submit h-9 rounded-[10px]",
            // Confirm-button drop-shadow halo (Figma DROP_SHADOW r=15):
            "shadow-[0_0_15px_rgba(0,0,0,0.25)]",
            // Typography (mono 13 ExtraBold, paper-on-ink baked into variant=oh):
            "font-mono text-[13px] font-extrabold",
          )}
        >
          {book.isPending ? t("submitBookPending") : t("submitBook")}
        </Button>
      </form>
    </FormProvider>
  );
}

// ── New helper components ────────────────────────────────────────────

type BookingFieldName = keyof Pick<BookingFormValues, "visitorName" | "visitorEmail" | "question">;

function BookingTextField({
  name,
  label,
  placeholder,
  type = "text",
  ...inputProps
}: {
  name: Exclude<BookingFieldName, "question">;
  label: string;
  placeholder?: string;
  type?: React.HTMLInputTypeAttribute;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "type" | "placeholder">) {
  return (
    <Controller<BookingFormValues>
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <div
            // ROW: paper bg + INNER_SHADOW (1-to-1 with Figma row).
            className={cn(
              "flex h-[33px] items-stretch overflow-hidden",
              "rounded-(--oh-r-xs) bg-[color:var(--oh-paper)]",
              "p-[0.5px]", // hairline padding from spec
              "shadow-[inset_0_0_4px_rgba(0,0,0,0.25)]",
            )}
          >
            {/* LABEL (left, 63×32, mono 11 ExtraBold ink) */}
            <span
              className={cn(
                "flex w-[63px] shrink-0 items-center pl-[6px]",
                "font-mono text-[11px] font-extrabold text-[color:var(--oh-ink)]",
              )}
            >
              {label}
            </span>
            {/* INPUT (right, 318.5×32, drop-shadow halo) */}
            <input
              {...field}
              {...inputProps}
              id={field.name}
              type={type}
              placeholder={placeholder}
              aria-invalid={fieldState.invalid}
              className={cn(
                "min-w-0 flex-1 bg-transparent px-[6px] py-[7px]",
                "font-sans text-[14px] leading-[18px]",
                "outline-none",
                "shadow-[0_4px_4px_rgba(0,0,0,0.25)]",
              )}
            />
          </div>
          <FieldError
            errors={fieldState.error ? [fieldState.error] : undefined}
            className="oh-field-error"
          />
        </Field>
      )}
    />
  );
}

function BookingTextareaField({
  name,
  label,
  placeholder,
  rows = 3,
  maxLength,
}: {
  name: Extract<BookingFieldName, "question">;
  label: string;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <Controller<BookingFormValues>
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <label className="sr-only" htmlFor={field.name}>{label}</label>
          {/* Textarea = Component 4 instance: paper bg, 1px ink stroke,
              cornerR 2, halo drop-shadow r=15. The label is inline-
              within (Figma uses a placeholder "Text" — we keep <label>
              for a11y with sr-only since the placeholder doubles as
              the visible cue). */}
          <textarea
            {...field}
            id={field.name}
            rows={rows}
            maxLength={maxLength}
            placeholder={placeholder}
            aria-invalid={fieldState.invalid}
            className={cn(
              "w-full resize-none",
              "rounded-(--oh-r-xs) border border-[color:var(--oh-ink)]",
              "bg-[color:var(--oh-paper)]",
              "px-[12.5px] py-[10.5px]",
              "font-sans text-[14px] leading-[18px] text-[color:var(--oh-ink)]",
              "placeholder:text-[color:var(--oh-ink)] placeholder:opacity-55",
              "outline-none",
              "shadow-[0_0_15px_rgba(0,0,0,0.25)]",
            )}
          />
          <FieldError
            errors={fieldState.error ? [fieldState.error] : undefined}
            className="oh-field-error"
          />
        </Field>
      )}
    />
  );
}
```

### Why these structural changes

- **`<FieldSet>` removed** (was wrapping single fields, inverted use)
- **`<OhInputGroup>` removed** for name/email — the Figma row layout
  doesn't match what `OhInputGroup` was built for (addon-decorated
  inputs in a single bordered chrome). The new row IS its own
  primitive, expressed inline. If you'd rather keep `OhInputGroup`,
  you'd need to extend it with a `variant="row-with-shadow"` mode —
  more invasive, not required for fidelity.
- **`<BookingTextField>` + `<BookingTextareaField>`** make the three
  fields share the same Controller+Field+FieldError shape, with a
  type-narrowed `name` prop preventing `question` from being passed
  to the text input or vice versa. Callsite is one component per
  row, no Controller boilerplate visible.
- **Submit button moved out of FieldGroup**, error message moved
  above the button (visually + semantically belongs with the form,
  not under it).

### Things to leave alone (style-only — not part of this commit)

- The `oh-booking-form` class — keep for any global form styling
  hooks already wired in `globals.css`.
- `useBookingCreate` mutation hook — unchanged.
- `getBrowserTimezone()` call — unchanged.
- `idempotencyKey` lazy initializer — unchanged (B.PT… pattern).
- The `RescheduleConfirm` component below — out of scope (different
  Figma frame; user explicitly named "the confirm form" which is
  CreateForm, not the reschedule path).

## Effects translation summary

| Figma effect | CSS / Tailwind |
|---|---|
| `INNER_SHADOW r=3.5 spread=0 offset=(0,0) #000@0.25` (input rows) | `shadow-[inset_0_0_4px_rgba(0,0,0,0.25)]` |
| `DROP_SHADOW r=4 spread=0 offset=(0,4) #000@0.25` (input element) | `shadow-[0_4px_4px_rgba(0,0,0,0.25)]` |
| `DROP_SHADOW r=15 spread=0 offset=(0,0) #000@0.25` (textarea + button row) | `shadow-[0_0_15px_rgba(0,0,0,0.25)]` |
| `cornerRadius: 2` | `rounded-(--oh-r-xs)` |
| `cornerRadius: 10` (button only) | `rounded-[10px]` (consider new token `--oh-r-cta: 10px`) |
| Fill `#EEE7D5` | `bg-[color:var(--oh-paper)]` |
| Fill `#0A0A0A` | `bg-[color:var(--oh-ink)]` |
| Stroke `#0A0A0A` 1px | `border border-[color:var(--oh-ink)]` |
| Text `#0A0A0A` | `text-[color:var(--oh-ink)]` |
| Text `#EEE7D5` (button) | `text-[color:var(--oh-paper)]` |

## Wiring notes

- The 20px gap between rows comes from Frame 2's `spc=20`. Use
  `gap-5` on the parent FieldGroup (Tailwind `5 = 20px`). The
  existing form's `<FieldGroup>` already uses spacing — verify the
  CSS variable / class delivers exactly 20px.
- `gap` between label and input WITHIN a row: spec doesn't carry a
  flex-gap on the row's auto-layout; the label width 63 + input
  width 318.5 = 381.5 ≈ 382.5 (the row width, less 1px hairline),
  so the row is gap-0 with both sections butting against each other.
- The input section's left padding (where text starts) is `hPad=6`
  in Figma. Inside the label section, the "Name" text sits at
  `pl-[6px]` (matching).
- The Figma input rows have `cornerRadius: 2` on the OUTER row; the
  input element itself has no cornerRadius. With `overflow-hidden`
  on the row, the input's drop-shadow is clipped — confirm visually
  if the halo is meant to escape the row (try `overflow-visible`
  alternative).

## What if the parallel agent wants to consolidate further

If the parallel agent prefers to keep a **single helper** instead of
two (`BookingField`), here's the union-typed version:

```tsx
type BookingFieldProps =
  | { name: "visitorName" | "visitorEmail"; label: string; placeholder?: string;
      type?: React.HTMLInputTypeAttribute; multiline?: never; rows?: never; maxLength?: never;
      autoComplete?: string; autoCapitalize?: string; autoCorrect?: string; spellCheck?: boolean }
  | { name: "question"; label: string; placeholder?: string; multiline: true;
      rows?: number; maxLength?: number;
      type?: never; autoComplete?: never; autoCapitalize?: never; autoCorrect?: never; spellCheck?: never };

function BookingField(props: BookingFieldProps) {
  if ("multiline" in props && props.multiline) return <BookingTextareaField {...props} />;
  return <BookingTextField {...props} />;
}
```

Tradeoff: tighter callsite, looser type ergonomics for autocomplete /
spellcheck props. Pick based on call density (3 callsites today, so
the explicit two-helper shape is fine).
