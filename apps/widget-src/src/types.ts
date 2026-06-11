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
  tierBg: string;
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
  savingsFontSize: number;
}>;

export type TextOverrides = Record<string, string>;

export type SubscriptionConfig = {
  enabled: boolean;
  heading: string;
  title: string;
  subtitle: string;
  details: string;
  widgetStyle: "modern" | "classic";
  showDiscountLabel: boolean;
  hideThirdPartyWidget: boolean;
};

export type SellingPlanAllocation = { planId: string; priceCents: number };
export type SellingPlanGroup = { id: string; name: string; plans: { id: string; name: string }[] };

export type BundleConfig = {
  id: string;
  name: string;
  mode: "classic" | "mix_match";
  products: ProductRef[];
  collectionId: string | null;
  bindToCurrentCollection?: boolean;
  targetQty: number | null;
  collectionProducts: CollectionProduct[] | null;
  discountType: DiscountType;
  discountValue: number;
  combinable: boolean;
  triggerProductIds: string[];
  visibility?: "same_as_members" | "all" | "all_except" | "specific" | "collections";
  visibilityCollectionIds?: string[];
  headline: string | null;
  ctaLabel: string | null;
  styleOverrides: StyleOverrides | null;
  textOverrides: TextOverrides | null;
  freeGiftVariantId: string | null;
  freeGiftVariantTitle: string | null;
  freeGiftAvailable: boolean | null;
  freeGiftProductId?: string | null;
  freeGiftProductTitle?: string | null;
  freeGiftProductImage?: string | null;
  freeGiftProductVariants?: Array<{
    variantId: string;
    title: string;
    available: boolean;
    priceCents: number;
  }> | null;
  linkedCountdownId?: string | null;
  linkedProgressiveGiftId?: string | null;
  stickyAtc?: StickyAtcConfig | null;
  addonsOrder?: string[] | null;
  subscription?: SubscriptionConfig | null;
};

export type QbVariant = {
  variantId: string;
  title: string;
  available: boolean;
  priceCents: number;
  sellingPlanAllocations?: SellingPlanAllocation[];
};

export type QbTier = {
  qty: number;
  discountType: DiscountType;
  discountValue: number;
  label: string;
  isMostPopular: boolean;
  enabled?: boolean;
  image?: string;          // tier image URL (display only)
  freeShipping?: boolean;  // grant free shipping when this tier is the active tier
  soldOut?: boolean;        // manual "this tier is unavailable"
  priceRounding?: number;   // charm ending in cents (99 | 95 | 0); absent = no rounding
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

export type QbCheckboxUpsell = {
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
};

export type QbConfig = {
  id: string;
  name: string;
  productId: string;
  productTitle: string;
  productImage: string | null;
  productVariants: QbVariant[];
  bindToCurrentProduct?: boolean;
  tiers: QbTier[];
  combinable: boolean;
  styleOverrides: StyleOverrides | null;
  textOverrides: TextOverrides | null;
  headline: string | null;
  ctaLabel: string | null;
  visibility?: "all" | "all_except" | "specific" | "collections";
  visibilityProductIds?: string[];
  visibilityCollectionIds?: string[];
  checkboxUpsellsEnabled?: boolean;
  checkboxUpsells?: QbCheckboxUpsell[];
  linkedCountdownId?: string | null;
  linkedProgressiveGiftId?: string | null;
  stickyAtc?: StickyAtcConfig | null;
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

export type ProgressiveGiftStyleOverrides = Partial<{
  backgroundColor: string;
  borderColor: string;
  headingColor: string;
  textColor: string;
  progressFill: string;
  progressTrack: string;
  cardBg: string;
  cardBorder: string;
  cardBgInactive: string;
  cardBorderInactive: string;
  badgeBg: string;
  badgeBgInactive: string;
  badgeText: string;
  borderRadius: number;
  paddingX: number;
  paddingY: number;
}>;

export type ProgressiveGiftThreshold = {
  minSpendCents: number;
  kind: "free_gift" | "free_shipping";
  label: string;
  title: string | null;
  lockedTitle: string | null;
  labelCrossedOut: string | null;
  lockedLabel: string | null;
  iconUrl: string | null;
  giftProductId: string | null;
  giftVariantId: string | null;
  productTitle: string | null;
  productImage: string | null;
  variants: Array<{
    variantId: string;
    title: string;
    available: boolean;
    priceCents: number;
  }>;
};

export type ProgressiveGiftConfig = {
  id: string;
  name: string;
  headline: string | null;
  subtitle: string | null;
  layout: "stacked" | "grid" | "inline";
  hideLocked: boolean;
  showLockedLabels: boolean;
  styleOverrides: ProgressiveGiftStyleOverrides | null;
  thresholds: ProgressiveGiftThreshold[];
};

export type StickyAtcConfig = {
  enabled: boolean;
  showImage: boolean;
  showQty: boolean;
  showPrice: boolean;
  ctaLabel: string;
  backgroundColor: string;
  textColor: string;
  buttonBg: string;
  buttonText: string;
};

export type BxgyBarConfig = {
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

export type BxgyOfferConfig = {
  id: string;
  name: string;
  productId: string;
  productTitle: string;
  productImage: string | null;
  productVariants: QbVariant[];
  bindToCurrentProduct?: boolean;
  bars: BxgyBarConfig[];
  combinable: boolean;
  headline: string | null;
  ctaLabel: string | null;
  styleOverrides?: StyleOverrides | null;
  textOverrides?: TextOverrides | null;
  visibility?: "all" | "all_except" | "specific" | "collections";
  visibilityProductIds?: string[];
  visibilityCollectionIds?: string[];
  linkedCountdownId?: string | null;
  linkedProgressiveGiftId?: string | null;
  addonsOrder?: string[] | null;
  stickyAtc?: StickyAtcConfig | null;
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
  checkboxUpsells?: QbCheckboxUpsell[];
  subscription?: SubscriptionConfig | null;
};

export type WidgetConfig = {
  shop: string;
  settings: Settings;
  bundles: BundleConfig[];
  quantityBreaks: QbConfig[];
  bxgyOffers?: BxgyOfferConfig[];
  progressiveGifts?: ProgressiveGiftConfig[];
};

export type CartLine = {
  variantId: string;
  qty: number;
};

export type WidgetType = "bundle" | "qb" | "mix_match" | "bxgy";

declare global {
  interface Window {
    _pumperConfig?: {
      shop: string;
      locale: string;
      currency: string;
      apiBase: string;
      productId?: string;
      productTitle?: string;
      productImage?: string | null;
      productCollectionIds?: string[];
      productVariants?: QbVariant[];
      currentCollectionId?: string;
      currentCollectionProducts?: CollectionProduct[];
      customerId?: string;
      sellingPlanGroups?: SellingPlanGroup[];
      requiresSellingPlan?: boolean;
    };
    _pumperPreview?: boolean;
    _pumperPreviewConfig?: WidgetConfig;
    _pumperRerender?: () => void;
  }
}
