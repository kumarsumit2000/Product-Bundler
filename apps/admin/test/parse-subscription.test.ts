import { describe, it, expect } from "vitest";
import { parseSubscriptionForm, EMPTY_SUBSCRIPTION } from "../app/lib/parse-subscription";

describe("parseSubscriptionForm", () => {
  it("returns null for null/empty input", () => {
    expect(parseSubscriptionForm(null)).toBeNull();
    expect(parseSubscriptionForm("")).toBeNull();
  });

  it("round-trips a valid config", () => {
    const raw = JSON.stringify({ ...EMPTY_SUBSCRIPTION, enabled: true, title: "Subscribe & Save" });
    expect(parseSubscriptionForm(raw)).toEqual({ ...EMPTY_SUBSCRIPTION, enabled: true, title: "Subscribe & Save" });
  });

  it("coerces an invalid widgetStyle to 'modern' and fills missing copy from defaults", () => {
    const raw = JSON.stringify({ enabled: true, widgetStyle: "bogus" });
    const out = parseSubscriptionForm(raw)!;
    expect(out.widgetStyle).toBe("modern");
    expect(out.heading).toBe(EMPTY_SUBSCRIPTION.heading);
  });

  it("returns null for malformed JSON", () => {
    expect(parseSubscriptionForm("{not json")).toBeNull();
  });
});
