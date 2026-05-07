import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "../drizzle/schema";
import {
  getKpis,
  getActivitySeries,
  getConversionsAndSales,
  getTopBundles,
  getQbTierBreakdown,
  getBundleListForFilter,
} from "../app/lib/analytics/dashboard-query";

const SHOP = "s.myshopify.com";

function setup() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  db.insert(schema.shops).values({ id: SHOP, scopes: "", installedAt: new Date() }).run();
  return db;
}

function seedBundle(db: ReturnType<typeof setup>, id: string, name: string) {
  db.insert(schema.bundles).values({
    id, shopId: SHOP, name, status: "active",
    products: [], discountType: "percentage", discountValue: 10, combinable: false,
    triggerProductIds: [], styleOverrides: null, headline: null, ctaLabel: null,
    mode: "classic", collectionId: null, targetQty: null,
    createdAt: new Date(), updatedAt: new Date(),
  }).run();
}

function seedQb(db: ReturnType<typeof setup>, id: string, name: string) {
  db.insert(schema.quantityBreaks).values({
    id, shopId: SHOP, name, status: "active",
    productId: "p1", collectionId: null,
    tiers: [{ qty: 1, discountType: "percentage", discountValue: 0, label: "", isMostPopular: false }],
    combinable: false, styleOverrides: null,
    createdAt: new Date(), updatedAt: new Date(),
  }).run();
}

function seedRevenueDaily(db: ReturnType<typeof setup>, date: string, totalCents: number, bundleCents: number, qbCents: number) {
  db.insert(schema.revenueDaily).values({
    shopId: SHOP, date,
    totalRevenueCents: totalCents, totalOrders: 1,
    bundleRevenueCents: bundleCents, bundleOrders: bundleCents > 0 ? 1 : 0,
    qbRevenueCents: qbCents, qbOrders: qbCents > 0 ? 1 : 0,
  }).run();
}

function seedBundleDaily(db: ReturnType<typeof setup>, date: string, bundleId: string, widgetType: "bundle" | "qb" | "mix_match", revenueCents: number, orders: number, applicationCount: number) {
  db.insert(schema.bundleDaily).values({
    shopId: SHOP, date, bundleId, widgetType,
    applicationCount, revenueCents, orders,
  }).run();
}

let _eventSeq = 0;
function seedEvent(db: ReturnType<typeof setup>, ts: number, type: "widget_impression" | "widget_click" | "add_to_cart", widgetType: "bundle" | "qb" | "mix_match", widgetId: string, tierQty: number | null = null, valueCents = 0) {
  db.insert(schema.events).values({
    id: `e-${ts}-${widgetId}-${type}-${tierQty ?? "null"}-${++_eventSeq}`, shopId: SHOP, type, widgetType, widgetId,
    productId: null, tierQty, valueCents, ts,
  }).run();
}

const RANGE = { startDate: "2026-05-01", endDate: "2026-05-07" };

describe("getKpis", () => {
  let db: ReturnType<typeof setup>;
  beforeEach(() => { db = setup(); });

  it("sums revenue and orders within range", async () => {
    seedRevenueDaily(db, "2026-05-01", 5000, 5000, 0);
    seedRevenueDaily(db, "2026-05-03", 3000, 0, 3000);
    seedRevenueDaily(db, "2026-04-28", 9999, 9999, 0);  // outside range, must be excluded
    const k = await getKpis(db, SHOP, RANGE);
    expect(k.totalRevenueCents).toBe(8000);
    expect(k.totalOrders).toBe(2);
  });

  it("returns sparkline series with one entry per day in range", async () => {
    seedRevenueDaily(db, "2026-05-03", 1000, 1000, 0);
    const k = await getKpis(db, SHOP, RANGE);
    const found = k.revenueSeries.find(s => s.date === "2026-05-03");
    expect(found?.cents).toBe(1000);
  });

  it("returns zeros for empty shop", async () => {
    const k = await getKpis(db, SHOP, RANGE);
    expect(k.totalRevenueCents).toBe(0);
    expect(k.totalOrders).toBe(0);
  });
});

describe("getActivitySeries", () => {
  let db: ReturnType<typeof setup>;
  beforeEach(() => { db = setup(); });

  it("returns per-day application counts", async () => {
    seedBundleDaily(db, "2026-05-01", "b1", "bundle", 5000, 1, 3);
    seedBundleDaily(db, "2026-05-01", "q1", "qb", 3000, 1, 5);
    const s = await getActivitySeries(db, SHOP, RANGE);
    const may1 = s.find(d => d.date === "2026-05-01")!;
    expect(may1.count).toBe(8);
    expect(may1.perBundle["b1"]).toBe(3);
    expect(may1.perBundle["q1"]).toBe(5);
  });

  it("filters by bundleIds when provided", async () => {
    seedBundleDaily(db, "2026-05-01", "b1", "bundle", 5000, 1, 3);
    seedBundleDaily(db, "2026-05-01", "q1", "qb", 3000, 1, 5);
    const s = await getActivitySeries(db, SHOP, RANGE, ["b1"]);
    const may1 = s.find(d => d.date === "2026-05-01")!;
    expect(may1.count).toBe(3);
  });
});

describe("getConversionsAndSales", () => {
  let db: ReturnType<typeof setup>;
  beforeEach(() => { db = setup(); });

  it("returns separate bundle and qb series", async () => {
    seedRevenueDaily(db, "2026-05-01", 8000, 5000, 3000);
    const r = await getConversionsAndSales(db, SHOP, RANGE);
    const may1 = r.conversions.find(c => c.date === "2026-05-01")!;
    expect(may1.bundleOrders).toBe(1);
    expect(may1.qbOrders).toBe(1);
    const sale1 = r.sales.find(c => c.date === "2026-05-01")!;
    expect(sale1.bundleCents).toBe(5000);
    expect(sale1.qbCents).toBe(3000);
  });
});

describe("getTopBundles", () => {
  let db: ReturnType<typeof setup>;
  beforeEach(() => { db = setup(); });

  it("returns bundles sorted by revenue descending", async () => {
    seedBundle(db, "b1", "Alpha");
    seedBundle(db, "b2", "Beta");
    seedBundleDaily(db, "2026-05-01", "b1", "bundle", 1000, 1, 1);
    seedBundleDaily(db, "2026-05-02", "b2", "bundle", 5000, 1, 1);
    const r = await getTopBundles(db, SHOP, RANGE);
    expect(r[0]!.bundleId).toBe("b2");
    expect(r[0]!.revenueCents).toBe(5000);
    expect(r[1]!.bundleId).toBe("b1");
  });

  it("falls back to '(deleted)' for missing bundle name", async () => {
    seedBundleDaily(db, "2026-05-01", "ghost", "bundle", 1000, 1, 1);
    const r = await getTopBundles(db, SHOP, RANGE);
    expect(r[0]!.name).toBe("(deleted)");
  });

  it("computes conversion rate", async () => {
    seedBundle(db, "b1", "B1");
    seedBundleDaily(db, "2026-05-01", "b1", "bundle", 1000, 5, 10);
    const r = await getTopBundles(db, SHOP, RANGE);
    expect(r[0]!.conversionRate).toBeCloseTo(0.5, 2);  // 5/10
  });
});

describe("getQbTierBreakdown", () => {
  let db: ReturnType<typeof setup>;
  beforeEach(() => { db = setup(); });

  it("groups events by widgetId + tierQty for QB add_to_cart", async () => {
    seedQb(db, "q1", "Q1");
    seedEvent(db, Date.parse("2026-05-01T00:00:00Z"), "add_to_cart", "qb", "q1", 1, 1000);
    seedEvent(db, Date.parse("2026-05-02T00:00:00Z"), "add_to_cart", "qb", "q1", 1, 1000);
    seedEvent(db, Date.parse("2026-05-02T00:00:00Z"), "add_to_cart", "qb", "q1", 2, 1800);
    seedEvent(db, Date.parse("2026-05-02T00:00:00Z"), "widget_click", "qb", "q1", 1, 0);  // not add_to_cart
    const r = await getQbTierBreakdown(db, SHOP, RANGE);
    expect(r.length).toBe(1);
    expect(r[0]!.qbId).toBe("q1");
    const tier1 = r[0]!.tiers.find(t => t.qty === 1)!;
    expect(tier1.addCount).toBe(2);
    const tier2 = r[0]!.tiers.find(t => t.qty === 2)!;
    expect(tier2.addCount).toBe(1);
  });
});

describe("getBundleListForFilter", () => {
  let db: ReturnType<typeof setup>;
  beforeEach(() => { db = setup(); });

  it("returns bundles + qbs together", async () => {
    seedBundle(db, "b1", "Alpha");
    seedQb(db, "q1", "Beta");
    const r = await getBundleListForFilter(db, SHOP);
    expect(r.length).toBe(2);
    expect(r.find(x => x.id === "b1")?.widgetType).toBe("bundle");
    expect(r.find(x => x.id === "q1")?.widgetType).toBe("qb");
  });
});
