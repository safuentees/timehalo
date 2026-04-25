import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import ProfileForm from "./components/profile-form";

export default async function ProfilePage() {
  const trpc = await createPrivateSSRHelper();
  await trpc.users.me.prefetch();

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <ProfileForm />
    </HydrationBoundary>
  );
}
