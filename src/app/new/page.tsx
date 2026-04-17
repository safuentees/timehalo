"use client";

import { trpc } from "@/trpc/hooks";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

export default function NewPostPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
    reset,
  } = useForm({
    defaultValues: { title: "", excerpt: "", tag: "", readTime: "" },
  });

  const pushPost = trpc.posts.push.useMutation({
    onSuccess: () => {
      reset();
      router.push("/");
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl px-8 pb-20 pt-16 sm:pt-32">
        <header className="mb-10 sm:mb-16">
          <h1 className="font-heading text-[clamp(2.5rem,1rem+5vw,4rem)] font-normal italic tracking-tight text-foreground leading-none -ml-1">
            New post
          </h1>
          <p className="mt-5 font-mono text-xs tracking-wide text-muted-foreground max-w-xs text-pretty">
            Draft a new entry for the blog.
          </p>
        </header>

        <div className="h-px bg-linear-to-r from-transparent via-border to-transparent" />

        <form
          onSubmit={handleSubmit(async (data) => {
            const date = new Date().toISOString().split("T")[0];
            await pushPost.mutateAsync({ ...data, date });
          })}
          className="grid gap-5 pt-10"
        >
          <div className="grid gap-2">
            <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Title
            </Label>
            <Input
              placeholder="Something worth reading"
              className="text-sm"
              {...register("title")}
            />
          </div>

          <div className="grid gap-2">
            <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Excerpt
            </Label>
            <Textarea
              placeholder="A short summary of the post"
              className="text-sm min-h-32"
              {...register("excerpt")}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Tag
              </Label>
              <Input
                placeholder="TypeScript"
                className="text-sm"
                {...register("tag")}
              />
            </div>
            <div className="grid gap-2">
              <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Read time
              </Label>
              <Input
                placeholder="5 min"
                className="text-sm"
                {...register("readTime")}
              />
            </div>
          </div>

          <div className="mx-8 h-px bg-linear-to-r from-transparent via-border to-transparent mt-3" />

          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="font-mono text-xs tracking-wide text-muted-foreground"
              type="button"
              onClick={() => router.push("/")}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="font-mono text-xs tracking-wide"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Publishing..." : "Publish"}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
