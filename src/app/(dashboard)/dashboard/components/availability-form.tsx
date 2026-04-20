"use client";

import { Clock2Icon, PlusIcon, XIcon } from "lucide-react";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type Control,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
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
type TimeFieldName = `${DayKey}.ranges.${number}.${"from" | "to"}`;

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

const schema = z.object({
  mon: daySchema,
  tue: daySchema,
  wed: daySchema,
  thu: daySchema,
  fri: daySchema,
  sat: daySchema,
  sun: daySchema,
});

type FormValues = z.infer<typeof schema>;

const DEFAULT_RANGE = { from: "09:00", to: "17:00" };

const defaultValues: FormValues = {
  mon: { enabled: true, ranges: [DEFAULT_RANGE] },
  tue: { enabled: true, ranges: [DEFAULT_RANGE] },
  wed: { enabled: true, ranges: [DEFAULT_RANGE] },
  thu: { enabled: true, ranges: [DEFAULT_RANGE] },
  fri: { enabled: true, ranges: [DEFAULT_RANGE] },
  sat: { enabled: false, ranges: [] },
  sun: { enabled: false, ranges: [] },
};

export default function AvailabilityForm() {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: "onBlur",
  });

  function onSubmit(values: FormValues) {
    alert(JSON.stringify(values, null, 2));
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>
        <FieldSet>
          <FieldLegend className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase">
            Availability
          </FieldLegend>
          <FieldDescription className="text-[13px] leading-[1.5] opacity-65">
            Weekly windows visitors can book from.
          </FieldDescription>
          <FieldGroup>
            {DAYS.map((day) => (
              <DayRow key={day.key} day={day} control={form.control} />
            ))}
          </FieldGroup>
        </FieldSet>

        <Field orientation="horizontal" className="justify-end">
          <Button
            type="submit"
            variant="brutalist"
            size="brutalist"
            className="w-full sm:w-auto"
          >
            Save schedule
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}

function DayRow({
  day,
  control,
}: {
  day: (typeof DAYS)[number];
  control: Control<FormValues>;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `${day.key}.ranges` as const,
  });
  const enabled = useWatch({ control, name: `${day.key}.enabled` });

  return (
    <Field className="flex-col gap-3 sm:flex-row sm:items-start">
      <Controller
        control={control}
        name={`${day.key}.enabled`}
        render={({ field }) => (
          <div className="flex items-center gap-3 sm:w-32 sm:shrink-0 sm:pt-1.5">
            <Switch
              id={`enabled-${day.key}`}
              checked={field.value}
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
                  control={control}
                  name={`${day.key}.ranges.${i}.from`}
                  ariaLabel={`${day.label} start time`}
                />
                <span className="shrink-0 opacity-50">—</span>
                <TimeField
                  control={control}
                  name={`${day.key}.ranges.${i}.to`}
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
  control,
  name,
  ariaLabel,
}: {
  control: Control<FormValues>;
  name: TimeFieldName;
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
