"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { useFormatter, useTranslations } from "next-intl";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeftIcon } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/trpc/hooks";
import type { AppRouter } from "@/trpc/router";
import { Button } from "@/components/ui/button";
import {
  OhInputGroup,
  OhInputGroupAddon,
  OhInputGroupInput,
  OhInputGroupText,
} from "@/components/oh/oh-input-group";
import { Field, FieldError, FieldGroup, FieldSet } from "@/components/ui/field";
import { OhPageShell } from "@/components/oh/page-shell";
import { useTeamBooking } from "@/lib/mutations/use-team-booking";
import { getBrowserTimezone } from "@/lib/timezone";
import {
  bookingFormSchema,
  type BookingFormValues,
} from "@/lib/booking-schema";

type RouterOutputs = inferRouterOutputs<AppRouter>;

type Props = {
  slug: string;
  eventTypeSlug: string;
  initialEventType: RouterOutputs["workspaces"]["publicGetEventType"];
  initialSlots: RouterOutputs["workspaces"]["publicGetUpcomingSlotsForEventType"];
  renderedAt: string;
};

// B.PT62b — team booking visitor flow. Mirrors the chrome of
// `/h/<handle>` (OhPageShell, sentence-case heading, oh-eyebrow
// metadata) but the slot picker is intentionally simpler than
// `<AvailabilityDrawer>` — there's no host-bio context to grow into,
// and team booking is more about "show me the next free slot for
// this event type" than "explore this person's calendar." A
// chronological day-grouped list reads cleaner here.
//
// Branch 5 (host hidden until confirm): the visitor sees the event
// type name + workspace + a small avatar stack, NEVER which host
// they'll get assigned to. Confirmation page (`/booked/<uid>`)
// reveals the picked host's name + avatar.
export function TeamBookingFlow({
  slug,
  eventTypeSlug,
  initialEventType,
  initialSlots,
}: Props) {
  const t = useTranslations("TeamBooking");
  const format = useFormatter();
  const { data: eventType } = trpc.workspaces.publicGetEventType.useQuery(
    { slug, eventTypeSlug },
    { initialData: initialEventType },
  );
  const { data: slots } =
    trpc.workspaces.publicGetUpcomingSlotsForEventType.useQuery(
      { slug, eventTypeSlug, days: 7 },
      { initialData: initialSlots },
    );

  const [selectedSlot, setSelectedSlot] = useState<{
    start: string;
    end: string;
  } | null>(null);

  const eventTypeData = eventType ?? initialEventType;
  const slotsData = slots ?? initialSlots;

  // Group slots by day (YYYY-MM-DD in visitor's local time) so the
  // picker reads as "Monday Jul 15: 9am 10am 11am" instead of a
  // flat list of 50+ chips.
  const grouped = useMemo(() => {
    const map = new Map<string, typeof slotsData[number][]>();
    for (const s of slotsData) {
      const d = new Date(s.start);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [slotsData]);

  return (
    <main className="min-h-screen bg-oh-bg" id="top">
      {/* Workspace eyebrow row — same chrome as B.PT61's directory. */}
      <div className="border-b border-oh-line">
        <div className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a
            href={`/w/${slug}`}
            className="oh-eyebrow flex items-center gap-1.5 opacity-55 transition-opacity hover:opacity-100"
          >
            <ArrowLeftIcon
              aria-hidden
              strokeWidth={1.75}
              className="size-3"
            />
            {eventTypeData.workspaceName}
          </a>
          <span className="oh-eyebrow tabular-nums">
            {t("hostCount", { count: eventTypeData.hostCount })}
          </span>
        </div>
      </div>

      <OhPageShell>
        <header className="flex flex-col gap-4">
          <span className="oh-eyebrow opacity-100">{t("eyebrow")}</span>
          <h1 className="text-[clamp(32px,1rem+4vw,52px)] font-black leading-[1.05] tracking-tight">
            {eventTypeData.name}
          </h1>
          <p className="oh-description">
            {t("durationDescription", {
              minutes: eventTypeData.durationMins,
            })}
          </p>
        </header>

        {selectedSlot ? (
          <BookingForm
            slug={slug}
            eventTypeSlug={eventTypeSlug}
            slotStart={selectedSlot.start}
            slotEnd={selectedSlot.end}
            onCancel={() => setSelectedSlot(null)}
          />
        ) : (
          <SlotPicker
            grouped={grouped}
            format={format}
            onPick={(slot) =>
              setSelectedSlot({ start: slot.start, end: slot.end })
            }
            emptyLabel={t("noSlots")}
          />
        )}
      </OhPageShell>
    </main>
  );
}

function SlotPicker({
  grouped,
  format,
  onPick,
  emptyLabel,
}: {
  grouped: Array<[string, Array<{ start: string; end: string }>]>;
  format: ReturnType<typeof useFormatter>;
  onPick: (slot: { start: string; end: string }) => void;
  emptyLabel: string;
}) {
  if (grouped.length === 0) {
    return (
      <p className="oh-description mt-12 opacity-65">{emptyLabel}</p>
    );
  }

  return (
    <section className="mt-12 flex flex-col gap-8">
      {grouped.map(([key, daySlots]) => {
        const date = new Date(daySlots[0].start);
        return (
          <article key={key}>
            <h2 className="oh-legend mb-3 opacity-100">
              {format.dateTime(date, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </h2>
            <ul
              role="list"
              className="grid grid-cols-3 gap-2 sm:grid-cols-4"
            >
              {daySlots.map((slot) => (
                <li key={slot.start}>
                  <button
                    type="button"
                    onClick={() => onPick(slot)}
                    aria-label={`Book ${format.dateTime(new Date(slot.start), { hour: "numeric", minute: "2-digit" })}`}
                    className="w-full rounded-(--oh-r-sm) border border-oh-line bg-oh-bg px-3 py-2.5 text-center font-[family-name:var(--oh-mono)] text-[13px] tabular-nums opacity-90 transition-colors duration-150 ease-oh hover:border-oh-line-strong hover:bg-oh-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--oh-ink)] focus-visible:outline-offset-2"
                  >
                    {format.dateTime(new Date(slot.start), {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </button>
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </section>
  );
}

function BookingForm({
  slug,
  eventTypeSlug,
  slotStart,
  slotEnd,
  onCancel,
}: {
  slug: string;
  eventTypeSlug: string;
  slotStart: string;
  slotEnd: string;
  onCancel: () => void;
}) {
  const t = useTranslations("TeamBooking");
  const format = useFormatter();
  const router = useRouter();
  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: { visitorName: "", visitorEmail: "", question: "" },
    mode: "onBlur",
  });

  // Stable idempotency key for this form lifetime — double-click,
  // back-and-resubmit, retry-on-flake all ship the same UUID and the
  // server returns the original booking instead of a duplicate.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const book = useTeamBooking({
    onSuccess: (booking) => {
      form.reset();
      router.push(
        `/w/${slug}/${eventTypeSlug}/booked/${booking.publicUid}`,
      );
    },
  });

  function onSubmit(values: BookingFormValues) {
    book.mutate({
      slug,
      eventTypeSlug,
      slotStart,
      idempotencyKey,
      visitorName: values.visitorName,
      visitorEmail: values.visitorEmail,
      question: values.question,
      visitorTimezone: getBrowserTimezone(),
    });
  }

  const start = new Date(slotStart);
  const end = new Date(slotEnd);

  return (
    <section className="mt-12 flex flex-col gap-6">
      <header className="flex items-baseline justify-between gap-4 border-b border-oh-line pb-4">
        <div>
          <p className="oh-eyebrow opacity-100">{t("selectedSlotLabel")}</p>
          <p className="mt-2 text-[18px] font-bold tabular-nums">
            {format.dateTime(start, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </p>
          <p className="mt-1 text-[15px] tabular-nums opacity-65">
            {format.dateTime(start, {
              hour: "numeric",
              minute: "2-digit",
            })}
            –
            {format.dateTime(end, {
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="oh-eyebrow opacity-55 transition-opacity hover:opacity-100"
        >
          {t("change")}
        </button>
      </header>

      <FormProvider {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="oh-booking-form"
        >
          <FieldGroup>
            <FieldSet>
              <FieldGroup>
                <Controller<BookingFormValues>
                  name="visitorName"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <OhInputGroup>
                        <OhInputGroupInput
                          {...field}
                          id={field.name}
                          placeholder="Alex"
                          autoComplete="name"
                          autoCapitalize="words"
                          aria-invalid={fieldState.invalid}
                        />
                        <OhInputGroupAddon align="inline-start">
                          <OhInputGroupText>{t("nameLabel")}</OhInputGroupText>
                        </OhInputGroupAddon>
                      </OhInputGroup>
                      <FieldError
                        errors={
                          fieldState.error ? [fieldState.error] : undefined
                        }
                        className="oh-field-error"
                      />
                    </Field>
                  )}
                />
              </FieldGroup>
            </FieldSet>
            <FieldSet>
              <FieldGroup>
                <Controller<BookingFormValues>
                  name="visitorEmail"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <OhInputGroup>
                        <OhInputGroupInput
                          {...field}
                          id={field.name}
                          type="email"
                          placeholder="alex@example.com"
                          autoComplete="email"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          aria-invalid={fieldState.invalid}
                        />
                        <OhInputGroupAddon align="inline-start">
                          <OhInputGroupText>{t("emailLabel")}</OhInputGroupText>
                        </OhInputGroupAddon>
                      </OhInputGroup>
                      <FieldError
                        errors={
                          fieldState.error ? [fieldState.error] : undefined
                        }
                        className="oh-field-error"
                      />
                    </Field>
                  )}
                />
              </FieldGroup>
            </FieldSet>
            <FieldSet>
              <FieldGroup>
                <Controller<BookingFormValues>
                  name="question"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <label
                        className="oh-field-label"
                        htmlFor={field.name}
                      >
                        {t("questionLabel")}{" "}
                        <span className="oh-field-label-opt">
                          {t("optional")}
                        </span>
                      </label>
                      <textarea
                        {...field}
                        id={field.name}
                        rows={3}
                        maxLength={500}
                        placeholder={t("questionPlaceholder")}
                        aria-invalid={fieldState.invalid}
                        className="oh-textarea"
                      />
                      <FieldError
                        errors={
                          fieldState.error ? [fieldState.error] : undefined
                        }
                        className="oh-field-error"
                      />
                    </Field>
                  )}
                />
              </FieldGroup>
            </FieldSet>
            <Button
              type="submit"
              variant="oh"
              size="oh"
              disabled={book.isPending}
              className="oh-book-submit"
            >
              {book.isPending ? t("booking") : t("confirmBooking")}
            </Button>
            {book.error ? (
              <p className="oh-field-error" role="alert">
                {book.error.message}
              </p>
            ) : null}
          </FieldGroup>
        </form>
      </FormProvider>
    </section>
  );
}
