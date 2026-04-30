import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function OhSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <p className="oh-eyebrow">{title}</p>
      <div>{children}</div>
    </section>
  );
}
