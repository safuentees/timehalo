# Mutation Hook Template

```ts
import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["router"]["procedure"];

export function useFeatureMutation(options?: Options) {
  return trpc.router.procedure.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Success message.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
```

## Checklist

- Import `toast` from `sonner`.
- Import `ReactQueryOptions` from `@/trpc/hooks`.
- Spread caller `options` first.
- Override `onSuccess` and `onError` after the spread.
- Re-invoke caller handlers manually.
- Keep invalidation out of the hook.
