import { describe, it, expect } from "vitest";
import { t, setLocale } from "./i18n";

describe("i18n", () => {
  it("returns the literal English string for known keys", () => {
    expect(t("bundle.heading")).toBe("Frequently bought together");
  });

  it("interpolates variables", () => {
    expect(t("bundle.ctaSavings", { savings: "$10.00" })).toBe("Add bundle to cart — Save $10.00");
  });

  it("returns the key when missing", () => {
    expect(t("nonexistent.key")).toBe("nonexistent.key");
  });

  it("setLocale falls back to en for unknown locales", () => {
    setLocale("xx-XX");
    expect(t("bundle.heading")).toBe("Frequently bought together");
  });
});
