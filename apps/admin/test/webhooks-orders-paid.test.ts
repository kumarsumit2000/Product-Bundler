import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "../drizzle/schema";
import { InMemoryKV } from "./helpers/kv-mock";

const SHOP = "s.myshopify.com";

function setup() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  db.insert(schema.shops).values({ id: SHOP, scopes: "", installedAt: new Date() }).run();
  db.insert(schema.bundles).values({
    id: "b1", shopId: SHOP, name: "B", status: "active",
    products: [], discountType: "percentage", discountValue: 10, combinable: false,
    triggerProductIds: [], styleOverrides: null, headline: null, ctaLabel: null,
    mode: "classic", collectionId: null, targetQty: null,
    createdAt: new Date(), updatedAt: new Date(),
  }).run();
  return { db, sqlite };
}

function makeContext(db: ReturnType<typeof setup>["db"]) {
  const kv = new InMemoryKV();
  return {
    cloudflare: {
      env: {
        DB: db as unknown as D1Database,
        SHOP_SETTINGS_CACHE: kv as unknown as KVNamespace,
        SHOPIFY_API_SECRET: "test-secret",
      },
    },
  } as never;
}

vi.mock("~/shopify.server", () => ({
  authenticate: {
    webhook: vi.fn(async (request: Request) => ({
      topic: "ORDERS_PAID",
      shop: SHOP,
      payload: JSON.parse(await request.text()),
      admin: undefined, // not exercised by these tests
    })),
  },
}));

import { action } from "../app/routes/webhooks.orders.paid";

function makeReq(body: unknown, webhookId: string) {
  return new Request("https://x/webhooks/orders/paid", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Webhook-Id": webhookId,
    },
    body: JSON.stringify(body),
  });
}

describe("/webhooks/orders/paid action", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => { s = setup(); });

  it("attributes revenue when order has _pumper_bundle_id lines", async () => {
    const order = {
      processed_at: "2026-05-07T12:34:56Z",
      line_items: [{
        price_set: { shop_money: { amount: "50.00", currency_code: "USD" } },
        quantity: 1,
        properties: [{ name: "_pumper_bundle_id", value: "b1" }],
      }],
    };
    const res = await action({ request: makeReq(order, "wh-1"), context: makeContext(s.db) } as never);
    expect((res as Response).status).toBe(200);
    const rev = s.db.select().from(schema.revenueDaily).all();
    expect(rev.length).toBe(1);
    expect(rev[0]!.totalRevenueCents).toBe(5000);
  });

  it("returns 200 and no DB write when order has no attributable lines", async () => {
    const order = {
      processed_at: "2026-05-07T12:00:00Z",
      line_items: [{
        price_set: { shop_money: { amount: "20.00", currency_code: "USD" } },
        quantity: 1,
        properties: [],
      }],
    };
    const res = await action({ request: makeReq(order, "wh-2"), context: makeContext(s.db) } as never);
    expect((res as Response).status).toBe(200);
    const rev = s.db.select().from(schema.revenueDaily).all();
    expect(rev.length).toBe(0);
  });

  it("idempotent: second delivery of same webhook id is no-op", async () => {
    const order = {
      processed_at: "2026-05-07T12:00:00Z",
      line_items: [{
        price_set: { shop_money: { amount: "50.00", currency_code: "USD" } },
        quantity: 1,
        properties: [{ name: "_pumper_bundle_id", value: "b1" }],
      }],
    };
    const ctx = makeContext(s.db);
    await action({ request: makeReq(order, "wh-3"), context: ctx } as never);
    await action({ request: makeReq(order, "wh-3"), context: ctx } as never);
    const rev = s.db.select().from(schema.revenueDaily).all();
    expect(rev.length).toBe(1);
    expect(rev[0]!.totalRevenueCents).toBe(5000);
  });

  it("falls back to created_at when processed_at missing", async () => {
    const order = {
      created_at: "2026-04-01T05:00:00Z",
      line_items: [{
        price_set: { shop_money: { amount: "50.00", currency_code: "USD" } },
        quantity: 1,
        properties: [{ name: "_pumper_bundle_id", value: "b1" }],
      }],
    };
    await action({ request: makeReq(order, "wh-4"), context: makeContext(s.db) } as never);
    const rev = s.db.select().from(schema.revenueDaily).all();
    expect(rev[0]!.date).toBe("2026-04-01");
  });
});

describe("billing integration in orders/paid", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => { s = setup(); });

  it("increments lifetimeOrderCount on every paid order", async () => {
    const order = {
      processed_at: "2026-05-07T12:00:00Z",
      line_items: [{
        price_set: { shop_money: { amount: "20.00", currency_code: "USD" } },
        quantity: 1,
        properties: [],
      }],
    };
    await action({ request: makeReq(order, "wh-cnt-1"), context: makeContext(s.db) } as never);
    const row = s.db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)).get();
    expect(row!.lifetimeOrderCount).toBe(1);
    expect(row!.monthlyOrderCount).toBe(1);
  });

  it("does not double-count on duplicate webhook id", async () => {
    const order = {
      processed_at: "2026-05-07T12:00:00Z",
      line_items: [{ price_set: { shop_money: { amount: "20.00", currency_code: "USD" } }, quantity: 1, properties: [] }],
    };
    const ctx = makeContext(s.db);
    await action({ request: makeReq(order, "wh-dup-cnt"), context: ctx } as never);
    await action({ request: makeReq(order, "wh-dup-cnt"), context: ctx } as never);
    const row = s.db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)).get();
    expect(row!.lifetimeOrderCount).toBe(1);
  });
});
