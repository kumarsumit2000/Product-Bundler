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
}) {
  return {
    shop: args.shop,
    settings: args.settings,
    bundles: [args.bundle],
    quantityBreaks: [],
  };
}

export function buildPreviewQbConfig(args: {
  shop: string;
  mockProduct: MockProduct;
  settings: Settings;
  qb: QbShape;
}) {
  return {
    shop: args.shop,
    settings: args.settings,
    bundles: [],
    quantityBreaks: [args.qb],
  };
}
