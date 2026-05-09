import { describe, it, expect } from "vitest";
import { t, tWith, setLocale } from "./i18n";

describe("t", () => {
  it("returns plain string when no template vars", () => {
    expect(t("bundle.totalLabel")).toBe("Total");
  });

  it("substitutes {var} placeholders", () => {
    expect(t("qb.tierLabel", { qty: 3 })).toBe("Buy 3");
  });

  it("returns the key when missing", () => {
    expect(t("nonexistent.key")).toBe("nonexistent.key");
  });

  it("returns the literal English string for known keys", () => {
    expect(t("bundle.heading")).toBe("Frequently bought together");
  });

  it("interpolates variables", () => {
    expect(t("bundle.ctaSavings", { savings: "$10.00" })).toBe("Add bundle to cart — Save $10.00");
  });

  it("setLocale falls back to en for unknown locales", () => {
    setLocale("xx-XX");
    expect(t("bundle.heading")).toBe("Frequently bought together");
  });
});

describe("tWith", () => {
  it("returns i18n default when overrides is null", () => {
    expect(tWith(null, "bundle.totalLabel")).toBe("Total");
  });

  it("returns i18n default when overrides is undefined", () => {
    expect(tWith(undefined, "bundle.totalLabel")).toBe("Total");
  });

  it("returns i18n default when override key absent", () => {
    expect(tWith({ "qb.mostPopular": "Best" }, "bundle.totalLabel")).toBe("Total");
  });

  it("returns i18n default when override value is empty string", () => {
    expect(tWith({ "bundle.totalLabel": "" }, "bundle.totalLabel")).toBe("Total");
  });

  it("returns the override when present", () => {
    expect(tWith({ "bundle.totalLabel": "Your total" }, "bundle.totalLabel")).toBe("Your total");
  });

  it("substitutes vars on overrides", () => {
    expect(tWith({ "qb.tierLabel": "Get {qty} now" }, "qb.tierLabel", { qty: 5 })).toBe("Get 5 now");
  });

  it("leaves unknown placeholders intact in overrides", () => {
    expect(tWith({ "qb.tierLabel": "Get {qty} {flavor}" }, "qb.tierLabel", { qty: 5 }))
      .toBe("Get 5 {flavor}");
  });
});

describe("bundle.savingsBadge i18n key", () => {
  it("exists with a {savings} placeholder", () => {
    setLocale("en");
    const result = t("bundle.savingsBadge", { savings: "$5.00" });
    expect(result).not.toBe("bundle.savingsBadge"); // must not fall through
    expect(result).toContain("$5.00");
  });
});
