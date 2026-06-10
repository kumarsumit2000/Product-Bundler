import { describe, it, expect } from "vitest";
import { reorderTiers, duplicateTier, setMostPopular, setTierEnabled } from "../app/lib/qb-tier-ops";

const t = (qty: number, extra: Record<string, unknown> = {}) => ({ qty, discountType: "percentage", discountValue: 0, label: "", isMostPopular: false, ...extra });

describe("qb-tier-ops", () => {
  it("reorderTiers moves an item from one index to another", () => {
    const out = reorderTiers([t(1), t(2), t(3)], 0, 2);
    expect(out.map((x) => x.qty)).toEqual([2, 3, 1]);
  });
  it("duplicateTier inserts a clone after the original with isMostPopular forced false", () => {
    const out = duplicateTier([t(1, { isMostPopular: true }), t(2)], 0);
    expect(out.map((x) => x.qty)).toEqual([1, 1, 2]);
    expect(out[1]!.isMostPopular).toBe(false);
    expect(out[0]).not.toBe(out[1]);
  });
  it("setMostPopular sets one tier popular and clears the rest", () => {
    const out = setMostPopular([t(1, { isMostPopular: true }), t(2), t(3)], 2);
    expect(out.map((x) => x.isMostPopular)).toEqual([false, false, true]);
  });
  it("setTierEnabled toggles the enabled flag on one tier only", () => {
    const out = setTierEnabled([t(1), t(2)], 1, false);
    expect(out[0]!.enabled).toBeUndefined();
    expect(out[1]!.enabled).toBe(false);
  });
});
