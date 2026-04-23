# Dashboard Form Debugging

- If a new Prisma delegate or model field seems missing at runtime, restart `pnpm dev` after `pnpm prisma generate`.
- If a child section does not see form updates, confirm it uses `useFormContext()` and not its own `useForm()`.
- If `Controller` path types look too wide, add a local `FormShape` type and generic-parameterize `Controller<FormShape>` or `useFieldArray<FormShape>`.
- If dynamic rows lose input state on removal, key by `field.id`, not the array index.
- If background refetches wipe in-progress edits, verify the form uses `values` plus `keepDirtyValues`.
- If a toast does not appear for a write, inspect the custom mutation hook before changing the component.
