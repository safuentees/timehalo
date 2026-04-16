"use client";
import { trpc } from "@/trpc/hooks";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";

function formatDate(dateStr: string) {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function Home() {
  const { data: posts } = trpc.posts.list.useQuery();

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl px-6 pb-20 pt-24 sm:pt-32">
        <header className="mb-16 flex items-start justify-between gap-8">
          <div>
            <h1 className="font-heading text-[clamp(2.5rem,1rem+5vw,4rem)] font-normal italic tracking-tight text-foreground leading-none -ml-1">
              Writing
            </h1>
            <p className="mt-5 text-muted-foreground text-sm leading-relaxed max-w-xs text-pretty">
              Notes on building software, frontend craft, and the occasional
              opinion nobody asked for.
            </p>
          </div>
          <Link
            href="/new"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "mt-1 font-mono text-xs tracking-wide shrink-0 rounded-none border-foreground/20 transition-colors duration-200 hover:bg-foreground hover:text-background hover:border-foreground",
            )}
          >
            New post
          </Link>
        </header>

        <div className="flex flex-col">
          {!posts
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i}>
                  {i > 0 && (
                    <div className="mb-8 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                  )}
                  <div className="mb-8 animate-pulse">
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
                </div>
              ))
            : posts.map((post, i) => (
                <article key={post.title}>
                  {i > 0 && (
                    <div className="mb-8 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                  )}
                  <a href="#" className="group block mb-8">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="font-mono text-xs text-muted-foreground tracking-wide">
                        {formatDate(post.date)}
                      </span>
                      <span
                        className="text-muted-foreground/40"
                        aria-hidden="true"
                      >
                        ·
                      </span>
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
                </article>
              ))}
        </div>

        <div className="mb-8 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        <div className="flex items-center justify-between">
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
        </div>
      </main>
    </div>
  );
}
