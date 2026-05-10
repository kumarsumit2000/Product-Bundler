import { sqliteTable, text, integer, real, index, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";

export const shops = sqliteTable("shops", {
  id: text("id").primaryKey(),
  scopes: text("scopes").notNull(),
  installedAt: integer("installed_at", { mode: "timestamp" }).notNull(),
  uninstalledAt: integer("uninstalled_at", { mode: "timestamp" }),
  plan: text("plan").notNull().default("free"),
  planActivatedAt: integer("plan_activated_at", { mode: "timestamp" }),
  trialEndsAt: integer("trial_ends_at", { mode: "timestamp" }),
  shopifyChargeId: text("shopify_charge_id"),
  shopifyDiscountId: text("shopify_discount_id"),
  shopifyDiscountIdCombinable: text("shopify_discount_id_combinable"),
  shopifyDiscountIdNonCombinable: text("shopify_discount_id_non_combinable"),
  shopifyShopGid: text("shopify_shop_gid"),
  currency: text("currency").notNull().default("USD"),
  primaryLocale: text("primary_locale").notNull().default("en"),
  attributedRevenueCents: integer("attributed_revenue_cents").notNull().default(0),
  monthlyOrderCount: integer("monthly_order_count").notNull().default(0),
  lifetimeOrderCount: integer("lifetime_order_count").notNull().default(0),
  monthlyOrderResetAt: integer("monthly_order_reset_at", { mode: "timestamp" }),
});

export type BundleProduct = {
  productId: string;
  variantId: string | null;
  qty: number;
  title?: string;
  image?: string;
};

export type QbTier = {
  qty: number;
  discountType: "percentage" | "flat" | "fixed_per_unit";
  discountValue: number;
  label: string;
  isMostPopular: boolean;
  freeGiftVariantId?: string;
  bogo?: {
    mode: "add_same" | "add_different" | "nth_free";
    targetVariantId?: string;
    bonusQty: number;
  };
  // Extra products bundled into this tier — drives the "Pack QB" pattern
  // ("3 pack" includes 1× base product + the listed extras). All extras get
  // added to cart with the tier's bundleId attribute when the tier is chosen.
  extraProducts?: BundleProduct[];
};

export type LayoutVariant = "list" | "grid";
export type FontStyle = "regular" | "medium" | "semibold" | "bold";

export type Subscription = {
  enabled: boolean;
  discountPercent: number;
  interval: "weekly" | "biweekly" | "monthly" | "quarterly";
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

export type StyleOverrides = Partial<{
  // Layout
  layoutVariant: LayoutVariant;
  gridColumns: number;
  borderRadius: number;
  spacing: number;

  // Legacy color shorthand (still honored by the widget today)
  primaryColor: string;
  textColor: string;
  backgroundColor: string;

  // General
  cardsBg: string;
  tierBg: string;
  selectedBg: string;
  borderColor: string;
  blockTitleColor: string;

  // Bar texts (per-tier display row)
  titleColor: string;
  subtitleColor: string;
  priceColor: string;
  fullPriceColor: string;
  // Savings pill on the right of each tier row
  savingsFontSize: number;

  // Label
  labelBg: string;
  labelText: string;

  // Badge ("Most popular" etc.)
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

  // Typography — font sizes in px, styles map to CSS font-weight via the widget.
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

export type BundleTextKey = "bundle.totalLabel" | "bundle.savingsBadge";
export type QbTextKey =
  | "qb.tierLabel"
  | "qb.savingsBadge"
  | "qb.mostPopular"
  | "qb.giftBadge";
export type TextOverrides = Partial<Record<BundleTextKey | QbTextKey, string>>;

export const bundles = sqliteTable("bundles", {
  id: text("id").primaryKey(),
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"),
  products: text("products", { mode: "json" }).$type<BundleProduct[]>().notNull(),
  discountType: text("discount_type").notNull(),
  discountValue: real("discount_value").notNull(),
  combinable: integer("combinable", { mode: "boolean" }).notNull().default(false),
  triggerProductIds: text("trigger_product_ids", { mode: "json" }).$type<string[]>().notNull(),
  styleOverrides: text("style_overrides", { mode: "json" }).$type<StyleOverrides | null>(),
  textOverrides: text("text_overrides", { mode: "json" }).$type<TextOverrides | null>(),
  headline: text("headline"),
  ctaLabel: text("cta_label"),
  freeGiftVariantId: text("free_gift_variant_id"),
  subscription: text("subscription", { mode: "json" }).$type<Subscription | null>(),
  mode: text("mode", { enum: ["classic", "mix_match"] }).notNull().default("classic"),
  collectionId: text("collection_id"),
  targetQty: integer("target_qty"),
  linkedCountdownId: text("linked_countdown_id"),
  linkedProgressiveGiftId: text("linked_progressive_gift_id"),
  stickyAtc: text("sticky_atc", { mode: "json" }).$type<StickyAtcConfig | null>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  shopIdx: index("bundles_shop_idx").on(t.shopId),
  statusIdx: index("bundles_status_idx").on(t.shopId, t.status),
}));

export type QbCheckboxUpsell = {
  id: string;
  mode: "selected" | "complementary";
  productId: string;
  variantId: string | null;
  productTitle: string;
  productImage: string | null;
  productPriceCents: number | null;
  discountType: "percentage" | "flat";
  discountValue: number;
  title: string;
  subtitle: string;
  selectedByDefault: boolean;
};

export const quantityBreaks = sqliteTable("quantity_breaks", {
  id: text("id").primaryKey(),
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"),
  productId: text("product_id").notNull(),
  collectionId: text("collection_id"),
  tiers: text("tiers", { mode: "json" }).$type<QbTier[]>().notNull(),
  combinable: integer("combinable", { mode: "boolean" }).notNull().default(false),
  styleOverrides: text("style_overrides", { mode: "json" }).$type<StyleOverrides | null>(),
  textOverrides: text("text_overrides", { mode: "json" }).$type<TextOverrides | null>(),
  headline: text("headline"),
  ctaLabel: text("cta_label"),
  subscription: text("subscription", { mode: "json" }).$type<Subscription | null>(),
  visibility: text("visibility").notNull().default("specific"),
  visibilityProductIds: text("visibility_product_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
  visibilityCollectionIds: text("visibility_collection_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
  checkboxUpsellsEnabled: integer("checkbox_upsells_enabled", { mode: "boolean" }).notNull().default(false),
  checkboxUpsells: text("checkbox_upsells", { mode: "json" }).$type<QbCheckboxUpsell[]>().notNull().default([]),
  linkedCountdownId: text("linked_countdown_id"),
  linkedProgressiveGiftId: text("linked_progressive_gift_id"),
  stickyAtc: text("sticky_atc", { mode: "json" }).$type<StickyAtcConfig | null>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  shopIdx: index("qb_shop_idx").on(t.shopId),
  productIdx: index("qb_product_idx").on(t.shopId, t.productId),
}));

// ─── Sticky add-to-cart (per-shop) ─────────────────────────
export const stickyAtcSettings = sqliteTable("sticky_atc_settings", {
  shopId: text("shop_id").primaryKey().references(() => shops.id, { onDelete: "cascade" }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  showImage: integer("show_image", { mode: "boolean" }).notNull().default(true),
  showQty: integer("show_qty", { mode: "boolean" }).notNull().default(true),
  showPrice: integer("show_price", { mode: "boolean" }).notNull().default(true),
  ctaLabel: text("cta_label").notNull().default("Add to cart"),
  backgroundColor: text("background_color").notNull().default("#FFFFFF"),
  textColor: text("text_color").notNull().default("#1A1A1A"),
  buttonBg: text("button_bg").notNull().default("#1A1A1A"),
  buttonText: text("button_text").notNull().default("#FFFFFF"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// ─── Countdown timers ─────────────────────────────────────
export type CountdownStyleOverrides = Partial<{
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  borderRadius: number;
}>;

export const countdownTimers = sqliteTable("countdown_timers", {
  id: text("id").primaryKey(),
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"),
  endAt: integer("end_at", { mode: "timestamp" }).notNull(),
  headline: text("headline").notNull().default("Sale ends in"),
  expiredHeadline: text("expired_headline").notNull().default("This deal has ended"),
  layout: text("layout").notNull().default("inline"),
  styleOverrides: text("style_overrides", { mode: "json" }).$type<CountdownStyleOverrides | null>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  shopIdx: index("ct_shop_idx").on(t.shopId),
}));

export const newsletterSettings = sqliteTable("newsletter_settings", {
  shopId: text("shop_id").primaryKey().references(() => shops.id, { onDelete: "cascade" }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  headline: text("headline").notNull().default("Get 10% off your first order"),
  subtitle: text("subtitle").notNull().default("Join our newsletter for early access and exclusive deals."),
  placeholder: text("placeholder").notNull().default("you@email.com"),
  ctaLabel: text("cta_label").notNull().default("Subscribe"),
  successMessage: text("success_message").notNull().default("Thanks! Check your inbox for the discount code."),
  tags: text("tags").notNull().default("newsletter,prospect"),
  popupEnabled: integer("popup_enabled", { mode: "boolean" }).notNull().default(false),
  popupTrigger: text("popup_trigger").notNull().default("delay"),
  popupDelaySeconds: integer("popup_delay_seconds").notNull().default(5),
  popupScrollPercent: integer("popup_scroll_percent").notNull().default(50),
  popupFrequencyDays: integer("popup_frequency_days").notNull().default(7),
  popupImageUrl: text("popup_image_url").notNull().default(""),
  popupImagePosition: text("popup_image_position").notNull().default("none"),
  excludedPaths: text("excluded_paths").notNull().default(""),
  styleOverrides: text("style_overrides", { mode: "json" }).$type<NewsletterStyleOverrides | null>(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export type NewsletterStyleOverrides = Partial<{
  backgroundColor: string;
  headingColor: string;
  textColor: string;
  buttonBg: string;
  buttonText: string;
  borderColor: string;
  borderRadius: number;
  inlinePadding: number;
  popupPadding: number;
  inlinePaddingX: number;
  inlinePaddingY: number;
  popupPaddingX: number;
  popupPaddingY: number;
  textAlign: "left" | "center" | "right";
  inlineMaxWidth: number;
  popupMaxWidth: number;
}>;

export type ProgressiveThreshold = {
  minSpendCents: number;
  giftVariantId: string;
  label: string;
  // Optional content overrides (per-threshold), modeled after competitor UX.
  title?: string;
  lockedTitle?: string;
  labelCrossedOut?: string;
  lockedLabel?: string;
  // Gift kind. "free_gift" attaches a product/variant. "free_shipping" applies
  // a 100% discount to shipping at checkout (handled at checkout, not on PDP).
  kind?: "free_gift" | "free_shipping";
  // Optional product-level pick (any variant of this product qualifies as the
  // gift). Used in addition to / instead of giftVariantId.
  giftProductId?: string;
  // Free-shipping icon URL override. Defaults to a built-in truck icon.
  iconUrl?: string;
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

export const progressiveGifts = sqliteTable("progressive_gifts", {
  id: text("id").primaryKey(),
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"),
  thresholds: text("thresholds", { mode: "json" }).$type<ProgressiveThreshold[]>().notNull(),
  headline: text("headline"),
  subtitle: text("subtitle"),
  layout: text("layout").notNull().default("grid"),
  hideLocked: integer("hide_locked", { mode: "boolean" }).notNull().default(false),
  showLockedLabels: integer("show_locked_labels", { mode: "boolean" }).notNull().default(true),
  styleOverrides: text("style_overrides", { mode: "json" }).$type<ProgressiveGiftStyleOverrides | null>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  shopIdx: index("pg_shop_idx").on(t.shopId),
}));

export const shopSettings = sqliteTable("shop_settings", {
  shopId: text("shop_id").primaryKey().references(() => shops.id, { onDelete: "cascade" }),
  primaryColor: text("primary_color").notNull().default("#7B1E2A"),
  textColor: text("text_color").notNull().default("#1A1A1A"),
  backgroundColor: text("background_color").notNull().default("#FFFFFF"),
  borderRadius: integer("border_radius").notNull().default(8),
  fontFamily: text("font_family").notNull().default("inherit"),
  bundleHeadline: text("bundle_headline").notNull().default("Frequently bought together"),
  qbHeadline: text("qb_headline").notNull().default("Choose your savings"),
  showCompareAtPrice: integer("show_compare_at_price", { mode: "boolean" }).notNull().default(true),
  enableBOGO: integer("enable_bogo", { mode: "boolean" }).notNull().default(true),
  customCss: text("custom_css"),
});

export type Shop = typeof shops.$inferSelect;
export type NewShop = typeof shops.$inferInsert;
export type Bundle = typeof bundles.$inferSelect;
export type NewBundle = typeof bundles.$inferInsert;
export type QuantityBreak = typeof quantityBreaks.$inferSelect;
export type ProgressiveGift = typeof progressiveGifts.$inferSelect;
export type NewProgressiveGift = typeof progressiveGifts.$inferInsert;
export type NewsletterSettings = typeof newsletterSettings.$inferSelect;
export type NewNewsletterSettings = typeof newsletterSettings.$inferInsert;
export type StickyAtcSettings = typeof stickyAtcSettings.$inferSelect;
export type NewStickyAtcSettings = typeof stickyAtcSettings.$inferInsert;
export type CountdownTimer = typeof countdownTimers.$inferSelect;
export type NewCountdownTimer = typeof countdownTimers.$inferInsert;
export type NewQuantityBreak = typeof quantityBreaks.$inferInsert;
export type ShopSettings = typeof shopSettings.$inferSelect;

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["widget_impression", "widget_click", "add_to_cart"] }).notNull(),
  widgetType: text("widget_type", { enum: ["bundle", "qb", "mix_match"] }).notNull(),
  widgetId: text("widget_id").notNull(),
  productId: text("product_id"),
  tierQty: integer("tier_qty"),
  valueCents: integer("value_cents").notNull().default(0),
  ts: integer("ts").notNull(),
}, (t) => ({
  shopTsIdx: index("events_shop_ts_idx").on(t.shopId, t.ts),
  shopWidgetTsIdx: index("events_shop_widget_ts_idx").on(t.shopId, t.widgetId, t.ts),
}));

export const revenueDaily = sqliteTable("revenue_daily", {
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  totalRevenueCents: integer("total_revenue_cents").notNull().default(0),
  totalOrders: integer("total_orders").notNull().default(0),
  bundleRevenueCents: integer("bundle_revenue_cents").notNull().default(0),
  bundleOrders: integer("bundle_orders").notNull().default(0),
  qbRevenueCents: integer("qb_revenue_cents").notNull().default(0),
  qbOrders: integer("qb_orders").notNull().default(0),
}, (t) => ({
  pk: primaryKey({ columns: [t.shopId, t.date] }),
}));

export const bundleDaily = sqliteTable("bundle_daily", {
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  bundleId: text("bundle_id").notNull(),
  widgetType: text("widget_type", { enum: ["bundle", "qb", "mix_match"] }).notNull(),
  applicationCount: integer("application_count").notNull().default(0),
  revenueCents: integer("revenue_cents").notNull().default(0),
  orders: integer("orders").notNull().default(0),
}, (t) => ({
  pk: primaryKey({ columns: [t.shopId, t.date, t.bundleId] }),
  shopDateIdx: index("bundle_daily_shop_date_idx").on(t.shopId, t.date),
}));

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type RevenueDaily = typeof revenueDaily.$inferSelect;
export type NewRevenueDaily = typeof revenueDaily.$inferInsert;
export type BundleDaily = typeof bundleDaily.$inferSelect;
export type NewBundleDaily = typeof bundleDaily.$inferInsert;
