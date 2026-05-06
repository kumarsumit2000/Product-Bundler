import { describe, it, expect, beforeEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../drizzle/schema";
import { ensureDiscountNodes } from "../app/lib/discount-nodes";

function setupDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  return db;
}

const SHOP = "test.myshopify.com";
const FUNCTION_ID = "gid://shopify/ShopifyFunction/abc123";
const COMBINABLE_GID = "gid://shopify/DiscountAutomaticNode/com1";
const NON_COMBINABLE_GID = "gid://shopify/DiscountAutomaticNode/non1";

function makeAdmin(opts: {
  fnId?: string;
  combinableId?: string;
  nonCombinableId?: string;
} = {}) {
  const calls: { query: string; variables?: unknown }[] = [];
  let createCount = 0;
  const admin = {
    graphql: vi.fn(async (query: string, options?: { variables?: unknown }) => {
      calls.push({ query, variables: options?.variables });
      if (query.includes("shopifyFunctions")) {
        return new Response(JSON.stringify({
          data: {
            shopifyFunctions: {
              nodes: [{ id: opts.fnId ?? FUNCTION_ID, title: "discount-function" }],
            },
          },
        }));
      }
      if (query.includes("discountAutomaticAppCreate")) {
        const vars = options?.variables as { d: { combinesWith: { productDiscounts: boolean } } };
        const isCombinable = vars?.d?.combinesWith?.productDiscounts === true;
        const id = isCombinable
          ? (opts.combinableId ?? COMBINABLE_GID)
          : (opts.nonCombinableId ?? NON_COMBINABLE_GID);
        createCount++;
        return new Response(JSON.stringify({
          data: {
            discountAutomaticAppCreate: {
              automaticAppDiscount: { discountId: id },
              userErrors: [],
            },
          },
        }));
      }
      return new Response(JSON.stringify({}));
    }),
  };
  return { admin, calls, getCreateCount: () => createCount };
}

describe("ensureDiscountNodes", () => {
  let db: ReturnType<typeof setupDb>;

  beforeEach(async () => {
    db = setupDb();
    await db.insert(schema.shops).values({
      id: SHOP,
      scopes: "",
      installedAt: new Date(),
    });
  });

  it("creates both nodes when shops row has neither", async () => {
    const { admin, getCreateCount } = makeAdmin();
    const result = await ensureDiscountNodes(admin, db, SHOP);
    expect(getCreateCount()).toBe(2);
    expect(result.combinable).toBe(COMBINABLE_GID);
    expect(result.nonCombinable).toBe(NON_COMBINABLE_GID);
  });

  it("returns existing IDs without mutations when both already present", async () => {
    await db.update(schema.shops).set({
      shopifyDiscountIdCombinable: "existing-com",
      shopifyDiscountIdNonCombinable: "existing-non",
    }).where(eq(schema.shops.id, SHOP));

    const { admin, getCreateCount } = makeAdmin();
    const result = await ensureDiscountNodes(admin, db, SHOP);
    expect(getCreateCount()).toBe(0);
    expect(result.combinable).toBe("existing-com");
    expect(result.nonCombinable).toBe("existing-non");
  });

  it("creates only the missing one when half already exists", async () => {
    await db.update(schema.shops).set({
      shopifyDiscountIdCombinable: "existing-com",
    }).where(eq(schema.shops.id, SHOP));

    const { admin, getCreateCount } = makeAdmin();
    const result = await ensureDiscountNodes(admin, db, SHOP);
    expect(getCreateCount()).toBe(1);
    expect(result.combinable).toBe("existing-com");
    expect(result.nonCombinable).toBe(NON_COMBINABLE_GID);
  });

  it("persists IDs to D1 after creation", async () => {
    const { admin } = makeAdmin();
    await ensureDiscountNodes(admin, db, SHOP);
    const row = (await db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)))[0];
    expect(row!.shopifyDiscountIdCombinable).toBe(COMBINABLE_GID);
    expect(row!.shopifyDiscountIdNonCombinable).toBe(NON_COMBINABLE_GID);
  });

  it("calls discountAutomaticAppCreate with combinesWith.* = true for combinable kind", async () => {
    const { admin, calls } = makeAdmin();
    await ensureDiscountNodes(admin, db, SHOP);
    const combinableCall = calls.find((c) => {
      if (!c.query.includes("discountAutomaticAppCreate")) return false;
      const vars = c.variables as { d: { combinesWith: { productDiscounts: boolean } } };
      return vars.d.combinesWith.productDiscounts === true;
    });
    expect(combinableCall).toBeDefined();
    const vars = combinableCall!.variables as { d: { combinesWith: { productDiscounts: boolean; orderDiscounts: boolean; shippingDiscounts: boolean } } };
    expect(vars.d.combinesWith.orderDiscounts).toBe(true);
    expect(vars.d.combinesWith.shippingDiscounts).toBe(true);
  });

  it("attaches correct nodeKind metafield value per kind", async () => {
    const { admin, calls } = makeAdmin();
    await ensureDiscountNodes(admin, db, SHOP);
    const createCalls = calls.filter((c) => c.query.includes("discountAutomaticAppCreate"));
    const kinds = createCalls.map((c) => {
      const vars = c.variables as { d: { metafields: { value: string }[] } };
      // metafield value is JSON; parse to extract nodeKind
      const parsed = JSON.parse(vars.d.metafields[0]!.value);
      return parsed.nodeKind;
    });
    expect(kinds.sort()).toEqual(["combinable", "non_combinable"]);
  });
});
