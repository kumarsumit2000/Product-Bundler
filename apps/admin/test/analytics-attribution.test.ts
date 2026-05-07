import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "../drizzle/schema";
import { parseOrderAttribution } from "../app/lib/analytics/attribution";

function setup() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  return db;
}

const SHOP = "s.myshopify.com";

function seedShop(db: ReturnType<typeof setup>) {
  db.insert(schema.shops).values({ id: SHOP, scopes: "", installedAt: new Date() }).run();
}

function seedBundle(db: ReturnType<typeof setup>, id: string, mode: "classic" | "mix_match" = "classic") {
  db.insert(schema.bundles).values({
    id, shopId: SHOP, name: id, status: "active",
    products: [], discountType: "percentage", discountValue: 10, combinable: false,
    triggerProductIds: [], styleOverrides: null, headline: null, ctaLabel: null,
    mode, collectionId: null, targetQty: null,
    createdAt: new Date(), updatedAt: new Date(),
  }).run();
}

function seedQb(db: ReturnType<typeof setup>, id: string) {
  db.insert(schema.quantityBreaks).values({
    id, shopId: SHOP, name: id, status: "active",
    productId: "p1", collectionId: null,
    tiers: [{ qty: 1, discountType: "percentage", discountValue: 0, label: "", isMostPopular: false }],
    combinable: false, styleOverrides: null,
    createdAt: new Date(), updatedAt: new Date(),
  }).run();
}

const lineWith = (bundleId: string, priceCents: number, qty = 1) => ({
  price_set: { shop_money: { amount: (priceCents / 100).toFixed(2), currency_code: "USD" } },
  quantity: qty,
  properties: [{ name: "_pumper_bundle_id", value: bundleId }],
});

const lineWithout = (priceCents: number, qty = 1) => ({
  price_set: { shop_money: { amount: (priceCents / 100).toFixed(2), currency_code: "USD" } },
  quantity: qty,
  properties: [],
});

describe("parseOrderAttribution", () => {
  let db: ReturnType<typeof setup>;
  beforeEach(() => { db = setup(); seedShop(db); });

  it("returns one entry for a single-bundle order", async () => {
    seedBundle(db, "b1");
    const order = { line_items: [lineWith("b1", 5000), lineWith("b1", 3000)] };
    const result = await parseOrderAttribution(db, SHOP, order);
    expect(result.totalCents).toBe(8000);
    expect(result.perBundle.length).toBe(1);
    expect(result.perBundle[0]!.bundleId).toBe("b1");
    expect(result.perBundle[0]!.widgetType).toBe("bundle");
    expect(result.perBundle[0]!.revenueCents).toBe(8000);
    expect(result.perBundle[0]!.units).toBe(2);
  });

  it("splits revenue between bundle and QB entries", async () => {
    seedBundle(db, "b1");
    seedQb(db, "q1");
    const order = { line_items: [lineWith("b1", 5000), lineWith("q1", 4000)] };
    const result = await parseOrderAttribution(db, SHOP, order);
    expect(result.totalCents).toBe(9000);
    expect(result.perBundle.length).toBe(2);
    const bundle = result.perBundle.find(p => p.bundleId === "b1")!;
    const qb = result.perBundle.find(p => p.bundleId === "q1")!;
    expect(bundle.widgetType).toBe("bundle");
    expect(qb.widgetType).toBe("qb");
  });

  it("identifies mix_match bundles correctly", async () => {
    seedBundle(db, "mm1", "mix_match");
    const order = { line_items: [lineWith("mm1", 2400), lineWith("mm1", 2400), lineWith("mm1", 2400)] };
    const result = await parseOrderAttribution(db, SHOP, order);
    expect(result.perBundle[0]!.widgetType).toBe("mix_match");
    expect(result.perBundle[0]!.revenueCents).toBe(7200);
    expect(result.perBundle[0]!.units).toBe(3);
  });

  it("returns empty perBundle and 0 totalCents when no _pumper_bundle_id lines", async () => {
    const order = { line_items: [lineWithout(5000), lineWithout(3000)] };
    const result = await parseOrderAttribution(db, SHOP, order);
    expect(result.totalCents).toBe(0);
    expect(result.perBundle).toEqual([]);
  });

  it("skips orphan bundle ids (deleted between cart-add and order paid)", async () => {
    seedBundle(db, "b1");
    const order = { line_items: [lineWith("b1", 5000), lineWith("orphan", 3000)] };
    const result = await parseOrderAttribution(db, SHOP, order);
    expect(result.totalCents).toBe(5000);
    expect(result.perBundle.length).toBe(1);
    expect(result.perBundle[0]!.bundleId).toBe("b1");
  });

  it("multiplies price × quantity correctly", async () => {
    seedBundle(db, "b1");
    const order = { line_items: [lineWith("b1", 1500, 3)] };
    const result = await parseOrderAttribution(db, SHOP, order);
    expect(result.totalCents).toBe(4500);
    expect(result.perBundle[0]!.units).toBe(3);
  });
});
