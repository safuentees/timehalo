import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createLogger } from "@/lib/logger";

describe("logger emit shape", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("info → console.log with valid JSON line carrying name + msg + fields", () => {
    const log = createLogger("test");
    log.info("hello", { foo: "bar", n: 1 });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const arg = logSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(arg);
    expect(parsed.level).toBe("info");
    expect(parsed.name).toBe("test");
    expect(parsed.msg).toBe("hello");
    expect(parsed.foo).toBe("bar");
    expect(parsed.n).toBe(1);
    expect(typeof parsed.time).toBe("string");
    expect(parsed.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("warn → console.warn", () => {
    const log = createLogger("test");
    log.warn("careful");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("error → console.error", () => {
    const log = createLogger("test");
    log.error("kaboom", { code: "E_FAIL" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(parsed.level).toBe("error");
    expect(parsed.code).toBe("E_FAIL");
  });

  it("debug → console.log in dev (test runs in dev mode)", () => {
    const log = createLogger("test");
    log.debug("trace");
    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed.level).toBe("debug");
  });

  it("emits no fields key when fields not supplied", () => {
    const log = createLogger("test");
    log.info("bare");
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).not.toHaveProperty("fields");
    const keys = Object.keys(parsed).sort();
    expect(keys).toEqual(["level", "msg", "name", "time"]);
  });

  it("scopes by name across loggers", () => {
    const a = createLogger("a");
    const b = createLogger("b");
    a.info("from-a");
    b.info("from-b");
    expect(logSpy).toHaveBeenCalledTimes(2);
    const namesEmitted = logSpy.mock.calls.map(
      (call: unknown[]) => JSON.parse(call[0] as string).name as string,
    );
    expect(namesEmitted).toEqual(["a", "b"]);
  });
});
