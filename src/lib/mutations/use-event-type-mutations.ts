"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// B4 — event-type management mutation hooks. Six writers:
// create / update / delete event type + addHost / updateHost /
// removeHost. Each follows the established useSetTimezone pattern:
// toast in the hook, caller spreads options, global invalidation in
// src/trpc/hooks.ts handles list refresh. CONFLICT (slug taken,
// duplicate host) suppresses the generic error toast so the dialog
// can surface inline copy.

export function useCreateEventType(
  options?: ReactQueryOptions["eventTypes"]["create"],
) {
  return trpc.eventTypes.create.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Event type created.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      if (error.data?.code !== "CONFLICT") toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}

export function useUpdateEventType(
  options?: ReactQueryOptions["eventTypes"]["update"],
) {
  return trpc.eventTypes.update.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Saved.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      if (error.data?.code !== "CONFLICT") toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}

export function useDeleteEventType(
  options?: ReactQueryOptions["eventTypes"]["delete"],
) {
  return trpc.eventTypes.delete.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Event type deleted.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}

export function useAddEventTypeHost(
  options?: ReactQueryOptions["eventTypes"]["addHost"],
) {
  return trpc.eventTypes.addHost.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Host added to pool.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      if (error.data?.code !== "CONFLICT") toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}

export function useUpdateEventTypeHost(
  options?: ReactQueryOptions["eventTypes"]["updateHost"],
) {
  return trpc.eventTypes.updateHost.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Saved.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}

export function useRemoveEventTypeHost(
  options?: ReactQueryOptions["eventTypes"]["removeHost"],
) {
  return trpc.eventTypes.removeHost.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Host removed.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
