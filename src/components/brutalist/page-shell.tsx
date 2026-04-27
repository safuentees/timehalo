import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  tight?: boolean;
};

export function BrutalistPageShell({ children, tight = false }: Props) {
  return (
    <div
      className={[
        "mx-auto w-full px-4 py-8 sm:px-6 sm:py-10",
        tight ? "max-w-2xl" : "max-w-[760px]",
      ].join(" ")}
    >
      {children}
    </div>
  );
}
