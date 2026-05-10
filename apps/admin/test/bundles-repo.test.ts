import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "../drizzle/schema";
import * as repo from "../app/lib/bundles/repo";

function setupDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  return { db, sqlite };
}

const SHOP_A = "shop-a.myshopify.com";
const SHOP_B = "shop-b.myshopify.com";

const NEW_BUNDLE_INPUT = {
  name: "Test bundle",
  status: "draft" as const,
  products: [
    { productId: "gid://shopify/Product/1", variantId: null, qty: 1 },
    { productId: "gid://shopify/Product/2", variantId: null, qty: 1 },
  ],
  discountType: "percentage",
  discountValue: 20,
  combinable: false,
  triggerProductIds: [],
  styleOverrides: null,
  textOverrides: null,
      subscription: null,
  headline: null,
  ctaLabel: null,
  freeGiftVariantId: null,
  mode: "classic" as const,
  collectionId: null,
  targetQty: null,
  linkedCountdownId: null,
  linkedProgressiveGiftId: null,
};

describe("bundles repo", () => {
  let setup: ReturnType<typeof setupDb>;

  beforeEach(() => {
    setup = setupDb();
    setup.db.insert(schema.shops).values({ id: SHOP_A, scopes: "", installedAt: new Date() }).run();
    setup.db.insert(schema.shops).values({ id: SHOP_B, scopes: "", installedAt: new Date() }).run();
  });

  it("create + listByShop returns the new bundle", async () => {
    const created = await repo.create(setup.db, SHOP_A, NEW_BUNDLE_INPUT);
    const list = await repo.listByShop(setup.db, SHOP_A);
    expect(list.length).toBe(1);
    expect(list[0]!.id).toBe(created.id);
    expect(list[0]!.name).toBe("Test bundle");
  });

  it("getById returns the bundle for the right shop", async () => {
    const created = await repo.create(setup.db, SHOP_A, NEW_BUNDLE_INPUT);
    const got = await repo.getById(setup.db, SHOP_A, created.id);
    expect(got).not.toBeNull();
    expect(got!.id).toBe(created.id);
  });

  it("getById returns null for the wrong shop (multi-tenancy)", async () => {
    const created = await repo.create(setup.db, SHOP_A, NEW_BUNDLE_INPUT);
    const got = await repo.getById(setup.db, SHOP_B, created.id);
    expect(got).toBeNull();
  });

  it("update modifies the bundle", async () => {
    const created = await repo.create(setup.db, SHOP_A, NEW_BUNDLE_INPUT);
    await repo.update(setup.db, SHOP_A, created.id, { discountValue: 30 });
    const got = await repo.getById(setup.db, SHOP_A, created.id);
    expect(got!.discountValue).toBe(30);
  });

  it("update on wrong shop is a no-op", async () => {
    const created = await repo.create(setup.db, SHOP_A, NEW_BUNDLE_INPUT);
    await repo.update(setup.db, SHOP_B, created.id, { discountValue: 99 });
    const got = await repo.getById(setup.db, SHOP_A, created.id);
    expect(got!.discountValue).toBe(20);
  });

  it("listByShop returns only that shop's bundles", async () => {
    await repo.create(setup.db, SHOP_A, NEW_BUNDLE_INPUT);
    await repo.create(setup.db, SHOP_B, NEW_BUNDLE_INPUT);
    const listA = await repo.listByShop(setup.db, SHOP_A);
    const listB = await repo.listByShop(setup.db, SHOP_B);
    expect(listA.length).toBe(1);
    expect(listB.length).toBe(1);
    expect(listA[0]!.shopId).toBe(SHOP_A);
    expect(listB[0]!.shopId).toBe(SHOP_B);
  });

  it("creates a mix_match bundle with collectionId + targetQty", async () => {
    const created = await repo.create(setup.db, SHOP_A, {
      ...NEW_BUNDLE_INPUT,
      products: [],
      mode: "mix_match",
      collectionId: "gid://shopify/Collection/123",
      targetQty: 3,
    });
    const got = await repo.getById(setup.db, SHOP_A, created.id);
    expect(got).not.toBeNull();
    expect(got!.mode).toBe("mix_match");
    expect(got!.collectionId).toBe("gid://shopify/Collection/123");
    expect(got!.targetQty).toBe(3);
    expect(got!.products).toEqual([]);
  });

  it("stores classic mode with null collectionId and targetQty", async () => {
    const created = await repo.create(setup.db, SHOP_A, NEW_BUNDLE_INPUT);
    expect(created.mode).toBe("classic");
    expect(created.collectionId).toBeNull();
    expect(created.targetQty).toBeNull();
  });

  it("persists styleOverrides + textOverrides + headline + ctaLabel round-trip", async () => {
    const created = await repo.create(setup.db, SHOP_A, {
      ...NEW_BUNDLE_INPUT,
      styleOverrides: { primaryColor: "#FF0000", borderRadius: 12 },
      textOverrides: { "bundle.totalLabel": "Your total", "bundle.savingsBadge": "Save {savings}!" },
      headline: "Bundle deal",
      ctaLabel: "Buy now",
    });
    const got = await repo.getById(setup.db, SHOP_A, created.id);
    expect(got!.styleOverrides).toEqual({ primaryColor: "#FF0000", borderRadius: 12 });
    expect(got!.textOverrides).toEqual({
      "bundle.totalLabel": "Your total",
      "bundle.savingsBadge": "Save {savings}!",
    });
    expect(got!.headline).toBe("Bundle deal");
    expect(got!.ctaLabel).toBe("Buy now");
  });

  it("textOverrides defaults to null when not provided", async () => {
    const created = await repo.create(setup.db, SHOP_A, NEW_BUNDLE_INPUT);
    const got = await repo.getById(setup.db, SHOP_A, created.id);
    expect(got!.textOverrides).toBeNull();
  });
});
