import { describe, it, expect } from "vitest";
import { buildStyleOverrides, EMPTY_STYLE_FORM } from "../app/lib/preview-overrides";

describe("buildStyleOverrides — CTA button colors", () => {
  it("emits set CTA button colors and omits empty ones", () => {
    const form = {
      ...EMPTY_STYLE_FORM,
      ctaBg: "#112233",
      buyNowText: "#ffeedd",
    };

    const out = buildStyleOverrides(form);

    expect(out).not.toBeNull();
    expect(out).toMatchObject({ ctaBg: "#112233", buyNowText: "#ffeedd" });
    expect(out).not.toHaveProperty("ctaText");
    expect(out).not.toHaveProperty("buyNowBg");
  });
});
