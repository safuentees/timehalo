import { cn } from "@/lib/utils";

export function GithubMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block bg-current", className ?? "size-4")}
      style={{
        maskImage: "url(/icons/github.svg)",
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskImage: "url(/icons/github.svg)",
        WebkitMaskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
      }}
    />
  );
}
