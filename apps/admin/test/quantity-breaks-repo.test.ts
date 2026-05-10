import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "../drizzle/schema";
import * as repo from "../app/lib/quantity-breaks/repo";

function setupDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  return { db, sqlite };
}

const SHOP_A = "shop-a.myshopify.com";
const SHOP_B = "shop-b.myshopify.com";

const NEW_QB_INPUT = {
  name: "Test QB",
  status: "draft" as const,
  productId: "gid://shopify/Product/1",
  collectionId: null,
  tiers: [
    { qty: 1, discountType: "percentage" as const, discountValue: 0, label: "Buy 1", isMostPopular: false },
    { qty: 2, discountType: "percentage" as const, discountValue: 10, label: "10% off", isMostPopular: true },
  ],
  combinable: false,
  styleOverrides: null,
  textOverrides: null,
      subscription: null,
  headline: null,
  ctaLabel: null,
  visibility: "specific" as const,
  visibilityProductIds: [],
  visibilityCollectionIds: [],
  checkboxUpsellsEnabled: false,
  checkboxUpsells: [],
  linkedCountdownId: null,
  linkedProgressiveGiftId: null,
  stickyAtc: null,
  addonsOrder: null,
};

describe("quantity-breaks repo", () => {
  let setup: ReturnType<typeof setupDb>;

  beforeEach(() => {
    setup = setupDb();
    setup.db.insert(schema.shops).values({ id: SHOP_A, scopes: "", installedAt: new Date() }).run();
    setup.db.insert(schema.shops).values({ id: SHOP_B, scopes: "", installedAt: new Date() }).run();
  });

  it("create + listByShop returns the new quantity break", async () => {
    const created = await repo.create(setup.db, SHOP_A, NEW_QB_INPUT);
    const list = await repo.listByShop(setup.db, SHOP_A);
    expect(list.length).toBe(1);
    expect(list[0]!.id).toBe(created.id);
    expect(list[0]!.name).toBe("Test QB");
  });

  it("getById returns the quantity break for the right shop", async () => {
    const created = await repo.create(setup.db, SHOP_A, NEW_QB_INPUT);
    const got = await repo.getById(setup.db, SHOP_A, created.id);
    expect(got).not.toBeNull();
    expect(got!.id).toBe(created.id);
  });

  it("getById returns null for the wrong shop (multi-tenancy)", async () => {
    const created = await repo.create(setup.db, SHOP_A, NEW_QB_INPUT);
    const got = await repo.getById(setup.db, SHOP_B, created.id);
    expect(got).toBeNull();
  });

  it("update modifies the quantity break", async () => {
    const created = await repo.create(setup.db, SHOP_A, NEW_QB_INPUT);
    await repo.update(setup.db, SHOP_A, created.id, { name: "Updated QB" });
    const got = await repo.getById(setup.db, SHOP_A, created.id);
    expect(got!.name).toBe("Updated QB");
  });

  it("update on wrong shop is a no-op", async () => {
    const created = await repo.create(setup.db, SHOP_A, NEW_QB_INPUT);
    await repo.update(setup.db, SHOP_B, created.id, { name: "evil" });
    const got = await repo.getById(setup.db, SHOP_A, created.id);
    expect(got!.name).toBe("Test QB");
  });

  it("listByShop returns only that shop's quantity breaks", async () => {
    await repo.create(setup.db, SHOP_A, NEW_QB_INPUT);
    await repo.create(setup.db, SHOP_B, NEW_QB_INPUT);
    const listA = await repo.listByShop(setup.db, SHOP_A);
    const listB = await repo.listByShop(setup.db, SHOP_B);
    expect(listA.length).toBe(1);
    expect(listB.length).toBe(1);
    expect(listA[0]!.shopId).toBe(SHOP_A);
    expect(listB[0]!.shopId).toBe(SHOP_B);
  });

  it("persists styleOverrides + textOverrides + headline + ctaLabel round-trip", async () => {
    const created = await repo.create(setup.db, SHOP_A, {
      ...NEW_QB_INPUT,
      styleOverrides: { primaryColor: "#00AA88" },
      textOverrides: { "qb.tierLabel": "Get {qty}", "qb.mostPopular": "Best deal" },
      headline: "Volume savings",
      ctaLabel: "Add to cart now",
    });
    const got = await repo.getById(setup.db, SHOP_A, created.id);
    expect(got!.styleOverrides).toEqual({ primaryColor: "#00AA88" });
    expect(got!.textOverrides).toEqual({ "qb.tierLabel": "Get {qty}", "qb.mostPopular": "Best deal" });
    expect(got!.headline).toBe("Volume savings");
    expect(got!.ctaLabel).toBe("Add to cart now");
  });
});
