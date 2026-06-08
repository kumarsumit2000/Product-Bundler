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
  linkedProgressiveGiftId?: string | null;
  addonsOrder?: string[] | null;
  freeGiftVariantId?: string | null;
  freeGiftVariantTitle?: string | null;
  freeGiftAvailable?: boolean | null;
  freeGiftMinQty?: number | null;
  freeGiftProductId?: string | null;
  freeGiftProductTitle?: string | null;
  freeGiftProductImage?: string | null;
  freeGiftProductVariants?: Array<{
    variantId: string;
    title: string;
    available: boolean;
    priceCents: number;
  }> | null;
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
  tiers: Array<{
    qty: number;
    discountType: string;
    discountValue: number;
    label: string;
    isMostPopular: boolean;
    available: boolean;
    freeGiftVariantId?: string | null;
    freeGiftVariantTitle?: string | null;
    freeGiftAvailable?: boolean | null;
    bogo?: {
      mode: "add_same" | "add_different" | "nth_free";
      targetVariantId?: string | null;
      bonusQty: number;
      targetAvailable?: boolean | null;
      targetVariantTitle?: string | null;
    } | null;
    extraProducts?: Array<{
      productId: string;
      variantId: string | null;
      qty: number;
      title?: string;
      image?: string | null;
    }>;
  }>;
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
  linkedProgressiveGiftId?: string | null;
  addonsOrder?: string[] | null;
  freeGiftVariantId?: string | null;
  freeGiftVariantTitle?: string | null;
  freeGiftAvailable?: boolean | null;
  freeGiftMinQty?: number | null;
  freeGiftProductId?: string | null;
  freeGiftProductTitle?: string | null;
  freeGiftProductImage?: string | null;
  freeGiftProductVariants?: Array<{
    variantId: string;
    title: string;
    available: boolean;
    priceCents: number;
  }> | null;
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

const MOCK_PRODUCT_TITLES = [
  "Sample product",
  "Sample add-on",
  "Sample accessory",
  "Sample combo item",
  "Sample bundle pick",
  "Sample variant",
  "Sample extra",
  "Sample bonus item",
];

function mockBundleProducts(count: number): ProductRef[] {
  return Array.from({ length: count }, (_, i) => ({
    productId: `gid://shopify/Product/preview-${i}`,
    variantId: `preview-v-${i}`,
    qty: 1,
    title: MOCK_PRODUCT_TITLES[i % MOCK_PRODUCT_TITLES.length]!,
    image: null,
    available: true,
    priceCents: 4999,
  }));
}

function mockCollectionProducts(count: number): CollectionProduct[] {
  return Array.from({ length: count }, (_, i) => ({
    productId: `gid://shopify/Product/preview-${i}`,
    variantId: `preview-v-${i}`,
    title: MOCK_PRODUCT_TITLES[i % MOCK_PRODUCT_TITLES.length]!,
    image: null,
    available: true,
    priceCents: 4999,
  }));
}

export function buildPreviewBundleConfig(args: {
  shop: string;
  mockProduct: MockProduct;
  settings: Settings;
  bundle: BundleShape;
  addons?: AddonsShape;
}) {
  // Pre-populate the preview iframe with mock products when the merchant
  // hasn't picked any yet — otherwise the renderer bails out (classic) or
  // shows "not enough stock" (mix & match) and the preview pane looks empty.
  let bundle = args.bundle;
  if (bundle.mode === "classic" && bundle.products.length === 0) {
    bundle = { ...bundle, products: mockBundleProducts(2) };
  } else if (
    bundle.mode === "mix_match" &&
    (bundle.collectionProducts === null || bundle.collectionProducts.length === 0)
  ) {
    const target = bundle.targetQty ?? 3;
    bundle = { ...bundle, collectionProducts: mockCollectionProducts(Math.max(target + 2, 6)) };
  }

  return {
    shop: args.shop,
    settings: args.settings,
    bundles: [bundle],
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

type BxgyShape = {
  id: string;
  name: string;
  productId: string;
  productTitle: string;
  productImage: string | null;
  productVariants: Array<{ variantId: string; title: string; available: boolean; priceCents: number }>;
  bars: Array<{
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
  }>;
  combinable: boolean;
  headline: string | null;
  ctaLabel: string | null;
  styleOverrides?: Record<string, unknown> | null;
  textOverrides?: Record<string, string> | null;
  linkedProgressiveGiftId?: string | null;
  addonsOrder?: string[] | null;
  freeGiftVariantId?: string | null;
  freeGiftVariantTitle?: string | null;
  freeGiftAvailable?: boolean | null;
  freeGiftMinBuyQty?: number | null;
  freeGiftProductId?: string | null;
  freeGiftProductTitle?: string | null;
  freeGiftProductImage?: string | null;
  freeGiftProductVariants?: Array<{
    variantId: string;
    title: string;
    available: boolean;
    priceCents: number;
  }> | null;
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
};

export function buildPreviewBxgyConfig(args: {
  shop: string;
  mockProduct: MockProduct;
  settings: Settings;
  offer: BxgyShape;
  addons?: AddonsShape;
}) {
  return {
    shop: args.shop,
    settings: args.settings,
    bundles: [],
    quantityBreaks: [],
    bxgyOffers: [{
      ...args.offer,
      // Force visibility=all so the preview iframe renders regardless of
      // the saved visibility scope (mirrors QB preview behavior).
      visibility: "all" as const,
      visibilityProductIds: [] as string[],
      visibilityCollectionIds: [] as string[],
    }],
    countdowns: args.addons?.countdowns ?? [],
    progressiveGifts: args.addons?.progressiveGifts ?? [],
  };
}
