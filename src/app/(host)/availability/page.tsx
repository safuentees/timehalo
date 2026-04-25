import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import AvailabilityForm from "./components/availability-form";

export default async function AvailabilityPage() {
  const trpc = await createPrivateSSRHelper();
  await trpc.schedule.get.prefetch();

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <AvailabilityForm />
    </HydrationBoundary>
  );
}
