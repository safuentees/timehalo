# Mutation Error Mapping

- `P2002` from Prisma should become `TRPCError({ code: "CONFLICT" })` in the router.
- Use inline form errors for specific recoverable cases like duplicate handles.
- Use generic toast errors for broad failures the user cannot resolve inline.
- Wrap `$transaction` writes in `try/catch` and rethrow a friendly `INTERNAL_SERVER_ERROR` with `cause`.
- If the component starts branching on many mutation error codes, push more of that behavior back into the hook or router layer.
