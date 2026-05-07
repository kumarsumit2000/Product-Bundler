import { describe, it, expect, beforeEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "../drizzle/schema";
import { buildStorefrontConfig } from "../app/lib/storefront-config";

const SHOP = "s.myshopify.com";

function setup() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  db.insert(schema.shops).values({ id: SHOP, scopes: "", installedAt: new Date() }).run();
  db.insert(schema.shopSettings).values({ shopId: SHOP }).run();
  return db;
}

function mockAdmin(json: unknown) {
  return {
    graphql: vi.fn().mockResolvedValue(new Response(JSON.stringify(json), { status: 200, headers: { "Content-Type": "application/json" } })),
  };
}

describe("buildStorefrontConfig", () => {
  let db: ReturnType<typeof setup>;
  beforeEach(() => { db = setup(); });

  it("returns settings + active classic bundles + qbs", async () => {
    db.insert(schema.bundles).values({
      id: "b1", shopId: SHOP, name: "B1", status: "active",
      products: [{ productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/11", qty: 1 }],
      discountType: "percentage", discountValue: 10, combinable: false,
      triggerProductIds: [], styleOverrides: null, headline: null, ctaLabel: null,
      mode: "classic", collectionId: null, targetQty: null,
      createdAt: new Date(), updatedAt: new Date(),
    }).run();

    const admin = mockAdmin({
      data: {
        nodes: [{
          __typename: "Product",
          id: "gid://shopify/Product/1",
          title: "P1",
          featuredImage: { url: "img1" },
          variants: { nodes: [{ id: "gid://shopify/ProductVariant/11", title: "Default", availableForSale: true, price: "100.00" }] },
        }],
      },
    });

    const cfg = await buildStorefrontConfig(db, admin, SHOP);
    expect(cfg.shop).toBe(SHOP);
    expect(cfg.bundles.length).toBe(1);
    expect(cfg.bundles[0]!.products[0]!.title).toBe("P1");
    expect(cfg.bundles[0]!.products[0]!.priceCents).toBe(10000);
    expect(cfg.bundles[0]!.products[0]!.available).toBe(true);
  });

  it("excludes draft and paused bundles + qbs", async () => {
    db.insert(schema.bundles).values({
      id: "b1", shopId: SHOP, name: "B1", status: "draft",
      products: [],
      discountType: "percentage", discountValue: 10, combinable: false,
      triggerProductIds: [], styleOverrides: null, headline: null, ctaLabel: null,
      mode: "classic", collectionId: null, targetQty: null,
      createdAt: new Date(), updatedAt: new Date(),
    }).run();
    const admin = mockAdmin({ data: { nodes: [] } });
    const cfg = await buildStorefrontConfig(db, admin, SHOP);
    expect(cfg.bundles.length).toBe(0);
  });

  it("includes mix_match collectionProducts in payload", async () => {
    db.insert(schema.bundles).values({
      id: "mm1", shopId: SHOP, name: "MM", status: "active",
      products: [],
      discountType: "percentage", discountValue: 20, combinable: false,
      triggerProductIds: [], styleOverrides: null, headline: null, ctaLabel: null,
      mode: "mix_match", collectionId: "gid://shopify/Collection/1", targetQty: 3,
      createdAt: new Date(), updatedAt: new Date(),
    }).run();

    // Only one graphql call: collection.products (fetchProductDetails short-circuits on empty ids)
    const adminGraphql = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { collection: { products: { nodes: [
          { id: "gid://shopify/Product/9", title: "Tee", featuredImage: { url: "img" }, variants: { nodes: [{ id: "v9", availableForSale: true, price: "24.00" }] } },
        ]}}},
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const admin = { graphql: adminGraphql };

    const cfg = await buildStorefrontConfig(db, admin, SHOP);
    expect(cfg.bundles[0]!.collectionProducts?.length).toBe(1);
    expect(cfg.bundles[0]!.collectionProducts?.[0]?.productId).toBe("gid://shopify/Product/9");
  });
});
