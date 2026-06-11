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

  it("enriches QB tier with freeGiftAvailable + bogo.targetAvailable", async () => {
    db.insert(schema.quantityBreaks).values({
      id: "q1", shopId: SHOP, name: "Q",
      status: "active",
      productId: "gid://shopify/Product/1",
      collectionId: null,
      tiers: [{
        qty: 3, discountType: "percentage", discountValue: 10,
        label: "10% off", isMostPopular: true,
        freeGiftVariantId: "gid://shopify/ProductVariant/9",
        bogo: { mode: "add_same", targetVariantId: "gid://shopify/ProductVariant/8", bonusQty: 1 },
      }],
      combinable: false, styleOverrides: null,
      subscription: {
        enabled: true, heading: "Purchase Options", title: "Subscribe & Save",
        subtitle: "Cancel anytime", details: "Flexible billing",
        widgetStyle: "modern", showDiscountLabel: true, hideThirdPartyWidget: false,
      },
      createdAt: new Date(), updatedAt: new Date(),
    }).run();

    // First call: fetchProductDetails for QB main product (gid://shopify/Product/1)
    // Second call: VariantsAvailable query for [gift variant 9, bogo target 8]
    const adminGraphql = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { nodes: [{
          __typename: "Product",
          id: "gid://shopify/Product/1",
          title: "Snowboard",
          featuredImage: { url: "img" },
          variants: { nodes: [{ id: "gid://shopify/ProductVariant/1", title: "Default", availableForSale: true, price: "100.00" }] },
        }]},
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { nodes: [
          { __typename: "ProductVariant", id: "gid://shopify/ProductVariant/9", availableForSale: true },
          { __typename: "ProductVariant", id: "gid://shopify/ProductVariant/8", availableForSale: false },
        ]},
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const admin = { graphql: adminGraphql };

    const cfg = await buildStorefrontConfig(db, admin, SHOP);
    const tier = cfg.quantityBreaks[0]!.tiers[0]!;
    expect(tier.freeGiftAvailable).toBe(true);
    expect(tier.bogo!.targetAvailable).toBe(false);
    expect(cfg.quantityBreaks[0]!.subscription).toEqual({
      enabled: true, heading: "Purchase Options", title: "Subscribe & Save",
      subtitle: "Cancel anytime", details: "Flexible billing",
      widgetStyle: "modern", showDiscountLabel: true, hideThirdPartyWidget: false,
    });
  });

  it("serializes per-tier enabled flag (false preserved, absent => undefined)", async () => {
    db.insert(schema.quantityBreaks).values({
      id: "q1", shopId: SHOP, name: "Q",
      status: "active",
      productId: "gid://shopify/Product/1",
      collectionId: null,
      tiers: [
        { qty: 1, discountType: "percentage", discountValue: 0, label: "Buy 1", isMostPopular: false, enabled: false },
        { qty: 2, discountType: "percentage", discountValue: 10, label: "10% off", isMostPopular: false },
      ],
      combinable: false, styleOverrides: null,
      createdAt: new Date(), updatedAt: new Date(),
    }).run();

    const admin = mockAdmin({
      data: { nodes: [{
        __typename: "Product",
        id: "gid://shopify/Product/1",
        title: "Snowboard",
        featuredImage: { url: "img" },
        variants: { nodes: [{ id: "gid://shopify/ProductVariant/1", title: "Default", availableForSale: true, price: "100.00" }] },
      }]},
    });

    const cfg = await buildStorefrontConfig(db, admin, SHOP);
    expect(cfg.quantityBreaks[0]!.tiers[0]!.enabled).toBe(false);
    expect(cfg.quantityBreaks[0]!.tiers[1]!.enabled).toBeUndefined();
  });

  it("serializes per-tier image + freeShipping", async () => {
    db.insert(schema.quantityBreaks).values({
      id: "q1", shopId: SHOP, name: "Q",
      status: "active",
      productId: "gid://shopify/Product/1",
      collectionId: null,
      tiers: [
        { qty: 1, discountType: "percentage", discountValue: 0, label: "Buy 1", isMostPopular: false, image: "https://cdn/x.png", freeShipping: true },
      ],
      combinable: false, styleOverrides: null,
      createdAt: new Date(), updatedAt: new Date(),
    }).run();

    const admin = mockAdmin({
      data: { nodes: [{
        __typename: "Product",
        id: "gid://shopify/Product/1",
        title: "Snowboard",
        featuredImage: { url: "img" },
        variants: { nodes: [{ id: "gid://shopify/ProductVariant/1", title: "Default", availableForSale: true, price: "100.00" }] },
      }]},
    });

    const cfg = await buildStorefrontConfig(db, admin, SHOP);
    expect(cfg.quantityBreaks[0]!.tiers[0]!.image).toBe("https://cdn/x.png");
    expect(cfg.quantityBreaks[0]!.tiers[0]!.freeShipping).toBe(true);
  });

  it("serializes per-tier soldOut + priceRounding", async () => {
    db.insert(schema.quantityBreaks).values({
      id: "q1", shopId: SHOP, name: "Q",
      status: "active",
      productId: "gid://shopify/Product/1",
      collectionId: null,
      tiers: [
        { qty: 1, discountType: "percentage", discountValue: 0, label: "Buy 1", isMostPopular: false, soldOut: true, priceRounding: 99 },
      ],
      combinable: false, styleOverrides: null,
      createdAt: new Date(), updatedAt: new Date(),
    }).run();

    const admin = mockAdmin({
      data: { nodes: [{
        __typename: "Product",
        id: "gid://shopify/Product/1",
        title: "Snowboard",
        featuredImage: { url: "img" },
        variants: { nodes: [{ id: "gid://shopify/ProductVariant/1", title: "Default", availableForSale: true, price: "100.00" }] },
      }]},
    });

    const cfg = await buildStorefrontConfig(db, admin, SHOP);
    expect(cfg.quantityBreaks[0]!.tiers[0]!.soldOut).toBe(true);
    expect(cfg.quantityBreaks[0]!.tiers[0]!.priceRounding).toBe(99);
  });

  it("emits textOverrides on bundles and quantityBreaks", async () => {
    const bundleId = crypto.randomUUID();
    const qbId = crypto.randomUUID();
    db.insert(schema.bundles).values({
      id: bundleId,
      shopId: SHOP,
      name: "B",
      status: "active",
      products: [
        { productId: "gid://shopify/Product/1", variantId: null, qty: 1 },
        { productId: "gid://shopify/Product/2", variantId: null, qty: 1 },
      ],
      discountType: "percentage",
      discountValue: 10,
      combinable: false,
      triggerProductIds: [],
      styleOverrides: { primaryColor: "#FF0000" },
      textOverrides: { "bundle.totalLabel": "Your cost" },
      headline: "B-headline",
      ctaLabel: "B-cta",
      mode: "classic",
      createdAt: new Date(),
      updatedAt: new Date(),
    }).run();
    db.insert(schema.quantityBreaks).values({
      id: qbId,
      shopId: SHOP,
      name: "Q",
      status: "active",
      productId: "gid://shopify/Product/3",
      tiers: [{ qty: 1, discountType: "percentage", discountValue: 10, label: "Buy 1", isMostPopular: false }],
      combinable: false,
      styleOverrides: { borderRadius: 4 },
      textOverrides: { "qb.mostPopular": "Best" },
      headline: "Q-headline",
      ctaLabel: "Q-cta",
      createdAt: new Date(),
      updatedAt: new Date(),
    }).run();

    const admin = mockAdmin({
      data: {
        nodes: [
          {
            __typename: "Product",
            id: "gid://shopify/Product/1",
            title: "P1",
            featuredImage: { url: "img1" },
            variants: { nodes: [{ id: "gid://shopify/ProductVariant/1", title: "Default", availableForSale: true, price: "10.00" }] },
          },
          {
            __typename: "Product",
            id: "gid://shopify/Product/2",
            title: "P2",
            featuredImage: { url: "img2" },
            variants: { nodes: [{ id: "gid://shopify/ProductVariant/2", title: "Default", availableForSale: true, price: "10.00" }] },
          },
          {
            __typename: "Product",
            id: "gid://shopify/Product/3",
            title: "P3",
            featuredImage: { url: "img3" },
            variants: { nodes: [{ id: "gid://shopify/ProductVariant/3", title: "Default", availableForSale: true, price: "10.00" }] },
          },
        ],
      },
    });

    const cfg = await buildStorefrontConfig(db, admin, SHOP);

    expect(cfg.bundles[0]!.textOverrides).toEqual({ "bundle.totalLabel": "Your cost" });
    expect(cfg.bundles[0]!.styleOverrides).toEqual({ primaryColor: "#FF0000" });
    expect(cfg.quantityBreaks[0]!.textOverrides).toEqual({ "qb.mostPopular": "Best" });
    expect(cfg.quantityBreaks[0]!.styleOverrides).toEqual({ borderRadius: 4 });
    expect(cfg.quantityBreaks[0]!.headline).toBe("Q-headline");
    expect(cfg.quantityBreaks[0]!.ctaLabel).toBe("Q-cta");
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
