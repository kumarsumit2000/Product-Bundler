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
    case "qb_tiered_5":
      return {
        name: "Tiered savings (5 tiers)",
        headline: "Buy more, save more",
        ctaLabel: "",
        tiers: [
          { qty: 2, discountType: "percentage", discountValue: 5, label: "Save 5%", isMostPopular: false },
          { qty: 3, discountType: "percentage", discountValue: 10, label: "Save 10%", isMostPopular: false },
          { qty: 5, discountType: "percentage", discountValue: 15, label: "Save 15%", isMostPopular: true },
          { qty: 8, discountType: "percentage", discountValue: 20, label: "Save 20%", isMostPopular: false },
          { qty: 12, discountType: "percentage", discountValue: 25, label: "Save 25%", isMostPopular: false },
        ],
      };
    case "qb_b2b_bulk":
      return {
        name: "B2B bulk pricing",
        headline: "Wholesale pricing",
        ctaLabel: "",
        tiers: [
          { qty: 10, discountType: "percentage", discountValue: 10, label: "10+ units — 10% off", isMostPopular: false },
          { qty: 25, discountType: "percentage", discountValue: 15, label: "25+ units — 15% off", isMostPopular: true },
          { qty: 50, discountType: "percentage", discountValue: 20, label: "50+ units — 20% off", isMostPopular: false },
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
    case "bundle_3_for_x":
      return {
        name: "3 for $59",
        headline: "Get any 3 for $59",
        ctaLabel: "",
        discountType: "fixed_total",
        discountValue: "59",
      };
    case "mix_match_5":
      return {
        name: "Mix & match — pick any 5",
        headline: "Pick any 5 — save 30%",
        ctaLabel: "",
        discountType: "percentage",
        discountValue: "30",
        mode: "mix_match",
        targetQty: "5",
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

export type BxgyBarPreset = {
  id: string;
  buyQty: number;
  buyDiscountPercent: number;
  getQty: number;
  getDiscountPercent: number;
  title: string;
  subtitle: string;
  badgeStyle: "save_percent" | "save_amount" | "custom" | "none";
  badgeText: string;
  label: string;
  isMostPopular: boolean;
};

export type BxgyTemplate = {
  name: string;
  headline: string;
  ctaLabel: string;
  bars: BxgyBarPreset[];
};

const DEFAULT_BAR_BADGE: Pick<BxgyBarPreset, "badgeStyle" | "badgeText"> = {
  badgeStyle: "save_percent",
  badgeText: "SAVE {{saved_percentage}}",
};

export function bxgyTemplate(template: string | null): BxgyTemplate | null {
  switch (template) {
    case "bxgy":
    case "bxgy_classic":
      return {
        name: "Buy X, get Y",
        headline: "Pick your deal",
        ctaLabel: "",
        bars: [
          { id: "bar-1", buyQty: 1, buyDiscountPercent: 0, getQty: 1, getDiscountPercent: 100, title: "Buy 1, get 1 free", subtitle: "", ...DEFAULT_BAR_BADGE, label: "", isMostPopular: false },
          { id: "bar-2", buyQty: 2, buyDiscountPercent: 0, getQty: 3, getDiscountPercent: 100, title: "Buy 2, get 3 free", subtitle: "", ...DEFAULT_BAR_BADGE, label: "", isMostPopular: false },
          { id: "bar-3", buyQty: 3, buyDiscountPercent: 0, getQty: 6, getDiscountPercent: 100, title: "Buy 3, get 6 free", subtitle: "", ...DEFAULT_BAR_BADGE, label: "", isMostPopular: true },
        ],
      };
    case "bxgy_b2g1":
      return {
        name: "Buy 2, get 1 free",
        headline: "Buy 2, get 1 free",
        ctaLabel: "",
        bars: [
          { id: "bar-1", buyQty: 2, buyDiscountPercent: 0, getQty: 1, getDiscountPercent: 100, title: "Buy 2, get 1 free", subtitle: "", ...DEFAULT_BAR_BADGE, label: "", isMostPopular: true },
        ],
      };
    case "bxgy_50_second":
      return {
        name: "Buy 1, get 50% off second",
        headline: "Buy 1, get the second 50% off",
        ctaLabel: "",
        bars: [
          { id: "bar-1", buyQty: 1, buyDiscountPercent: 0, getQty: 1, getDiscountPercent: 50, title: "Buy 1, second 50% off", subtitle: "", ...DEFAULT_BAR_BADGE, label: "", isMostPopular: true },
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
