import { describe, it, expect } from "vitest";
import { test, fc } from "@fast-check/vitest";
import { DAY_KEYS, type DayKey } from "@/lib/schedule";
import {
  formatDayLabel,
  validateDraft,
  type DayLabelStrings,
} from "../format-day-label";

function makeEnglishStrings(): DayLabelStrings {
  const SHORT: Record<DayKey, string> = {
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun",
  };
  const LONG: Record<DayKey, string> = {
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday",
  };
  return {
    nameOf: (key, length) => (length === "short" ? SHORT[key] : LONG[key]),
    empty: "No days",
    everyDay: "Every day",
  };
}

function makeSpanishStrings(): DayLabelStrings {
  const SHORT: Record<DayKey, string> = {
    mon: "lun",
    tue: "mar",
    wed: "mié",
    thu: "jue",
    fri: "vie",
    sat: "sáb",
    sun: "dom",
  };
  const LONG: Record<DayKey, string> = {
    mon: "lunes",
    tue: "martes",
    wed: "miércoles",
    thu: "jueves",
    fri: "viernes",
    sat: "sábado",
    sun: "domingo",
  };
  return {
    nameOf: (key, length) => (length === "short" ? SHORT[key] : LONG[key]),
    empty: "Sin días",
    everyDay: "Todos los días",
  };
}

describe("formatDayLabel — example cases (en)", () => {
  const en = makeEnglishStrings();

  it("[] → empty placeholder", () => {
    expect(formatDayLabel([], "short", en)).toBe("No days");
  });

  it("all 7 → everyDay shorthand", () => {
    expect(formatDayLabel([...DAY_KEYS], "short", en)).toBe("Every day");
  });

  it("mon..fri → 'Mon – Fri'", () => {
    expect(
      formatDayLabel(["mon", "tue", "wed", "thu", "fri"], "short", en),
    ).toBe("Mon – Fri");
  });

  it("sat, sun → 'Sat – Sun'", () => {
    expect(formatDayLabel(["sat", "sun"], "short", en)).toBe("Sat – Sun");
  });

  it("contiguous run of 3 → 'Mon – Wed'", () => {
    expect(formatDayLabel(["mon", "tue", "wed"], "short", en)).toBe(
      "Mon – Wed",
    );
  });

  it("two runs joined → 'Mon – Wed, Fri – Sat'", () => {
    expect(
      formatDayLabel(["mon", "tue", "wed", "fri", "sat"], "short", en),
    ).toBe("Mon – Wed, Fri – Sat");
  });

  it("non-contiguous singletons → 'Mon, Wed, Fri'", () => {
    expect(formatDayLabel(["mon", "wed", "fri"], "short", en)).toBe(
      "Mon, Wed, Fri",
    );
  });

  it("input order does not matter — sorts canonically", () => {
    expect(formatDayLabel(["fri", "mon", "wed"], "short", en)).toBe(
      "Mon, Wed, Fri",
    );
  });

  it("long form swaps the day-name shape", () => {
    expect(formatDayLabel(["mon", "wed", "fri"], "long", en)).toBe(
      "Monday, Wednesday, Friday",
    );
  });
});

describe("formatDayLabel — locale swap (es)", () => {
  const es = makeSpanishStrings();

  it("empty → 'Sin días'", () => {
    expect(formatDayLabel([], "short", es)).toBe("Sin días");
  });

  it("all 7 → 'Todos los días'", () => {
    expect(formatDayLabel([...DAY_KEYS], "short", es)).toBe(
      "Todos los días",
    );
  });

  it("mon..fri → 'lun – vie' (ICU weekday short)", () => {
    expect(
      formatDayLabel(["mon", "tue", "wed", "thu", "fri"], "short", es),
    ).toBe("lun – vie");
  });

  it("sat, sun → 'sáb – dom'", () => {
    expect(formatDayLabel(["sat", "sun"], "short", es)).toBe("sáb – dom");
  });

  it("non-contiguous → 'lun, mié, vie'", () => {
    expect(formatDayLabel(["mon", "wed", "fri"], "short", es)).toBe(
      "lun, mié, vie",
    );
  });
});

describe("formatDayLabel — property invariants", () => {
  const en = makeEnglishStrings();

  const nonEmptyDayArb = fc
    .subarray([...DAY_KEYS] as DayKey[], { minLength: 1 })
    .map((arr) => Array.from(new Set(arr)) as DayKey[]);

  const nonContiguousDayArb = fc
    .subarray(["mon", "wed", "fri", "sun"] as DayKey[], { minLength: 1 })
    .map((arr) => Array.from(new Set(arr)) as DayKey[]);

  test.prop({ days: nonContiguousDayArb }, { numRuns: 50 })(
    "non-contiguous days each appear individually in the output (en, short)",
    ({ days }) => {
      const out = formatDayLabel(days, "short", en);
      for (const d of days) {
        const name = en.nameOf(d, "short");
        if (!out.includes(name)) {
          throw new Error(
            `expected "${name}" in "${out}" for input ${JSON.stringify(days)}`,
          );
        }
      }
    },
  );

  test.prop({ days: nonEmptyDayArb }, { numRuns: 100 })(
    "output is non-empty for any non-empty input",
    ({ days }) => {
      const out = formatDayLabel(days, "short", en);
      expect(out.length).toBeGreaterThan(0);
    },
  );

  test.prop({ days: nonEmptyDayArb }, { numRuns: 50 })(
    "input order does not affect output (sorted canonically)",
    ({ days }) => {
      const reversed = [...days].reverse();
      expect(formatDayLabel(days, "short", en)).toBe(
        formatDayLabel(reversed, "short", en),
      );
    },
  );
});

describe("validateDraft — sentinel keys + locale-aware overlap payload", () => {
  const en = makeEnglishStrings();
  const es = makeSpanishStrings();

  it("empty days → 'needsDay'", () => {
    expect(
      validateDraft(
        { days: [], from: "09:00", to: "10:00" },
        [],
        en.nameOf,
      ),
    ).toBe("needsDay");
  });

  it("end before start → 'endBeforeStart'", () => {
    expect(
      validateDraft(
        { days: ["mon"], from: "10:00", to: "09:00" },
        [],
        en.nameOf,
      ),
    ).toBe("endBeforeStart");
  });

  it("end equals start → 'endBeforeStart' (zero-width range)", () => {
    expect(
      validateDraft(
        { days: ["mon"], from: "09:00", to: "09:00" },
        [],
        en.nameOf,
      ),
    ).toBe("endBeforeStart");
  });

  it("non-overlapping ranges on shared day → null", () => {
    const result = validateDraft(
      { days: ["mon"], from: "09:00", to: "10:00" },
      [{ days: ["mon"], from: "10:00", to: "12:00" }],
      en.nameOf,
    );
    expect(result).toBeNull();
  });

  it("overlapping range on shared day → 'overlap:<en short names>'", () => {
    const result = validateDraft(
      { days: ["mon", "wed"], from: "09:00", to: "11:00" },
      [{ days: ["mon", "fri"], from: "10:00", to: "12:00" }],
      en.nameOf,
    );
    expect(result).toBe("overlap:Mon");
  });

  it("overlap on multiple shared days → comma-joined list", () => {
    const result = validateDraft(
      { days: ["mon", "wed", "fri"], from: "09:00", to: "11:00" },
      [{ days: ["mon", "wed", "sat"], from: "10:00", to: "12:00" }],
      en.nameOf,
    );
    expect(result).toBe("overlap:Mon, Wed");
  });

  it("locale swap — overlap payload uses es names", () => {
    const result = validateDraft(
      { days: ["mon", "wed"], from: "09:00", to: "11:00" },
      [{ days: ["mon", "wed"], from: "10:00", to: "12:00" }],
      es.nameOf,
    );
    expect(result).toBe("overlap:lun, mié");
  });

  it("disjoint days → no overlap regardless of time", () => {
    const result = validateDraft(
      { days: ["mon"], from: "09:00", to: "11:00" },
      [{ days: ["tue"], from: "09:00", to: "11:00" }],
      en.nameOf,
    );
    expect(result).toBeNull();
  });
});
