import { describe, it, expect } from "vitest";
import { serializeTierForm } from "../app/lib/serialize-qb-tier";

const base = { qty: 2, discountType: "percentage" as const, discountValue: 20, label: "Buy 2", isMostPopular: false, enabled: true };

describe("serializeTierForm", () => {
  it("builds bogo from the flat bogo* fields", () => {
    const out = serializeTierForm({ ...base, bogoMode: "add_different", bogoTargetVariant: { variantId: "gid://v/9" } as never, bogoBonusQty: 2 });
    expect(out.bogo).toEqual({ mode: "add_different", targetVariantId: "gid://v/9", bonusQty: 2 });
  });
  it("omits bogo when bogoMode is empty", () => {
    const out = serializeTierForm({ ...base, bogoMode: "" });
    expect(out.bogo).toBeUndefined();
  });
  it("builds freeGiftVariantId from freeGiftVariant", () => {
    const out = serializeTierForm({ ...base, freeGiftVariant: { variantId: "gid://v/3" } as never });
    expect(out.freeGiftVariantId).toBe("gid://v/3");
  });
  it("passes through qty/discount/label/isMostPopular/enabled", () => {
    const out = serializeTierForm({ ...base });
    expect(out).toMatchObject({ qty: 2, discountType: "percentage", discountValue: 20, label: "Buy 2", isMostPopular: false, enabled: true });
    expect(out.bogo).toBeUndefined();
    expect(out.freeGiftVariantId).toBeUndefined();
  });
  it("carries image and freeShipping", () => {
    const out = serializeTierForm({ qty: 3, discountType: "percentage", discountValue: 10, label: "", isMostPopular: false, image: "https://cdn/x.png", freeShipping: true } as never);
    expect(out.image).toBe("https://cdn/x.png");
    expect(out.freeShipping).toBe(true);
  });
  it("omits image/freeShipping when unset/false", () => {
    const out = serializeTierForm({ qty: 1, discountType: "percentage", discountValue: 0, label: "", isMostPopular: false } as never);
    expect(out.image).toBeUndefined();
    expect(out.freeShipping).toBeUndefined();
  });
  it("carries soldOut and priceRounding", () => {
    const out = serializeTierForm({ qty: 2, discountType: "percentage", discountValue: 20, label: "", isMostPopular: false, soldOut: true, priceRounding: 99 } as never);
    expect(out.soldOut).toBe(true);
    expect(out.priceRounding).toBe(99);
  });
  it("omits soldOut/priceRounding when unset/false", () => {
    const out = serializeTierForm({ qty: 1, discountType: "percentage", discountValue: 0, label: "", isMostPopular: false } as never);
    expect(out.soldOut).toBeUndefined();
    expect(out.priceRounding).toBeUndefined();
  });
});
