"use client";

import { fmtDate } from "@/lib/brutalist";

type Post = {
  id: number;
  date: string;
  title: string;
  excerpt: string;
  tag: string;
  readTime: string;
};

type Props = {
  post: Post;
  index: number;
  onDelete: (id: number) => void;
};

export function BrutalistPostRow({ post, index, onDelete }: Props) {
  const inverted = index % 2 === 1;
  const numeral = String(index + 1).padStart(2, "0");
  const minutes = post.readTime.split(" ")[0] || post.readTime;

  return (
    <article
      className={`bru-post ${inverted ? "bru-inverted" : ""} bru-reveal`}
      style={{ ["--d" as string]: `${300 + index * 60}ms` }}
    >
      <div className="bru-post-num">
        <div className="bru-num-big">{numeral}</div>
        <div className="bru-post-date">{fmtDate(post.date).toUpperCase()}</div>
      </div>
      <div className="bru-post-body">
        <h2 className="bru-post-title">
          <span className="bru-post-title-inner">{post.title}</span>
        </h2>
        <p className="bru-post-excerpt">{post.excerpt}</p>
      </div>
      <div className="bru-post-aside">
        <div className="bru-tag">{post.tag.toUpperCase()}</div>
        <div className="bru-read">
          <div className="bru-read-label">READ</div>
          <div className="bru-read-big">
            {minutes}
            <em>MIN</em>
          </div>
        </div>
        <div className="bru-open">OPEN →</div>
      </div>
      <button
        type="button"
        className="bru-post-delete"
        aria-label={`Delete ${post.title}`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onDelete(post.id);
        }}
      >
        ×
      </button>
    </article>
  );
}
