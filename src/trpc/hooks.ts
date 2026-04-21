import { createTRPCReact } from "@trpc/react-query";
import type { inferReactQueryProcedureOptions } from "@trpc/react-query";

import type { AppRouter } from "@/trpc/router";

// server fn component
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

// Typed options for any procedure — enables typed custom mutation hooks:
//   type MyOpts = ReactQueryOptions["schedule"]["save"];
export type ReactQueryOptions = inferReactQueryProcedureOptions<AppRouter>;
