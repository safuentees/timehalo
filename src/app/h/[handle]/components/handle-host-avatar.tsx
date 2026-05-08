import type { CSSProperties } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export const HANDLE_AVATAR_PROJECTION_STYLE: CSSProperties = {
  borderRadius: 9999,
  boxShadow: "0 4px 4px rgba(0,0,0,0.25)",
};

type HandleHostAvatarBodyProps = {
  src: string | null | undefined;
  alt: string;
  initials: string;
  size?: number | string;
};

export function HandleHostAvatarBody({
  src,
  alt,
  initials,
  size = 55,
}: HandleHostAvatarBodyProps) {
  return (
    <>
      <Avatar style={{ width: size, height: size }}>
        <AvatarImage src={src ?? undefined} alt={alt} />
        <AvatarFallback className="bg-[color:var(--oh-tint)] font-[family-name:var(--oh-mono)] text-[11px] font-extrabold uppercase tracking-[1px]">
          {initials}
        </AvatarFallback>
      </Avatar>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-[#E5E5E5]"
      />
    </>
  );
}

type HandleHostAvatarProps = HandleHostAvatarBodyProps & { className?: string };

export function HandleHostAvatar({
  src,
  alt,
  initials,
  size = 55,
  className,
}: HandleHostAvatarProps) {
  return (
    <span
      style={HANDLE_AVATAR_PROJECTION_STYLE}
      className={cn("relative inline-flex shrink-0", className)}
    >
      <HandleHostAvatarBody src={src} alt={alt} initials={initials} size={size} />
    </span>
  );
}
