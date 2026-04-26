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
} as const;

export type TemplateName = keyof typeof TEMPLATES;

export type TemplatePropsMap = {
  "booking-created": BookingCreatedProps;
  "booking-cancelled": BookingCancelledProps;
  "booking-cancelled-host": BookingCancelledHostProps;
};

export function renderTemplateElement<T extends TemplateName>(
  template: T,
  props: TemplatePropsMap[T],
): ReactElement {
  const { Component } = TEMPLATES[template];
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
