import HandleForm from "./components/nav";

export default function Page() {
  return (
    <main className="bru-main">
      <section className="mx-auto w-full max-w-[520px] px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="mb-5 font-[family:var(--bru-mono)] text-[13px] font-extrabold uppercase tracking-[2.5px]">
          Handle
        </h1>
        <HandleForm />
      </section>
    </main>
  );
}
