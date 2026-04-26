import "server-only";
import type { ReactElement } from "react";
import BookingCreatedEmail, {
  bookingCreatedSubject,
  type BookingCreatedProps,
} from "./templates/booking-created";
import BookingCancelledEmail, {
  bookingCancelledSubject,
  type BookingCancelledProps,
} from "./templates/booking-cancelled";
import BookingCancelledHostEmail, {
  bookingCancelledHostSubject,
  type BookingCancelledHostProps,
} from "./templates/booking-cancelled-host";
import AccountDeletedEmail, {
  accountDeletedSubject,
  type AccountDeletedProps,
} from "./templates/account-deleted";
import BookingRescheduledEmail, {
  bookingRescheduledSubject,
  type BookingRescheduledProps,
} from "./templates/booking-rescheduled";
import BookingReminderEmail, {
  bookingReminderSubject,
  type BookingReminderProps,
} from "./templates/booking-reminder";

// Template registry — one entry per template, paired with its subject
// generator. The discriminated union of TemplateName + per-template
// props is the public surface of the email module. Adding a template:
// (1) drop the .tsx into ./templates/, (2) add a registry row here,
// (3) the union below gains the new key automatically.
//
// Pattern reference: rallly /packages/emails/src/templates.ts.

export const TEMPLATES = {
  "booking-created": {
    Component: BookingCreatedEmail,
    getSubject: bookingCreatedSubject,
  },
  "booking-cancelled": {
    Component: BookingCancelledEmail,
    getSubject: bookingCancelledSubject,
  },
  "booking-cancelled-host": {
    Component: BookingCancelledHostEmail,
    getSubject: bookingCancelledHostSubject,
  },
  "account-deleted": {
    Component: AccountDeletedEmail,
    getSubject: accountDeletedSubject,
  },
  "booking-rescheduled": {
    Component: BookingRescheduledEmail,
    getSubject: bookingRescheduledSubject,
  },
  "booking-reminder": {
    Component: BookingReminderEmail,
    getSubject: bookingReminderSubject,
  },
} as const;

export type TemplateName = keyof typeof TEMPLATES;

// Per-template prop map — the source of truth that sendEmail() narrows
// on via the TemplateName discriminator.
export type TemplatePropsMap = {
  "booking-created": BookingCreatedProps;
  "booking-cancelled": BookingCancelledProps;
  "booking-cancelled-host": BookingCancelledHostProps;
  "account-deleted": AccountDeletedProps;
  "booking-rescheduled": BookingRescheduledProps;
  "booking-reminder": BookingReminderProps;
};

export function renderTemplateElement<T extends TemplateName>(
  template: T,
  props: TemplatePropsMap[T],
): ReactElement {
  const { Component } = TEMPLATES[template];
  // Cast is safe — the registry row's Component type matches its
  // props by construction. TS can't narrow through the keyed lookup.
  const Typed = Component as (p: TemplatePropsMap[T]) => ReactElement;
  return Typed(props);
}

export function getSubject<T extends TemplateName>(
  template: T,
  props: TemplatePropsMap[T],
): string {
  const { getSubject } = TEMPLATES[template];
  const typed = getSubject as (p: TemplatePropsMap[T]) => string;
  return typed(props);
}
