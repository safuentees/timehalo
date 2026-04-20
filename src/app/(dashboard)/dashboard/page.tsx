import AvailabilityForm from "./components/availability-form";
import HandleForm from "./components/nav";

export default function Page() {
  return (
    <main className="bru-main">
      <section className="mx-auto flex w-full max-w-[640px] flex-col gap-10 px-4 py-8 sm:px-6 sm:py-10">
        <HandleForm />
        <AvailabilityForm />
      </section>
    </main>
  );
}
