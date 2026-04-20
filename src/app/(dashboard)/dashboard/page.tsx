import HandleForm from "./components/nav";

export default function Page() {
  return (
    <main className="bru-main">
      <section className="max-w-[560px] px-6 py-10 sm:px-10">
        <header className="mb-6">
          <div className="font-[family:var(--bru-mono)] text-[11px] font-extrabold uppercase tracking-[2.5px] opacity-60">
            WORKSPACE / HANDLE
          </div>
          <h1 className="mt-3 text-[clamp(40px,8cqi,72px)] font-black uppercase leading-[0.9] tracking-[-0.02em]">
            Pick your handle
          </h1>
          <p className="mt-4 max-w-[440px] text-[14.5px] leading-[1.5] opacity-78">
            It becomes your public URL. Lowercase letters, numbers and
            hyphens, 3 characters minimum.
          </p>
        </header>

        <HandleForm />
      </section>
    </main>
  );
}
