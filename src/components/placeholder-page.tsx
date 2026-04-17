export function PlaceholderPage({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl">
        <header className="px-8 pt-24 sm:pt-32 pb-10 sm:pb-16">
          <h1 className="font-heading text-[clamp(2.5rem,1rem+5vw,4rem)] font-normal italic tracking-tight text-foreground leading-none -ml-1">
            {title}
          </h1>
          <p className="mt-5 text-muted-foreground text-sm leading-relaxed max-w-xs text-pretty">
            {subtitle}
          </p>
        </header>

        <div className="h-px bg-linear-to-r from-transparent via-border to-transparent" />

        <div className="px-8 pt-12 pb-20">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Coming soon
          </p>
        </div>
      </main>
    </div>
  );
}
