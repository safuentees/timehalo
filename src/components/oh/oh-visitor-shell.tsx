import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function OhVisitorShell({ children, header, footer, className }: Props) {
  return (
    <div
      className={[
        "flex min-h-dvh flex-col bg-oh-bg text-oh-content",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {header ? <OhVisitorHeader>{header}</OhVisitorHeader> : null}
      <main className="flex-1">{children}</main>
      {footer ? <OhVisitorFooter>{footer}</OhVisitorFooter> : null}
    </div>
  );
}

function OhVisitorHeader({ children }: { children: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b-[1.5px] border-oh-line bg-oh-bg/85 px-5 py-4 backdrop-blur sm:px-8 sm:py-5 lg:px-12">
      {children}
    </header>
  );
}

function OhVisitorFooter({ children }: { children: ReactNode }) {
  return (
    <footer className="oh-eyebrow hidden items-center justify-between border-t-[1.5px] border-oh-line px-8 py-5 sm:flex lg:px-12">
      {children}
    </footer>
  );
}
