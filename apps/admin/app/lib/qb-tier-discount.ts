import type { TierFormValue } from "../components/QbTierBuilder";

export type DiscountTab = "percentage" | "flat" | "fixed_per_unit" | "bogo" | "none";

export function tierDiscountTab(t: Pick<TierFormValue, "discountType" | "discountValue" | "bogoMode">): DiscountTab {
  if (t.bogoMode) return "bogo";
  if (t.discountType === "fixed_per_unit") return "fixed_per_unit";
  if (t.discountValue === 0) return "none";
  if (t.discountType === "flat") return "flat";
  return "percentage";
}

export function applyDiscountTab(t: TierFormValue, tab: DiscountTab): TierFormValue {
  const clearBogo = { bogoMode: "" as const, bogoTargetVariant: null };
  switch (tab) {
    case "percentage": return { ...t, ...clearBogo, discountType: "percentage" };
    case "flat": return { ...t, ...clearBogo, discountType: "flat" };
    case "fixed_per_unit": return { ...t, ...clearBogo, discountType: "fixed_per_unit" };
    case "none": return { ...t, ...clearBogo, discountType: "percentage", discountValue: 0 };
    case "bogo": return { ...t, discountType: "percentage", bogoMode: t.bogoMode ? t.bogoMode : "add_same", bogoBonusQty: t.bogoBonusQty ?? 1 };
  }
}
