import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  tight?: boolean;
  wide?: boolean;
};

export function BrutalistPageShell({
  children,
  tight = false,
  wide = false,
}: Props) {
  const widthClass = tight
    ? "max-w-2xl"
    : wide
      ? "max-w-[760px] md:max-w-3xl lg:max-w-4xl xl:max-w-5xl"
      : "max-w-[760px]";
  return (
    <div
      className={["mx-auto w-full px-4 py-8 sm:px-6 sm:py-10", widthClass].join(
        " ",
      )}
    >
      {children}
    </div>
  );
}
