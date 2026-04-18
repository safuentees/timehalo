"use client";

import { Fragment, useEffect, useState } from "react";
import { trpc } from "@/trpc/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useForm, SubmitHandler } from "react-hook-form";
import { useTheme } from "next-themes";
import { Sun, Moon, Trash2 } from "lucide-react";

function formatDate(dateStr: string) {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function NewPostForm({
  onSuccess,
  onCancel,
}: {
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
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
      onSuccess?.();
    },
  });
  
  const delPost = trpc.posts.delete.useMutation()

  return (
    <form
      onSubmit={handleSubmit(async (data) => {
        const date = new Date().toISOString().split("T")[0];
        await pushPost.mutateAsync({ ...data, date });
      })}
      className="grid gap-5"
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
          className="text-sm min-h-20"
          {...register("excerpt")}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
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

      <div className="flex items-center justify-between pt-5 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          className="font-mono text-xs tracking-wide text-muted-foreground"
          type="button"
          onClick={onCancel}
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
  );
}

function NewPostModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 640px)");

  if (isDesktop) {
    return (
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl font-normal italic tracking-tight">
              New post
            </DialogTitle>
            <DialogDescription className="font-mono text-xs tracking-wide">
              Draft a new entry for the blog.
            </DialogDescription>
          </DialogHeader>

          <NewPostForm onSuccess={onClose} onCancel={onClose} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DrawerContent>
        <DrawerHeader className="text-left px-6 pt-6 pb-0">
          <DrawerTitle className="font-heading text-2xl font-normal italic tracking-tight">
            New post
          </DrawerTitle>
          <DrawerDescription className="font-mono text-xs tracking-wide">
            Draft a new entry for the blog.
          </DrawerDescription>
        </DrawerHeader>

        <div className="overflow-y-auto px-6 py-5">
          <NewPostForm onSuccess={onClose} onCancel={onClose} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export default function Dashboard() {
  const { data: posts } = trpc.posts.list.useQuery();
  const [showNewPost, setShowNewPost] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl">
        <header className="px-8 pt-24 sm:pt-32 pb-10 sm:pb-16 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <div>
            <h1 className="font-heading text-[clamp(2.5rem,1rem+5vw,4rem)] font-normal italic tracking-tight text-foreground leading-none -ml-1">
              Writing
            </h1>
            <p className="mt-5 text-muted-foreground text-sm leading-relaxed max-w-xs text-pretty">
              Notes on building software, frontend craft, and the occasional
              opinion nobody asked for.
            </p>
          </div>
          <div className="flex items-center gap-3 sm:self-start mt-1">
            {mounted && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground transition-colors duration-200 hover:text-foreground"
                onClick={() =>
                  setTheme(resolvedTheme === "dark" ? "light" : "dark")
                }
                aria-label="Toggle theme"
              >
                {resolvedTheme === "dark" ? (
                  <Sun className="size-3.5" />
                ) : (
                  <Moon className="size-3.5" />
                )}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs tracking-wide shrink-0 border-foreground/20 transition-colors duration-200 hover:bg-foreground/[0.06] hover:border-foreground/40"
              onClick={() => setShowNewPost(true)}
            >
              New post
            </Button>
          </div>
        </header>

        <div className="h-px bg-linear-to-r from-transparent via-border to-transparent" />

        {!posts
          ? Array.from({ length: 5 }).map((_, i) => (
              <Fragment key={i}>
                <div className="px-8 pt-6 pb-10 animate-pulse">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-3 w-24 rounded bg-muted" />
                    <div className="h-3 w-12 rounded bg-muted" />
                    <div className="ml-auto h-4 w-16 rounded-none bg-muted" />
                  </div>
                  <div className="h-5 w-3/4 rounded bg-muted" />
                  <div className="mt-3 space-y-1.5">
                    <div className="h-3 w-full rounded bg-muted" />
                    <div className="h-3 w-2/3 rounded bg-muted" />
                  </div>
                </div>
              </Fragment>
            ))
          : posts.map((post, i) => (
              <Fragment key={post.id}>
                <article className="group relative transition-colors duration-200 hover:bg-foreground/[0.03]">
                  <a href="#" className="block px-8 pt-6 pb-10">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="font-mono text-xs text-muted-foreground tracking-wide">
                        {formatDate(post.date)}
                      </span>
                      <div
                        className="h-1 w-1 rounded-full bg-muted-foreground/40"
                        aria-hidden="true"
                      />
                      <span className="font-mono text-xs text-muted-foreground tracking-wide">
                        {post.readTime}
                      </span>
                      <Badge
                        variant="outline"
                        className="ml-auto text-xs uppercase tracking-widest font-mono scale-[0.8] origin-right rounded-none transition-colors duration-200 group-hover:border-muted-foreground/50"
                      >
                        {post.tag}
                      </Badge>
                    </div>
                    <h2 className="text-xl font-bold text-foreground tracking-tight transition-colors duration-200 group-hover:underline group-hover:decoration-muted-foreground/40 group-hover:underline-offset-4">
                      {post.title}
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                      {post.excerpt}
                    </p>
                  </a>
                  <button
                    type="button"
                    aria-label={`Delete ${post.title}`}
                    className="absolute right-6 top-1/2 -translate-y-1/2 inline-flex size-7 items-center justify-center rounded-none text-muted-foreground transition-all duration-200 opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:text-destructive hover:bg-destructive/[0.08] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive/40"
                  >
                    <Trash2 className="size-3.5 stroke-[1.5]" />
                  </button>
                </article>
              </Fragment>
            ))}

        <div className="mx-8 h-px bg-linear-to-r from-transparent via-border to-transparent" />

        <nav
          className="px-8 py-5 flex items-center justify-between"
          aria-label="Pagination"
        >
          <Button
            variant="ghost"
            size="sm"
            disabled
            className="font-mono text-xs tracking-wide text-muted-foreground transition-colors duration-200"
          >
            Newer
          </Button>
          <span className="font-mono text-xs text-muted-foreground">1 / 3</span>
          <Button
            variant="ghost"
            size="sm"
            className="font-mono text-xs tracking-wide text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            Older
          </Button>
        </nav>
      </main>

      <NewPostModal open={showNewPost} onClose={() => setShowNewPost(false)} />
    </div>
  );
}
