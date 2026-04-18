"use client";

import { BrutalistTopbar } from "./topbar";
import { BrutalistTicker } from "./ticker";
import { BrutalistHero } from "./hero";
import { BrutalistPostRow } from "./post-row";
import { BrutalistEndRule } from "./end-rule";
import type { HalftoneTweaks } from "@/lib/halftone-defaults";

type Post = {
  id: number;
  date: string;
  title: string;
  excerpt: string;
  tag: string;
  readTime: string;
};

type Props = {
  posts: Post[] | undefined;
  onNewPost: () => void;
  onDelete: (id: number) => void;
  tweaks: HalftoneTweaks;
  motion: boolean;
  theme: string | undefined;
  onThemeToggle: () => void;
};

export function BrutalistMain({
  posts,
  onNewPost,
  onDelete,
  tweaks,
  motion,
  theme,
  onThemeToggle,
}: Props) {
  const list = posts ?? [];

  return (
    <main className="bru-main" id="top">
      <BrutalistTopbar
        onNewPost={onNewPost}
        theme={theme}
        onThemeToggle={onThemeToggle}
      />
      <BrutalistTicker />
      <BrutalistHero tweaks={tweaks} motion={motion} />

      <div className="bru-posts">
        {posts === undefined ? (
          <PostSkeleton count={5} />
        ) : list.length === 0 ? (
          <EmptyState />
        ) : (
          list.map((post, i) => (
            <BrutalistPostRow
              key={post.id}
              post={post}
              index={i}
              onDelete={onDelete}
            />
          ))
        )}
      </div>

      <BrutalistEndRule count={list.length} total={list.length} />
    </main>
  );
}

function PostSkeleton({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <article
          key={i}
          className={`bru-post ${i % 2 === 1 ? "bru-inverted" : ""}`}
          aria-hidden
        >
          <div className="bru-post-num">
            <div className="bru-num-big" style={{ opacity: 0.15 }}>
              {String(i + 1).padStart(2, "0")}
            </div>
            <div className="bru-post-date" style={{ opacity: 0.25 }}>
              · · ·
            </div>
          </div>
          <div className="bru-post-body">
            <div
              style={{
                height: 28,
                width: "70%",
                background: "currentColor",
                opacity: 0.08,
                marginBottom: 16,
              }}
            />
            <div
              style={{
                height: 14,
                width: "90%",
                background: "currentColor",
                opacity: 0.08,
                marginBottom: 6,
              }}
            />
            <div
              style={{
                height: 14,
                width: "65%",
                background: "currentColor",
                opacity: 0.08,
              }}
            />
          </div>
          <div className="bru-post-aside" />
        </article>
      ))}
    </>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: "80px 44px",
        textAlign: "center",
        fontFamily: "var(--font-jetbrains), monospace",
        fontSize: 12,
        letterSpacing: 2,
        opacity: 0.6,
      }}
    >
      NO POSTS YET · HIT + NEW POST
    </div>
  );
}
