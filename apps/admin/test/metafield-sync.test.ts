import { describe, it, expect, beforeEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../drizzle/schema";
import * as bundleRepo from "../app/lib/bundles/repo";
import * as qbRepo from "../app/lib/quantity-breaks/repo";
import { syncShopConfig } from "../app/lib/metafield-sync";

function setupDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  return { db, sqlite };
}

const SHOP = "test.myshopify.com";
const SHOP_GID = "gid://shopify/Shop/12345";

function makeAdmin(opts: { shopGid?: string } = {}) {
  const calls: Array<{ query: string; variables?: unknown }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = {
    graphql: vi.fn(async (query: string, options?: { variables?: unknown }) => {
      calls.push({ query, variables: options?.variables });
      if (query.includes("shop { id }")) {
        return new Response(
          JSON.stringify({ data: { shop: { id: opts.shopGid ?? SHOP_GID } } }),
        );
      }
      return new Response(JSON.stringify({ data: { metafieldsSet: { userErrors: [] } } }));
    }),
  };
  return { admin, calls };
}

describe("syncShopConfig", () => {
  let setup: ReturnType<typeof setupDb>;

  beforeEach(async () => {
    setup = setupDb();
    await setup.db.insert(schema.shops).values({
      id: SHOP,
      scopes: "",
      installedAt: new Date(),
    });
  });

  it("writes empty config when shop has no bundles or QBs", async () => {
    const { admin, calls } = makeAdmin();
    await syncShopConfig(setup.db, admin, SHOP);
    const setCall = calls.find((c) => c.query.includes("metafieldsSet"));
    expect(setCall).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = JSON.parse((setCall!.variables as any).metafields[0]!.value);
    expect(value).toEqual({
      schemaVersion: 1,
      bundles: [],
      quantityBreaks: [],
      progressiveGifts: [],
    });
  });

  it("includes bundles in config", async () => {
    await bundleRepo.create(setup.db, SHOP, {
      name: "B",
      status: "active",
      mode: "classic",
      products: [
        { productId: "gid://shopify/Product/1", variantId: null, qty: 1 },
        { productId: "gid://shopify/Product/2", variantId: null, qty: 1 },
      ],
      collectionId: null,
      bindToCurrentCollection: false,
      targetQty: null,
      sortOrder: 0,
      activeStartAt: null,
      activeEndAt: null,
      discountType: "percentage",
      discountValue: 20,
      combinable: false,
      triggerProductIds: [],
      styleOverrides: null,
      textOverrides: null,
      headline: null,
      ctaLabel: null,
      freeGiftVariantId: null,
      freeGiftProductId: null,
      subscription: null,
      linkedCountdownId: null,
      linkedProgressiveGiftId: null,
      stickyAtc: null,
      addonsOrder: null,
      visibility: "same_as_members",
      visibilityCollectionIds: [],
    });
    const { admin, calls } = makeAdmin();
    await syncShopConfig(setup.db, admin, SHOP);
    const setCall = calls.find((c) => c.query.includes("metafieldsSet"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = JSON.parse((setCall!.variables as any).metafields[0]!.value);
    expect(value.bundles.length).toBe(1);
    expect(value.bundles[0]!.name).toBe("B");
  });

  it("includes QBs in config", async () => {
    await qbRepo.create(setup.db, SHOP, {
      name: "Q",
      status: "active",
      productId: "gid://shopify/Product/1",
      collectionId: null,
      tiers: [
        {
          qty: 1,
          discountType: "percentage",
          discountValue: 5,
          label: "5%",
          isMostPopular: false,
        },
      ],
      combinable: false,
      bindToCurrentProduct: false,
      sortOrder: 0,
      activeStartAt: null,
      activeEndAt: null,
      styleOverrides: null,
      textOverrides: null,
      headline: null,
      ctaLabel: null,
      visibility: "specific",
      visibilityProductIds: [],
      visibilityCollectionIds: [],
      checkboxUpsellsEnabled: false,
      checkboxUpsells: [],
      linkedCountdownId: null,
      linkedProgressiveGiftId: null,
      stickyAtc: null,
      addonsOrder: null,
      freeGiftVariantId: null,
      freeGiftProductId: null,
      subscription: null,
      freeGiftMinQty: 1,
    });
    const { admin, calls } = makeAdmin();
    await syncShopConfig(setup.db, admin, SHOP);
    const setCall = calls.find((c) => c.query.includes("metafieldsSet"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = JSON.parse((setCall!.variables as any).metafields[0]!.value);
    expect(value.quantityBreaks.length).toBe(1);
  });

  it("caches shop GID in shops table after first call", async () => {
    const { admin } = makeAdmin();
    await syncShopConfig(setup.db, admin, SHOP);
    const rows = await setup.db
      .select()
      .from(schema.shops)
      .where(eq(schema.shops.id, SHOP));
    expect(rows[0]!.shopifyShopGid).toBe(SHOP_GID);
  });

  it("includes mix_match mode + collectionId + targetQty in synced metafield", async () => {
    await bundleRepo.create(setup.db, SHOP, {
      name: "MM",
      status: "active",
      products: [],
      discountType: "percentage",
      discountValue: 20,
      combinable: false,
      triggerProductIds: [],
      styleOverrides: null,
      textOverrides: null,
      headline: null,
      ctaLabel: null,
      freeGiftVariantId: null,
      freeGiftProductId: null,
      subscription: null,
      mode: "mix_match",
      collectionId: "gid://shopify/Collection/9",
      bindToCurrentCollection: false,
      targetQty: 3,
      sortOrder: 0,
      activeStartAt: null,
      activeEndAt: null,
      linkedCountdownId: null,
      linkedProgressiveGiftId: null,
      stickyAtc: null,
      addonsOrder: null,
      visibility: "same_as_members",
      visibilityCollectionIds: [],
    });
    const { admin, calls } = makeAdmin();
    await syncShopConfig(setup.db, admin, SHOP);
    const setCall = calls.find((c) => c.query.includes("metafieldsSet"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = JSON.parse((setCall!.variables as any).metafields[0]!.value);
    expect(value.bundles[0].mode).toBe("mix_match");
    expect(value.bundles[0].collectionId).toBe("gid://shopify/Collection/9");
    expect(value.bundles[0].targetQty).toBe(3);
  });

  it("includes freeGiftVariantId + bogo in synced QB tier metafield", async () => {
    await qbRepo.create(setup.db, SHOP, {
      name: "Q",
      status: "active",
      productId: "gid://shopify/Product/1",
      collectionId: null,
      tiers: [
        {
          qty: 3,
          discountType: "percentage",
          discountValue: 10,
          label: "10% off",
          isMostPopular: true,
          freeGiftVariantId: "gid://shopify/ProductVariant/9",
          bogo: {
            mode: "add_same",
            targetVariantId: "gid://shopify/ProductVariant/8",
            bonusQty: 1,
          },
        },
      ],
      combinable: false,
      bindToCurrentProduct: false,
      sortOrder: 0,
      activeStartAt: null,
      activeEndAt: null,
      styleOverrides: null,
      textOverrides: null,
      headline: null,
      ctaLabel: null,
      visibility: "specific",
      visibilityProductIds: [],
      visibilityCollectionIds: [],
      checkboxUpsellsEnabled: false,
      checkboxUpsells: [],
      linkedCountdownId: null,
      linkedProgressiveGiftId: null,
      stickyAtc: null,
      addonsOrder: null,
      freeGiftVariantId: null,
      freeGiftProductId: null,
      subscription: null,
      freeGiftMinQty: 1,
    });
    const { admin, calls } = makeAdmin();
    await syncShopConfig(setup.db, admin, SHOP);
    const setCall = calls.find((c) => c.query.includes("metafieldsSet"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = JSON.parse((setCall!.variables as any).metafields[0]!.value);
    const tier = value.quantityBreaks[0].tiers[0];
    expect(tier.freeGiftVariantId).toBe("gid://shopify/ProductVariant/9");
    expect(tier.bogo.mode).toBe("add_same");
    expect(tier.bogo.targetVariantId).toBe("gid://shopify/ProductVariant/8");
    expect(tier.bogo.bonusQty).toBe(1);
  });

  it("syncs freeShipping but omits image from QB tier metafield", async () => {
    await qbRepo.create(setup.db, SHOP, {
      name: "Q",
      status: "active",
      productId: "gid://shopify/Product/1",
      collectionId: null,
      tiers: [
        {
          qty: 3,
          discountType: "percentage",
          discountValue: 10,
          label: "10% off",
          isMostPopular: true,
          image: "x",
          freeShipping: true,
        },
      ],
      combinable: false,
      bindToCurrentProduct: false,
      sortOrder: 0,
      activeStartAt: null,
      activeEndAt: null,
      styleOverrides: null,
      textOverrides: null,
      headline: null,
      ctaLabel: null,
      visibility: "specific",
      visibilityProductIds: [],
      visibilityCollectionIds: [],
      checkboxUpsellsEnabled: false,
      checkboxUpsells: [],
      linkedCountdownId: null,
      linkedProgressiveGiftId: null,
      stickyAtc: null,
      addonsOrder: null,
      freeGiftVariantId: null,
      freeGiftProductId: null,
      subscription: null,
      freeGiftMinQty: 1,
    });
    const { admin, calls } = makeAdmin();
    await syncShopConfig(setup.db, admin, SHOP);
    const setCall = calls.find((c) => c.query.includes("metafieldsSet"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = JSON.parse((setCall!.variables as any).metafields[0]!.value);
    const syncedTier = value.quantityBreaks[0].tiers[0];
    expect(syncedTier.freeShipping).toBe(true);
    expect(syncedTier.image).toBeUndefined();
  });

  it("syncs priceRounding but omits soldOut from QB tier metafield", async () => {
    await qbRepo.create(setup.db, SHOP, {
      name: "Q",
      status: "active",
      productId: "gid://shopify/Product/1",
      collectionId: null,
      tiers: [
        {
          qty: 2,
          discountType: "percentage",
          discountValue: 20,
          label: "20% off",
          isMostPopular: false,
          soldOut: true,
          priceRounding: 99,
        },
      ],
      combinable: false,
      bindToCurrentProduct: false,
      sortOrder: 0,
      activeStartAt: null,
      activeEndAt: null,
      styleOverrides: null,
      textOverrides: null,
      headline: null,
      ctaLabel: null,
      visibility: "specific",
      visibilityProductIds: [],
      visibilityCollectionIds: [],
      checkboxUpsellsEnabled: false,
      checkboxUpsells: [],
      linkedCountdownId: null,
      linkedProgressiveGiftId: null,
      stickyAtc: null,
      addonsOrder: null,
      freeGiftVariantId: null,
      freeGiftProductId: null,
      subscription: null,
      freeGiftMinQty: 1,
    });
    const { admin, calls } = makeAdmin();
    await syncShopConfig(setup.db, admin, SHOP);
    const setCall = calls.find((c) => c.query.includes("metafieldsSet"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = JSON.parse((setCall!.variables as any).metafields[0]!.value);
    const syncedTier = value.quantityBreaks[0].tiers[0];
    expect(syncedTier.priceRounding).toBe(99);
    expect(syncedTier.soldOut).toBeUndefined();
  });

  it("throws when JSON exceeds 50KB", async () => {
    await bundleRepo.create(setup.db, SHOP, {
      name: "Big",
      status: "active",
      mode: "classic",
      products: [
        { productId: "gid://shopify/Product/1", variantId: null, qty: 1 },
        { productId: "gid://shopify/Product/2", variantId: null, qty: 1 },
      ],
      collectionId: null,
      bindToCurrentCollection: false,
      targetQty: null,
      sortOrder: 0,
      activeStartAt: null,
      activeEndAt: null,
      discountType: "percentage",
      discountValue: 20,
      combinable: false,
      triggerProductIds: [],
      styleOverrides: null,
      textOverrides: null,
      headline: "x".repeat(60_000),
      ctaLabel: null,
      freeGiftVariantId: null,
      freeGiftProductId: null,
      subscription: null,
      linkedCountdownId: null,
      linkedProgressiveGiftId: null,
      stickyAtc: null,
      addonsOrder: null,
      visibility: "same_as_members",
      visibilityCollectionIds: [],
    });
    const { admin } = makeAdmin();
    await expect(syncShopConfig(setup.db, admin, SHOP)).rejects.toThrow(
      /exceeds.*safety limit/,
    );
  });
});
