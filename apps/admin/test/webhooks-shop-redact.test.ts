import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { InMemoryKV } from "./helpers/kv-mock";
import { handleShopRedact } from "../app/routes/webhooks.shop.redact";
import * as schema from "../drizzle/schema";

function setupDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  return { db, sqlite };
}

function makeCtx(opts: {
  db: ReturnType<typeof setupDb>["db"];
  sessions: InMemoryKV;
  cache: InMemoryKV;
}) {
  return {
    cloudflare: {
      env: {
        DB: opts.db as unknown as D1Database,
        SESSIONS: opts.sessions as unknown as KVNamespace,
        SHOP_SETTINGS_CACHE: opts.cache as unknown as KVNamespace,
      },
    },
  } as unknown as Parameters<typeof handleShopRedact>[0];
}

describe("handleShopRedact", () => {
  let setup: ReturnType<typeof setupDb>;
  let sessions: InMemoryKV;
  let cache: InMemoryKV;

  beforeEach(async () => {
    setup = setupDb();
    sessions = new InMemoryKV();
    cache = new InMemoryKV();

    // Seed a shop row
    await setup.db.insert(schema.shops).values({
      id: "test.myshopify.com",
      scopes: "read_products",
      installedAt: new Date(),
    });

    // Seed sessions
    await sessions.put("session:offline_test.myshopify.com", "blob");
    await sessions.put("shop-index:test.myshopify.com:offline_test.myshopify.com", "1");

    // Seed widget config cache
    await cache.put("config:test.myshopify.com", '{"bundles":[]}');
  });

  it("deletes the shop row from D1", async () => {
    const ctx = makeCtx({ db: setup.db, sessions, cache });
    await handleShopRedact(ctx, "test.myshopify.com");
    const rows = await setup.db.select().from(schema.shops);
    expect(rows.length).toBe(0);
  });

  it("purges all KV session entries for the shop", async () => {
    const ctx = makeCtx({ db: setup.db, sessions, cache });
    await handleShopRedact(ctx, "test.myshopify.com");
    expect(await sessions.get("session:offline_test.myshopify.com")).toBeNull();
    expect(await sessions.get("shop-index:test.myshopify.com:offline_test.myshopify.com")).toBeNull();
  });

  it("deletes the widget config cache entry", async () => {
    const ctx = makeCtx({ db: setup.db, sessions, cache });
    await handleShopRedact(ctx, "test.myshopify.com");
    expect(await cache.get("config:test.myshopify.com")).toBeNull();
  });

  it("does not affect other shops' data", async () => {
    await setup.db.insert(schema.shops).values({
      id: "other.myshopify.com",
      scopes: "read_products",
      installedAt: new Date(),
    });
    await sessions.put("session:offline_other.myshopify.com", "other-blob");
    await sessions.put("shop-index:other.myshopify.com:offline_other.myshopify.com", "1");

    const ctx = makeCtx({ db: setup.db, sessions, cache });
    await handleShopRedact(ctx, "test.myshopify.com");

    const remainingShops = await setup.db.select().from(schema.shops);
    expect(remainingShops.length).toBe(1);
    expect(remainingShops[0]!.id).toBe("other.myshopify.com");
    expect(await sessions.get("session:offline_other.myshopify.com")).toBe("other-blob");
  });
});
