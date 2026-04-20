"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";

const schema = z.object({
  handle: z
    .string()
    .min(3, "3+ characters")
    .regex(/^[a-z0-9-]+$/, "Lowercase, numbers, hyphens"),
});

type FormValues = z.infer<typeof schema>;

export default function HandleForm() {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { handle: "" },
  });

  function onSubmit(values: FormValues) {
    alert(`Would save handle: ${values.handle}`);
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
    >
      <Controller
        name="handle"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <div className="flex items-stretch border-[1.5px] border-[var(--bru-ink)] bg-[var(--bru-paper)] focus-within:shadow-[3px_3px_0_var(--bru-ink)] transition-shadow duration-75 [transition-timing-function:steps(1)]">
              <span className="flex items-center px-2.5 bg-[var(--bru-ink)] text-[var(--bru-paper)] font-[family:var(--bru-mono)] text-[10px] font-extrabold uppercase tracking-[1.5px]">
                /h/
              </span>
              <input
                {...field}
                id={field.name}
                type="text"
                placeholder="alex"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={fieldState.invalid}
                className="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-[15px] text-[var(--bru-ink)] outline-none placeholder:text-[var(--bru-placeholder)]"
              />
            </div>
            <FieldError
              errors={fieldState.error ? [fieldState.error] : undefined}
              className="font-[family:var(--bru-mono)] text-[9.5px] font-bold uppercase tracking-[2.5px]"
            />
          </Field>
        )}
      />

      <Button
        type="submit"
        variant="brutalist"
        size="brutalist"
        className="w-full sm:w-auto sm:self-end"
      >
        Save
      </Button>
    </form>
  );
}
