import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import SettingsForm from "./components/settings-form";

export default async function SettingsPage() {
  const trpc = await createPrivateSSRHelper();
  await trpc.users.me.prefetch();

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <SettingsForm />
    </HydrationBoundary>
  );
}
