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
  freeGiftMinQty?: number;
  freeGiftEnabled?: boolean;
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
          // discountValue stays at 0 on BOGO tiers — the bonus quantity IS
          // the deal. Adding a tier discount on top would double-discount
          // the paid line.
          { qty: 1, discountType: "percentage", discountValue: 0, label: "Buy 1, get 1 free", isMostPopular: false, bogoMode: "add_same", bogoBonusQty: 1 },
          { qty: 2, discountType: "percentage", discountValue: 0, label: "Buy 2, get 3 free", isMostPopular: false, bogoMode: "add_same", bogoBonusQty: 3 },
          { qty: 3, discountType: "percentage", discountValue: 0, label: "Buy 3, get 6 free + FREE gift", isMostPopular: true, bogoMode: "add_same", bogoBonusQty: 6 },
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
    case "bogo_simple":
      return {
        name: "Buy 1, get 1 free",
        headline: "Buy one, get one free",
        ctaLabel: "",
        tiers: [
          // BOGO bonus alone does the work — tier discount stays 0 to avoid
          // double-discounting the paid line.
          { qty: 1, discountType: "percentage", discountValue: 0, label: "Buy 1, get 1 free", isMostPopular: true, bogoMode: "add_same", bogoBonusQty: 1 },
        ],
      };
    case "qb_volume_4":
      return {
        name: "Volume discount",
        headline: "Buy more, save more",
        ctaLabel: "",
        tiers: [
          { qty: 1, discountType: "percentage", discountValue: 0, label: "Single", isMostPopular: false },
          { qty: 2, discountType: "percentage", discountValue: 10, label: "Save 10%", isMostPopular: false },
          { qty: 4, discountType: "percentage", discountValue: 20, label: "Save 20%", isMostPopular: true },
          { qty: 8, discountType: "percentage", discountValue: 30, label: "Save 30%", isMostPopular: false },
        ],
      };
    case "qb_free_gift":
      return {
        name: "Free gift with order",
        headline: "Buy more, unlock a free gift",
        ctaLabel: "",
        freeGiftEnabled: true,
        freeGiftMinQty: 3,
        tiers: [
          { qty: 1, discountType: "percentage", discountValue: 0, label: "Standard", isMostPopular: false },
          { qty: 2, discountType: "percentage", discountValue: 10, label: "Save 10%", isMostPopular: false },
          { qty: 3, discountType: "percentage", discountValue: 20, label: "Save 20% + FREE gift", isMostPopular: true },
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
  mode?: "classic" | "mix_match";
  targetQty?: string;
};

export function bundleTemplate(template: string | null): BundleTemplate | null {
  switch (template) {
    case "bundle":
      return {
        name: "Complete the bundle",
        headline: "Complete the bundle",
        ctaLabel: "",
        discountType: "percentage",
        discountValue: "20",
      };
    case "mix_match":
      return {
        name: "Mix & match",
        headline: "Pick any 3 — save 25%",
        ctaLabel: "",
        discountType: "percentage",
        discountValue: "25",
        mode: "mix_match",
        targetQty: "3",
      };
    case "bundle_2":
      return {
        name: "Frequently bought together",
        headline: "Frequently bought together",
        ctaLabel: "",
        discountType: "percentage",
        discountValue: "10",
      };
    default:
      return null;
  }
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
  switch (template) {
    case "progressive":
      return {
        name: "Progressive gifts",
        headline: "🎁 Unlock free gifts with your order",
        thresholds: [
          { minSpendCents: 5_000, kind: "free_shipping", label: "FREE" },
          { minSpendCents: 10_000, kind: "free_gift", label: "FREE" },
          { minSpendCents: 20_000, kind: "free_gift", label: "FREE" },
        ],
      };
    case "free_shipping_bar":
      return {
        name: "Free shipping bar",
        headline: "🚚 Free shipping over $50",
        thresholds: [
          { minSpendCents: 5_000, kind: "free_shipping", label: "FREE" },
        ],
      };
    case "spend_unlock":
      return {
        name: "Spend & unlock",
        headline: "Spend more, unlock more",
        thresholds: [
          { minSpendCents: 7_500, kind: "free_shipping", label: "FREE" },
          { minSpendCents: 15_000, kind: "free_gift", label: "FREE" },
          { minSpendCents: 30_000, kind: "free_gift", label: "FREE" },
        ],
      };
    default:
      return null;
  }
}

export type CountdownTemplate = {
  name: string;
  headline: string;
  expiredHeadline: string;
  layout: "inline" | "bar";
  daysFromNow: number;
};

export function countdownTemplate(template: string | null): CountdownTemplate | null {
  switch (template) {
    case "countdown_sale":
      return {
        name: "Sale countdown",
        headline: "Sale ends in",
        expiredHeadline: "This deal has ended",
        layout: "inline",
        daysFromNow: 7,
      };
    case "countdown_bar":
      return {
        name: "Top bar countdown",
        headline: "🔥 Limited-time offer ends in",
        expiredHeadline: "Offer ended",
        layout: "bar",
        daysFromNow: 3,
      };
    default:
      return null;
  }
}
