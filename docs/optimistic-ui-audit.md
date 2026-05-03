# Optimistic UI audit

User reported (QA-2 in `docs/qa-pass-2026-05-03.md`) that the
B.PT84 workspace-switcher optimism (trigger label flips to the
picked workspace name BEFORE the cookie write resolves) felt
distinctively responsive and asked: where else in the project
would the same pattern benefit?

This doc walks every mutation hook in `src/lib/mutations/`,
classifies it by optimism candidacy, and ranks the high-ROI
candidates for incremental rollout. Two reference implementations
ship in B.PT96 (workflow toggle + workflow delete) to validate
the pattern before scaling to the rest.

## Optimism patterns at our disposal

Three distinct shapes we can apply, picked by what the user is
about to see change:

| Shape | When to use | Reference today |
|---|---|---|
| **`useTransition` + optimistic local state** | Single-component flip the user clicks (workspace switcher trigger label, theme toggle). State lives in the component; rollback is "throw away the optimistic value." | B.PT84 workspace switcher (`src/components/oh/oh-dashboard-bar.tsx:75-110`). |
| **React Query `onMutate` + `setQueryData`** | Mutation that changes a list-shaped cache. Snapshot cache → patch → rollback on error → invalidate on settle. Tanstack's canonical [optimistic update pattern](https://tanstack.com/query/v5/docs/framework/react/guides/optimistic-updates). | NEW in B.PT96 (`use-update-workflow.ts` + `use-delete-workflow.ts`). |
| **React 19 `useOptimistic`** | Local-state optimism inside a Server Action / RSC boundary OR when the mutation is sync-async hybrid. Returns `[optimisticValue, addOptimistic]` with automatic rollback when the underlying state resolves. | None today; consider for future Server-Action surfaces. |
| **Toast undo on destructive ops** | Cancel / Delete actions where the user might regret. Linear/Sentry pattern: row disappears immediately, "Deleted X — Undo" toast for ~5s, undo restores. | None today; recommended for high-frequency destructives (cancel-booking, revoke-api-key). |

Pick by the data shape:
- **Local component state** → useTransition (B.PT84) or useState + setOptimistic
- **Cached server data (React Query)** → onMutate + setQueryData
- **Server action result that's also rendered** → useOptimistic
- **Destructive but recoverable** → toast undo on top of any of the above

## Per-hook audit

35 mutation hooks live in `src/lib/mutations/`. Categorized:

### NAVIGATION — no optimism (user is leaving the page)

| Hook | Why no |
|---|---|
| `use-accept-invitation` | Redirects to workspace on success |
| `use-billing-checkout` | Redirects to Stripe Checkout |
| `use-billing-portal` | Redirects to Stripe Customer Portal |
| `use-booking-create` | Visitor redirects to /booked/<uid> confirmation |
| `use-calendar-auth-url` | Redirects to OAuth provider |
| `use-create-workspace` | Redirects to new workspace |
| `use-delete-account` | Forces sign-out |
| `use-leave-workspace` | Redirects to /workspaces |
| `use-register` | Auto-signs-in + redirects to /bookings |
| `use-reschedule-booking` | Redirects to new /booked/<uid> |
| `use-transfer-ownership` | Refreshes — owner badge change visible after refetch |

### FORM SAVE — limited value (already shows pending state via isPending)

| Hook | Why low value |
|---|---|
| `use-schedule-save` | Submit button `pending` → `saved` flip is the canonical feedback; setting an optimistic "rows saved" is duplicative |
| `use-set-handle` | Single field; CONFLICT inline error is the only failure path that matters |
| `use-set-timezone` | Same as set-handle |
| `use-update-workspace` | Form save; same shape |
| `use-create-api-key` | Server response carries the secret — must wait |
| `use-create-webhook` | Same — secret reveal |

### CREATE / INSERT — medium ROI (server id required for permanent rendering)

| Hook | Pattern | Priority |
|---|---|---|
| `use-create-workflow` | Optimistic temp row with `id: "optimistic-<uuid>"`, replaced by real id on success | MEDIUM |
| `use-invite-many` | Pending invites show immediately, replaced on success | MEDIUM |
| `use-invite-member` | Same | MEDIUM |

The optimism here is "the row appears in the list immediately." Trade-off: handling the temp-id swap is fiddly + the user typically navigates after creating (workflow editor opens, etc.) so the win is small.

### TOGGLE — HIGH ROI (instant visual feedback, cheap rollback)

| Hook | Pattern | Priority | Reference impl ship date |
|---|---|---|---|
| `use-update-workflow` | Toggle workflow.active; setQueryData patches the row's `active` field | **HIGH** | **B.PT96 (this commit)** |
| `use-update-invitation-role` | Role select changes pending invite's role | HIGH | TODO |
| `use-set-member-role` | Role select changes member's role | HIGH | TODO |
| `use-calendar-set-selected` | Per-calendar toggle in the picker dialog | HIGH (10+ checkboxes per render — biggest win) | TODO |

### DELETE / REVOKE — HIGH ROI (row disappears immediately, undo toast)

| Hook | Pattern | Priority | Ship date |
|---|---|---|---|
| `use-delete-workflow` | Optimistic remove from `workflows.list`; undo toast | **HIGH** | **B.PT96 (this commit)** |
| `use-cancel-booking` | Booking row disappears from upcoming, undo toast (within grace window) | HIGH | TODO |
| `use-delete-webhook` | Row disappears | HIGH | TODO |
| `use-delete-workspace` | Workspace card disappears (typed-confirm gates) | MEDIUM (with confirm step, optimism less impactful) | TODO |
| `use-revoke-api-key` | Status flips to Revoked | HIGH | TODO |
| `use-revoke-invitation` | Pending invite row disappears | HIGH | TODO |
| `use-remove-member` | Member row disappears | HIGH | TODO |
| `use-resend-invitation` | No list change — just a toast confirming resend; not an optimism candidate | LOW | n/a |
| `use-calendar-disconnect` | Card flips to disconnected state | MEDIUM | TODO |

### SPECIAL — `use-event-type-mutations`

Bundled file with multiple sub-mutations (host pool, weight, etc.). Internal toggles + reorders. Extract into its own audit pass when the surface lands a real consumer (today only `/workspaces/<slug>/event-types` admin page touches it).

## Recommended rollout (post-B.PT96)

1. **Wave 1** (B.PT96, this commit): `use-update-workflow` + `use-delete-workflow` — proves the pattern, gives every future commit a reference. Workflow chrome is high-frequency in dev (settings → workflows → toggle).
2. **Wave 2** (B.PT97): `use-calendar-set-selected` — biggest win-per-line because the picker dialog renders 10+ checkboxes; current behavior shows a loading state per click.
3. **Wave 3** (B.PT98): destructive list operations (`use-cancel-booking`, `use-revoke-api-key`, `use-revoke-invitation`, `use-remove-member`) with the **toast-undo pattern** — Linear's shape: row disappears immediately, sonner shows "Cancelled — Undo" for 5s, click restores. Implementation note: requires keeping the deleted row's snapshot in the toast's onClick scope so undo can re-insert it before the server's irreversible delete fires; a server-side soft-delete + `cancel.undo` mutation makes this clean (the project already soft-deletes bookings — `Booking.deleted` flag — so cancel-booking is the natural first one).
4. **Wave 4**: role flips (`use-update-invitation-role`, `use-set-member-role`) — small surface, niche use, low priority.

## Sibling behaviors related to optimism

Beyond per-mutation optimism, these are app-wide patterns the user would feel:

### Skeleton loading
We have one (`/invitations/[token]/loading.tsx` from B.PT81). Consider adding for: `/workspaces/[slug]/members` (member list takes ~200ms cold), `/settings/billing` (billing.currentPlan takes ~150ms server-side). Skeleton mirrors final layout to prevent layout shift.

### Optimistic navigation (next/link prefetch)
Already free via Next 16's automatic prefetch. Verify it's not disabled anywhere.

### React 19 `useOptimistic` for Server Actions
`/settings → Language` switcher uses a Server Action today (`oh_locale` cookie write). Could wrap with `useOptimistic` so the language flips before the cookie write returns. Minor win.

### Stale-while-revalidate on `users.me` + `workspaces.list`
Already on by default via tRPC's React Query integration. Verify staleTime config is reasonable (current default ~30s).

### Background prefetch of likely-next routes
Hover on a `/workspaces/<slug>` link → prefetch the workspace's data. Next 16's `<Link prefetch="hover">` handles. Audit which links use it.

## Anti-patterns to avoid

- **Optimistic mutations on irreversible operations** — never optimistic-render a payment confirmation. The user's mental model breaks if they see "Booked!" then it disappears.
- **Optimistic create with auto-generated server ids** — needs careful temp-id swap on success or you get duplicate rows during the brief overlap window.
- **Optimism without rollback** — every `onMutate` MUST pair with `onError` rollback. Skipping this leaves the cache in a lying state when the server rejects.
- **Optimism on slow rollbacks** — if the rollback itself takes 500ms+ (re-fetching big list), the user sees a confusing "appeared then jumped." Cheap rollback is the unwritten contract.
- **Stacking optimisms** — N concurrent optimistic mutations on the same cache key fight each other. Cancel in-flight queries in `onMutate` (canonical Tanstack guard) to serialize.

## Tanstack canonical optimistic-mutation shape

For new hooks, use this shape verbatim:

```ts
trpc.<router>.<procedure>.useMutation({
  onMutate: async (variables) => {
    // 1. Cancel in-flight refetches so they don't overwrite our patch
    await utils.<sibling-list>.cancel();
    // 2. Snapshot for rollback
    const previous = utils.<sibling-list>.getData();
    // 3. Patch the cache optimistically
    utils.<sibling-list>.setData(undefined, (old) => {
      if (!old) return old;
      return /* patched shape */;
    });
    // 4. Return snapshot as rollback context
    return { previous };
  },
  onError: (err, variables, context) => {
    // Roll back to snapshot
    if (context?.previous) {
      utils.<sibling-list>.setData(undefined, context.previous);
    }
    toast.error(err.message);
  },
  onSettled: () => {
    // Server is source of truth — invalidate to reconcile
    utils.<sibling-list>.invalidate();
  },
});
```

`utils` from `trpc.useUtils()`. The `cancel` + snapshot + patch + rollback + invalidate sequence is non-negotiable — skipping any step leaves a known race.

## What the user will feel

After Wave 1 (B.PT96):
- Toggle workflow active → switch flips instantly, no visible round-trip
- Delete workflow → row disappears instantly

After Wave 2:
- Pick calendars dialog → checkboxes flip instantly per click

After Wave 3:
- Cancel booking → row gone instantly + 5s undo toast
- Revoke API key → status flips to Revoked instantly
- Revoke invitation → row gone instantly + undo toast
- Remove member → row gone instantly + undo toast

After Wave 4:
- Member role select → dropdown value flips instantly
- Invitation role select → same

Cumulative: ~80% of dashboard mutations feel instant. The remaining 20% (form saves, navigation-triggers) keep their existing pending-state UX which is correct for their shape.
