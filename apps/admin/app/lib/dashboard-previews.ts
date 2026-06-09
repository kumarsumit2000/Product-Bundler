// Builds live-widget preview configs for the 5 featured template cards on the
// dashboard (app._index). Each entry returns the iframe `type` and a widget
// `config` matching what the edit-form routes feed to PreviewPane — so the
// cards render the REAL storefront widget instead of a static mockup.
//
// Pure + client-safe: only imports the client-safe preview-config helpers and
// the template presets. The dashboard's color-theme swatch is threaded in via
// `themeColor` so each live widget tints to the selected accent.

import {
  buildPreviewQbConfig,
  buildPreviewBxgyConfig,
  buildPreviewBundleConfig,
  defaultPreviewSettings,
} from "./preview-config";
import { qbTemplate, bxgyTemplate, bundleTemplate } from "./template-presets";
import { EMPTY_SUBSCRIPTION } from "./parse-subscription";

// $24.95 so the rendered numbers match the dashboard design.
const MOCK_PRICE_CENTS = 2495;
const MOCK_PRODUCT_ID = "gid://shopify/Product/0";
const MOCK_VARIANT_ID = "preview-v-0";

type ThemeColor = string;

type PreviewResult = { type: "qb" | "bxgy" | "bundle" | "mix_match"; config: unknown };

function previewSettings(themeColor: ThemeColor) {
  return {
    ...defaultPreviewSettings(),
    primaryColor: themeColor,
    currency: "USD",
  };
}

const mockProduct = () => ({
  productId: MOCK_PRODUCT_ID,
  title: "Sample product",
  priceCents: MOCK_PRICE_CENTS,
});

// Single mock variant shared by every QB / BXGY preview.
const mockVariants = () => [
  { variantId: MOCK_VARIANT_ID, title: "Default", available: true, priceCents: MOCK_PRICE_CENTS },
];

// ---- QB tier helper -----------------------------------------------------
type QbTierInput = {
  qty: number;
  discountValue: number;
  label: string;
  isMostPopular?: boolean;
  freeGiftVariantId?: string | null;
  freeGiftVariantTitle?: string | null;
  freeGiftAvailable?: boolean | null;
};

function qbTier(t: QbTierInput) {
  return {
    qty: t.qty,
    discountType: "percentage" as const,
    discountValue: t.discountValue,
    label: t.label,
    isMostPopular: t.isMostPopular ?? false,
    available: true,
    freeGiftVariantId: t.freeGiftVariantId ?? null,
    freeGiftVariantTitle: t.freeGiftVariantTitle ?? null,
    freeGiftAvailable: t.freeGiftAvailable ?? null,
    bogo: null,
    extraProducts: [],
  };
}

// Base QB shape shared by the three QB-flavored cards. Caller supplies tiers
// (and optional subscription) and we fill the widget-only fields with mocks.
function qbConfig(
  themeColor: ThemeColor,
  opts: {
    name: string;
    headline: string;
    tiers: ReturnType<typeof qbTier>[];
    subscription?: typeof EMPTY_SUBSCRIPTION;
  },
): PreviewResult {
  const config = buildPreviewQbConfig({
    shop: "preview",
    mockProduct: mockProduct(),
    settings: previewSettings(themeColor),
    qb: {
      id: "template",
      name: opts.name,
      productId: MOCK_PRODUCT_ID,
      productTitle: "Sample product",
      productImage: null,
      productVariants: mockVariants(),
      tiers: opts.tiers,
      combinable: false,
      styleOverrides: null,
      textOverrides: null,
      headline: opts.headline,
      ctaLabel: null,
      ...(opts.subscription ? { subscription: opts.subscription } : {}),
    } as Parameters<typeof buildPreviewQbConfig>[0]["qb"],
  });
  return { type: "qb", config };
}

// ---- Per-key builders ---------------------------------------------------

function buyMoreSaveMore(themeColor: ThemeColor): PreviewResult {
  // qb_volume_4 — 4 tiers qty 1/2/3/4, 0/20/30/40% off, tier 4 most popular.
  return qbConfig(themeColor, {
    name: "Buy More Save More",
    headline: "Buy more, save more",
    tiers: [
      qbTier({ qty: 1, discountValue: 0, label: "Standard price" }),
      qbTier({ qty: 2, discountValue: 20, label: "20% OFF" }),
      qbTier({ qty: 3, discountValue: 30, label: "30% OFF" }),
      qbTier({ qty: 4, discountValue: 40, label: "40% OFF", isMostPopular: true }),
    ],
  });
}

function bogoOffers(themeColor: ThemeColor): PreviewResult {
  // bxgy — Buy 1 (standard) / Buy 2 Get 1 Free / Buy 3 Get 2 Free.
  const preset = bxgyTemplate("bxgy");
  const bars = [
    {
      id: "bar-1",
      buyQty: 1,
      buyDiscountPercent: 0,
      getQty: 0,
      getDiscountPercent: 0,
      title: "Buy 1",
      subtitle: "",
      badgeStyle: "none" as const,
      badgeText: "",
      label: "",
      isMostPopular: false,
    },
    {
      id: "bar-2",
      buyQty: 2,
      buyDiscountPercent: 0,
      getQty: 1,
      getDiscountPercent: 100,
      title: "Buy 2 Get 1 Free!",
      subtitle: "",
      badgeStyle: "save_percent" as const,
      badgeText: "SAVE {{saved_percentage}}",
      label: "",
      isMostPopular: false,
    },
    {
      id: "bar-3",
      buyQty: 3,
      buyDiscountPercent: 0,
      getQty: 2,
      getDiscountPercent: 100,
      title: "Buy 3 Get 2 Free!",
      subtitle: "",
      badgeStyle: "save_percent" as const,
      badgeText: "SAVE {{saved_percentage}}",
      label: "",
      isMostPopular: true,
    },
  ];
  const config = buildPreviewBxgyConfig({
    shop: "preview",
    mockProduct: mockProduct(),
    settings: previewSettings(themeColor),
    offer: {
      id: "template",
      name: preset?.name ?? "BOGO Offers",
      productId: MOCK_PRODUCT_ID,
      productTitle: "Sample product",
      productImage: null,
      productVariants: mockVariants(),
      bars,
      combinable: false,
      headline: preset?.headline ?? "Pick your deal",
      ctaLabel: null,
      styleOverrides: null,
      textOverrides: null,
    } as Parameters<typeof buildPreviewBxgyConfig>[0]["offer"],
  });
  return { type: "bxgy", config };
}

function unlockFreeGifts(themeColor: ThemeColor): PreviewResult {
  // qb_free_gift — Single / Duo (most popular, with a free gift on the tier).
  return qbConfig(themeColor, {
    name: "Unlock Free Gifts",
    headline: "Buy more, unlock a free gift",
    tiers: [
      qbTier({ qty: 1, discountValue: 0, label: "Single" }),
      qbTier({
        qty: 2,
        discountValue: 20,
        label: "Duo",
        isMostPopular: true,
        freeGiftVariantId: "preview-gift-v-0",
        freeGiftVariantTitle: "Free gift",
        freeGiftAvailable: true,
      }),
    ],
  });
}

function subscribeSave(themeColor: ThemeColor): PreviewResult {
  // qb_subscribe — 1 Pack / 2 Packs (20% off) + Subscribe & Save options.
  return qbConfig(themeColor, {
    name: "Subscribe & Save",
    headline: "Subscribe & Save",
    tiers: [
      qbTier({ qty: 1, discountValue: 0, label: "1 Pack" }),
      qbTier({ qty: 2, discountValue: 20, label: "2 Packs", isMostPopular: true }),
    ],
    subscription: {
      ...EMPTY_SUBSCRIPTION,
      enabled: true,
      heading: "Purchase Options",
      title: "Subscribe & Save",
      subtitle: "Cancel anytime",
      details: "Enjoy flexible billing & discounts",
      widgetStyle: "modern",
      showDiscountLabel: true,
      hideThirdPartyWidget: false,
    },
  });
}

function bundleSave(themeColor: ThemeColor): PreviewResult {
  // mix_match — "pick any 3". buildPreviewBundleConfig auto-fills mock
  // collectionProducts when empty, so we pass collectionProducts: null.
  const preset = bundleTemplate("mix_match");
  const config = buildPreviewBundleConfig({
    shop: "preview",
    mockProduct: mockProduct(),
    settings: previewSettings(themeColor),
    bundle: {
      id: "template",
      name: preset?.name ?? "Bundle & Save",
      mode: "mix_match",
      products: [],
      collectionId: null,
      targetQty: preset?.targetQty ? parseInt(preset.targetQty, 10) : 3,
      collectionProducts: null,
      discountType: (preset?.discountType ?? "percentage") as "percentage" | "flat" | "fixed_total",
      discountValue: preset ? parseFloat(preset.discountValue) : 25,
      combinable: false,
      triggerProductIds: [],
      headline: preset?.headline ?? "Pick any 3 — save 25%",
      ctaLabel: null,
      styleOverrides: null,
      textOverrides: null,
    } as Parameters<typeof buildPreviewBundleConfig>[0]["bundle"],
  });
  return { type: "mix_match", config };
}

const BUILDERS: Record<string, (themeColor: ThemeColor) => PreviewResult> = {
  qb_volume_4: buyMoreSaveMore,
  bxgy: bogoOffers,
  qb_free_gift: unlockFreeGifts,
  qb_subscribe: subscribeSave,
  mix_match: bundleSave,
};

export function buildTemplatePreview(key: string, themeColor: ThemeColor): PreviewResult {
  const build = BUILDERS[key] ?? buyMoreSaveMore;
  return build(themeColor);
}
