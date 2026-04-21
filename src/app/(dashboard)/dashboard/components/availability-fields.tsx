"use client";

import { Clock2Icon, PlusIcon, XIcon } from "lucide-react";
import { Controller, useFieldArray, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import {
  BrutalistInputGroup,
  BrutalistInputGroupAddon,
  BrutalistInputGroupInput,
} from "@/components/brutalist/brutalist-input-group";
import type { DayKey, ScheduleValues } from "@/lib/schedule";

export {
  scheduleSchema as availabilitySchema,
  defaultSchedule as defaultAvailability,
} from "@/lib/schedule";
export type { ScheduleValues as AvailabilityValues } from "@/lib/schedule";

const DAYS: ReadonlyArray<{ key: DayKey; label: string; short: string }> = [
  { key: "mon", label: "Monday", short: "Mon" },
  { key: "tue", label: "Tuesday", short: "Tue" },
  { key: "wed", label: "Wednesday", short: "Wed" },
  { key: "thu", label: "Thursday", short: "Thu" },
  { key: "fri", label: "Friday", short: "Fri" },
  { key: "sat", label: "Saturday", short: "Sat" },
  { key: "sun", label: "Sunday", short: "Sun" },
] as const;

const DEFAULT_RANGE = { from: "09:00", to: "17:00" };

type FormShape = { availability: ScheduleValues };

export function AvailabilityFields() {
  return (
    <>
      {DAYS.map((day) => (
        <DayRow key={day.key} day={day} />
      ))}
    </>
  );
}

function DayRow({ day }: { day: (typeof DAYS)[number] }) {
  const { fields, append, remove } = useFieldArray<FormShape>({
    name: `availability.${day.key}.ranges`,
  });
  const enabled = useWatch<FormShape>({
    name: `availability.${day.key}.enabled`,
  });

  return (
    <Field className="flex-col gap-3 sm:flex-row sm:items-start">
      <Controller<FormShape>
        name={`availability.${day.key}.enabled`}
        render={({ field }) => (
          <div className="flex items-center gap-3 sm:w-32 sm:shrink-0 sm:pt-1.5">
            <Switch
              id={`enabled-${day.key}`}
              checked={field.value as boolean}
              onCheckedChange={(v) => {
                field.onChange(v);
                if (v && fields.length === 0) append(DEFAULT_RANGE);
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
                  dayKey={day.key}
                  index={i}
                  bound="from"
                  ariaLabel={`${day.label} start time`}
                />
                <span className="shrink-0 opacity-50">—</span>
                <TimeField
                  dayKey={day.key}
                  index={i}
                  bound="to"
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
              onClick={() => append(DEFAULT_RANGE)}
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

function TimeField({
  dayKey,
  index,
  bound,
  ariaLabel,
}: {
  dayKey: DayKey;
  index: number;
  bound: "from" | "to";
  ariaLabel: string;
}) {
  return (
    <Controller<FormShape>
      name={`availability.${dayKey}.ranges.${index}.${bound}`}
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
