import SettingsForm from "./components/settings-form";

export default function Page() {
  return (
    <main className="bru-main">
      <section className="mx-auto w-full max-w-[640px] px-4 py-8 sm:px-6 sm:py-10">
        <SettingsForm />
      </section>
    </main>
  );
}
