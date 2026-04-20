import HandleForm from "./components/nav";

export default function Page() {
  return (
    <main className="bru-main">
      <section className="mx-auto w-full max-w-[520px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-6 border-b border-[var(--bru-line-firm)] pb-5">
          <h1 className="font-[family:var(--bru-mono)] text-[13px] font-extrabold uppercase tracking-[2.5px]">
            Handle
          </h1>
          <p className="mt-2 text-[13px] leading-[1.5] opacity-65">
            Your public URL slug. You can change it later.
          </p>
        </header>

        <HandleForm />
      </section>
    </main>
  );
}
