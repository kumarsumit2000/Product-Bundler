import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "../drizzle/schema";
import { writeStorefrontEvent } from "../app/lib/analytics/events-write";

function setup() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  return { db, sqlite };
}

const SHOP = "s.myshopify.com";

describe("writeStorefrontEvent", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
    s.db.insert(schema.shops).values({ id: SHOP, scopes: "", installedAt: new Date() }).run();
  });

  it("inserts a row with all fields populated", async () => {
    await writeStorefrontEvent(s.db, SHOP, {
      type: "widget_impression",
      widgetType: "bundle",
      widgetId: "b1",
      productId: "p1",
      tierQty: 3,
      valueCents: 1234,
      ts: 1700000000000,
    });
    const rows = s.db.select().from(schema.events).all();
    expect(rows.length).toBe(1);
    expect(rows[0]!.shopId).toBe(SHOP);
    expect(rows[0]!.type).toBe("widget_impression");
    expect(rows[0]!.widgetType).toBe("bundle");
    expect(rows[0]!.widgetId).toBe("b1");
    expect(rows[0]!.productId).toBe("p1");
    expect(rows[0]!.tierQty).toBe(3);
    expect(rows[0]!.valueCents).toBe(1234);
    expect(rows[0]!.ts).toBe(1700000000000);
  });

  it("coerces missing optional fields to null/0", async () => {
    await writeStorefrontEvent(s.db, SHOP, {
      type: "widget_click",
      widgetType: "qb",
      widgetId: "q1",
      ts: 1700000000000,
    });
    const rows = s.db.select().from(schema.events).all();
    expect(rows[0]!.productId).toBeNull();
    expect(rows[0]!.tierQty).toBeNull();
    expect(rows[0]!.valueCents).toBe(0);
  });

  it("generates a unique id for each event", async () => {
    await writeStorefrontEvent(s.db, SHOP, { type: "add_to_cart", widgetType: "bundle", widgetId: "b1", ts: 1 });
    await writeStorefrontEvent(s.db, SHOP, { type: "add_to_cart", widgetType: "bundle", widgetId: "b1", ts: 2 });
    const rows = s.db.select().from(schema.events).all();
    expect(rows.length).toBe(2);
    expect(rows[0]!.id).not.toBe(rows[1]!.id);
  });
});
