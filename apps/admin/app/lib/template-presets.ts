// Template presets that hydrate the QB / Bundle / Progressive / Newsletter
// new-form initial values so a merchant who picks a card from /app/new lands
// on a form that already looks like the preview they clicked.

export type QbTemplateTier = {
  qty: number;
  discountType: "percentage" | "flat" | "fixed_per_unit";
  discountValue: number;
  label: string;
  isMostPopular: boolean;
  bogoMode?: "add_same" | "add_different" | "nth_free" | "";
  bogoBonusQty?: number;
};

export type QbTemplate = {
  name: string;
  headline: string;
  ctaLabel: string;
  tiers: QbTemplateTier[];
};

export function qbTemplate(template: string | null): QbTemplate | null {
  switch (template) {
    case "qb_same":
      return {
        name: "Quantity breaks",
        headline: "Choose your savings",
        ctaLabel: "",
        tiers: [
          { qty: 1, discountType: "percentage", discountValue: 0, label: "Standard price", isMostPopular: false },
          { qty: 2, discountType: "percentage", discountValue: 15, label: "Save 15%", isMostPopular: true },
          { qty: 3, discountType: "percentage", discountValue: 25, label: "Save 25%", isMostPopular: false },
        ],
      };
    case "bxgy":
      return {
        name: "Buy X, get Y",
        headline: "Pick your deal",
        ctaLabel: "",
        tiers: [
          { qty: 1, discountType: "percentage", discountValue: 50, label: "Buy 1, get 1 free", isMostPopular: false, bogoMode: "add_same", bogoBonusQty: 1 },
          { qty: 2, discountType: "percentage", discountValue: 60, label: "Buy 2, get 3 free", isMostPopular: false, bogoMode: "add_same", bogoBonusQty: 3 },
          { qty: 3, discountType: "percentage", discountValue: 67, label: "Buy 3, get 6 free + FREE gift", isMostPopular: true, bogoMode: "add_same", bogoBonusQty: 6 },
        ],
      };
    case "qb_diff":
      return {
        name: "Pack quantity breaks",
        headline: "Choose your pack",
        ctaLabel: "",
        tiers: [
          { qty: 1, discountType: "percentage", discountValue: 0, label: "1 pack", isMostPopular: false },
          { qty: 2, discountType: "percentage", discountValue: 15, label: "2 pack — Save 15%", isMostPopular: true },
          { qty: 3, discountType: "percentage", discountValue: 20, label: "3 pack — Save 20%", isMostPopular: false },
        ],
      };
    default:
      return null;
  }
}

export type BundleTemplate = {
  name: string;
  headline: string;
  ctaLabel: string;
  discountType: "percentage" | "flat" | "fixed_total";
  discountValue: string;
};

export function bundleTemplate(template: string | null): BundleTemplate | null {
  if (template !== "bundle") return null;
  return {
    name: "Complete the bundle",
    headline: "Complete the bundle",
    ctaLabel: "",
    discountType: "percentage",
    discountValue: "20",
  };
}

export type ProgressiveTemplate = {
  name: string;
  headline: string;
  thresholds: Array<{
    minSpendCents: number;
    kind: "free_gift" | "free_shipping";
    label: string;
  }>;
};

export function progressiveTemplate(template: string | null): ProgressiveTemplate | null {
  if (template !== "progressive") return null;
  return {
    name: "Progressive gifts",
    headline: "🎁 Unlock free gifts with your order",
    thresholds: [
      { minSpendCents: 5_000, kind: "free_shipping", label: "FREE" },
      { minSpendCents: 10_000, kind: "free_gift", label: "FREE" },
      { minSpendCents: 20_000, kind: "free_gift", label: "FREE" },
    ],
  };
}
