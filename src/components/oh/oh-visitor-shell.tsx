import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function OhVisitorShell({ children, header, footer, className }: Props) {
  return (
    <div className="oh-visitor-shell flex h-dvh flex-col overflow-hidden bg-oh-bg-muted p-[15px] [--oh-ink:#0a0a0a] [--oh-paper:#eee7d5] dark:[--oh-ink:#ede4cf] dark:[--oh-paper:#1a1a1a]">
      <div
        className={[
          "oh-visitor-panel relative min-h-0 flex-1 overflow-hidden rounded-[25px] bg-oh-bg text-oh-content",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {header ? (
          <div className="absolute inset-x-0 top-0 z-10">
            <OhVisitorHeader>{header}</OhVisitorHeader>
          </div>
        ) : null}
        <main className="absolute inset-0 flex items-center justify-center overflow-hidden">
          {children}
        </main>
        {footer ? (
          <div className="absolute inset-x-0 bottom-0 z-10">
            <OhVisitorFooter>{footer}</OhVisitorFooter>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function OhVisitorHeader({ children }: { children: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-oh-bg/85 px-5 py-4 backdrop-blur sm:px-8 sm:py-5 lg:px-12">
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
