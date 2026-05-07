import { describe, it, expect, beforeEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import Database from "better-sqlite3";
import * as schema from "../drizzle/schema";
import { InMemoryKV } from "./helpers/kv-mock";

const SHOP = "s.myshopify.com";

function setup() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  db.insert(schema.shops).values({
    id: SHOP,
    scopes: "",
    installedAt: new Date(),
    plan: "free",
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
      topic: "APP_SUBSCRIPTIONS_UPDATE",
      shop: SHOP,
      payload: JSON.parse(await request.text()),
    })),
  },
}));

import { action } from "../app/routes/webhooks.app-subscriptions.update";

function makeReq(body: unknown, webhookId: string) {
  return new Request("https://x/webhooks/app-subscriptions/update", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Webhook-Id": webhookId },
    body: JSON.stringify(body),
  });
}

describe("webhooks.app-subscriptions.update", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => { s = setup(); });

  it("ACTIVE first time → sets plan, planActivatedAt, trialEndsAt, monthlyOrderResetAt, chargeId", async () => {
    const payload = {
      app_subscription: {
        admin_graphql_api_id: "gid://shopify/AppSubscription/abc",
        name: "Starter",
        status: "ACTIVE",
        trial_days: 7,
        line_items: [{ plan: { pricing_details: { __typename: "AppRecurringPricing", price: { amount: "19.00", currency_code: "USD" } } } }],
      },
    };
    const res = await action({ request: makeReq(payload, "wh-act-1"), context: makeContext(s.db) } as never);
    expect((res as Response).status).toBe(200);
    const row = s.db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)).get();
    expect(row!.plan).toBe("starter");
    expect(row!.shopifyChargeId).toBe("gid://shopify/AppSubscription/abc");
    expect(row!.planActivatedAt).toBeTruthy();
    expect(row!.trialEndsAt).toBeTruthy();
    expect(row!.monthlyOrderResetAt).toBeTruthy();
  });

  it("CANCELLED → reverts to free, clears chargeId/trial/reset", async () => {
    s.db.update(schema.shops).set({
      plan: "growth",
      shopifyChargeId: "gid://shopify/AppSubscription/abc",
      trialEndsAt: new Date("2026-05-15T00:00:00Z"),
      monthlyOrderResetAt: new Date("2026-06-01T00:00:00Z"),
    }).where(eq(schema.shops.id, SHOP)).run();

    const payload = { app_subscription: { admin_graphql_api_id: "gid://shopify/AppSubscription/abc", name: "Growth", status: "CANCELLED", line_items: [] } };
    const res = await action({ request: makeReq(payload, "wh-cancel"), context: makeContext(s.db) } as never);
    expect((res as Response).status).toBe(200);
    const row = s.db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)).get();
    expect(row!.plan).toBe("free");
    expect(row!.shopifyChargeId).toBeNull();
    expect(row!.trialEndsAt).toBeNull();
    expect(row!.monthlyOrderResetAt).toBeNull();
  });

  it("EXPIRED → reverts to free", async () => {
    s.db.update(schema.shops).set({ plan: "starter", shopifyChargeId: "gid://shopify/X" }).where(eq(schema.shops.id, SHOP)).run();
    const payload = { app_subscription: { admin_graphql_api_id: "gid://shopify/X", name: "Starter", status: "EXPIRED", line_items: [] } };
    await action({ request: makeReq(payload, "wh-exp"), context: makeContext(s.db) } as never);
    const row = s.db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)).get();
    expect(row!.plan).toBe("free");
  });

  it("FROZEN → keeps plan", async () => {
    s.db.update(schema.shops).set({ plan: "starter", shopifyChargeId: "gid://shopify/X" }).where(eq(schema.shops.id, SHOP)).run();
    const payload = { app_subscription: { admin_graphql_api_id: "gid://shopify/X", name: "Starter", status: "FROZEN", line_items: [] } };
    await action({ request: makeReq(payload, "wh-frozen"), context: makeContext(s.db) } as never);
    const row = s.db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)).get();
    expect(row!.plan).toBe("starter");
    expect(row!.shopifyChargeId).toBe("gid://shopify/X");
  });

  it("idempotent — same webhook id processed once", async () => {
    const payload = {
      app_subscription: {
        admin_graphql_api_id: "gid://shopify/AppSubscription/abc",
        name: "Starter",
        status: "ACTIVE",
        trial_days: 7,
        line_items: [{ plan: { pricing_details: { __typename: "AppRecurringPricing", price: { amount: "19.00", currency_code: "USD" } } } }],
      },
    };
    const ctx = makeContext(s.db);
    await action({ request: makeReq(payload, "wh-dup"), context: ctx } as never);
    // change DB state to verify second call doesn't reapply
    s.db.update(schema.shops).set({ plan: "free" }).where(eq(schema.shops.id, SHOP)).run();
    await action({ request: makeReq(payload, "wh-dup"), context: ctx } as never);
    const row = s.db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)).get();
    expect(row!.plan).toBe("free"); // second call was no-op due to idempotency
  });
});
