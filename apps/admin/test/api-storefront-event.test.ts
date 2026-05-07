import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "../drizzle/schema";
import { action } from "../app/routes/api.storefront.event";

class InMemoryKV {
  private store = new Map<string, string>();
  async get(key: string) { return this.store.get(key) ?? null; }
  async put(key: string, val: string) { this.store.set(key, val); }
  async delete(key: string) { this.store.delete(key); }
}

function setup() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  return { db, sqlite };
}

function makeContext(db: ReturnType<typeof setup>["db"]) {
  const kv = new InMemoryKV();
  return {
    cloudflare: {
      env: {
        DB: db as unknown as D1Database,
        SHOP_SETTINGS_CACHE: kv as unknown as KVNamespace,
      },
    },
  } as never;
}

const SHOP = "s.myshopify.com";

describe("/api/storefront/event action", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
    s.db.insert(schema.shops).values({ id: SHOP, scopes: "", installedAt: new Date() }).run();
  });

  it("returns 204 on a valid event from an installed shop", async () => {
    const req = new Request("https://x/api/storefront/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "widget_impression", shop: SHOP, widgetType: "bundle", widgetId: "b1", productId: "p1", ts: Date.now() }),
    });
    const res = await action({ request: req, context: makeContext(s.db) } as never);
    expect((res as Response).status).toBe(204);
  });

  it("returns 413 on an oversized body", async () => {
    const req = new Request("https://x/api/storefront/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "x".repeat(5000),
    });
    const res = await action({ request: req, context: makeContext(s.db) } as never);
    expect((res as Response).status).toBe(413);
  });

  it("returns 400 on bad JSON", async () => {
    const req = new Request("https://x/api/storefront/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    const res = await action({ request: req, context: makeContext(s.db) } as never);
    expect((res as Response).status).toBe(400);
  });

  it("drops silently (204) for shops not installed", async () => {
    const req = new Request("https://x/api/storefront/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "widget_impression", shop: "other.myshopify.com", widgetType: "bundle", widgetId: "b1" }),
    });
    const res = await action({ request: req, context: makeContext(s.db) } as never);
    expect((res as Response).status).toBe(204);
  });

  it("inserts a row in events table on a valid beacon", async () => {
    const ts = Date.now();
    const req = new Request("https://x/api/storefront/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "widget_impression", shop: SHOP, widgetType: "bundle", widgetId: "b1", productId: "p1", ts }),
    });
    const res = await action({ request: req, context: makeContext(s.db) } as never);
    expect((res as Response).status).toBe(204);
    const rows = s.db.select().from(schema.events).all();
    expect(rows.length).toBe(1);
    expect(rows[0]!.shopId).toBe(SHOP);
    expect(rows[0]!.type).toBe("widget_impression");
    expect(rows[0]!.ts).toBe(ts);
  });
});
