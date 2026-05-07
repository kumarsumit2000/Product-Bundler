import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import Database from "better-sqlite3";
import * as schema from "../drizzle/schema";
import { lazyResetIfDue, incrementOrderCount } from "../app/lib/billing/usage";

const SHOP = "s.myshopify.com";

function setup() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  return { db, sqlite };
}

function insertShop(
  db: ReturnType<typeof setup>["db"],
  overrides: Partial<typeof schema.shops.$inferInsert> = {}
) {
  db.insert(schema.shops)
    .values({
      id: SHOP,
      scopes: "",
      installedAt: new Date(),
      plan: "starter",
      monthlyOrderCount: 100,
      lifetimeOrderCount: 100,
      monthlyOrderResetAt: new Date("2026-06-01T00:00:00Z"),
      ...overrides,
    })
    .run();
}

describe("lazyResetIfDue", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it("no-op when monthlyOrderResetAt is in the future", async () => {
    insertShop(s.db);
    const now = new Date("2026-05-15T00:00:00Z"); // before resetAt
    const reset = await lazyResetIfDue(s.db, SHOP, now);
    expect(reset).toBe(false);
    const row = s.db
      .select()
      .from(schema.shops)
      .where(eq(schema.shops.id, SHOP))
      .get();
    expect(row!.monthlyOrderCount).toBe(100);
    expect(row!.monthlyOrderResetAt!.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("advances by exactly 30d, zeroes monthlyOrderCount, leaves lifetime alone", async () => {
    insertShop(s.db);
    const now = new Date("2026-06-02T00:00:00Z"); // 1 day past reset
    const reset = await lazyResetIfDue(s.db, SHOP, now);
    expect(reset).toBe(true);
    const row = s.db
      .select()
      .from(schema.shops)
      .where(eq(schema.shops.id, SHOP))
      .get();
    expect(row!.monthlyOrderCount).toBe(0);
    expect(row!.lifetimeOrderCount).toBe(100); // untouched
    expect(row!.monthlyOrderResetAt!.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("advances multiple cycles in one shot when shop dormant 90+ days", async () => {
    insertShop(s.db);
    const now = new Date("2026-09-15T00:00:00Z"); // ~3.5 cycles past 2026-06-01
    const reset = await lazyResetIfDue(s.db, SHOP, now);
    expect(reset).toBe(true);
    const row = s.db
      .select()
      .from(schema.shops)
      .where(eq(schema.shops.id, SHOP))
      .get();
    expect(row!.monthlyOrderCount).toBe(0);
    // 2026-06-01 + 4*30d = 2026-09-29
    expect(row!.monthlyOrderResetAt!.toISOString()).toBe("2026-09-29T00:00:00.000Z");
  });

  it("no-op when monthlyOrderResetAt is null (free plan)", async () => {
    insertShop(s.db, { plan: "free", monthlyOrderResetAt: null });
    const now = new Date("2026-06-02T00:00:00Z");
    const reset = await lazyResetIfDue(s.db, SHOP, now);
    expect(reset).toBe(false);
    const row = s.db
      .select()
      .from(schema.shops)
      .where(eq(schema.shops.id, SHOP))
      .get();
    expect(row!.monthlyOrderCount).toBe(100); // untouched
  });
});

describe("incrementOrderCount", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it("increments both counters on free plan; never returns overage", async () => {
    s.db
      .insert(schema.shops)
      .values({
        id: SHOP,
        scopes: "",
        installedAt: new Date(),
        plan: "free",
        monthlyOrderCount: 0,
        lifetimeOrderCount: 49,
        monthlyOrderResetAt: null,
      })
      .run();
    const result = await incrementOrderCount(s.db, SHOP);
    expect(result.overageOrders).toBe(0);
    expect(result.isOverFreeCap).toBe(false);
    const row = s.db
      .select()
      .from(schema.shops)
      .where(eq(schema.shops.id, SHOP))
      .get();
    expect(row!.monthlyOrderCount).toBe(1);
    expect(row!.lifetimeOrderCount).toBe(50);
  });

  it("returns isOverFreeCap=true when free shop crosses 50", async () => {
    s.db
      .insert(schema.shops)
      .values({
        id: SHOP,
        scopes: "",
        installedAt: new Date(),
        plan: "free",
        monthlyOrderCount: 0,
        lifetimeOrderCount: 50,
        monthlyOrderResetAt: null,
      })
      .run();
    const result = await incrementOrderCount(s.db, SHOP);
    expect(result.isOverFreeCap).toBe(true);
    expect(result.overageOrders).toBe(0); // no overage on free
  });

  it("returns overageOrders=0 when paid shop is below cap", async () => {
    s.db
      .insert(schema.shops)
      .values({
        id: SHOP,
        scopes: "",
        installedAt: new Date(),
        plan: "starter",
        monthlyOrderCount: 100,
        lifetimeOrderCount: 100,
        monthlyOrderResetAt: new Date("2099-01-01T00:00:00Z"),
      })
      .run();
    const result = await incrementOrderCount(s.db, SHOP);
    expect(result.overageOrders).toBe(0);
    const row = s.db
      .select()
      .from(schema.shops)
      .where(eq(schema.shops.id, SHOP))
      .get();
    expect(row!.monthlyOrderCount).toBe(101);
  });

  it("returns overageOrders=1 the moment paid shop crosses cap", async () => {
    s.db
      .insert(schema.shops)
      .values({
        id: SHOP,
        scopes: "",
        installedAt: new Date(),
        plan: "starter",
        monthlyOrderCount: 300,
        lifetimeOrderCount: 300,
        monthlyOrderResetAt: new Date("2099-01-01T00:00:00Z"),
      })
      .run();
    const result = await incrementOrderCount(s.db, SHOP);
    expect(result.overageOrders).toBe(1);
    const row = s.db
      .select()
      .from(schema.shops)
      .where(eq(schema.shops.id, SHOP))
      .get();
    expect(row!.monthlyOrderCount).toBe(301);
  });

  it("returns overageOrders=1 even when already over cap (each over-cap order bills)", async () => {
    s.db
      .insert(schema.shops)
      .values({
        id: SHOP,
        scopes: "",
        installedAt: new Date(),
        plan: "starter",
        monthlyOrderCount: 350,
        lifetimeOrderCount: 350,
        monthlyOrderResetAt: new Date("2099-01-01T00:00:00Z"),
      })
      .run();
    const result = await incrementOrderCount(s.db, SHOP);
    expect(result.overageOrders).toBe(1);
  });

  it("triggers lazy reset before incrementing", async () => {
    s.db
      .insert(schema.shops)
      .values({
        id: SHOP,
        scopes: "",
        installedAt: new Date(),
        plan: "starter",
        monthlyOrderCount: 290,
        lifetimeOrderCount: 290,
        monthlyOrderResetAt: new Date("2020-01-01T00:00:00Z"), // way in the past
      })
      .run();
    const result = await incrementOrderCount(s.db, SHOP);
    expect(result.overageOrders).toBe(0); // counter reset to 0, then ++ to 1, under cap
    const row = s.db
      .select()
      .from(schema.shops)
      .where(eq(schema.shops.id, SHOP))
      .get();
    expect(row!.monthlyOrderCount).toBe(1);
    expect(row!.lifetimeOrderCount).toBe(291);
  });
});
