import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export function BrutalistPageShell({ children }: Props) {
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-8 sm:px-6 sm:py-10">
      {children}
    </div>
  );
}
