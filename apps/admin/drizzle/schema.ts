import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

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
  currency: text("currency").notNull().default("USD"),
  primaryLocale: text("primary_locale").notNull().default("en"),
  attributedRevenueCents: integer("attributed_revenue_cents").notNull().default(0),
});

export type Shop = typeof shops.$inferSelect;
export type NewShop = typeof shops.$inferInsert;
