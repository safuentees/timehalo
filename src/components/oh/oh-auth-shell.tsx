import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
};

export function OhAuthShell({ children, header, footer }: Props) {
  return (
    <div className="flex min-h-dvh flex-col bg-[color:var(--oh-frame)] text-[color:var(--oh-ink)]">
      {header ? <OhAuthHeader>{header}</OhAuthHeader> : null}
      <main className="flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-6 sm:py-14">
        <div className="w-full max-w-[420px]">{children}</div>
      </main>
      {footer ? <OhAuthFooter>{footer}</OhAuthFooter> : null}
    </div>
  );
}

function OhAuthHeader({ children }: { children: ReactNode }) {
  return (
    <header className="flex items-center justify-center px-5 pt-6 sm:px-6 sm:pt-8">
      {children}
    </header>
  );
}

function OhAuthFooter({ children }: { children: ReactNode }) {
  return (
    <footer className="oh-eyebrow flex items-center justify-center gap-3 px-5 pb-6 opacity-55 sm:px-6 sm:pb-8">
      {children}
    </footer>
  );
}
