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
  styleOverrides: Record<string, unknown> | null;
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
  styleOverrides: Record<string, unknown> | null;
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

export type WidgetConfig = {
  shop: string;
  settings: Settings;
  bundles: BundleConfig[];
  quantityBreaks: QbConfig[];
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
