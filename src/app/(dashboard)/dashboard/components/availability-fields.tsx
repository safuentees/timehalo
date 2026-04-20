"use client";

import { Clock2Icon, PlusIcon, XIcon } from "lucide-react";
import {
  Controller,
  useFieldArray,
  useWatch,
  type Control,
  type FieldPath,
} from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import {
  BrutalistInputGroup,
  BrutalistInputGroupAddon,
  BrutalistInputGroupInput,
} from "@/components/brutalist/brutalist-input-group";

const DAYS = [
  { key: "mon", label: "Monday", short: "Mon" },
  { key: "tue", label: "Tuesday", short: "Tue" },
  { key: "wed", label: "Wednesday", short: "Wed" },
  { key: "thu", label: "Thursday", short: "Thu" },
  { key: "fri", label: "Friday", short: "Fri" },
  { key: "sat", label: "Saturday", short: "Sat" },
  { key: "sun", label: "Sunday", short: "Sun" },
] as const;

type DayKey = (typeof DAYS)[number]["key"];

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const rangeSchema = z
  .object({
    from: z.string().regex(timeRegex, "HH:MM"),
    to: z.string().regex(timeRegex, "HH:MM"),
  })
  .refine((r) => r.from < r.to, {
    message: "End must be after start",
    path: ["to"],
  });

const daySchema = z.object({
  enabled: z.boolean(),
  ranges: z.array(rangeSchema),
});

export const availabilitySchema = z.object({
  mon: daySchema,
  tue: daySchema,
  wed: daySchema,
  thu: daySchema,
  fri: daySchema,
  sat: daySchema,
  sun: daySchema,
});

export type AvailabilityValues = z.infer<typeof availabilitySchema>;

const DEFAULT_RANGE = { from: "09:00", to: "17:00" };

export const defaultAvailability: AvailabilityValues = {
  mon: { enabled: true, ranges: [DEFAULT_RANGE] },
  tue: { enabled: true, ranges: [DEFAULT_RANGE] },
  wed: { enabled: true, ranges: [DEFAULT_RANGE] },
  thu: { enabled: true, ranges: [DEFAULT_RANGE] },
  fri: { enabled: true, ranges: [DEFAULT_RANGE] },
  sat: { enabled: false, ranges: [] },
  sun: { enabled: false, ranges: [] },
};

type AvailabilityPrefix = "availability";
type TimeFieldName = `${AvailabilityPrefix}.${DayKey}.ranges.${number}.${"from" | "to"}`;
type EnabledName = `${AvailabilityPrefix}.${DayKey}.enabled`;
type RangesName = `${AvailabilityPrefix}.${DayKey}.ranges`;

export function AvailabilityFields<
  TFieldValues extends { availability: AvailabilityValues },
>({ control }: { control: Control<TFieldValues> }) {
  return (
    <>
      {DAYS.map((day) => (
        <DayRow key={day.key} day={day} control={control} />
      ))}
    </>
  );
}

function DayRow<TFieldValues extends { availability: AvailabilityValues }>({
  day,
  control,
}: {
  day: (typeof DAYS)[number];
  control: Control<TFieldValues>;
}) {
  const rangesName = `availability.${day.key}.ranges` as RangesName as FieldPath<TFieldValues>;
  const enabledName = `availability.${day.key}.enabled` as EnabledName as FieldPath<TFieldValues>;

  const { fields, append, remove } = useFieldArray({
    control,
    name: rangesName as never,
  });
  const enabled = useWatch({ control, name: enabledName }) as boolean;

  return (
    <Field className="flex-col gap-3 sm:flex-row sm:items-start">
      <Controller
        control={control}
        name={enabledName}
        render={({ field }) => (
          <div className="flex items-center gap-3 sm:w-32 sm:shrink-0 sm:pt-1.5">
            <Switch
              id={`enabled-${day.key}`}
              checked={field.value as boolean}
              onCheckedChange={(v) => {
                field.onChange(v);
                if (v && fields.length === 0) append(DEFAULT_RANGE as never);
              }}
              aria-label={day.label}
            />
            <FieldLabel
              htmlFor={`enabled-${day.key}`}
              className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[1.5px] uppercase"
            >
              {day.short}
            </FieldLabel>
          </div>
        )}
      />

      <div className="flex flex-1 flex-col gap-2">
        {!enabled ? (
          <span className="py-2 font-[family-name:var(--bru-mono)] text-[10px] font-bold tracking-[2px] uppercase opacity-40">
            unavailable
          </span>
        ) : (
          <>
            {fields.map((f, i) => (
              <div key={f.id} className="flex items-center gap-2">
                <TimeField
                  control={control}
                  name={`availability.${day.key}.ranges.${i}.from` as TimeFieldName as FieldPath<TFieldValues>}
                  ariaLabel={`${day.label} start time`}
                />
                <span className="shrink-0 opacity-50">—</span>
                <TimeField
                  control={control}
                  name={`availability.${day.key}.ranges.${i}.to` as TimeFieldName as FieldPath<TFieldValues>}
                  ariaLabel={`${day.label} end time`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => remove(i)}
                  aria-label="Remove range"
                  className="shrink-0"
                >
                  <XIcon />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => append(DEFAULT_RANGE as never)}
              className="self-start font-[family-name:var(--bru-mono)] text-[10px] tracking-[1.5px] uppercase"
            >
              <PlusIcon /> Add range
            </Button>
          </>
        )}
      </div>
    </Field>
  );
}

function TimeField<TFieldValues extends { availability: AvailabilityValues }>({
  control,
  name,
  ariaLabel,
}: {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  ariaLabel: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <BrutalistInputGroup className="flex-1">
          <BrutalistInputGroupInput
            {...field}
            value={(field.value as string) ?? ""}
            type="time"
            step={900}
            aria-label={ariaLabel}
            aria-invalid={fieldState.invalid}
            className="appearance-none py-1.5 text-[14px] [&::-webkit-calendar-picker-indicator]:hidden"
          />
          <BrutalistInputGroupAddon align="inline-end">
            <Clock2Icon className="size-3.5" />
          </BrutalistInputGroupAddon>
        </BrutalistInputGroup>
      )}
    />
  );
}
