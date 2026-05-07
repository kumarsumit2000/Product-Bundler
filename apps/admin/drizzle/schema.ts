import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

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
};

export type StyleOverrides = Partial<{
  primaryColor: string;
  textColor: string;
  backgroundColor: string;
  borderRadius: number;
}>;

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
  headline: text("headline"),
  ctaLabel: text("cta_label"),
  mode: text("mode", { enum: ["classic", "mix_match"] }).notNull().default("classic"),
  collectionId: text("collection_id"),
  targetQty: integer("target_qty"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  shopIdx: index("bundles_shop_idx").on(t.shopId),
  statusIdx: index("bundles_status_idx").on(t.shopId, t.status),
}));

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
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  shopIdx: index("qb_shop_idx").on(t.shopId),
  productIdx: index("qb_product_idx").on(t.shopId, t.productId),
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
export type NewQuantityBreak = typeof quantityBreaks.$inferInsert;
export type ShopSettings = typeof shopSettings.$inferSelect;
