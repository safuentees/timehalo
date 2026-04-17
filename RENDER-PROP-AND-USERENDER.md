# `render` prop, `useRender`, and composition patterns

Notes on what's going on inside shadcn/Base UI components — specifically `SidebarMenuButton` and why `render={<Link />}` works the way it does.

---

## The problem being solved

> "I want a component's **styling and behavior** but I want it rendered as a **different HTML element** than its default."

For the sidebar:
- `SidebarMenuButton` defaults to rendering a `<button>`
- Navigation needs an `<a>` / Next.js `<Link>` for client-side routing
- Want button's styling (classes, active state, tooltip wiring) + Link's navigation

Bad alternatives:
- Nest `<Link>` inside `<button>` → invalid HTML (`<button><a></a></button>`)
- Nest `<button>` inside `<Link>` → same problem flipped
- Manually copy the ~30 classes onto a `<Link>` → brittle, stale on updates

## The solution: `render` prop

```tsx
<SidebarMenuButton render={<Link href="/drafts" />}>
  <FileEdit />
  <span>Drafts</span>
</SidebarMenuButton>
```

**What actually renders in the DOM:** the `<Link>` (which becomes an `<a>`), with all the button's classes, data attributes, and event handlers stamped onto it.

```html
<a href="/drafts"
   class="...30+ classes from cva + my overrides..."
   data-active="true"
   data-slot="sidebar-menu-button">
  <FileEdit />
  <span>Drafts</span>
</a>
```

One element. Valid HTML. Styling preserved. Navigation works.

## Who "wins" when props conflict

**The parent component wins on behavioral props.** Your passed element wins on identity-defining props (like `href`).

| Prop | Source |
|---|---|
| `href` | Your `<Link>` |
| `class` | Parent's className + your className (merged via `tailwind-merge`) |
| `data-*` | Parent (from `state` object in `useRender`) |
| `ref` | Combined so both sides get the DOM node |
| `onClick` | If both have one, they're **chained** (both run) |

---

## `useRender` — what it does

The hook from `@base-ui/react/use-render` that every Base UI component uses internally.

```ts
const element = useRender({
  defaultTagName: "button",   // fallback if no render passed
  render,                      // optional — <Link /> or callback
  props: mergeProps(baseProps, userProps),
  state: { active: true, size: "default" },
})
```

Five things it handles so you don't:

1. **Optional `render`** — if undefined, falls back to `defaultTagName`
2. **`render` can be element OR function** — both branches work
3. **Smart prop merging** — `className` concatenated, `onClick` chained, refs combined
4. **`state` → `data-*` attributes** — `{ active: true }` becomes `data-active="true"`
5. **Ref forwarding** — both internal and external refs share the DOM node

Without it, every component author would reimplement 25+ lines of cloning / merging / type-checking boilerplate. With it, one hook = consistent behavior across every Base UI component.

---

## Is `render` optional?

Yes. Types are `render?: RenderProp<T>`. Three scenarios:

```tsx
// No render — falls back to defaultTagName "button"
<SidebarMenuButton>Drafts</SidebarMenuButton>
// → <button>Drafts</button>

// Render as element
<SidebarMenuButton render={<Link href="/drafts" />}>Drafts</SidebarMenuButton>
// → <a href="/drafts">Drafts</a>

// Render as callback (access internal state)
<SidebarMenuButton render={(props, state) => (
  <MyCustom {...props} highlight={state.active} />
)}>
// → whatever MyCustom renders
```

All three go through the same `useRender` call.

---

## `data-*` attributes — what they're for

Custom HTML attributes. Browser ignores them, but:

1. **CSS can target them** — `data-[active=true]:bg-foreground/5`
2. **Ancestors/descendants can react** — `group-data-[collapsible=icon]:size-8`
3. **Show up in DevTools** — easy to debug state

Why prefer `data-active="true"` over just toggling a class? Because it separates **state declaration** (`data-active`) from **visual presentation** (the CSS that reacts to it). Change the CSS, state logic stays untouched.

In Base UI, the `state` object you pass to `useRender` becomes data attributes automatically:

```ts
state: { active: true, size: "default", slot: "sidebar-menu-button" }
// → data-active="true" data-size="default" data-slot="sidebar-menu-button"
```

---

## `cva` (class-variance-authority)

Helper that packages `{ base classes, variant classes, default variants }`:

```ts
const sidebarMenuButtonVariants = cva(
  "base classes always applied...",  // base
  {
    variants: {
      size: {
        default: "h-8 text-sm",
        sm: "h-7 text-xs",
        lg: "h-12 text-sm",
      },
    },
    defaultVariants: { size: "default" },
  }
)

// Calling returns a className string:
sidebarMenuButtonVariants({ size: "sm" })
// → "base classes... h-7 text-xs"
```

Components use it to generate their className based on variant props.

---

## The tooltip ternary in `SidebarMenuButton`

```ts
render: !tooltip ? render : <TooltipTrigger render={render} />,
```

**If no tooltip:** use the user's `render` directly.
**If tooltip:** wrap the user's render in a `<TooltipTrigger>`, which itself uses the render prop pattern to attach tooltip triggering to the same element.

It's the render prop pattern **nested twice** — still produces one `<a>` in the DOM, but with extra ARIA attributes so the tooltip knows what to point at.

---

## Connection to react-hook-form

Same underlying pattern, different flavors:

| | `{...register("title")}` | `render={<Link />}` |
|---|---|---|
| Library | react-hook-form | Base UI |
| Returns/accepts | Object of props | A React element |
| Merge method | JSX spread | `mergeProps` + `cloneElement` |
| Use case | Native inputs (uncontrolled) | Any element (polymorphic) |

**Both solve:** "A library owns behaviors/state that must attach to a DOM element rendered by the consumer."

### For custom controlled components (shadcn Select, etc.) — use `Controller`

```tsx
<Controller
  name="role"
  control={control}
  render={({ field }) => (
    <Select onValueChange={field.onChange} value={field.value}>...</Select>
  )}
/>
```

Controller's `render` is a **function** (callback form), unlike Base UI's element form. It gives you `field = { onChange, value, ref, name, onBlur }` to wire manually into the custom component's controlled props.

Why? Because shadcn's `Select` (and similar) manage their own state via React Context — there's no `<input>` DOM node to spread `register()` onto. You must bridge state manually.

---

## The mental shortcut

When you see either pattern, ask:

> "What does this library own, and how is it attaching to the element I render?"

- **`{...register()}`** — form state attaches via spread
- **`render={<Link />}`** — component behavior attaches via prop-merging
- **`<Controller render={({field}) => ...}>`** — form state attaches via function callback

All three are inversion of control over rendering — the library defines the behavior, the consumer chooses the element.

---

## In this project specifically

### `src/components/app-sidebar.tsx`

```tsx
<SidebarMenuButton
  isActive={pathname === item.href}       // → data-active attribute
  tooltip={item.label}                     // → wraps in TooltipTrigger when collapsed
  className={menuButtonClasses}            // → merged with cva output
  render={                                 // → clones this as final element
    <Link href={item.href}>
      <item.icon />
      <span>{item.label}</span>
    </Link>
  }
/>
```

Four props. No `variant`/`size` passed → defaults kick in. Final DOM is an `<a>` with button styling and active-state CSS reacting to `data-active`.

### Key files

- `src/components/ui/sidebar.tsx` — `SidebarMenuButton` source, `sidebarMenuButtonVariants` cva definition, `useRender` usage at line 513
- `src/components/ui/button.tsx` — customized to `rounded-none` base (sharp corners for this project)
- `src/components/app-sidebar.tsx` — actual nav component using `render={<Link />}` pattern
