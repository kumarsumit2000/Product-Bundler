export type DiscountType = "percentage" | "flat" | "fixed_total" | "fixed_per_unit";

export type ProductRef = {
  productId: string;
  variantId: string | null;
  qty: number;
  title: string;
  image: string | null;
  available: boolean;
  priceCents: number;
};

export type CollectionProduct = {
  productId: string;
  variantId: string | null;
  title: string;
  image: string | null;
  available: boolean;
  priceCents: number;
};

export type LayoutVariant = "list" | "grid";
export type FontStyle = "regular" | "medium" | "semibold" | "bold";

export type StyleOverrides = Partial<{
  // Layout
  layoutVariant: LayoutVariant;
  gridColumns: number;
  borderRadius: number;
  spacing: number;
  // Legacy 3-color shorthand
  primaryColor: string;
  textColor: string;
  backgroundColor: string;
  // General
  cardsBg: string;
  selectedBg: string;
  borderColor: string;
  blockTitleColor: string;
  // Bar texts
  titleColor: string;
  subtitleColor: string;
  priceColor: string;
  fullPriceColor: string;
  // Label
  labelBg: string;
  labelText: string;
  // Badge
  badgeBg: string;
  badgeText: string;
  // Free gift
  freeGiftBg: string;
  freeGiftText: string;
  freeGiftSelectedBg: string;
  freeGiftSelectedText: string;
  // Upsell
  upsellBg: string;
  upsellText: string;
  upsellSelectedBg: string;
  upsellSelectedText: string;
  // Typography
  blockTitleFontSize: number;
  blockTitleFontStyle: FontStyle;
  titleFontSize: number;
  titleFontStyle: FontStyle;
  subtitleFontSize: number;
  subtitleFontStyle: FontStyle;
  labelFontSize: number;
  labelFontStyle: FontStyle;
  freeGiftFontSize: number;
  freeGiftFontStyle: FontStyle;
  upsellFontSize: number;
  upsellFontStyle: FontStyle;
  unitLabelFontSize: number;
  unitLabelFontStyle: FontStyle;
}>;

export type TextOverrides = Record<string, string>;

export type SubscriptionConfig = {
  enabled: boolean;
  discountPercent: number;
  interval: "weekly" | "biweekly" | "monthly" | "quarterly";
};

export type BundleConfig = {
  id: string;
  name: string;
  mode: "classic" | "mix_match";
  products: ProductRef[];
  collectionId: string | null;
  targetQty: number | null;
  collectionProducts: CollectionProduct[] | null;
  discountType: DiscountType;
  discountValue: number;
  combinable: boolean;
  triggerProductIds: string[];
  headline: string | null;
  ctaLabel: string | null;
  styleOverrides: StyleOverrides | null;
  textOverrides: TextOverrides | null;
  freeGiftVariantId: string | null;
  freeGiftVariantTitle: string | null;
  freeGiftAvailable: boolean | null;
  subscription?: SubscriptionConfig | null;
};

export type QbVariant = {
  variantId: string;
  title: string;
  available: boolean;
  priceCents: number;
};

export type QbTier = {
  qty: number;
  discountType: DiscountType;
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
    targetVariantTitle?: string | null;
    targetAvailable?: boolean | null;
  } | null;
  extraProducts?: Array<{
    productId: string;
    variantId: string | null;
    qty: number;
    title?: string;
    image?: string | null;
  }>;
};

export type QbConfig = {
  id: string;
  name: string;
  productId: string;
  productTitle: string;
  productImage: string | null;
  productVariants: QbVariant[];
  tiers: QbTier[];
  combinable: boolean;
  styleOverrides: StyleOverrides | null;
  textOverrides: TextOverrides | null;
  headline: string | null;
  ctaLabel: string | null;
  subscription?: SubscriptionConfig | null;
};

export type Settings = {
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

export type NewsletterConfig = {
  headline: string;
  subtitle: string;
  placeholder: string;
  ctaLabel: string;
  successMessage: string;
  tags: string;
};

export type WidgetConfig = {
  shop: string;
  settings: Settings;
  bundles: BundleConfig[];
  quantityBreaks: QbConfig[];
  newsletter?: NewsletterConfig | null;
};

export type CartLine = {
  variantId: string;
  qty: number;
};

export type WidgetType = "bundle" | "qb" | "mix_match";

declare global {
  interface Window {
    _pumperConfig?: { shop: string; locale: string; currency: string; apiBase: string };
    _pumperPreview?: boolean;
    _pumperPreviewConfig?: WidgetConfig;
    _pumperRerender?: () => void;
  }
}
