# Phase 2 — Bundle + QB CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build merchant-facing CRUD for Bundles and Quantity Breaks. Each save validates input, writes to D1, syncs full config JSON to shop metafield via Admin GraphQL, and invalidates the storefront cache.

**Architecture:** Pure validation functions + repos for D1 access (multi-tenancy via required `shopId`) + metafield sync helper. Routes wire these together. UI uses Polaris components + App Bridge `resourcePicker`. Component tests deferred to Phase 8 — TDD applied to validation, repo, and metafield-sync layers.

**Tech Stack:** Same as Phase 1 — Remix on Cloudflare Pages, `@shopify/shopify-app-remix`, Drizzle/D1, Polaris v13, App Bridge React v4, Vitest.

**Spec this plan implements:** [`docs/superpowers/specs/2026-05-06-phase-2-bundle-qb-crud-design.md`](../specs/2026-05-06-phase-2-bundle-qb-crud-design.md)

---

## Task 1: Schema migration (3 new tables + 1 column)

**Files:**
- Modify: `apps/admin/drizzle/schema.ts`
- Create: `apps/admin/drizzle/migrations/0001_*.sql` (auto-generated)

- [ ] **Step 1: Replace `apps/admin/drizzle/schema.ts` with the full Phase 2 schema**

```ts
import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const shops = sqliteTable("shops", {
  id: text("id").primaryKey(),
  scopes: text("scopes").notNull(),
  installedAt: integer("installed_at", { mode: "timestamp" }).notNull(),
  uninstalledAt: integer("uninstalled_at", { mode: "timestamp" }),
  plan: text("plan").notNull().default("free"),
  planActivatedAt: integer("plan_activated_at", { mode: "timestamp" }),
  trialEndsAt: integer("trial_ends_at", { mode: "timestamp" }),
  shopifyChargeId: text("shopify_charge_id"),
  shopifyDiscountId: text("shopify_discount_id"),
  shopifyShopGid: text("shopify_shop_gid"),
  currency: text("currency").notNull().default("USD"),
  primaryLocale: text("primary_locale").notNull().default("en"),
  attributedRevenueCents: integer("attributed_revenue_cents").notNull().default(0),
});

export type BundleProduct = {
  productId: string;
  variantId: string | null;
  qty: number;
};

export type QbTier = {
  qty: number;
  discountType: "percentage" | "flat" | "fixed_per_unit";
  discountValue: number;
  label: string;
  isMostPopular: boolean;
  freeGiftVariantId?: string;
  bogoTargetVariantId?: string;
};

export type StyleOverrides = Partial<{
  primaryColor: string;
  textColor: string;
  backgroundColor: string;
  borderRadius: number;
}>;

export const bundles = sqliteTable("bundles", {
  id: text("id").primaryKey(),
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"),
  products: text("products", { mode: "json" }).$type<BundleProduct[]>().notNull(),
  discountType: text("discount_type").notNull(),
  discountValue: real("discount_value").notNull(),
  combinable: integer("combinable", { mode: "boolean" }).notNull().default(false),
  triggerProductIds: text("trigger_product_ids", { mode: "json" }).$type<string[]>().notNull(),
  styleOverrides: text("style_overrides", { mode: "json" }).$type<StyleOverrides | null>(),
  headline: text("headline"),
  ctaLabel: text("cta_label"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  shopIdx: index("bundles_shop_idx").on(t.shopId),
  statusIdx: index("bundles_status_idx").on(t.shopId, t.status),
}));

export const quantityBreaks = sqliteTable("quantity_breaks", {
  id: text("id").primaryKey(),
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"),
  productId: text("product_id").notNull(),
  collectionId: text("collection_id"),
  tiers: text("tiers", { mode: "json" }).$type<QbTier[]>().notNull(),
  combinable: integer("combinable", { mode: "boolean" }).notNull().default(false),
  styleOverrides: text("style_overrides", { mode: "json" }).$type<StyleOverrides | null>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  shopIdx: index("qb_shop_idx").on(t.shopId),
  productIdx: index("qb_product_idx").on(t.shopId, t.productId),
}));

export const shopSettings = sqliteTable("shop_settings", {
  shopId: text("shop_id").primaryKey().references(() => shops.id, { onDelete: "cascade" }),
  primaryColor: text("primary_color").notNull().default("#7B1E2A"),
  textColor: text("text_color").notNull().default("#1A1A1A"),
  backgroundColor: text("background_color").notNull().default("#FFFFFF"),
  borderRadius: integer("border_radius").notNull().default(8),
  fontFamily: text("font_family").notNull().default("inherit"),
  bundleHeadline: text("bundle_headline").notNull().default("Frequently bought together"),
  qbHeadline: text("qb_headline").notNull().default("Choose your savings"),
  showCompareAtPrice: integer("show_compare_at_price", { mode: "boolean" }).notNull().default(true),
  enableBOGO: integer("enable_bogo", { mode: "boolean" }).notNull().default(true),
  customCss: text("custom_css"),
});

export type Shop = typeof shops.$inferSelect;
export type NewShop = typeof shops.$inferInsert;
export type Bundle = typeof bundles.$inferSelect;
export type NewBundle = typeof bundles.$inferInsert;
export type QuantityBreak = typeof quantityBreaks.$inferSelect;
export type NewQuantityBreak = typeof quantityBreaks.$inferInsert;
export type ShopSettings = typeof shopSettings.$inferSelect;
```

- [ ] **Step 2: Generate the migration**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App/apps/admin"
pnpm db:generate
```

Expected: creates `drizzle/migrations/0001_<random>.sql` with `CREATE TABLE bundles ...`, `CREATE TABLE quantity_breaks ...`, `CREATE TABLE shop_settings ...`, and `ALTER TABLE shops ADD COLUMN shopify_shop_gid text`.

- [ ] **Step 3: Apply migration locally**

```bash
pnpm db:migrate:local
```

Expected: `🚣 Executed N commands successfully`.

- [ ] **Step 4: Apply migration to remote prod D1**

```bash
CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=e3dfc3a3d6ef58eb226c8eaeec1ab73f \
  pnpm db:migrate:prod
```

Expected: same output for remote DB.

- [ ] **Step 5: Verify tables exist**

```bash
CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=e3dfc3a3d6ef58eb226c8eaeec1ab73f \
  pnpm wrangler d1 execute bundler-prod --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table'" 2>&1 | grep -E '"name"' | head -10
```

Expected: includes `bundles`, `quantity_breaks`, `shop_settings`, `shops`.

- [ ] **Step 6: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/drizzle/schema.ts apps/admin/drizzle/migrations/
git commit -m "feat(admin): add bundles, quantity_breaks, shop_settings tables"
```

---

## Task 2: Bundle validation (TDD)

**Files:**
- Create: `apps/admin/test/bundles-validate.test.ts`
- Create: `apps/admin/app/lib/bundles/validate.ts`

- [ ] **Step 1: Write `apps/admin/test/bundles-validate.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { validateBundle } from "../app/lib/bundles/validate";

const VALID: Parameters<typeof validateBundle>[0] = {
  name: "Test bundle",
  status: "draft",
  products: [
    { productId: "gid://shopify/Product/1", variantId: null, qty: 1 },
    { productId: "gid://shopify/Product/2", variantId: null, qty: 1 },
  ],
  discountType: "percentage",
  discountValue: 20,
  combinable: false,
  triggerProductIds: [],
  headline: null,
  ctaLabel: null,
};

describe("validateBundle", () => {
  it("accepts a valid bundle", () => {
    expect(validateBundle(VALID)).toEqual({ valid: true });
  });

  it("rejects empty name", () => {
    const r = validateBundle({ ...VALID, name: "" });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.name).toBeDefined();
  });

  it("rejects name longer than 100 chars", () => {
    const r = validateBundle({ ...VALID, name: "a".repeat(101) });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.name).toBeDefined();
  });

  it("rejects fewer than 2 products", () => {
    const r = validateBundle({ ...VALID, products: [VALID.products[0]!] });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.products).toBeDefined();
  });

  it("rejects qty below 1", () => {
    const r = validateBundle({
      ...VALID,
      products: [
        { productId: "gid://shopify/Product/1", variantId: null, qty: 0 },
        { productId: "gid://shopify/Product/2", variantId: null, qty: 1 },
      ],
    });
    expect(r.valid).toBe(false);
  });

  it("rejects qty above 100", () => {
    const r = validateBundle({
      ...VALID,
      products: [
        { productId: "gid://shopify/Product/1", variantId: null, qty: 101 },
        { productId: "gid://shopify/Product/2", variantId: null, qty: 1 },
      ],
    });
    expect(r.valid).toBe(false);
  });

  it("rejects invalid discount type", () => {
    const r = validateBundle({ ...VALID, discountType: "bogus" as never });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.discountType).toBeDefined();
  });

  it("rejects discount value of zero or below", () => {
    const r = validateBundle({ ...VALID, discountValue: 0 });
    expect(r.valid).toBe(false);
  });

  it("rejects percentage above 100", () => {
    const r = validateBundle({ ...VALID, discountType: "percentage", discountValue: 150 });
    expect(r.valid).toBe(false);
  });

  it("rejects invalid status", () => {
    const r = validateBundle({ ...VALID, status: "weird" as never });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.status).toBeDefined();
  });
});
```

- [ ] **Step 2: Run, verify failures**

```bash
cd apps/admin
pnpm test bundles-validate
```

Expected: 10 failing tests.

- [ ] **Step 3: Implement `apps/admin/app/lib/bundles/validate.ts`**

```ts
import type { BundleProduct } from "../../../drizzle/schema";

export type BundleInput = {
  name: string;
  status: string;
  products: BundleProduct[];
  discountType: string;
  discountValue: number;
  combinable: boolean;
  triggerProductIds: string[];
  headline: string | null;
  ctaLabel: string | null;
};

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: Record<string, string> };

export function validateBundle(input: BundleInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.name || !input.name.trim()) {
    errors.name = "Name is required";
  } else if (input.name.length > 100) {
    errors.name = "Name must be 100 characters or less";
  }

  if (!Array.isArray(input.products) || input.products.length < 2) {
    errors.products = "Bundle must have at least 2 products";
  } else {
    for (const p of input.products) {
      if (!p.productId) {
        errors.products = "Each product must have a product ID";
        break;
      }
      if (typeof p.qty !== "number" || p.qty < 1 || p.qty > 100) {
        errors.products = "Quantity must be between 1 and 100";
        break;
      }
    }
  }

  if (!["percentage", "flat", "fixed_total"].includes(input.discountType)) {
    errors.discountType = "Invalid discount type";
  }

  if (typeof input.discountValue !== "number" || input.discountValue <= 0) {
    errors.discountValue = "Discount value must be positive";
  } else if (input.discountType === "percentage" && input.discountValue > 100) {
    errors.discountValue = "Percentage cannot exceed 100";
  }

  if (!["draft", "active", "paused"].includes(input.status)) {
    errors.status = "Invalid status";
  }

  if (input.headline && input.headline.length > 100) {
    errors.headline = "Headline must be 100 characters or less";
  }

  if (input.ctaLabel && input.ctaLabel.length > 50) {
    errors.ctaLabel = "CTA label must be 50 characters or less";
  }

  return Object.keys(errors).length === 0 ? { valid: true } : { valid: false, errors };
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm test bundles-validate
```

Expected: 10 passing.

- [ ] **Step 5: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/lib/bundles/validate.ts apps/admin/test/bundles-validate.test.ts
git commit -m "feat(admin): add bundle validation (TDD)"
```

---

## Task 3: QB validation (TDD)

**Files:**
- Create: `apps/admin/test/quantity-breaks-validate.test.ts`
- Create: `apps/admin/app/lib/quantity-breaks/validate.ts`

- [ ] **Step 1: Write tests**

```ts
import { describe, it, expect } from "vitest";
import { validateQb } from "../app/lib/quantity-breaks/validate";

const VALID: Parameters<typeof validateQb>[0] = {
  name: "Test QB",
  status: "draft",
  productId: "gid://shopify/Product/1",
  tiers: [
    { qty: 1, discountType: "percentage", discountValue: 0, label: "Buy 1", isMostPopular: false },
    { qty: 2, discountType: "percentage", discountValue: 10, label: "10% off", isMostPopular: false },
    { qty: 3, discountType: "percentage", discountValue: 15, label: "15% off", isMostPopular: true },
  ],
  combinable: false,
};

describe("validateQb", () => {
  it("accepts a valid QB", () => {
    expect(validateQb(VALID)).toEqual({ valid: true });
  });

  it("rejects empty name", () => {
    const r = validateQb({ ...VALID, name: "" });
    expect(r.valid).toBe(false);
  });

  it("rejects missing productId", () => {
    const r = validateQb({ ...VALID, productId: "" });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.productId).toBeDefined();
  });

  it("rejects empty tiers", () => {
    const r = validateQb({ ...VALID, tiers: [] });
    expect(r.valid).toBe(false);
  });

  it("rejects more than 10 tiers", () => {
    const tiers = Array.from({ length: 11 }, (_, i) => ({
      qty: i + 1,
      discountType: "percentage" as const,
      discountValue: i,
      label: `Tier ${i}`,
      isMostPopular: false,
    }));
    const r = validateQb({ ...VALID, tiers });
    expect(r.valid).toBe(false);
  });

  it("rejects non-ascending tier qty", () => {
    const r = validateQb({
      ...VALID,
      tiers: [
        { qty: 3, discountType: "percentage", discountValue: 10, label: "A", isMostPopular: false },
        { qty: 2, discountType: "percentage", discountValue: 5, label: "B", isMostPopular: false },
      ],
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.tiers).toBeDefined();
  });

  it("rejects multiple popular tiers", () => {
    const r = validateQb({
      ...VALID,
      tiers: [
        { qty: 1, discountType: "percentage", discountValue: 5, label: "A", isMostPopular: true },
        { qty: 2, discountType: "percentage", discountValue: 10, label: "B", isMostPopular: true },
      ],
    });
    expect(r.valid).toBe(false);
  });

  it("rejects invalid status", () => {
    const r = validateQb({ ...VALID, status: "weird" as never });
    expect(r.valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify failures**

```bash
cd apps/admin
pnpm test quantity-breaks-validate
```

Expected: 8 failing.

- [ ] **Step 3: Implement `apps/admin/app/lib/quantity-breaks/validate.ts`**

```ts
import type { QbTier } from "../../../drizzle/schema";

export type QbInput = {
  name: string;
  status: string;
  productId: string;
  tiers: QbTier[];
  combinable: boolean;
};

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: Record<string, string> };

export function validateQb(input: QbInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.name || !input.name.trim()) {
    errors.name = "Name is required";
  } else if (input.name.length > 100) {
    errors.name = "Name must be 100 characters or less";
  }

  if (!input.productId || !input.productId.trim()) {
    errors.productId = "Product is required";
  }

  if (!Array.isArray(input.tiers) || input.tiers.length === 0) {
    errors.tiers = "At least one tier is required";
  } else if (input.tiers.length > 10) {
    errors.tiers = "Maximum 10 tiers";
  } else {
    let popularCount = 0;
    let lastQty = 0;
    for (const tier of input.tiers) {
      if (typeof tier.qty !== "number" || tier.qty < 1) {
        errors.tiers = "Tier qty must be at least 1";
        break;
      }
      if (tier.qty <= lastQty) {
        errors.tiers = "Tiers must be in ascending qty order";
        break;
      }
      lastQty = tier.qty;

      if (!["percentage", "flat", "fixed_per_unit"].includes(tier.discountType)) {
        errors.tiers = "Invalid tier discount type";
        break;
      }
      if (typeof tier.discountValue !== "number" || tier.discountValue < 0) {
        errors.tiers = "Tier discount value must be non-negative";
        break;
      }
      if (tier.discountType === "percentage" && tier.discountValue > 100) {
        errors.tiers = "Tier percentage cannot exceed 100";
        break;
      }
      if (tier.isMostPopular) popularCount++;
    }
    if (!errors.tiers && popularCount > 1) {
      errors.tiers = "Only one tier can be marked as most popular";
    }
  }

  if (!["draft", "active", "paused"].includes(input.status)) {
    errors.status = "Invalid status";
  }

  return Object.keys(errors).length === 0 ? { valid: true } : { valid: false, errors };
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test quantity-breaks-validate
```

Expected: 8 passing.

- [ ] **Step 5: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/lib/quantity-breaks/validate.ts apps/admin/test/quantity-breaks-validate.test.ts
git commit -m "feat(admin): add QB validation (TDD)"
```

---

## Task 4: Bundle repository (TDD)

**Files:**
- Create: `apps/admin/test/bundles-repo.test.ts`
- Create: `apps/admin/app/lib/bundles/repo.ts`

- [ ] **Step 1: Write tests**

```ts
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
  headline: null,
  ctaLabel: null,
};

describe("bundles repo", () => {
  let setup: ReturnType<typeof setupDb>;

  beforeEach(async () => {
    setup = setupDb();
    await setup.db.insert(schema.shops).values({ id: SHOP_A, scopes: "", installedAt: new Date() });
    await setup.db.insert(schema.shops).values({ id: SHOP_B, scopes: "", installedAt: new Date() });
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
});
```

- [ ] **Step 2: Run, verify failures**

```bash
cd apps/admin
pnpm test bundles-repo
```

Expected: 6 failing.

- [ ] **Step 3: Implement `apps/admin/app/lib/bundles/repo.ts`**

```ts
import { and, eq, desc } from "drizzle-orm";
import type { DB } from "~/db.server";
import { schema } from "~/db.server";
import type { Bundle } from "../../../drizzle/schema";

type CreateBundleInput = Omit<Bundle, "id" | "shopId" | "createdAt" | "updatedAt">;
type UpdateBundlePatch = Partial<CreateBundleInput>;

export async function listByShop(db: DB, shopId: string): Promise<Bundle[]> {
  return db
    .select()
    .from(schema.bundles)
    .where(eq(schema.bundles.shopId, shopId))
    .orderBy(desc(schema.bundles.updatedAt));
}

export async function getById(
  db: DB,
  shopId: string,
  id: string,
): Promise<Bundle | null> {
  const rows = await db
    .select()
    .from(schema.bundles)
    .where(and(eq(schema.bundles.shopId, shopId), eq(schema.bundles.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function create(
  db: DB,
  shopId: string,
  input: CreateBundleInput,
): Promise<Bundle> {
  const id = crypto.randomUUID();
  const now = new Date();
  const row: Bundle = { ...input, id, shopId, createdAt: now, updatedAt: now };
  await db.insert(schema.bundles).values(row);
  return row;
}

export async function update(
  db: DB,
  shopId: string,
  id: string,
  patch: UpdateBundlePatch,
): Promise<Bundle | null> {
  const now = new Date();
  await db
    .update(schema.bundles)
    .set({ ...patch, updatedAt: now })
    .where(and(eq(schema.bundles.shopId, shopId), eq(schema.bundles.id, id)));
  return getById(db, shopId, id);
}
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm test bundles-repo
```

Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/lib/bundles/repo.ts apps/admin/test/bundles-repo.test.ts
git commit -m "feat(admin): add bundles repo with multi-tenancy enforcement (TDD)"
```

---

## Task 5: QB repository (TDD)

**Files:**
- Create: `apps/admin/test/quantity-breaks-repo.test.ts`
- Create: `apps/admin/app/lib/quantity-breaks/repo.ts`

- [ ] **Step 1: Write tests**

```ts
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
};

describe("quantity-breaks repo", () => {
  let setup: ReturnType<typeof setupDb>;

  beforeEach(async () => {
    setup = setupDb();
    await setup.db.insert(schema.shops).values({ id: SHOP_A, scopes: "", installedAt: new Date() });
    await setup.db.insert(schema.shops).values({ id: SHOP_B, scopes: "", installedAt: new Date() });
  });

  it("create + listByShop", async () => {
    const created = await repo.create(setup.db, SHOP_A, NEW_QB_INPUT);
    const list = await repo.listByShop(setup.db, SHOP_A);
    expect(list.length).toBe(1);
    expect(list[0]!.id).toBe(created.id);
  });

  it("getById returns null for wrong shop", async () => {
    const created = await repo.create(setup.db, SHOP_A, NEW_QB_INPUT);
    const got = await repo.getById(setup.db, SHOP_B, created.id);
    expect(got).toBeNull();
  });

  it("update modifies the QB", async () => {
    const created = await repo.create(setup.db, SHOP_A, NEW_QB_INPUT);
    await repo.update(setup.db, SHOP_A, created.id, { name: "Updated" });
    const got = await repo.getById(setup.db, SHOP_A, created.id);
    expect(got!.name).toBe("Updated");
  });

  it("update on wrong shop is a no-op", async () => {
    const created = await repo.create(setup.db, SHOP_A, NEW_QB_INPUT);
    await repo.update(setup.db, SHOP_B, created.id, { name: "evil" });
    const got = await repo.getById(setup.db, SHOP_A, created.id);
    expect(got!.name).toBe("Test QB");
  });

  it("listByShop isolates per shop", async () => {
    await repo.create(setup.db, SHOP_A, NEW_QB_INPUT);
    await repo.create(setup.db, SHOP_B, NEW_QB_INPUT);
    expect((await repo.listByShop(setup.db, SHOP_A)).length).toBe(1);
    expect((await repo.listByShop(setup.db, SHOP_B)).length).toBe(1);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd apps/admin
pnpm test quantity-breaks-repo
```

Expected: 5 failing.

- [ ] **Step 3: Implement `apps/admin/app/lib/quantity-breaks/repo.ts`**

```ts
import { and, eq, desc } from "drizzle-orm";
import type { DB } from "~/db.server";
import { schema } from "~/db.server";
import type { QuantityBreak } from "../../../drizzle/schema";

type CreateQbInput = Omit<QuantityBreak, "id" | "shopId" | "createdAt" | "updatedAt">;
type UpdateQbPatch = Partial<CreateQbInput>;

export async function listByShop(db: DB, shopId: string): Promise<QuantityBreak[]> {
  return db
    .select()
    .from(schema.quantityBreaks)
    .where(eq(schema.quantityBreaks.shopId, shopId))
    .orderBy(desc(schema.quantityBreaks.updatedAt));
}

export async function getById(
  db: DB,
  shopId: string,
  id: string,
): Promise<QuantityBreak | null> {
  const rows = await db
    .select()
    .from(schema.quantityBreaks)
    .where(and(eq(schema.quantityBreaks.shopId, shopId), eq(schema.quantityBreaks.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function create(
  db: DB,
  shopId: string,
  input: CreateQbInput,
): Promise<QuantityBreak> {
  const id = crypto.randomUUID();
  const now = new Date();
  const row: QuantityBreak = { ...input, id, shopId, createdAt: now, updatedAt: now };
  await db.insert(schema.quantityBreaks).values(row);
  return row;
}

export async function update(
  db: DB,
  shopId: string,
  id: string,
  patch: UpdateQbPatch,
): Promise<QuantityBreak | null> {
  const now = new Date();
  await db
    .update(schema.quantityBreaks)
    .set({ ...patch, updatedAt: now })
    .where(and(eq(schema.quantityBreaks.shopId, shopId), eq(schema.quantityBreaks.id, id)));
  return getById(db, shopId, id);
}
```

- [ ] **Step 4: Run pass**

```bash
pnpm test quantity-breaks-repo
```

- [ ] **Step 5: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/lib/quantity-breaks/repo.ts apps/admin/test/quantity-breaks-repo.test.ts
git commit -m "feat(admin): add quantity-breaks repo (TDD)"
```

---

## Task 6: Metafield sync helper (TDD)

**Files:**
- Create: `apps/admin/test/metafield-sync.test.ts`
- Create: `apps/admin/app/lib/metafield-sync.ts`

- [ ] **Step 1: Write tests**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
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
  const admin = {
    graphql: vi.fn(async (query: string, options?: { variables?: unknown }) => {
      calls.push({ query, variables: options?.variables });
      if (query.includes("shop { id }")) {
        return new Response(JSON.stringify({ data: { shop: { id: opts.shopGid ?? SHOP_GID } } }));
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
    await setup.db.insert(schema.shops).values({ id: SHOP, scopes: "", installedAt: new Date() });
  });

  it("writes empty config when shop has no bundles or QBs", async () => {
    const { admin, calls } = makeAdmin();
    await syncShopConfig(setup.db, admin, SHOP);
    const setCall = calls.find((c) => c.query.includes("metafieldsSet"));
    expect(setCall).toBeDefined();
    const value = JSON.parse((setCall!.variables as { metafields: { value: string }[] }).metafields[0]!.value);
    expect(value).toEqual({ schemaVersion: 1, bundles: [], quantityBreaks: [] });
  });

  it("includes bundles in config", async () => {
    await bundleRepo.create(setup.db, SHOP, {
      name: "B",
      status: "active",
      products: [
        { productId: "gid://shopify/Product/1", variantId: null, qty: 1 },
        { productId: "gid://shopify/Product/2", variantId: null, qty: 1 },
      ],
      discountType: "percentage",
      discountValue: 20,
      combinable: false,
      triggerProductIds: [],
      styleOverrides: null,
      headline: null,
      ctaLabel: null,
    });
    const { admin, calls } = makeAdmin();
    await syncShopConfig(setup.db, admin, SHOP);
    const setCall = calls.find((c) => c.query.includes("metafieldsSet"));
    const value = JSON.parse((setCall!.variables as { metafields: { value: string }[] }).metafields[0]!.value);
    expect(value.bundles.length).toBe(1);
    expect(value.bundles[0].name).toBe("B");
  });

  it("includes QBs in config", async () => {
    await qbRepo.create(setup.db, SHOP, {
      name: "Q",
      status: "active",
      productId: "gid://shopify/Product/1",
      collectionId: null,
      tiers: [{ qty: 1, discountType: "percentage", discountValue: 5, label: "5%", isMostPopular: false }],
      combinable: false,
      styleOverrides: null,
    });
    const { admin, calls } = makeAdmin();
    await syncShopConfig(setup.db, admin, SHOP);
    const setCall = calls.find((c) => c.query.includes("metafieldsSet"));
    const value = JSON.parse((setCall!.variables as { metafields: { value: string }[] }).metafields[0]!.value);
    expect(value.quantityBreaks.length).toBe(1);
  });

  it("caches shop GID in shops table after first call", async () => {
    const { admin } = makeAdmin();
    await syncShopConfig(setup.db, admin, SHOP);
    const row = (await setup.db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)))[0];
    expect(row!.shopifyShopGid).toBe(SHOP_GID);
  });

  it("throws when JSON exceeds 50KB", async () => {
    // Create a bundle with a huge headline to inflate the config size
    await bundleRepo.create(setup.db, SHOP, {
      name: "Big",
      status: "active",
      products: [
        { productId: "gid://shopify/Product/1", variantId: null, qty: 1 },
        { productId: "gid://shopify/Product/2", variantId: null, qty: 1 },
      ],
      discountType: "percentage",
      discountValue: 20,
      combinable: false,
      triggerProductIds: [],
      styleOverrides: null,
      headline: "x".repeat(60_000), // pushes total JSON over 50KB
      ctaLabel: null,
    });
    const { admin } = makeAdmin();
    await expect(syncShopConfig(setup.db, admin, SHOP)).rejects.toThrow(/exceeds.*safety limit/);
  });
});
```

Add `import { eq } from "drizzle-orm";` to the test file imports.

- [ ] **Step 2: Verify failure**

```bash
cd apps/admin
pnpm test metafield-sync
```

Expected: 5 failing.

- [ ] **Step 3: Implement `apps/admin/app/lib/metafield-sync.ts`**

```ts
import { eq } from "drizzle-orm";
import type { DB } from "~/db.server";
import { schema } from "~/db.server";
import * as bundleRepo from "./bundles/repo";
import * as qbRepo from "./quantity-breaks/repo";

const MAX_BYTES = 50_000;

type AdminGraphqlClient = {
  graphql(
    query: string,
    options?: { variables?: unknown },
  ): Promise<Response>;
};

export async function syncShopConfig(
  db: DB,
  admin: AdminGraphqlClient,
  shopId: string,
): Promise<void> {
  const [bundles, qbs] = await Promise.all([
    bundleRepo.listByShop(db, shopId),
    qbRepo.listByShop(db, shopId),
  ]);

  const config = {
    schemaVersion: 1,
    bundles: bundles.map((b) => ({
      id: b.id,
      name: b.name,
      status: b.status,
      products: b.products,
      discountType: b.discountType,
      discountValue: b.discountValue,
      combinable: b.combinable,
      triggerProductIds: b.triggerProductIds,
      headline: b.headline,
      ctaLabel: b.ctaLabel,
    })),
    quantityBreaks: qbs.map((q) => ({
      id: q.id,
      name: q.name,
      status: q.status,
      productId: q.productId,
      tiers: q.tiers,
      combinable: q.combinable,
    })),
  };

  const json = JSON.stringify(config);
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > MAX_BYTES) {
    throw new Error(
      `Config JSON is ${bytes} bytes; exceeds ${MAX_BYTES}-byte safety limit. ` +
        `Sharding not yet implemented (Phase 3 Group B). Reduce bundles or QBs and try again.`,
    );
  }

  const shopGid = await getOrFetchShopGid(db, admin, shopId);

  await admin.graphql(
    `mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId: shopGid,
            namespace: "pumper",
            key: "config",
            type: "json",
            value: json,
          },
        ],
      },
    },
  );
}

async function getOrFetchShopGid(
  db: DB,
  admin: AdminGraphqlClient,
  shopId: string,
): Promise<string> {
  const rows = await db
    .select()
    .from(schema.shops)
    .where(eq(schema.shops.id, shopId))
    .limit(1);
  const cached = rows[0]?.shopifyShopGid;
  if (cached) return cached;

  const res = await admin.graphql(`query { shop { id } }`);
  const data = (await res.json()) as { data: { shop: { id: string } } };
  const gid = data.data.shop.id;

  await db
    .update(schema.shops)
    .set({ shopifyShopGid: gid })
    .where(eq(schema.shops.id, shopId));

  return gid;
}
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm test metafield-sync
```

Expected: 5 passing.

- [ ] **Step 5: Run full suite + typecheck**

```bash
pnpm test && pnpm typecheck
```

Expected: 67 tests passing (33 prior + 34 new across Tasks 2-6: 10+8+6+5+5).

- [ ] **Step 6: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/lib/metafield-sync.ts apps/admin/test/metafield-sync.test.ts
git commit -m "feat(admin): add metafield-sync helper with shop GID caching (TDD)"
```

---

## Task 7: StatusBadge component

**Files:**
- Create: `apps/admin/app/components/StatusBadge.tsx`

- [ ] **Step 1: Create component**

```tsx
import { Badge } from "@shopify/polaris";

type Status = "draft" | "active" | "paused";

const TONE: Record<Status, "success" | "info" | "warning"> = {
  active: "success",
  draft: "info",
  paused: "warning",
};

const LABEL: Record<Status, string> = {
  active: "Active",
  draft: "Draft",
  paused: "Paused",
};

export function StatusBadge({ status }: { status: Status }) {
  return <Badge tone={TONE[status]}>{LABEL[status]}</Badge>;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/admin
pnpm typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/components/StatusBadge.tsx
git commit -m "feat(admin): add StatusBadge component"
```

---

## Task 8: DiscountValueInput component

**Files:**
- Create: `apps/admin/app/components/DiscountValueInput.tsx`

- [ ] **Step 1: Create component**

```tsx
import { TextField } from "@shopify/polaris";

type DiscountType = "percentage" | "flat" | "fixed_total";

type Props = {
  type: DiscountType;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  label?: string;
};

const SUFFIX: Record<DiscountType, string> = {
  percentage: "%",
  flat: "",
  fixed_total: "",
};

const PREFIX: Record<DiscountType, string> = {
  percentage: "",
  flat: "$",
  fixed_total: "$",
};

const HELP: Record<DiscountType, string> = {
  percentage: "Discount applied as a percentage of bundle subtotal",
  flat: "Fixed amount off the bundle subtotal",
  fixed_total: "Set the total bundle price (overrides individual prices)",
};

export function DiscountValueInput({ type, value, onChange, error, label = "Discount value" }: Props) {
  return (
    <TextField
      label={label}
      type="number"
      value={value}
      onChange={onChange}
      prefix={PREFIX[type] || undefined}
      suffix={SUFFIX[type] || undefined}
      helpText={HELP[type]}
      error={error}
      autoComplete="off"
      min={0}
      step={0.01}
    />
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd apps/admin && pnpm typecheck
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/components/DiscountValueInput.tsx
git commit -m "feat(admin): add DiscountValueInput component"
```

---

## Task 9: ProductPicker component

**Files:**
- Create: `apps/admin/app/components/ProductPicker.tsx`

- [ ] **Step 1: Create component**

```tsx
import { Button, BlockStack, InlineStack, Text, Thumbnail, TextField } from "@shopify/polaris";
import { useCallback } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

export type PickedProduct = {
  productId: string;
  variantId: string | null;
  qty: number;
  title?: string;
  image?: string;
};

type Props = {
  products: PickedProduct[];
  onChange: (products: PickedProduct[]) => void;
  multiple?: boolean;
  showQty?: boolean;
};

export function ProductPicker({
  products,
  onChange,
  multiple = true,
  showQty = true,
}: Props) {
  const shopify = useAppBridge();

  const handleAdd = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (shopify as any).resourcePicker({
      type: "product",
      multiple,
      selectionIds: products.map((p) => ({ id: p.productId })),
    });
    if (!result?.selection) return;
    const next: PickedProduct[] = result.selection.map(
      (s: { id: string; title?: string; images?: { originalSrc?: string }[] }) => {
        const existing = products.find((p) => p.productId === s.id);
        return {
          productId: s.id,
          variantId: existing?.variantId ?? null,
          qty: existing?.qty ?? 1,
          title: s.title,
          image: s.images?.[0]?.originalSrc,
        };
      },
    );
    onChange(next);
  }, [shopify, multiple, products, onChange]);

  const handleRemove = (productId: string) => {
    onChange(products.filter((p) => p.productId !== productId));
  };

  const handleQtyChange = (productId: string, qty: string) => {
    const n = parseInt(qty, 10);
    if (Number.isNaN(n)) return;
    onChange(products.map((p) => (p.productId === productId ? { ...p, qty: n } : p)));
  };

  return (
    <BlockStack gap="300">
      {products.map((p) => (
        <InlineStack key={p.productId} gap="300" blockAlign="center">
          <Thumbnail source={p.image ?? ""} alt={p.title ?? ""} />
          <Text as="span" variant="bodyMd">{p.title ?? p.productId}</Text>
          {showQty && (
            <div style={{ width: 80 }}>
              <TextField
                label="Qty"
                labelHidden
                type="number"
                value={String(p.qty)}
                onChange={(v) => handleQtyChange(p.productId, v)}
                autoComplete="off"
                min={1}
                max={100}
              />
            </div>
          )}
          <Button onClick={() => handleRemove(p.productId)} tone="critical" variant="plain">
            Remove
          </Button>
        </InlineStack>
      ))}
      <Button onClick={handleAdd}>{multiple ? "Add product" : products.length ? "Change product" : "Pick product"}</Button>
    </BlockStack>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd apps/admin && pnpm typecheck
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/components/ProductPicker.tsx
git commit -m "feat(admin): add ProductPicker (App Bridge resourcePicker wrapper)"
```

---

## Task 10: BundleForm component

**Files:**
- Create: `apps/admin/app/components/BundleForm.tsx`

- [ ] **Step 1: Create component**

```tsx
import { Form } from "@remix-run/react";
import {
  BlockStack,
  Card,
  ChoiceList,
  Banner,
  TextField,
  Checkbox,
  Button,
  InlineStack,
  Text,
} from "@shopify/polaris";
import { useState } from "react";
import { ProductPicker, type PickedProduct } from "./ProductPicker";
import { DiscountValueInput } from "./DiscountValueInput";

type DiscountType = "percentage" | "flat" | "fixed_total";
type Status = "draft" | "active" | "paused";
type TriggerMode = "same_as_members" | "specific";

export type BundleFormValues = {
  name: string;
  products: PickedProduct[];
  discountType: DiscountType;
  discountValue: string;
  combinable: boolean;
  triggerMode: TriggerMode;
  triggerProducts: PickedProduct[];
  status: Status;
  headline: string;
  ctaLabel: string;
};

type Props = {
  initialValues?: Partial<BundleFormValues>;
  errors?: Record<string, string>;
  submitLabel: string;
};

const DEFAULTS: BundleFormValues = {
  name: "",
  products: [],
  discountType: "percentage",
  discountValue: "10",
  combinable: false,
  triggerMode: "same_as_members",
  triggerProducts: [],
  status: "draft",
  headline: "",
  ctaLabel: "",
};

export function BundleForm({ initialValues, errors, submitLabel }: Props) {
  const [values, setValues] = useState<BundleFormValues>({ ...DEFAULTS, ...initialValues });

  const update = <K extends keyof BundleFormValues>(key: K, val: BundleFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: val }));

  const hasErrors = errors && Object.keys(errors).length > 0;

  return (
    <Form method="post">
      {/* Hidden fields carry the structured data the action will parse */}
      <input type="hidden" name="products" value={JSON.stringify(values.products)} />
      <input type="hidden" name="triggerProducts" value={JSON.stringify(values.triggerProducts)} />

      <BlockStack gap="500">
        {hasErrors && (
          <Banner tone="critical" title="Fix these issues to save the bundle">
            <Text as="p">{Object.values(errors!).join(" • ")}</Text>
          </Banner>
        )}

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">1. Products in this bundle</Text>
            <TextField
              label="Bundle name"
              name="name"
              value={values.name}
              onChange={(v) => update("name", v)}
              error={errors?.name}
              autoComplete="off"
              maxLength={100}
            />
            <ProductPicker
              products={values.products}
              onChange={(p) => update("products", p)}
              multiple
            />
            {errors?.products && <Banner tone="critical">{errors.products}</Banner>}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">2. Discount</Text>
            <ChoiceList
              title="Discount type"
              choices={[
                { label: "Percentage off", value: "percentage" },
                { label: "Flat amount off", value: "flat" },
                { label: "Fixed total price", value: "fixed_total" },
              ]}
              selected={[values.discountType]}
              onChange={(s) => update("discountType", s[0] as DiscountType)}
              name="discountType"
            />
            <DiscountValueInput
              type={values.discountType}
              value={values.discountValue}
              onChange={(v) => update("discountValue", v)}
              error={errors?.discountValue}
            />
            <input type="hidden" name="discountValue" value={values.discountValue} />
            <Checkbox
              label="Combinable with other discounts"
              checked={values.combinable}
              onChange={(c) => update("combinable", c)}
              name="combinable"
            />
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">3. Trigger products</Text>
            <Text as="p" variant="bodyMd">Choose which product pages show this bundle.</Text>
            <ChoiceList
              title="Trigger mode"
              titleHidden
              choices={[
                { label: "Same as bundle members", value: "same_as_members" },
                { label: "Specific products", value: "specific" },
              ]}
              selected={[values.triggerMode]}
              onChange={(s) => update("triggerMode", s[0] as TriggerMode)}
              name="triggerMode"
            />
            {values.triggerMode === "specific" && (
              <ProductPicker
                products={values.triggerProducts}
                onChange={(p) => update("triggerProducts", p)}
                multiple
                showQty={false}
              />
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Settings</Text>
            <ChoiceList
              title="Status"
              choices={[
                { label: "Draft", value: "draft" },
                { label: "Active", value: "active" },
                { label: "Paused", value: "paused" },
              ]}
              selected={[values.status]}
              onChange={(s) => update("status", s[0] as Status)}
              name="status"
            />
            <TextField
              label="Headline (optional)"
              name="headline"
              value={values.headline}
              onChange={(v) => update("headline", v)}
              error={errors?.headline}
              autoComplete="off"
              maxLength={100}
            />
            <TextField
              label="CTA label (optional)"
              name="ctaLabel"
              value={values.ctaLabel}
              onChange={(v) => update("ctaLabel", v)}
              error={errors?.ctaLabel}
              autoComplete="off"
              maxLength={50}
            />
          </BlockStack>
        </Card>

        <InlineStack align="end" gap="300">
          <Button url="/app/bundles">Cancel</Button>
          <Button submit variant="primary">{submitLabel}</Button>
        </InlineStack>
      </BlockStack>
    </Form>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd apps/admin && pnpm typecheck
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/components/BundleForm.tsx
git commit -m "feat(admin): add BundleForm component (3-section single-page form)"
```

---

## Task 11: QbTierBuilder component

**Files:**
- Create: `apps/admin/app/components/QbTierBuilder.tsx`

- [ ] **Step 1: Create component**

```tsx
import { Button, BlockStack, InlineStack, TextField, Select, Checkbox } from "@shopify/polaris";

export type TierFormValue = {
  qty: number;
  discountType: "percentage" | "flat" | "fixed_per_unit";
  discountValue: number;
  label: string;
  isMostPopular: boolean;
};

type Props = {
  tiers: TierFormValue[];
  onChange: (tiers: TierFormValue[]) => void;
  maxTiers?: number;
};

const DEFAULT_TIER: TierFormValue = {
  qty: 1,
  discountType: "percentage",
  discountValue: 0,
  label: "",
  isMostPopular: false,
};

export function QbTierBuilder({ tiers, onChange, maxTiers = 10 }: Props) {
  const updateTier = (index: number, patch: Partial<TierFormValue>) => {
    onChange(tiers.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };

  const togglePopular = (index: number) => {
    onChange(
      tiers.map((t, i) => ({
        ...t,
        isMostPopular: i === index ? !t.isMostPopular : false,
      })),
    );
  };

  const addTier = () => {
    const lastQty = tiers.length > 0 ? tiers[tiers.length - 1]!.qty : 0;
    onChange([...tiers, { ...DEFAULT_TIER, qty: lastQty + 1 }]);
  };

  const removeTier = (index: number) => {
    onChange(tiers.filter((_, i) => i !== index));
  };

  return (
    <BlockStack gap="300">
      {tiers.map((tier, i) => (
        <InlineStack key={i} gap="200" blockAlign="end">
          <div style={{ width: 80 }}>
            <TextField
              label="Qty"
              type="number"
              value={String(tier.qty)}
              onChange={(v) => updateTier(i, { qty: parseInt(v, 10) || 0 })}
              autoComplete="off"
              min={1}
            />
          </div>
          <div style={{ width: 160 }}>
            <Select
              label="Discount type"
              options={[
                { label: "Percentage", value: "percentage" },
                { label: "Flat", value: "flat" },
                { label: "Fixed per unit", value: "fixed_per_unit" },
              ]}
              value={tier.discountType}
              onChange={(v) => updateTier(i, { discountType: v as TierFormValue["discountType"] })}
            />
          </div>
          <div style={{ width: 100 }}>
            <TextField
              label="Value"
              type="number"
              value={String(tier.discountValue)}
              onChange={(v) => updateTier(i, { discountValue: parseFloat(v) || 0 })}
              autoComplete="off"
              min={0}
              step={0.01}
            />
          </div>
          <div style={{ flex: 1 }}>
            <TextField
              label="Label"
              value={tier.label}
              onChange={(v) => updateTier(i, { label: v })}
              autoComplete="off"
              maxLength={50}
            />
          </div>
          <Checkbox
            label="Popular"
            checked={tier.isMostPopular}
            onChange={() => togglePopular(i)}
          />
          <Button onClick={() => removeTier(i)} tone="critical" variant="plain">Remove</Button>
        </InlineStack>
      ))}
      <Button onClick={addTier} disabled={tiers.length >= maxTiers}>
        Add tier{tiers.length >= maxTiers && ` (max ${maxTiers})`}
      </Button>
    </BlockStack>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd apps/admin && pnpm typecheck
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/components/QbTierBuilder.tsx
git commit -m "feat(admin): add QbTierBuilder component"
```

---

## Task 12: QbForm component

**Files:**
- Create: `apps/admin/app/components/QbForm.tsx`

- [ ] **Step 1: Create component**

```tsx
import { Form } from "@remix-run/react";
import { BlockStack, Card, ChoiceList, Banner, TextField, Checkbox, Button, InlineStack, Text } from "@shopify/polaris";
import { useState } from "react";
import { ProductPicker, type PickedProduct } from "./ProductPicker";
import { QbTierBuilder, type TierFormValue } from "./QbTierBuilder";

type Status = "draft" | "active" | "paused";

export type QbFormValues = {
  name: string;
  product: PickedProduct[];
  tiers: TierFormValue[];
  combinable: boolean;
  status: Status;
};

type Props = {
  initialValues?: Partial<QbFormValues>;
  errors?: Record<string, string>;
  submitLabel: string;
};

const DEFAULTS: QbFormValues = {
  name: "",
  product: [],
  tiers: [{ qty: 1, discountType: "percentage", discountValue: 0, label: "Buy 1", isMostPopular: false }],
  combinable: false,
  status: "draft",
};

export function QbForm({ initialValues, errors, submitLabel }: Props) {
  const [values, setValues] = useState<QbFormValues>({ ...DEFAULTS, ...initialValues });
  const update = <K extends keyof QbFormValues>(k: K, v: QbFormValues[K]) => setValues((s) => ({ ...s, [k]: v }));

  const hasErrors = errors && Object.keys(errors).length > 0;

  return (
    <Form method="post">
      <input type="hidden" name="productId" value={values.product[0]?.productId ?? ""} />
      <input type="hidden" name="tiers" value={JSON.stringify(values.tiers)} />

      <BlockStack gap="500">
        {hasErrors && (
          <Banner tone="critical" title="Fix these issues to save">
            <Text as="p">{Object.values(errors!).join(" • ")}</Text>
          </Banner>
        )}

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">1. Product</Text>
            <TextField
              label="Name"
              name="name"
              value={values.name}
              onChange={(v) => update("name", v)}
              error={errors?.name}
              autoComplete="off"
              maxLength={100}
            />
            <ProductPicker
              products={values.product}
              onChange={(p) => update("product", p)}
              multiple={false}
              showQty={false}
            />
            {errors?.productId && <Banner tone="critical">{errors.productId}</Banner>}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">2. Tiers</Text>
            <QbTierBuilder tiers={values.tiers} onChange={(t) => update("tiers", t)} />
            {errors?.tiers && <Banner tone="critical">{errors.tiers}</Banner>}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Settings</Text>
            <ChoiceList
              title="Status"
              choices={[
                { label: "Draft", value: "draft" },
                { label: "Active", value: "active" },
                { label: "Paused", value: "paused" },
              ]}
              selected={[values.status]}
              onChange={(s) => update("status", s[0] as Status)}
              name="status"
            />
            <Checkbox
              label="Combinable with other discounts"
              checked={values.combinable}
              onChange={(c) => update("combinable", c)}
              name="combinable"
            />
          </BlockStack>
        </Card>

        <InlineStack align="end" gap="300">
          <Button url="/app/quantity-breaks">Cancel</Button>
          <Button submit variant="primary">{submitLabel}</Button>
        </InlineStack>
      </BlockStack>
    </Form>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd apps/admin && pnpm typecheck
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/components/QbForm.tsx
git commit -m "feat(admin): add QbForm component"
```

---

## Task 13: Bundle list route

**Files:**
- Create: `apps/admin/app/routes/app.bundles._index.tsx`

- [ ] **Step 1: Create route**

```tsx
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, EmptyState, IndexTable, Text, Link } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as bundleRepo from "~/lib/bundles/repo";
import { StatusBadge } from "~/components/StatusBadge";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const bundles = await bundleRepo.listByShop(db, session.shop);
  return json({ bundles });
}

function summarizeDiscount(b: { discountType: string; discountValue: number }): string {
  if (b.discountType === "percentage") return `${b.discountValue}% off`;
  if (b.discountType === "flat") return `$${b.discountValue.toFixed(2)} off`;
  return `Fixed $${b.discountValue.toFixed(2)}`;
}

export default function BundlesIndex() {
  const { bundles } = useLoaderData<typeof loader>();

  if (bundles.length === 0) {
    return (
      <Page title="Bundles" primaryAction={{ content: "Create bundle", url: "/app/bundles/new" }}>
        <Card>
          <EmptyState
            heading="No bundles yet"
            action={{ content: "Create bundle", url: "/app/bundles/new" }}
            image=""
          >
            <Text as="p">Group products together with a discount that applies at checkout.</Text>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  const rowMarkup = bundles.map((b, i) => (
    <IndexTable.Row id={b.id} key={b.id} position={i}>
      <IndexTable.Cell>
        <Link url={`/app/bundles/${b.id}`} monochrome removeUnderline>{b.name}</Link>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <StatusBadge status={b.status as "draft" | "active" | "paused"} />
      </IndexTable.Cell>
      <IndexTable.Cell>{summarizeDiscount(b)}</IndexTable.Cell>
      <IndexTable.Cell>{new Date(b.updatedAt).toLocaleDateString()}</IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page title="Bundles" primaryAction={{ content: "Create bundle", url: "/app/bundles/new" }}>
      <Card padding="0">
        <IndexTable
          itemCount={bundles.length}
          headings={[
            { title: "Name" },
            { title: "Status" },
            { title: "Discount" },
            { title: "Updated" },
          ]}
          selectable={false}
        >
          {rowMarkup}
        </IndexTable>
      </Card>
    </Page>
  );
}
```

- [ ] **Step 2: Typecheck + build (route compiles)**

```bash
cd apps/admin
pnpm typecheck && pnpm build 2>&1 | tail -3
```

Expected: clean typecheck, build succeeds.

- [ ] **Step 3: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/routes/app.bundles._index.tsx
git commit -m "feat(admin): add bundle list route with empty state and IndexTable"
```

---

## Task 14: Bundle create route

**Files:**
- Create: `apps/admin/app/routes/app.bundles.new.tsx`

- [ ] **Step 1: Create route**

```tsx
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData } from "@remix-run/react";
import { Page } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as bundleRepo from "~/lib/bundles/repo";
import { validateBundle } from "~/lib/bundles/validate";
import { syncShopConfig } from "~/lib/metafield-sync";
import { BundleForm } from "~/components/BundleForm";
import type { PickedProduct } from "~/components/ProductPicker";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  await authenticate.admin(request, ctx);
  return json({});
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session, admin } = await authenticate.admin(request, ctx);
  const form = await request.formData();

  const products: PickedProduct[] = JSON.parse((form.get("products") as string) || "[]");
  const triggerProducts: PickedProduct[] = JSON.parse(
    (form.get("triggerProducts") as string) || "[]",
  );
  const triggerMode = form.get("triggerMode") as string;
  const triggerProductIds =
    triggerMode === "specific" ? triggerProducts.map((p) => p.productId) : [];

  const input = {
    name: (form.get("name") as string) || "",
    status: (form.get("status") as string) || "draft",
    products: products.map((p) => ({
      productId: p.productId,
      variantId: p.variantId,
      qty: p.qty,
    })),
    discountType: (form.get("discountType") as string) || "percentage",
    discountValue: parseFloat((form.get("discountValue") as string) || "0"),
    combinable: form.get("combinable") === "on",
    triggerProductIds,
    headline: (form.get("headline") as string) || null,
    ctaLabel: (form.get("ctaLabel") as string) || null,
  };

  const v = validateBundle(input);
  if (!v.valid) {
    return json({ errors: v.errors, values: input }, { status: 400 });
  }

  const db = getDb(ctx.cloudflare.env.DB);
  await bundleRepo.create(db, session.shop, {
    ...input,
    status: input.status as "draft" | "active" | "paused",
    discountType: input.discountType as "percentage" | "flat" | "fixed_total",
    styleOverrides: null,
  });

  await syncShopConfig(db, admin, session.shop);
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${session.shop}`);

  return redirect("/app/bundles");
}

export default function BundleNew() {
  const actionData = useActionData<typeof action>();
  const errors = actionData && "errors" in actionData ? actionData.errors : undefined;

  return (
    <Page title="Create bundle" backAction={{ content: "Bundles", url: "/app/bundles" }}>
      <BundleForm submitLabel="Save bundle" errors={errors} />
    </Page>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/admin && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/routes/app.bundles.new.tsx
git commit -m "feat(admin): add bundle create route with metafield sync"
```

---

## Task 15: Bundle edit route

**Files:**
- Create: `apps/admin/app/routes/app.bundles.\$id.tsx`

- [ ] **Step 1: Create route**

```tsx
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData, useLoaderData } from "@remix-run/react";
import { Page } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as bundleRepo from "~/lib/bundles/repo";
import { validateBundle } from "~/lib/bundles/validate";
import { syncShopConfig } from "~/lib/metafield-sync";
import { BundleForm, type BundleFormValues } from "~/components/BundleForm";
import type { PickedProduct } from "~/components/ProductPicker";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const bundle = await bundleRepo.getById(db, session.shop, params.id!);
  if (!bundle) throw new Response("Not found", { status: 404 });
  return json({ bundle });
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session, admin } = await authenticate.admin(request, ctx);
  const form = await request.formData();

  const products: PickedProduct[] = JSON.parse((form.get("products") as string) || "[]");
  const triggerProducts: PickedProduct[] = JSON.parse(
    (form.get("triggerProducts") as string) || "[]",
  );
  const triggerMode = form.get("triggerMode") as string;
  const triggerProductIds =
    triggerMode === "specific" ? triggerProducts.map((p) => p.productId) : [];

  const input = {
    name: (form.get("name") as string) || "",
    status: (form.get("status") as string) || "draft",
    products: products.map((p) => ({
      productId: p.productId,
      variantId: p.variantId,
      qty: p.qty,
    })),
    discountType: (form.get("discountType") as string) || "percentage",
    discountValue: parseFloat((form.get("discountValue") as string) || "0"),
    combinable: form.get("combinable") === "on",
    triggerProductIds,
    headline: (form.get("headline") as string) || null,
    ctaLabel: (form.get("ctaLabel") as string) || null,
  };

  const v = validateBundle(input);
  if (!v.valid) return json({ errors: v.errors }, { status: 400 });

  const db = getDb(ctx.cloudflare.env.DB);
  await bundleRepo.update(db, session.shop, params.id!, {
    ...input,
    status: input.status as "draft" | "active" | "paused",
    discountType: input.discountType as "percentage" | "flat" | "fixed_total",
  });

  await syncShopConfig(db, admin, session.shop);
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${session.shop}`);

  return redirect("/app/bundles");
}

export default function BundleEdit() {
  const { bundle } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const errors = actionData && "errors" in actionData ? actionData.errors : undefined;

  const initial: Partial<BundleFormValues> = {
    name: bundle.name,
    products: bundle.products.map((p) => ({
      productId: p.productId,
      variantId: p.variantId,
      qty: p.qty,
    })),
    discountType: bundle.discountType as BundleFormValues["discountType"],
    discountValue: String(bundle.discountValue),
    combinable: bundle.combinable,
    triggerMode: bundle.triggerProductIds.length > 0 ? "specific" : "same_as_members",
    triggerProducts: bundle.triggerProductIds.map((id: string) => ({
      productId: id,
      variantId: null,
      qty: 1,
    })),
    status: bundle.status as BundleFormValues["status"],
    headline: bundle.headline ?? "",
    ctaLabel: bundle.ctaLabel ?? "",
  };

  return (
    <Page title={bundle.name} backAction={{ content: "Bundles", url: "/app/bundles" }}>
      <BundleForm submitLabel="Save changes" errors={errors} initialValues={initial} />
    </Page>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd apps/admin && pnpm typecheck
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add 'apps/admin/app/routes/app.bundles.$id.tsx'
git commit -m "feat(admin): add bundle edit route"
```

---

## Task 16: QB list route

**Files:**
- Create: `apps/admin/app/routes/app.quantity-breaks._index.tsx`

- [ ] **Step 1: Create route**

```tsx
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, EmptyState, IndexTable, Text, Link } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as qbRepo from "~/lib/quantity-breaks/repo";
import { StatusBadge } from "~/components/StatusBadge";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const items = await qbRepo.listByShop(db, session.shop);
  return json({ items });
}

export default function QbsIndex() {
  const { items } = useLoaderData<typeof loader>();

  if (items.length === 0) {
    return (
      <Page title="Quantity Breaks" primaryAction={{ content: "Create quantity break", url: "/app/quantity-breaks/new" }}>
        <Card>
          <EmptyState
            heading="No quantity breaks yet"
            action={{ content: "Create quantity break", url: "/app/quantity-breaks/new" }}
            image=""
          >
            <Text as="p">Set tiered pricing on a single product so customers save when they buy more.</Text>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  const rowMarkup = items.map((q, i) => (
    <IndexTable.Row id={q.id} key={q.id} position={i}>
      <IndexTable.Cell>
        <Link url={`/app/quantity-breaks/${q.id}`} monochrome removeUnderline>{q.name}</Link>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <StatusBadge status={q.status as "draft" | "active" | "paused"} />
      </IndexTable.Cell>
      <IndexTable.Cell>{q.tiers.length} tier{q.tiers.length === 1 ? "" : "s"}</IndexTable.Cell>
      <IndexTable.Cell>{new Date(q.updatedAt).toLocaleDateString()}</IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page title="Quantity Breaks" primaryAction={{ content: "Create quantity break", url: "/app/quantity-breaks/new" }}>
      <Card padding="0">
        <IndexTable
          itemCount={items.length}
          headings={[
            { title: "Name" },
            { title: "Status" },
            { title: "Tiers" },
            { title: "Updated" },
          ]}
          selectable={false}
        >
          {rowMarkup}
        </IndexTable>
      </Card>
    </Page>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd apps/admin && pnpm typecheck
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/routes/app.quantity-breaks._index.tsx
git commit -m "feat(admin): add QB list route"
```

---

## Task 17: QB create route

**Files:**
- Create: `apps/admin/app/routes/app.quantity-breaks.new.tsx`

- [ ] **Step 1: Create route**

```tsx
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData } from "@remix-run/react";
import { Page } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as qbRepo from "~/lib/quantity-breaks/repo";
import { validateQb } from "~/lib/quantity-breaks/validate";
import { syncShopConfig } from "~/lib/metafield-sync";
import { QbForm } from "~/components/QbForm";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  await authenticate.admin(request, ctx);
  return json({});
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session, admin } = await authenticate.admin(request, ctx);
  const form = await request.formData();

  const tiersRaw = JSON.parse((form.get("tiers") as string) || "[]");
  const input = {
    name: (form.get("name") as string) || "",
    status: (form.get("status") as string) || "draft",
    productId: (form.get("productId") as string) || "",
    tiers: tiersRaw,
    combinable: form.get("combinable") === "on",
  };

  const v = validateQb(input);
  if (!v.valid) {
    return json({ errors: v.errors }, { status: 400 });
  }

  const db = getDb(ctx.cloudflare.env.DB);
  await qbRepo.create(db, session.shop, {
    name: input.name,
    status: input.status as "draft" | "active" | "paused",
    productId: input.productId,
    collectionId: null,
    tiers: input.tiers,
    combinable: input.combinable,
    styleOverrides: null,
  });

  await syncShopConfig(db, admin, session.shop);
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${session.shop}`);

  return redirect("/app/quantity-breaks");
}

export default function QbNew() {
  const actionData = useActionData<typeof action>();
  const errors = actionData && "errors" in actionData ? actionData.errors : undefined;
  return (
    <Page title="Create quantity break" backAction={{ content: "Quantity Breaks", url: "/app/quantity-breaks" }}>
      <QbForm submitLabel="Save quantity break" errors={errors} />
    </Page>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd apps/admin && pnpm typecheck
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/routes/app.quantity-breaks.new.tsx
git commit -m "feat(admin): add QB create route with metafield sync"
```

---

## Task 18: QB edit route

**Files:**
- Create: `apps/admin/app/routes/app.quantity-breaks.\$id.tsx`

- [ ] **Step 1: Create route**

```tsx
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData, useLoaderData } from "@remix-run/react";
import { Page } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as qbRepo from "~/lib/quantity-breaks/repo";
import { validateQb } from "~/lib/quantity-breaks/validate";
import { syncShopConfig } from "~/lib/metafield-sync";
import { QbForm, type QbFormValues } from "~/components/QbForm";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const qb = await qbRepo.getById(db, session.shop, params.id!);
  if (!qb) throw new Response("Not found", { status: 404 });
  return json({ qb });
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session, admin } = await authenticate.admin(request, ctx);
  const form = await request.formData();

  const tiersRaw = JSON.parse((form.get("tiers") as string) || "[]");
  const input = {
    name: (form.get("name") as string) || "",
    status: (form.get("status") as string) || "draft",
    productId: (form.get("productId") as string) || "",
    tiers: tiersRaw,
    combinable: form.get("combinable") === "on",
  };

  const v = validateQb(input);
  if (!v.valid) return json({ errors: v.errors }, { status: 400 });

  const db = getDb(ctx.cloudflare.env.DB);
  await qbRepo.update(db, session.shop, params.id!, {
    name: input.name,
    status: input.status as "draft" | "active" | "paused",
    productId: input.productId,
    tiers: input.tiers,
    combinable: input.combinable,
  });

  await syncShopConfig(db, admin, session.shop);
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${session.shop}`);

  return redirect("/app/quantity-breaks");
}

export default function QbEdit() {
  const { qb } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const errors = actionData && "errors" in actionData ? actionData.errors : undefined;

  const initial: Partial<QbFormValues> = {
    name: qb.name,
    product: [{ productId: qb.productId, variantId: null, qty: 1 }],
    tiers: qb.tiers,
    combinable: qb.combinable,
    status: qb.status as QbFormValues["status"],
  };

  return (
    <Page title={qb.name} backAction={{ content: "Quantity Breaks", url: "/app/quantity-breaks" }}>
      <QbForm submitLabel="Save changes" errors={errors} initialValues={initial} />
    </Page>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd apps/admin && pnpm typecheck
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add 'apps/admin/app/routes/app.quantity-breaks.$id.tsx'
git commit -m "feat(admin): add QB edit route"
```

---

## Task 19: Update dashboard and add NavMenu

**Files:**
- Modify: `apps/admin/app/routes/app._index.tsx`
- Modify: `apps/admin/app/routes/app.tsx`

- [ ] **Step 1: Replace `apps/admin/app/routes/app._index.tsx`**

```tsx
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, MediaCard, BlockStack, Text, Layout } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb, schema } from "~/db.server";
import { eq } from "drizzle-orm";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);

  const db = getDb(ctx.cloudflare.env.DB);
  await db
    .insert(schema.shops)
    .values({
      id: session.shop,
      scopes: session.scope ?? "",
      installedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.shops.id,
      set: { scopes: session.scope ?? "", uninstalledAt: null },
    });

  return json({ shop: session.shop });
}

export default function Dashboard() {
  const { shop } = useLoaderData<typeof loader>();

  return (
    <Page title="Product Bundler">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Welcome, {shop}</Text>
              <Text as="p" variant="bodyMd">
                Get started by creating a bundle or quantity break. Once active, your widgets appear on product pages and discounts apply at checkout.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneHalf">
          <MediaCard
            title="Bundles"
            primaryAction={{ content: "View bundles", url: "/app/bundles" }}
            description="Group two or more products together at a discount. Customers see a 'buy together' widget on product pages."
            portrait
          >
            <div style={{ height: 80 }} />
          </MediaCard>
        </Layout.Section>

        <Layout.Section variant="oneHalf">
          <MediaCard
            title="Quantity Breaks"
            primaryAction={{ content: "View quantity breaks", url: "/app/quantity-breaks" }}
            description="Tiered pricing on a single product. Customers save when they buy more."
            portrait
          >
            <div style={{ height: 80 }} />
          </MediaCard>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

- [ ] **Step 2: Modify `apps/admin/app/routes/app.tsx` to add NavMenu**

Replace the entire file with:

```tsx
import type { LoaderFunctionArgs, HeadersFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate, type AppLoadContext } from "~/shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  await authenticate.admin(request, ctx);
  return json({ apiKey: ctx.cloudflare.env.SHOPIFY_API_KEY });
}

export default function App() {
  useLoaderData<typeof loader>();
  return (
    <PolarisAppProvider i18n={enTranslations}>
      <NavMenu>
        <Link to="/app" rel="home">Dashboard</Link>
        <Link to="/app/bundles">Bundles</Link>
        <Link to="/app/quantity-breaks">Quantity Breaks</Link>
      </NavMenu>
      <Outlet />
    </PolarisAppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
```

- [ ] **Step 3: Typecheck and build**

```bash
cd apps/admin
pnpm typecheck && pnpm build 2>&1 | tail -3
```

Expected: clean typecheck, build succeeds.

- [ ] **Step 4: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/routes/app._index.tsx apps/admin/app/routes/app.tsx
git commit -m "feat(admin): add dashboard cards and NavMenu (Bundles, QBs)"
```

---

## Task 20: Build, deploy, smoke test, tag phase-2-complete

**Files:** none (deployment only)

- [ ] **Step 1: Run full test suite + typecheck**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App/apps/admin"
pnpm test && pnpm typecheck
```

Expected: 67 tests passing, typecheck clean.

- [ ] **Step 2: Build for production**

```bash
pnpm build
```

Expected: clean build to `build/client/` and `build/server/index.js`.

- [ ] **Step 3: Deploy to Cloudflare Pages**

```bash
CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=e3dfc3a3d6ef58eb226c8eaeec1ab73f \
  pnpm exec wrangler pages deploy ./build/client \
  --project-name=bundler-admin --branch=main --commit-dirty=false
```

Expected: `✨ Deployment complete!`.

- [ ] **Step 4: Wait for live**

```bash
until curl -sI https://bundler.deepseatools.in/app | grep -qE "HTTP"; do sleep 2; done
echo "Live"
```

- [ ] **Step 5: Manual smoke test on dev store**

Open `https://admin.shopify.com/store/deepseatools/apps/deepseatools-product-bundler` in browser:

1. Verify dashboard renders 2 MediaCards (Bundles, Quantity Breaks).
2. Click NavMenu "Bundles" → empty state with "Create bundle" button.
3. Click "Create bundle" → form renders with all 4 cards.
4. Pick 2+ products via ResourcePicker.
5. Set discount type Percentage, value 20.
6. Set status Active.
7. Click "Save bundle" → redirects to bundle list, new bundle visible.
8. Click bundle name → edit form pre-populated.
9. Change discount value to 25, save → list shows updated.
10. Same flow for Quantity Breaks: pick a product, define 3 tiers, save → verify list.

- [ ] **Step 6: Verify metafield via Admin GraphQL**

In Shopify admin, navigate to a product and use the Bulk Editor / Metafields debug, OR run via Shopify GraphiQL app:

```graphql
query {
  shop {
    metafield(namespace: "pumper", key: "config") {
      value
    }
  }
}
```

Expected: returns JSON with `bundles[]` and `quantityBreaks[]` matching what was saved.

- [ ] **Step 7: Verify KV cache invalidation**

```bash
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/e3dfc3a3d6ef58eb226c8eaeec1ab73f/storage/kv/namespaces/0c09056732f74254a1d5501e381ed150/values/config:deepseatools.myshopify.com" | head -3
```

Expected: 404 Not Found (cache key was deleted on save). If anything else, verify the route action calls `SHOP_SETTINGS_CACHE.delete(...)`.

- [ ] **Step 8: Tag and push**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git push
git tag phase-2-complete
git push origin --tags
```

Expected: tag pushed; GitHub repo shows `phase-2-complete`.

---

## Phase 2 Done Checklist

After Task 20, verify every item:

- [ ] Drizzle migration applied (local + remote): `bundles`, `quantity_breaks`, `shop_settings` tables exist; `shops.shopify_shop_gid` column added.
- [ ] All 6 new routes implemented and `pnpm typecheck` clean.
- [ ] Bundle CRUD end-to-end: create → list shows it → edit → save → metafield reflects it.
- [ ] QB CRUD end-to-end: create with ≥2 tiers → list → edit → save → metafield reflects.
- [ ] Status transitions work: draft → active → paused.
- [ ] App navigation has Dashboard, Bundles, Quantity Breaks entries.
- [ ] Empty states render correctly.
- [ ] All 67 tests pass (33 Phase 0+1 + 34 Phase 2).
- [ ] Metafield sync writes valid JSON containing saved entities.
- [ ] `shopifyShopGid` populated on `shops` row after first sync.
- [ ] KV `config:${shop}` deleted after each save.
- [ ] Production deploy succeeds; smoke test passes.
- [ ] `phase-2-complete` git tag pushed.
