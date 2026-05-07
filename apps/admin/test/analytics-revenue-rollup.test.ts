import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { eq, and } from "drizzle-orm";
import * as schema from "../drizzle/schema";
import { applyAttribution } from "../app/lib/analytics/revenue-rollup";

const SHOP = "s.myshopify.com";
const DATE = "2026-05-07";

function setup() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  db.insert(schema.shops).values({ id: SHOP, scopes: "", installedAt: new Date() }).run();
  return db;
}

describe("applyAttribution", () => {
  let db: ReturnType<typeof setup>;
  beforeEach(() => { db = setup(); });

  it("creates a new revenue_daily row on first attribution", async () => {
    await applyAttribution(db, SHOP, {
      totalCents: 5000,
      perBundle: [{ bundleId: "b1", widgetType: "bundle", revenueCents: 5000, units: 2 }],
    }, DATE);
    const rows = db.select().from(schema.revenueDaily).where(and(eq(schema.revenueDaily.shopId, SHOP), eq(schema.revenueDaily.date, DATE))).all();
    expect(rows.length).toBe(1);
    expect(rows[0]!.totalRevenueCents).toBe(5000);
    expect(rows[0]!.totalOrders).toBe(1);
    expect(rows[0]!.bundleRevenueCents).toBe(5000);
    expect(rows[0]!.bundleOrders).toBe(1);
    expect(rows[0]!.qbRevenueCents).toBe(0);
    expect(rows[0]!.qbOrders).toBe(0);
  });

  it("increments existing revenue_daily row on second attribution same day", async () => {
    await applyAttribution(db, SHOP, {
      totalCents: 5000,
      perBundle: [{ bundleId: "b1", widgetType: "bundle", revenueCents: 5000, units: 2 }],
    }, DATE);
    await applyAttribution(db, SHOP, {
      totalCents: 3000,
      perBundle: [{ bundleId: "b1", widgetType: "bundle", revenueCents: 3000, units: 1 }],
    }, DATE);
    const row = db.select().from(schema.revenueDaily).where(and(eq(schema.revenueDaily.shopId, SHOP), eq(schema.revenueDaily.date, DATE))).all()[0]!;
    expect(row.totalRevenueCents).toBe(8000);
    expect(row.totalOrders).toBe(2);
    expect(row.bundleOrders).toBe(2);
  });

  it("splits between bundle and qb on a mixed order", async () => {
    await applyAttribution(db, SHOP, {
      totalCents: 9000,
      perBundle: [
        { bundleId: "b1", widgetType: "bundle", revenueCents: 5000, units: 1 },
        { bundleId: "q1", widgetType: "qb", revenueCents: 4000, units: 1 },
      ],
    }, DATE);
    const row = db.select().from(schema.revenueDaily).where(and(eq(schema.revenueDaily.shopId, SHOP), eq(schema.revenueDaily.date, DATE))).all()[0]!;
    expect(row.totalRevenueCents).toBe(9000);
    expect(row.totalOrders).toBe(1);
    expect(row.bundleRevenueCents).toBe(5000);
    expect(row.bundleOrders).toBe(1);
    expect(row.qbRevenueCents).toBe(4000);
    expect(row.qbOrders).toBe(1);
  });

  it("upserts bundle_daily per bundle entry", async () => {
    await applyAttribution(db, SHOP, {
      totalCents: 9000,
      perBundle: [
        { bundleId: "b1", widgetType: "bundle", revenueCents: 5000, units: 1 },
        { bundleId: "q1", widgetType: "qb", revenueCents: 4000, units: 1 },
      ],
    }, DATE);
    const rows = db.select().from(schema.bundleDaily).where(eq(schema.bundleDaily.shopId, SHOP)).all();
    expect(rows.length).toBe(2);
    const b1 = rows.find(r => r.bundleId === "b1")!;
    expect(b1.applicationCount).toBe(1);
    expect(b1.revenueCents).toBe(5000);
    expect(b1.orders).toBe(1);
    expect(b1.widgetType).toBe("bundle");
  });

  it("bumps shops.attributedRevenueCents", async () => {
    await applyAttribution(db, SHOP, {
      totalCents: 5000,
      perBundle: [{ bundleId: "b1", widgetType: "bundle", revenueCents: 5000, units: 1 }],
    }, DATE);
    const shop = db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)).all()[0]!;
    expect(shop.attributedRevenueCents).toBe(5000);
  });

  it("treats mix_match as bundle in revenue_daily aggregation", async () => {
    await applyAttribution(db, SHOP, {
      totalCents: 7200,
      perBundle: [{ bundleId: "mm1", widgetType: "mix_match", revenueCents: 7200, units: 3 }],
    }, DATE);
    const row = db.select().from(schema.revenueDaily).where(and(eq(schema.revenueDaily.shopId, SHOP), eq(schema.revenueDaily.date, DATE))).all()[0]!;
    expect(row.bundleRevenueCents).toBe(7200);
    expect(row.bundleOrders).toBe(1);
    expect(row.qbOrders).toBe(0);
  });
});
