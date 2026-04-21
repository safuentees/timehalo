import { createTRPCReact } from "@trpc/react-query";
import type { inferReactQueryProcedureOptions } from "@trpc/react-query";

import type { AppRouter } from "@/trpc/router";

export const trpc = createTRPCReact<AppRouter>({
  overrides: {
    useMutation: {
      async onSuccess(opts) {
        await opts.originalFn();
        await opts.queryClient.invalidateQueries();
      },
    },
  },
});

export type ReactQueryOptions = inferReactQueryProcedureOptions<AppRouter>;
