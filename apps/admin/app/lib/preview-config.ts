type Settings = {
  primaryColor: string;
  textColor: string;
  backgroundColor: string;
  borderRadius: number;
  fontFamily: string;
  bundleHeadline: string;
  qbHeadline: string;
  showCompareAtPrice: boolean;
  currency: string;
  locale: string;
};

type ProductRef = {
  productId: string;
  variantId: string | null;
  qty: number;
  title: string;
  image: string | null;
  available: boolean;
  priceCents: number;
};

type CollectionProduct = {
  productId: string;
  variantId: string | null;
  title: string;
  image: string | null;
  available: boolean;
  priceCents: number;
};

type BundleShape = {
  id: string;
  name: string;
  mode: "classic" | "mix_match";
  products: ProductRef[];
  collectionId: string | null;
  targetQty: number | null;
  collectionProducts: CollectionProduct[] | null;
  discountType: "percentage" | "flat" | "fixed_total";
  discountValue: number;
  combinable: boolean;
  triggerProductIds: string[];
  headline: string | null;
  ctaLabel: string | null;
  styleOverrides: Record<string, unknown> | null;
  textOverrides: Record<string, string> | null;
  linkedCountdownId?: string | null;
  linkedProgressiveGiftId?: string | null;
  addonsOrder?: string[] | null;
  freeGiftVariantId?: string | null;
  freeGiftVariantTitle?: string | null;
  freeGiftAvailable?: boolean | null;
};

type AddonsShape = {
  countdowns?: Array<{
    id: string;
    name: string;
    endAt: number;
    headline: string;
    expiredHeadline: string;
    layout: "inline" | "bar";
    styleOverrides: Record<string, unknown> | null;
  }>;
  progressiveGifts?: Array<{
    id: string;
    name: string;
    headline: string | null;
    subtitle: string | null;
    layout: "stacked" | "grid" | "inline";
    hideLocked: boolean;
    showLockedLabels: boolean;
    styleOverrides: Record<string, unknown> | null;
    thresholds: Array<Record<string, unknown>>;
  }>;
};

type QbShape = {
  id: string;
  name: string;
  productId: string;
  productTitle: string;
  productImage: string | null;
  productVariants: Array<{ variantId: string; title: string; available: boolean; priceCents: number }>;
  tiers: Array<{ qty: number; discountType: string; discountValue: number; label: string; isMostPopular: boolean; available: boolean }>;
  combinable: boolean;
  styleOverrides: Record<string, unknown> | null;
  textOverrides: Record<string, string> | null;
  headline: string | null;
  ctaLabel: string | null;
  checkboxUpsellsEnabled?: boolean;
  checkboxUpsells?: Array<{
    id: string;
    productId: string;
    variantId: string | null;
    productTitle: string;
    productImage: string | null;
    productPriceCents: number | null;
    discountType: "percentage" | "flat";
    discountValue: number;
    title: string;
    subtitle: string;
  }>;
  linkedCountdownId?: string | null;
  linkedProgressiveGiftId?: string | null;
  addonsOrder?: string[] | null;
};

type MockProduct = { productId: string; title: string; priceCents: number };

export function defaultMockProduct(): MockProduct {
  return { productId: "gid://shopify/Product/0", title: "Sample product", priceCents: 4999 };
}

export function defaultPreviewSettings(): Settings {
  return {
    primaryColor: "#7B1E2A",
    textColor: "#1A1A1A",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    fontFamily: "inherit",
    bundleHeadline: "Frequently bought together",
    qbHeadline: "Choose your savings",
    showCompareAtPrice: true,
    currency: "USD",
    locale: "en",
  };
}

export function buildPreviewBundleConfig(args: {
  shop: string;
  mockProduct: MockProduct;
  settings: Settings;
  bundle: BundleShape;
  addons?: AddonsShape;
}) {
  return {
    shop: args.shop,
    settings: args.settings,
    bundles: [args.bundle],
    quantityBreaks: [],
    countdowns: args.addons?.countdowns ?? [],
    progressiveGifts: args.addons?.progressiveGifts ?? [],
  };
}

export function buildPreviewQbConfig(args: {
  shop: string;
  mockProduct: MockProduct;
  settings: Settings;
  qb: QbShape;
  addons?: AddonsShape;
}) {
  return {
    shop: args.shop,
    settings: args.settings,
    bundles: [],
    // Force visibility=all in preview so the widget renders regardless of
    // the merchant's saved visibility choice (otherwise a "Specific products"
    // QB with no products picked would show as blank in the admin preview).
    quantityBreaks: [{
      ...args.qb,
      visibility: "all" as const,
      visibilityProductIds: [] as string[],
      visibilityCollectionIds: [] as string[],
    }],
    countdowns: args.addons?.countdowns ?? [],
    progressiveGifts: args.addons?.progressiveGifts ?? [],
  };
}
