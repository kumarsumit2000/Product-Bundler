# Phase 9.A.1: Bundle Widget Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let merchants set per-bundle/per-QB color overrides and rename a curated set of widget strings (headline, CTA, badges, labels), with empty values inheriting shop defaults.

**Architecture:** Render-time precedence: i18n default → shop settings → bundle/QB overrides. Schema adds `textOverrides` JSON column to both `bundles` and `quantity_breaks`, plus `headline` + `ctaLabel` to `quantity_breaks` for parity with `bundles`. Widget reads layered values via a new `tWith()` helper for text and an updated `applyCssVars()` that accepts overrides.

**Tech Stack:** Drizzle ORM (D1/SQLite), Remix on Cloudflare Pages, Polaris v13 forms, vanilla TS widget (vitest+jsdom), better-sqlite3 for in-memory DB tests.

**Spec:** [docs/superpowers/specs/2026-05-09-phase-9a1-bundle-customization-design.md](../specs/2026-05-09-phase-9a1-bundle-customization-design.md)

---

## File map

**Created (1):**
- `apps/admin/drizzle/migrations/0006_phase_9a1_customization.sql`
- `apps/widget-src/src/i18n.test.ts` (new test file — `i18n.ts` currently has no dedicated test)

**Modified (~13):**
- `apps/admin/drizzle/schema.ts` — `textOverrides` column on both, `headline`/`ctaLabel` on QB
- `apps/admin/app/lib/bundles/validate.ts` — accept new fields, length limits
- `apps/admin/app/lib/quantity-breaks/validate.ts` — same + new headline/CTA fields
- `apps/admin/app/lib/storefront-config.ts` — emit `textOverrides` (both) + QB headline/ctaLabel
- `apps/admin/app/lib/preview-config.ts` — same on the type definitions
- `apps/admin/app/components/BundleForm.tsx` — new "Style & Text" card
- `apps/admin/app/components/QbForm.tsx` — new "Style & Text" card + headline/CTA inputs
- `apps/admin/app/routes/app.bundles.new.tsx` — parse + persist new form fields
- `apps/admin/app/routes/app.bundles.$id.tsx` — same on update path
- `apps/admin/app/routes/app.quantity-breaks.new.tsx` — same
- `apps/admin/app/routes/app.quantity-breaks.$id.tsx` — same
- `apps/widget-src/src/types.ts` — sharpen `StyleOverrides`, add `textOverrides`, add QB `headline`/`ctaLabel`
- `apps/widget-src/src/i18n.ts` — factor `interpolate`, add `tWith`, add `bundle.savingsBadge` key
- `apps/widget-src/src/widget.ts` — `applyCssVars` accepts overrides
- `apps/widget-src/src/render-bundle.ts` — adopt `tWith` for curated keys, plumb overrides
- `apps/widget-src/src/render-qb.ts` — same
- `apps/widget-src/src/render-mix-match.ts` — same (uses bundle's overrides)

Existing tests get extended in place; one new test file (`i18n.test.ts`).

---

## Task 1: Schema migration + types

**Files:**
- Modify: `apps/admin/drizzle/schema.ts`
- Create: `apps/admin/drizzle/migrations/0006_phase_9a1_customization.sql`

- [ ] **Step 1: Add the SQL migration**

Create `apps/admin/drizzle/migrations/0006_phase_9a1_customization.sql`:

```sql
ALTER TABLE `bundles` ADD `text_overrides` text;
--> statement-breakpoint
ALTER TABLE `quantity_breaks` ADD `text_overrides` text;
--> statement-breakpoint
ALTER TABLE `quantity_breaks` ADD `headline` text;
--> statement-breakpoint
ALTER TABLE `quantity_breaks` ADD `cta_label` text;
```

- [ ] **Step 2: Update Drizzle schema**

Edit `apps/admin/drizzle/schema.ts`. Above `bundles`, add the curated `TextKey` types (we hand-roll them rather than use the union from i18n because schema.ts is also imported from non-widget code):

```ts
export type BundleTextKey = "bundle.totalLabel" | "bundle.savingsBadge";
export type QbTextKey =
  | "qb.tierLabel"
  | "qb.savingsBadge"
  | "qb.mostPopular"
  | "qb.giftBadge";
export type TextOverrides = Partial<Record<string, string>>;
```

In the `bundles` table, after the `styleOverrides` line (~line 63), add:

```ts
  textOverrides: text("text_overrides", { mode: "json" }).$type<TextOverrides | null>(),
```

In the `quantityBreaks` table, after the `styleOverrides` line (~line 85), add:

```ts
  textOverrides: text("text_overrides", { mode: "json" }).$type<TextOverrides | null>(),
  headline: text("headline"),
  ctaLabel: text("cta_label"),
```

- [ ] **Step 3: Run typecheck to verify schema compiles**

Run: `pnpm --filter admin tsc --noEmit`
Expected: PASS (no errors). The repos are typed against `Bundle`/`QuantityBreak` inferred types, so the new optional fields propagate automatically.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/drizzle/migrations/0006_phase_9a1_customization.sql apps/admin/drizzle/schema.ts
git commit -m "feat(schema): add textOverrides + QB headline/ctaLabel for phase 9.A.1"
```

---

## Task 2: Repo round-trip tests for new fields

**Files:**
- Test: `apps/admin/test/bundles-repo.test.ts`
- Test: `apps/admin/test/quantity-breaks-repo.test.ts`

- [ ] **Step 1: Write failing test in `bundles-repo.test.ts`**

Append to `apps/admin/test/bundles-repo.test.ts` (inside the `describe("bundles repo", ...)` block):

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter admin vitest run test/bundles-repo.test.ts`
Expected: FAIL — `textOverrides` is required by the type but `NEW_BUNDLE_INPUT` doesn't include it.

- [ ] **Step 3: Update `NEW_BUNDLE_INPUT` fixture to include the new field**

In `apps/admin/test/bundles-repo.test.ts`, edit the `NEW_BUNDLE_INPUT` constant:

```ts
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
  headline: null,
  ctaLabel: null,
  mode: "classic" as const,
  collectionId: null,
  targetQty: null,
};
```

- [ ] **Step 4: Run tests again**

Run: `pnpm --filter admin vitest run test/bundles-repo.test.ts`
Expected: PASS — migration adds the column, JSON serialization round-trips.

- [ ] **Step 5: Mirror the same test pattern in `quantity-breaks-repo.test.ts`**

Open `apps/admin/test/quantity-breaks-repo.test.ts`, find its fixture (likely named `NEW_QB_INPUT`), and add `textOverrides: null`, `headline: null`, `ctaLabel: null` to it. Then append:

```ts
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
```

If the QB test file uses a different fixture variable name, adjust accordingly. If it has no fixture variable and inlines the input, add the same three null defaults to each `repo.create(...)` call site.

- [ ] **Step 6: Run all repo tests**

Run: `pnpm --filter admin vitest run test/bundles-repo.test.ts test/quantity-breaks-repo.test.ts`
Expected: PASS — all green.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/test/bundles-repo.test.ts apps/admin/test/quantity-breaks-repo.test.ts
git commit -m "test(repos): cover textOverrides + QB headline/ctaLabel round-trip"
```

---

## Task 3: Validators accept new fields with length limits

**Files:**
- Modify: `apps/admin/app/lib/bundles/validate.ts`
- Modify: `apps/admin/app/lib/quantity-breaks/validate.ts`
- Test: `apps/admin/test/bundles-validate.test.ts`
- Test: `apps/admin/test/quantity-breaks-validate.test.ts` (verify it exists; if not, the validator changes still need to land — see Step 5 note)

- [ ] **Step 1: Write failing tests for bundle validator**

Append to `apps/admin/test/bundles-validate.test.ts`:

```ts
import { validateBundle } from "../app/lib/bundles/validate";

describe("validateBundle textOverrides + styleOverrides", () => {
  const baseInput = {
    name: "x",
    status: "draft",
    products: [
      { productId: "gid://shopify/Product/1", variantId: null, qty: 1 },
      { productId: "gid://shopify/Product/2", variantId: null, qty: 1 },
    ],
    discountType: "percentage",
    discountValue: 10,
    combinable: false,
    triggerProductIds: [],
    headline: null,
    ctaLabel: null,
    mode: "classic" as const,
    collectionId: null,
    targetQty: null,
  };

  it("accepts null textOverrides + styleOverrides", () => {
    const r = validateBundle({ ...baseInput, textOverrides: null, styleOverrides: null });
    expect(r.valid).toBe(true);
  });

  it("accepts a partial textOverrides object", () => {
    const r = validateBundle({
      ...baseInput,
      textOverrides: { "bundle.totalLabel": "Your total" },
      styleOverrides: { primaryColor: "#FF0000" },
    });
    expect(r.valid).toBe(true);
  });

  it("rejects textOverride values longer than 120 chars", () => {
    const r = validateBundle({
      ...baseInput,
      textOverrides: { "bundle.totalLabel": "x".repeat(121) },
      styleOverrides: null,
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.textOverrides).toMatch(/120/);
  });

  it("rejects unknown text override keys", () => {
    const r = validateBundle({
      ...baseInput,
      textOverrides: { "bundle.heading": "x" } as Record<string, string>, // heading is a column, not an override
      styleOverrides: null,
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.textOverrides).toBeDefined();
  });

  it("rejects non-hex primaryColor", () => {
    const r = validateBundle({
      ...baseInput,
      textOverrides: null,
      styleOverrides: { primaryColor: "red" },
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.styleOverrides).toMatch(/color/i);
  });

  it("rejects borderRadius outside 0–24", () => {
    const r = validateBundle({
      ...baseInput,
      textOverrides: null,
      styleOverrides: { borderRadius: 99 },
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.styleOverrides).toMatch(/radius/i);
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `pnpm --filter admin vitest run test/bundles-validate.test.ts`
Expected: FAIL — `BundleInput` type rejects `textOverrides` / `styleOverrides`; or tests pass through but produce wrong errors.

- [ ] **Step 3: Update `validateBundle`**

Edit `apps/admin/app/lib/bundles/validate.ts`. Add to the top of the file under the existing import:

```ts
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ALLOWED_BUNDLE_TEXT_KEYS = new Set(["bundle.totalLabel", "bundle.savingsBadge"]);
const ALLOWED_STYLE_KEYS = new Set(["primaryColor", "textColor", "backgroundColor", "borderRadius"]);
```

Extend `BundleInput`:

```ts
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
  mode: "classic" | "mix_match";
  collectionId: string | null;
  targetQty: number | null;
  styleOverrides: Record<string, unknown> | null;
  textOverrides: Record<string, string> | null;
};
```

Inside `validateBundle`, before the final `return`, add:

```ts
  if (input.textOverrides !== null && input.textOverrides !== undefined) {
    if (typeof input.textOverrides !== "object" || Array.isArray(input.textOverrides)) {
      errors.textOverrides = "textOverrides must be an object";
    } else {
      for (const [k, v] of Object.entries(input.textOverrides)) {
        if (!ALLOWED_BUNDLE_TEXT_KEYS.has(k)) {
          errors.textOverrides = `Unknown text override key: ${k}`;
          break;
        }
        if (typeof v !== "string") {
          errors.textOverrides = `Text override for ${k} must be a string`;
          break;
        }
        if (v.length > 120) {
          errors.textOverrides = `Text override for ${k} must be 120 characters or less`;
          break;
        }
      }
    }
  }

  if (input.styleOverrides !== null && input.styleOverrides !== undefined) {
    if (typeof input.styleOverrides !== "object" || Array.isArray(input.styleOverrides)) {
      errors.styleOverrides = "styleOverrides must be an object";
    } else {
      for (const [k, v] of Object.entries(input.styleOverrides)) {
        if (!ALLOWED_STYLE_KEYS.has(k)) {
          errors.styleOverrides = `Unknown style key: ${k}`;
          break;
        }
        if (k === "borderRadius") {
          if (typeof v !== "number" || v < 0 || v > 24) {
            errors.styleOverrides = "borderRadius must be a number between 0 and 24";
            break;
          }
        } else {
          if (typeof v !== "string" || !HEX_COLOR_RE.test(v)) {
            errors.styleOverrides = `${k} must be a hex color like #RRGGBB`;
            break;
          }
        }
      }
    }
  }
```

- [ ] **Step 4: Run bundle validator tests**

Run: `pnpm --filter admin vitest run test/bundles-validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Mirror the same changes in `quantity-breaks/validate.ts`**

Edit `apps/admin/app/lib/quantity-breaks/validate.ts`. At top:

```ts
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ALLOWED_QB_TEXT_KEYS = new Set([
  "qb.tierLabel",
  "qb.savingsBadge",
  "qb.mostPopular",
  "qb.giftBadge",
]);
const ALLOWED_STYLE_KEYS = new Set(["primaryColor", "textColor", "backgroundColor", "borderRadius"]);
```

Extend `QbInput`:

```ts
export type QbInput = {
  name: string;
  status: string;
  productId: string;
  tiers: QbTier[];
  combinable: boolean;
  headline: string | null;
  ctaLabel: string | null;
  styleOverrides: Record<string, unknown> | null;
  textOverrides: Record<string, string> | null;
};
```

Inside `validateQb`, before the final `return`, add the **identical block** as in Step 3 but replace `ALLOWED_BUNDLE_TEXT_KEYS` with `ALLOWED_QB_TEXT_KEYS`. Also add headline/ctaLabel length checks (same as bundle):

```ts
  if (input.headline && input.headline.length > 100) {
    errors.headline = "Headline must be 100 characters or less";
  }
  if (input.ctaLabel && input.ctaLabel.length > 50) {
    errors.ctaLabel = "CTA label must be 50 characters or less";
  }
```

If `apps/admin/test/quantity-breaks-validate.test.ts` does not exist, create it with parallel tests to bundles-validate. If it does exist, append the parallel tests.

Parallel tests for QB validator (full file if creating, otherwise just the new describe block):

```ts
import { describe, it, expect } from "vitest";
import { validateQb } from "../app/lib/quantity-breaks/validate";

describe("validateQb textOverrides + styleOverrides + headline/cta", () => {
  const baseInput = {
    name: "x",
    status: "draft",
    productId: "gid://shopify/Product/1",
    tiers: [{ qty: 1, discountType: "percentage" as const, discountValue: 10, label: "Buy 1", isMostPopular: false }],
    combinable: false,
    headline: null,
    ctaLabel: null,
  };

  it("accepts null overrides", () => {
    expect(validateQb({ ...baseInput, textOverrides: null, styleOverrides: null }).valid).toBe(true);
  });

  it("accepts curated text override keys", () => {
    const r = validateQb({
      ...baseInput,
      textOverrides: { "qb.tierLabel": "Get {qty}", "qb.mostPopular": "Top pick" },
      styleOverrides: null,
    });
    expect(r.valid).toBe(true);
  });

  it("rejects unknown text override key (e.g. qb.heading is a column)", () => {
    const r = validateQb({
      ...baseInput,
      textOverrides: { "qb.heading": "x" } as Record<string, string>,
      styleOverrides: null,
    });
    expect(r.valid).toBe(false);
  });

  it("rejects non-hex color", () => {
    const r = validateQb({
      ...baseInput,
      textOverrides: null,
      styleOverrides: { textColor: "black" },
    });
    expect(r.valid).toBe(false);
  });

  it("rejects headline > 100 chars", () => {
    const r = validateQb({
      ...baseInput,
      headline: "x".repeat(101),
      textOverrides: null,
      styleOverrides: null,
    });
    expect(r.valid).toBe(false);
  });
});
```

- [ ] **Step 6: Run validator tests**

Run: `pnpm --filter admin vitest run test/bundles-validate.test.ts test/quantity-breaks-validate.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/app/lib/bundles/validate.ts apps/admin/app/lib/quantity-breaks/validate.ts apps/admin/test/bundles-validate.test.ts apps/admin/test/quantity-breaks-validate.test.ts
git commit -m "feat(validate): accept and bound textOverrides + styleOverrides"
```

---

## Task 4: Storefront-config emits new fields

**Files:**
- Modify: `apps/admin/app/lib/storefront-config.ts`
- Modify: `apps/admin/app/lib/preview-config.ts`
- Test: `apps/admin/test/storefront-config.test.ts`
- Test: `apps/admin/test/preview-config.test.ts`

- [ ] **Step 1: Write failing test in `storefront-config.test.ts`**

Append to `apps/admin/test/storefront-config.test.ts`:

```ts
  it("emits textOverrides on bundles and quantityBreaks", async () => {
    // setup: insert one bundle and one QB with overrides into the in-memory DB
    // (use the existing test harness — pattern from earlier tests in this file)
    const bundleId = crypto.randomUUID();
    const qbId = crypto.randomUUID();
    setup.db.insert(schema.bundles).values({
      id: bundleId,
      shopId: SHOP_A,
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
    setup.db.insert(schema.quantityBreaks).values({
      id: qbId,
      shopId: SHOP_A,
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

    const cfg = await buildStorefrontConfig(setup.db, mockAdmin, SHOP_A);

    expect(cfg.bundles[0]!.textOverrides).toEqual({ "bundle.totalLabel": "Your cost" });
    expect(cfg.bundles[0]!.styleOverrides).toEqual({ primaryColor: "#FF0000" });
    expect(cfg.quantityBreaks[0]!.textOverrides).toEqual({ "qb.mostPopular": "Best" });
    expect(cfg.quantityBreaks[0]!.styleOverrides).toEqual({ borderRadius: 4 });
    expect(cfg.quantityBreaks[0]!.headline).toBe("Q-headline");
    expect(cfg.quantityBreaks[0]!.ctaLabel).toBe("Q-cta");
  });
```

If the existing file uses a different harness (e.g. mocked db that doesn't actually run SQL), adapt to match — the principle is: the function must surface the new fields on bundles/QBs. Read the top of `storefront-config.test.ts` to see the existing pattern before writing this test.

- [ ] **Step 2: Run failing test**

Run: `pnpm --filter admin vitest run test/storefront-config.test.ts`
Expected: FAIL — `textOverrides` is `undefined` on bundles/QBs in the result, or QB lacks `headline`/`ctaLabel`.

- [ ] **Step 3: Update `storefront-config.ts`**

Edit `apps/admin/app/lib/storefront-config.ts`.

In `buildQb` (~line 109), update the returned object:

```ts
    return {
      id: q.id,
      name: q.name,
      productId: q.productId,
      productTitle: detail?.title ?? "",
      productImage: detail?.image ?? null,
      productVariants: variants,
      tiers,
      combinable: q.combinable,
      styleOverrides: q.styleOverrides,
      textOverrides: q.textOverrides,
      headline: q.headline,
      ctaLabel: q.ctaLabel,
    };
```

In the bundles map (~line 166), add `textOverrides`:

```ts
    bundles: bundles.map((b) => ({
      id: b.id,
      // ...existing fields
      headline: b.headline,
      ctaLabel: b.ctaLabel,
      styleOverrides: b.styleOverrides,
      textOverrides: b.textOverrides,
    })),
```

(Keep all existing fields — only `textOverrides: b.textOverrides` is new on bundles.)

- [ ] **Step 4: Update `preview-config.ts` types**

Edit `apps/admin/app/lib/preview-config.ts`. Extend the local `BundleShape` type:

```ts
type BundleShape = {
  id: string;
  name: string;
  mode: "classic" | "mix_match";
  products: ProductRef[];
  collectionId: string | null;
  targetQty: number | null;
  collectionProducts: CollectionProduct[] | null;
  discountType: "percentage" | "flat" | "fixed_total";
  discountValue: number;
  combinable: boolean;
  triggerProductIds: string[];
  headline: string | null;
  ctaLabel: string | null;
  styleOverrides: Record<string, unknown> | null;
  textOverrides: Record<string, string> | null;
};
```

And `QbShape`:

```ts
type QbShape = {
  id: string;
  name: string;
  productId: string;
  productTitle: string;
  productImage: string | null;
  productVariants: Array<{ variantId: string; title: string; available: boolean; priceCents: number }>;
  tiers: Array<{ qty: number; discountType: string; discountValue: number; label: string; isMostPopular: boolean; available: boolean }>;
  combinable: boolean;
  styleOverrides: Record<string, unknown> | null;
  textOverrides: Record<string, string> | null;
  headline: string | null;
  ctaLabel: string | null;
};
```

- [ ] **Step 5: Add a test in `preview-config.test.ts`**

Append:

```ts
import { buildPreviewBundleConfig, buildPreviewQbConfig, defaultPreviewSettings } from "../app/lib/preview-config";

describe("buildPreviewBundleConfig with overrides", () => {
  it("passes textOverrides through unchanged", () => {
    const cfg = buildPreviewBundleConfig({
      shop: "s",
      mockProduct: { productId: "p", title: "T", priceCents: 100 },
      settings: defaultPreviewSettings(),
      bundle: {
        id: "b1",
        name: "n",
        mode: "classic",
        products: [],
        collectionId: null,
        targetQty: null,
        collectionProducts: null,
        discountType: "percentage",
        discountValue: 10,
        combinable: false,
        triggerProductIds: [],
        headline: null,
        ctaLabel: null,
        styleOverrides: { primaryColor: "#ABCDEF" },
        textOverrides: { "bundle.totalLabel": "X" },
      },
    });
    expect(cfg.bundles[0]!.textOverrides).toEqual({ "bundle.totalLabel": "X" });
    expect(cfg.bundles[0]!.styleOverrides).toEqual({ primaryColor: "#ABCDEF" });
  });
});
```

- [ ] **Step 6: Run all storefront-config + preview-config tests**

Run: `pnpm --filter admin vitest run test/storefront-config.test.ts test/preview-config.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/app/lib/storefront-config.ts apps/admin/app/lib/preview-config.ts apps/admin/test/storefront-config.test.ts apps/admin/test/preview-config.test.ts
git commit -m "feat(config): emit textOverrides + QB headline/ctaLabel in widget payload"
```

---

## Task 5: Widget i18n — `interpolate` + `tWith` + new `bundle.savingsBadge`

**Files:**
- Modify: `apps/widget-src/src/i18n.ts`
- Create: `apps/widget-src/src/i18n.test.ts`

- [ ] **Step 1: Create `apps/widget-src/src/i18n.test.ts` with failing tests**

```ts
import { describe, it, expect } from "vitest";
import { t, tWith, setLocale } from "./i18n";

describe("t", () => {
  it("returns plain string when no template vars", () => {
    expect(t("bundle.totalLabel")).toBe("Total");
  });
  it("substitutes {var} placeholders", () => {
    expect(t("qb.tierLabel", { qty: 3 })).toBe("Buy 3");
  });
  it("returns the key when missing", () => {
    expect(t("nonexistent.key")).toBe("nonexistent.key");
  });
});

describe("tWith", () => {
  it("returns i18n default when overrides is null", () => {
    expect(tWith(null, "bundle.totalLabel")).toBe("Total");
  });

  it("returns i18n default when overrides is undefined", () => {
    expect(tWith(undefined, "bundle.totalLabel")).toBe("Total");
  });

  it("returns i18n default when override key absent", () => {
    expect(tWith({ "qb.mostPopular": "Best" }, "bundle.totalLabel")).toBe("Total");
  });

  it("returns i18n default when override value is empty string", () => {
    expect(tWith({ "bundle.totalLabel": "" }, "bundle.totalLabel")).toBe("Total");
  });

  it("returns the override when present", () => {
    expect(tWith({ "bundle.totalLabel": "Your total" }, "bundle.totalLabel")).toBe("Your total");
  });

  it("substitutes vars on overrides", () => {
    expect(tWith({ "qb.tierLabel": "Get {qty} now" }, "qb.tierLabel", { qty: 5 })).toBe("Get 5 now");
  });

  it("leaves unknown placeholders intact in overrides", () => {
    expect(tWith({ "qb.tierLabel": "Get {qty} {flavor}" }, "qb.tierLabel", { qty: 5 }))
      .toBe("Get 5 {flavor}");
  });
});

describe("bundle.savingsBadge i18n key", () => {
  it("exists with a {amount} or {savings} placeholder", () => {
    setLocale("en");
    const result = t("bundle.savingsBadge", { savings: "$5.00" });
    expect(result).not.toBe("bundle.savingsBadge"); // must not fall through
    expect(result).toContain("$5.00");
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `pnpm --filter widget vitest run src/i18n.test.ts`
Expected: FAIL — `tWith` is not exported, and `bundle.savingsBadge` key is missing.

- [ ] **Step 3: Update `apps/widget-src/src/i18n.ts`**

Replace the entire file with:

```ts
type StringTable = Record<string, string>;

const EN: StringTable = {
  "bundle.heading": "Frequently bought together",
  "bundle.totalLabel": "Total",
  "bundle.cta": "Add bundle to cart",
  "bundle.ctaSavings": "Add bundle to cart — Save {savings}",
  "bundle.savingsBadge": "Save {savings}",
  "bundle.unavailable": "1 item out of stock — bundle unavailable",
  "qb.heading": "Choose your savings",
  "qb.tierLabel": "Buy {qty}",
  "qb.savingsBadge": "−{savings}",
  "qb.cta": "Add {qty} to cart",
  "qb.ctaSavings": "Add {qty} to cart — Save {savings}",
  "qb.mostPopular": "MOST POPULAR",
  "qb.tierUnavailable": "Only {available} left",
  "mm.heading": "Pick any {target} — Save {discount}",
  "mm.picked": "{count} of {target} picked",
  "mm.pickMore": "Pick {n} more",
  "mm.cta": "Add bundle to cart",
  "mm.ctaPickMore": "Pick {n} more to unlock {discount}",
  "mm.notEnoughStock": "Not enough items in stock",
  "mm.viewAll": "View all ({n})",
  "addToCart.error": "Couldn't add to cart — please try again.",
  "addToCart.unavailable": "Sorry, that item is no longer available.",
  "qb.giftBadge": "🎁 + Free {variantTitle}",
  "qb.giftBadgeUnavailable": "🎁 Free gift unavailable — out of stock",
  "qb.bogoSameOne": "🎁 + 1 free",
  "qb.bogoSameMany": "🎁 + {n} free",
  "qb.bogoDifferent": "🎁 + Free {variantTitle}",
  "qb.bogoNthFree": "🎁 Buy {qty}, pay for {paidQty}",
};

const TABLES: Record<string, StringTable> = { en: EN };

let active: StringTable = TABLES.en!;

export function setLocale(loc: string): void {
  active = TABLES[loc.split("-")[0]!] ?? TABLES.en!;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export function t(key: string, vars?: Record<string, string | number>): string {
  return interpolate(active[key] ?? key, vars);
}

export function tWith(
  overrides: Record<string, string> | null | undefined,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const override = overrides?.[key];
  const template = override && override.length > 0 ? override : (active[key] ?? key);
  return interpolate(template, vars);
}
```

- [ ] **Step 4: Run i18n tests**

Run: `pnpm --filter widget vitest run src/i18n.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full widget suite to confirm no regression**

Run: `pnpm --filter widget vitest run`
Expected: PASS — `t()` behavior is unchanged for existing callers.

- [ ] **Step 6: Commit**

```bash
git add apps/widget-src/src/i18n.ts apps/widget-src/src/i18n.test.ts
git commit -m "feat(widget): add tWith helper and bundle.savingsBadge key"
```

---

## Task 6: Widget types + per-bundle CSS vars

**Files:**
- Modify: `apps/widget-src/src/types.ts`
- Modify: `apps/widget-src/src/widget.ts`
- Test: `apps/widget-src/src/widget.test.ts`

- [ ] **Step 1: Sharpen types**

Edit `apps/widget-src/src/types.ts`. Replace the `BundleConfig` and `QbConfig` types with:

```ts
export type StyleOverrides = Partial<{
  primaryColor: string;
  textColor: string;
  backgroundColor: string;
  borderRadius: number;
}>;

export type TextOverrides = Record<string, string>;

export type BundleConfig = {
  id: string;
  name: string;
  mode: "classic" | "mix_match";
  products: ProductRef[];
  collectionId: string | null;
  targetQty: number | null;
  collectionProducts: CollectionProduct[] | null;
  discountType: DiscountType;
  discountValue: number;
  combinable: boolean;
  triggerProductIds: string[];
  headline: string | null;
  ctaLabel: string | null;
  styleOverrides: StyleOverrides | null;
  textOverrides: TextOverrides | null;
};

export type QbConfig = {
  id: string;
  name: string;
  productId: string;
  productTitle: string;
  productImage: string | null;
  productVariants: QbVariant[];
  tiers: QbTier[];
  combinable: boolean;
  styleOverrides: StyleOverrides | null;
  textOverrides: TextOverrides | null;
  headline: string | null;
  ctaLabel: string | null;
};
```

- [ ] **Step 2: Write failing test for `applyCssVars` accepting overrides**

Append to `apps/widget-src/src/widget.test.ts`:

```ts
import { applyCssVars } from "./widget";  // export the function for testing — see Step 4

describe("applyCssVars layered precedence", () => {
  function makeCfg(overrides: Partial<{ primaryColor: string; textColor: string; backgroundColor: string; borderRadius: number; fontFamily: string }> = {}) {
    return {
      shop: "s",
      settings: {
        primaryColor: "#000000",
        textColor: "#111111",
        backgroundColor: "#FFFFFF",
        borderRadius: 8,
        fontFamily: "inherit",
        bundleHeadline: "FBT",
        qbHeadline: "QBH",
        showCompareAtPrice: true,
        currency: "USD",
        locale: "en",
        ...overrides,
      },
      bundles: [],
      quantityBreaks: [],
    };
  }

  it("uses shop settings when override is null", () => {
    const el = document.createElement("div");
    applyCssVars(el, makeCfg(), null);
    expect(el.style.getPropertyValue("--pumper-primary")).toBe("#000000");
    expect(el.style.getPropertyValue("--pumper-radius")).toBe("8px");
  });

  it("uses override when provided", () => {
    const el = document.createElement("div");
    applyCssVars(el, makeCfg(), { primaryColor: "#FF0000", borderRadius: 12 });
    expect(el.style.getPropertyValue("--pumper-primary")).toBe("#FF0000");
    expect(el.style.getPropertyValue("--pumper-radius")).toBe("12px");
  });

  it("falls back to settings for unset override fields", () => {
    const el = document.createElement("div");
    applyCssVars(el, makeCfg(), { primaryColor: "#FF0000" });
    expect(el.style.getPropertyValue("--pumper-primary")).toBe("#FF0000");
    expect(el.style.getPropertyValue("--pumper-text")).toBe("#111111");
  });
});
```

- [ ] **Step 3: Run failing test**

Run: `pnpm --filter widget vitest run src/widget.test.ts`
Expected: FAIL — `applyCssVars` is not exported and signature doesn't accept overrides.

- [ ] **Step 4: Update `applyCssVars` and renderShortcode/renderMount**

Edit `apps/widget-src/src/widget.ts`. Replace `applyCssVars`:

```ts
export function applyCssVars(
  target: HTMLElement,
  cfg: WidgetConfig,
  override: StyleOverrides | null,
): void {
  const s = cfg.settings;
  target.style.setProperty("--pumper-primary",  override?.primaryColor    ?? s.primaryColor);
  target.style.setProperty("--pumper-text",     override?.textColor       ?? s.textColor);
  target.style.setProperty("--pumper-bg",       override?.backgroundColor ?? s.backgroundColor);
  target.style.setProperty("--pumper-radius",   `${override?.borderRadius ?? s.borderRadius}px`);
  target.style.setProperty("--pumper-font",     s.fontFamily);
}
```

Add the import for `StyleOverrides` at the top of `widget.ts`:

```ts
import type { WidgetConfig, WidgetType, StyleOverrides } from "./types";
```

Update call sites in the same file:

In `renderShortcode` (~line 64), replace `applyCssVars(el, cfg);` with the entity-aware lookup-then-apply pattern:

```ts
function renderShortcode(el: HTMLElement, kind: ShortcodeKind, id: string, cfg: WidgetConfig): void {
  if (kind === "bundle") {
    const b = lookupBundle(cfg, id);
    if (!b) { el.innerHTML = ""; el.style.minHeight = ""; el.dataset.pumperRendered = "1"; return; }
    applyCssVars(el, cfg, b.styleOverrides);
    renderBundle(el, b, cfg);
    el.dataset.pumperRendered = "1";
    return;
  }
  if (kind === "qb") {
    const q = lookupQb(cfg, id);
    if (!q) { el.innerHTML = ""; el.style.minHeight = ""; el.dataset.pumperRendered = "1"; return; }
    applyCssVars(el, cfg, q.styleOverrides);
    renderQb(el, q, cfg);
    el.dataset.pumperRendered = "1";
    return;
  }
  // kind === "mix"
  const m = lookupMixMatch(cfg, id);
  if (!m) { el.innerHTML = ""; el.style.minHeight = ""; el.dataset.pumperRendered = "1"; return; }
  applyCssVars(el, cfg, m.styleOverrides);
  renderMixMatch(el, m, cfg);
  el.dataset.pumperRendered = "1";
}
```

In `renderMount` (~line 98), replace the existing `applyCssVars(mount, cfg);` line — move it inside each branch after the entity is resolved:

```ts
function renderMount(mount: HTMLElement, cfg: WidgetConfig): void {
  const type = mount.dataset.pumperType as WidgetType | undefined;
  const productId = toGid(mount.dataset.productId ?? "");
  if (!type || !productId) {
    mount.innerHTML = "";
    return;
  }
  if (type === "bundle") {
    const b = matchBundle(cfg, productId);
    if (!b) { mount.innerHTML = ""; mount.style.minHeight = ""; return; }
    applyCssVars(mount, cfg, b.styleOverrides);
    renderBundle(mount, b, cfg);
  } else if (type === "qb") {
    const q = matchQb(cfg, productId);
    if (!q) { mount.innerHTML = ""; mount.style.minHeight = ""; return; }
    applyCssVars(mount, cfg, q.styleOverrides);
    renderQb(mount, q, cfg);
  } else if (type === "mix_match") {
    const m = matchMixMatch(cfg, productId);
    if (!m) { mount.innerHTML = ""; mount.style.minHeight = ""; return; }
    applyCssVars(mount, cfg, m.styleOverrides);
    renderMixMatch(mount, m, cfg);
  }
  mount.dataset.pumperRendered = "1";
}
```

- [ ] **Step 5: Set vitest environment to jsdom for the new widget.test.ts case**

The widget package's vitest config likely already uses jsdom — verify with `cat apps/widget-src/vitest.config.ts`. If it doesn't, the existing widget tests would already be broken, so it does. Skip this step if confirmed.

- [ ] **Step 6: Run widget tests**

Run: `pnpm --filter widget vitest run`
Expected: PASS — all existing tests remain green and the new applyCssVars tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/widget-src/src/types.ts apps/widget-src/src/widget.ts apps/widget-src/src/widget.test.ts
git commit -m "feat(widget): per-entity CSS var overrides via applyCssVars(target, cfg, override)"
```

---

## Task 7: Render layer — adopt `tWith` for curated keys

**Files:**
- Modify: `apps/widget-src/src/render-bundle.ts`
- Modify: `apps/widget-src/src/render-qb.ts`
- Modify: `apps/widget-src/src/render-mix-match.ts`
- Test: `apps/widget-src/src/render-bundle.test.ts`
- Test: `apps/widget-src/src/render-qb.test.ts`

- [ ] **Step 1: Write failing test in `render-bundle.test.ts`**

Append to `apps/widget-src/src/render-bundle.test.ts`:

```ts
  it("renders bundle with textOverrides for totalLabel and savingsBadge", () => {
    const el = document.createElement("div");
    const bundle = makeBundleFixture({
      textOverrides: { "bundle.totalLabel": "Your cost", "bundle.savingsBadge": "You save {savings}!" },
    });
    renderBundle(el, bundle, makeCfgFixture());
    expect(el.innerHTML).toContain("Your cost");
  });

  it("falls back to default totalLabel when override absent", () => {
    const el = document.createElement("div");
    const bundle = makeBundleFixture({ textOverrides: null });
    renderBundle(el, bundle, makeCfgFixture());
    expect(el.innerHTML).toContain("Total");
  });
```

If the test file lacks `makeBundleFixture` / `makeCfgFixture` helpers, inline a minimal fixture inside each test based on the `BundleConfig` type. Look at the file's existing tests for the shape of the fixture they already use, then add the optional `textOverrides: null` (or the override map) field to it.

- [ ] **Step 2: Run failing test**

Run: `pnpm --filter widget vitest run src/render-bundle.test.ts`
Expected: FAIL — override doesn't appear in output, "Your cost" is not in innerHTML.

- [ ] **Step 3: Update `render-bundle.ts`**

Edit `apps/widget-src/src/render-bundle.ts`. At the import for `t`, change to:

```ts
import { t, tWith } from "./i18n";
```

Replace this line (~line 45):

```ts
      <span class="pumper-total-label">${t("bundle.totalLabel")}
```

with:

```ts
      <span class="pumper-total-label">${tWith(bundle.textOverrides, "bundle.totalLabel")}
```

Replace the CTA computation (~lines 53-56). Find the block resembling:

```ts
    ? t("bundle.unavailable")
    : (savings > 0
        ? t("bundle.ctaSavings", { savings: ... })
        : t("bundle.cta")));
```

The `bundle.unavailable` and `bundle.cta` / `bundle.ctaSavings` keys are NOT in the curated set per the spec — keep them on `t()`. Only `bundle.totalLabel` and `bundle.savingsBadge` are overridable on the bundle side. Leave the CTA block alone.

If the file currently has no `bundle.savingsBadge` usage (it doesn't — the key is new), find the savings-display location and add it. Search for where `savingsCents` is rendered as a badge — if there's currently inline string concatenation, replace with `tWith(bundle.textOverrides, "bundle.savingsBadge", { savings: formatMoney(...) })`. If the bundle currently doesn't render a savings badge at all, skip the savingsBadge integration in this task — the i18n key is in place, and a follow-up render task can wire it in.

- [ ] **Step 4: Update `render-qb.ts`**

Edit `apps/widget-src/src/render-qb.ts`. Update import:

```ts
import { t, tWith } from "./i18n";
```

Replace the curated-key call sites:

Line ~68:
```ts
const heading = config.settings.qbHeadline || t("qb.heading");
```
becomes:
```ts
const heading = qb.headline || config.settings.qbHeadline || tWith(qb.textOverrides, "qb.heading");
```
(Note: `qb.heading` is rendered through `tWith` so a textOverride for it could apply — but per spec, `qb.heading` lives in the new `headline` column, not `textOverrides`. The `tWith(qb.textOverrides, "qb.heading")` call returns the i18n default since `qb.heading` is not an allowed override key in the validator. This is intentional defense-in-depth — even if a stale override slipped in, the validator rejects it on save.)

Line ~76:
```ts
? `<span class="pumper-qb-popular-badge">${t("qb.mostPopular")}</span>`
```
becomes:
```ts
? `<span class="pumper-qb-popular-badge">${tWith(qb.textOverrides, "qb.mostPopular")}</span>`
```

Line ~79:
```ts
? `<span class="pumper-qb-savings">${t("qb.savingsBadge", { savings: formatMoney(...) })}</span>`
```
becomes:
```ts
? `<span class="pumper-qb-savings">${tWith(qb.textOverrides, "qb.savingsBadge", { savings: formatMoney(savings, config.settings.currency, config.settings.locale) })}</span>`
```

Line ~91:
```ts
<div class="pumper-qb-tier-title">${escapeHtml(t("qb.tierLabel", { qty: tr.qty }))}${tr.discountValue > 0 ? ` — ${escapeHtml(tr.label)}` : ""}</div>
```
becomes:
```ts
<div class="pumper-qb-tier-title">${escapeHtml(tWith(qb.textOverrides, "qb.tierLabel", { qty: tr.qty }))}${tr.discountValue > 0 ? ` — ${escapeHtml(tr.label)}` : ""}</div>
```

Line ~19 (the freeGiftVariantTitle path):
```ts
badges.push(`<div class="pumper-qb-gift-badge">${escapeHtml(t("qb.giftBadge", { variantTitle: tier.freeGiftVariantTitle ?? "gift" }))}</div>`);
```
becomes:
```ts
badges.push(`<div class="pumper-qb-gift-badge">${escapeHtml(tWith(qb.textOverrides, "qb.giftBadge", { variantTitle: tier.freeGiftVariantTitle ?? "gift" }))}</div>`);
```

Note: this badge function is a helper at the top of the file that may not currently take `qb` as a parameter. If so, thread `qb` (or just `qb.textOverrides`) into the helper's signature. If multiple callers exist, update all to pass it. Keep the bogo/giftBadgeUnavailable strings on plain `t()` — they're not in the curated set.

For the QB `cta` and `ctaSavings` calls (~lines 105-106), keep them on `t()` — `qb.cta` lives in the `ctaLabel` column, not `textOverrides`. The current code looks like:

```ts
      ? t("qb.ctaSavings", { qty: tr.qty, savings: formatMoney(savings, config.settings.currency, config.settings.locale) })
      : t("qb.cta", { qty: tr.qty })
```

Replace with a column-aware ternary that prefers `qb.ctaLabel` when set:

```ts
      ? (qb.ctaLabel || t("qb.ctaSavings", { qty: tr.qty, savings: formatMoney(savings, config.settings.currency, config.settings.locale) }))
      : (qb.ctaLabel || t("qb.cta", { qty: tr.qty }))
```

Note: when `ctaLabel` is set, the merchant gets full control of the CTA text (including the savings phrasing); they can use `{savings}` and `{qty}` template vars but only the i18n default substitutes them. The simplest behavior is "merchant override wins, no template substitution" — if you want template support on the column too, run it through `interpolate(qb.ctaLabel, { qty: tr.qty, savings: formatMoney(...) })`. For v1, keep it simple: static override wins as-is. Document this in the form helpText: "Use the headline/CTA fields above for static text. Templates with {qty} and {savings} are only available in the i18n defaults."

- [ ] **Step 5: Update `render-mix-match.ts`**

Mix-match uses the bundle's headline/ctaLabel and inherits its overrides. Open the file and find calls to `t()` for `bundle.totalLabel` (if any) — replace with `tWith(bundle.textOverrides, "bundle.totalLabel")`. The mix-match view typically uses `mm.*` keys — those are not in the curated set, so leave them on `t()`.

If `render-mix-match.ts` has no `bundle.totalLabel` usage, no changes needed to this file.

- [ ] **Step 6: Add render-qb test for textOverrides**

Append to `apps/widget-src/src/render-qb.test.ts`:

```ts
  it("renders override for qb.mostPopular when set", () => {
    const el = document.createElement("div");
    const qb = makeQbFixture({
      tiers: [{ qty: 2, discountType: "percentage", discountValue: 10, label: "10%", isMostPopular: true, available: true, freeGiftVariantId: null, freeGiftAvailable: null, bogo: null }],
      textOverrides: { "qb.mostPopular": "Best value" },
    });
    renderQb(el, qb, makeCfgFixture());
    expect(el.innerHTML).toContain("Best value");
    expect(el.innerHTML).not.toContain("MOST POPULAR");
  });

  it("falls back to default qb.mostPopular when override absent", () => {
    const el = document.createElement("div");
    const qb = makeQbFixture({
      tiers: [{ qty: 2, discountType: "percentage", discountValue: 10, label: "10%", isMostPopular: true, available: true, freeGiftVariantId: null, freeGiftAvailable: null, bogo: null }],
      textOverrides: null,
    });
    renderQb(el, qb, makeCfgFixture());
    expect(el.innerHTML).toContain("MOST POPULAR");
  });

  it("uses qb.headline column when set", () => {
    const el = document.createElement("div");
    const qb = makeQbFixture({ headline: "Volume savings", textOverrides: null });
    renderQb(el, qb, makeCfgFixture());
    expect(el.innerHTML).toContain("Volume savings");
  });
```

Match the existing fixture shape in the file. If `makeQbFixture` doesn't support `textOverrides` / `headline` yet, extend it.

- [ ] **Step 7: Run widget tests**

Run: `pnpm --filter widget vitest run`
Expected: PASS — all existing + new tests green.

- [ ] **Step 8: Commit**

```bash
git add apps/widget-src/src/render-bundle.ts apps/widget-src/src/render-qb.ts apps/widget-src/src/render-mix-match.ts apps/widget-src/src/render-bundle.test.ts apps/widget-src/src/render-qb.test.ts
git commit -m "feat(widget): adopt tWith for curated keys, layer QB headline/ctaLabel"
```

---

## Task 8: BundleForm "Style & Text" card

**Files:**
- Modify: `apps/admin/app/components/BundleForm.tsx`

- [ ] **Step 1: Extend `BundleFormValues`**

In `apps/admin/app/components/BundleForm.tsx`, update the type (~line 24):

```ts
export type BundleFormValues = {
  name: string;
  mode: Mode;
  products: PickedProduct[];
  collection: PickedCollection | null;
  targetQty: string;
  discountType: DiscountType;
  discountValue: string;
  combinable: boolean;
  triggerMode: TriggerMode;
  triggerProducts: PickedProduct[];
  status: Status;
  headline: string;
  ctaLabel: string;
  primaryColor: string;       // "" = inherit
  textColor: string;          // "" = inherit
  backgroundColor: string;    // "" = inherit
  borderRadius: string;       // "" = inherit (string for textfield round-trip; parseInt at submit)
  textOverrides: Record<string, string>; // empty values stripped at submit
};
```

Update DEFAULTS:

```ts
const DEFAULTS: BundleFormValues = {
  name: "",
  mode: "classic",
  products: [],
  collection: null,
  targetQty: "3",
  discountType: "percentage",
  discountValue: "10",
  combinable: false,
  triggerMode: "same_as_members",
  triggerProducts: [],
  status: "draft",
  headline: "",
  ctaLabel: "",
  primaryColor: "",
  textColor: "",
  backgroundColor: "",
  borderRadius: "",
  textOverrides: { "bundle.totalLabel": "", "bundle.savingsBadge": "" },
};
```

- [ ] **Step 2: Add hidden inputs that serialize the new fields**

Inside the `<Form method="post">` (~line 79), add three more hidden inputs alongside the existing ones:

```tsx
      <input type="hidden" name="styleOverrides" value={JSON.stringify({
        primaryColor: values.primaryColor || undefined,
        textColor: values.textColor || undefined,
        backgroundColor: values.backgroundColor || undefined,
        borderRadius: values.borderRadius ? parseInt(values.borderRadius, 10) : undefined,
      })} />
      <input type="hidden" name="textOverrides" value={JSON.stringify(
        Object.fromEntries(Object.entries(values.textOverrides).filter(([, v]) => v.length > 0))
      )} />
```

- [ ] **Step 3: Add the "Style & Text" Card before the closing `</BlockStack>`**

After the existing Settings card (the last `<Card>` before `<Box paddingBlockEnd="600">`), insert:

```tsx
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Style & Text</Text>
            <Text as="p" tone="subdued">Override how this bundle looks and reads. Leave fields empty to use shop defaults.</Text>

            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Colors</Text>
              <InlineStack gap="300">
                <TextField
                  label="Primary color"
                  type="text"
                  value={values.primaryColor}
                  onChange={(v) => update("primaryColor", v)}
                  placeholder="#7B1E2A"
                  helpText="6-digit hex like #FF0000"
                  autoComplete="off"
                  maxLength={7}
                />
                <TextField
                  label="Text color"
                  type="text"
                  value={values.textColor}
                  onChange={(v) => update("textColor", v)}
                  placeholder="#1A1A1A"
                  autoComplete="off"
                  maxLength={7}
                />
                <TextField
                  label="Background color"
                  type="text"
                  value={values.backgroundColor}
                  onChange={(v) => update("backgroundColor", v)}
                  placeholder="#FFFFFF"
                  autoComplete="off"
                  maxLength={7}
                />
              </InlineStack>
              <TextField
                label="Border radius (px)"
                type="number"
                min={0}
                max={24}
                value={values.borderRadius}
                onChange={(v) => update("borderRadius", v)}
                placeholder="8"
                autoComplete="off"
              />
            </BlockStack>

            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Text</Text>
              <TextField
                label="Total label"
                value={values.textOverrides["bundle.totalLabel"] ?? ""}
                onChange={(v) => update("textOverrides", { ...values.textOverrides, "bundle.totalLabel": v })}
                placeholder="Total"
                helpText="Leave empty to use the default."
                autoComplete="off"
                maxLength={120}
              />
              <TextField
                label="Savings badge"
                value={values.textOverrides["bundle.savingsBadge"] ?? ""}
                onChange={(v) => update("textOverrides", { ...values.textOverrides, "bundle.savingsBadge": v })}
                placeholder="Save {savings}"
                helpText="Available variables: {savings}"
                autoComplete="off"
                maxLength={120}
              />
            </BlockStack>

            {(errors?.styleOverrides || errors?.textOverrides) && (
              <Banner tone="critical">{errors?.styleOverrides || errors?.textOverrides}</Banner>
            )}
          </BlockStack>
        </Card>
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter admin tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/components/BundleForm.tsx
git commit -m "feat(admin): bundle form Style & Text card with color + curated text inputs"
```

---

## Task 9: Bundle routes parse + persist new form fields

**Files:**
- Modify: `apps/admin/app/routes/app.bundles.new.tsx`
- Modify: `apps/admin/app/routes/app.bundles.$id.tsx`

- [ ] **Step 1: Update create action**

In `apps/admin/app/routes/app.bundles.new.tsx` action, after the existing `triggerProducts` parsing (~line 38), add:

```ts
  const styleOverridesRaw = (form.get("styleOverrides") as string) || "{}";
  const textOverridesRaw = (form.get("textOverrides") as string) || "{}";
  let parsedStyleOverrides: Record<string, unknown> | null = null;
  let parsedTextOverrides: Record<string, string> | null = null;
  try {
    const so = JSON.parse(styleOverridesRaw);
    const filteredSo: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(so)) {
      if (v !== undefined && v !== null && v !== "") filteredSo[k] = v;
    }
    parsedStyleOverrides = Object.keys(filteredSo).length > 0 ? filteredSo : null;
  } catch { parsedStyleOverrides = null; }
  try {
    const to = JSON.parse(textOverridesRaw);
    const filteredTo: Record<string, string> = {};
    for (const [k, v] of Object.entries(to)) {
      if (typeof v === "string" && v.length > 0) filteredTo[k] = v;
    }
    parsedTextOverrides = Object.keys(filteredTo).length > 0 ? filteredTo : null;
  } catch { parsedTextOverrides = null; }
```

Then in the `input` object construction (~line 53), add:

```ts
  const input = {
    // ...existing fields
    headline: (form.get("headline") as string) || null,
    ctaLabel: (form.get("ctaLabel") as string) || null,
    styleOverrides: parsedStyleOverrides,
    textOverrides: parsedTextOverrides,
  };
```

In the `bundleRepo.create(...)` call (~line 85), remove the `styleOverrides: null` line — `input` now provides the right value, so the spread does it. The block becomes:

```ts
  const created = await bundleRepo.create(db, session.shop, {
    ...input,
    status: input.status as "draft" | "active" | "paused",
    discountType: input.discountType as
      | "percentage"
      | "flat"
      | "fixed_total",
    mode: input.mode,
  });
```

- [ ] **Step 2: Update edit action**

Same changes in `apps/admin/app/routes/app.bundles.$id.tsx`. The action body is structurally identical (same `input` shape, same `bundleRepo.update(...)` call). Apply the same parsing block and the same `input` extension. The update call (~line 157) becomes:

```ts
  await bundleRepo.update(db, session.shop, params.id!, {
    ...input,
    status: input.status as "draft" | "active" | "paused",
    discountType: input.discountType as
      | "percentage"
      | "flat"
      | "fixed_total",
    mode: input.mode,
  });
```

(Same `input` from above is spread.)

- [ ] **Step 3: In the edit page's loader/initial values, hydrate the form**

In `apps/admin/app/routes/app.bundles.$id.tsx`, find where `<BundleForm initialValues={...}>` is rendered. Update the initialValues to include the new fields:

```tsx
<BundleForm
  initialValues={{
    name: bundle.name,
    mode: bundle.mode,
    products: /* existing */,
    collection: /* existing */,
    targetQty: bundle.targetQty?.toString() ?? "3",
    discountType: bundle.discountType,
    discountValue: bundle.discountValue.toString(),
    combinable: bundle.combinable,
    triggerMode: /* existing */,
    triggerProducts: /* existing */,
    status: bundle.status as "draft" | "active" | "paused",
    headline: bundle.headline ?? "",
    ctaLabel: bundle.ctaLabel ?? "",
    primaryColor: (bundle.styleOverrides as { primaryColor?: string } | null)?.primaryColor ?? "",
    textColor: (bundle.styleOverrides as { textColor?: string } | null)?.textColor ?? "",
    backgroundColor: (bundle.styleOverrides as { backgroundColor?: string } | null)?.backgroundColor ?? "",
    borderRadius: (bundle.styleOverrides as { borderRadius?: number } | null)?.borderRadius?.toString() ?? "",
    textOverrides: {
      "bundle.totalLabel": (bundle.textOverrides as Record<string, string> | null)?.["bundle.totalLabel"] ?? "",
      "bundle.savingsBadge": (bundle.textOverrides as Record<string, string> | null)?.["bundle.savingsBadge"] ?? "",
    },
  }}
  // ...
/>
```

Keep the existing `products`, `collection`, `triggerMode`, `triggerProducts` initial-values logic — just add the override fields.

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter admin tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Run admin test suite**

Run: `pnpm --filter admin vitest run`
Expected: PASS — all 184+ tests still green (validators tightened, but inputs from the form now include the new fields, so route-level integration is type-correct).

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/routes/app.bundles.new.tsx apps/admin/app/routes/app.bundles.$id.tsx
git commit -m "feat(admin): persist bundle styleOverrides + textOverrides from form"
```

---

## Task 10: QbForm "Style & Text" card with new headline/CTA inputs

**Files:**
- Modify: `apps/admin/app/components/QbForm.tsx`

- [ ] **Step 1: Extend `QbFormValues`**

In `apps/admin/app/components/QbForm.tsx`:

```ts
export type QbFormValues = {
  name: string;
  product: PickedProduct[];
  tiers: TierFormValue[];
  combinable: boolean;
  status: Status;
  headline: string;
  ctaLabel: string;
  primaryColor: string;
  textColor: string;
  backgroundColor: string;
  borderRadius: string;
  textOverrides: Record<string, string>;
};
```

Update DEFAULTS:

```ts
const DEFAULTS: QbFormValues = {
  name: "",
  product: [],
  tiers: [{ qty: 1, discountType: "percentage", discountValue: 0, label: "Buy 1", isMostPopular: false }],
  combinable: false,
  status: "draft",
  headline: "",
  ctaLabel: "",
  primaryColor: "",
  textColor: "",
  backgroundColor: "",
  borderRadius: "",
  textOverrides: {
    "qb.tierLabel": "",
    "qb.savingsBadge": "",
    "qb.mostPopular": "",
    "qb.giftBadge": "",
  },
};
```

- [ ] **Step 2: Add hidden inputs**

Inside the `<Form method="post">`, add alongside the existing tiers hidden input:

```tsx
      <input type="hidden" name="headline" value={values.headline} />
      <input type="hidden" name="ctaLabel" value={values.ctaLabel} />
      <input type="hidden" name="styleOverrides" value={JSON.stringify({
        primaryColor: values.primaryColor || undefined,
        textColor: values.textColor || undefined,
        backgroundColor: values.backgroundColor || undefined,
        borderRadius: values.borderRadius ? parseInt(values.borderRadius, 10) : undefined,
      })} />
      <input type="hidden" name="textOverrides" value={JSON.stringify(
        Object.fromEntries(Object.entries(values.textOverrides).filter(([, v]) => v.length > 0))
      )} />
```

- [ ] **Step 3: Add the Style & Text Card before the closing `</BlockStack>`**

After the existing Settings card, insert:

```tsx
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Style & Text</Text>
            <Text as="p" tone="subdued">Override how this quantity break looks and reads. Leave fields empty to use shop defaults.</Text>

            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Headline & CTA</Text>
              <TextField
                label="Headline (optional)"
                value={values.headline}
                onChange={(v) => update("headline", v)}
                error={errors?.headline}
                placeholder="Choose your savings"
                autoComplete="off"
                maxLength={100}
              />
              <TextField
                label="CTA label (optional)"
                value={values.ctaLabel}
                onChange={(v) => update("ctaLabel", v)}
                error={errors?.ctaLabel}
                placeholder="Add to cart"
                autoComplete="off"
                maxLength={50}
              />
            </BlockStack>

            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Colors</Text>
              <InlineStack gap="300">
                <TextField
                  label="Primary color"
                  value={values.primaryColor}
                  onChange={(v) => update("primaryColor", v)}
                  placeholder="#7B1E2A"
                  helpText="6-digit hex like #FF0000"
                  autoComplete="off"
                  maxLength={7}
                />
                <TextField
                  label="Text color"
                  value={values.textColor}
                  onChange={(v) => update("textColor", v)}
                  placeholder="#1A1A1A"
                  autoComplete="off"
                  maxLength={7}
                />
                <TextField
                  label="Background color"
                  value={values.backgroundColor}
                  onChange={(v) => update("backgroundColor", v)}
                  placeholder="#FFFFFF"
                  autoComplete="off"
                  maxLength={7}
                />
              </InlineStack>
              <TextField
                label="Border radius (px)"
                type="number"
                min={0}
                max={24}
                value={values.borderRadius}
                onChange={(v) => update("borderRadius", v)}
                placeholder="8"
                autoComplete="off"
              />
            </BlockStack>

            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Text overrides</Text>
              <TextField
                label="Tier label"
                value={values.textOverrides["qb.tierLabel"] ?? ""}
                onChange={(v) => update("textOverrides", { ...values.textOverrides, "qb.tierLabel": v })}
                placeholder="Buy {qty}"
                helpText="Available variables: {qty}"
                autoComplete="off"
                maxLength={120}
              />
              <TextField
                label="Savings badge"
                value={values.textOverrides["qb.savingsBadge"] ?? ""}
                onChange={(v) => update("textOverrides", { ...values.textOverrides, "qb.savingsBadge": v })}
                placeholder="−{savings}"
                helpText="Available variables: {savings}"
                autoComplete="off"
                maxLength={120}
              />
              <TextField
                label="\"Most popular\" badge"
                value={values.textOverrides["qb.mostPopular"] ?? ""}
                onChange={(v) => update("textOverrides", { ...values.textOverrides, "qb.mostPopular": v })}
                placeholder="MOST POPULAR"
                autoComplete="off"
                maxLength={120}
              />
              <TextField
                label="Free gift badge"
                value={values.textOverrides["qb.giftBadge"] ?? ""}
                onChange={(v) => update("textOverrides", { ...values.textOverrides, "qb.giftBadge": v })}
                placeholder="🎁 + Free {variantTitle}"
                helpText="Available variables: {variantTitle}"
                autoComplete="off"
                maxLength={120}
              />
            </BlockStack>

            {(errors?.styleOverrides || errors?.textOverrides) && (
              <Banner tone="critical">{errors?.styleOverrides || errors?.textOverrides}</Banner>
            )}
          </BlockStack>
        </Card>
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter admin tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/components/QbForm.tsx
git commit -m "feat(admin): QB form Style & Text card with headline/CTA + curated text inputs"
```

---

## Task 11: QB routes parse + persist new form fields

**Files:**
- Modify: `apps/admin/app/routes/app.quantity-breaks.new.tsx`
- Modify: `apps/admin/app/routes/app.quantity-breaks.$id.tsx`

- [ ] **Step 1: Update create action**

In `apps/admin/app/routes/app.quantity-breaks.new.tsx` action, after the existing tiers parsing (~line 34), add the same `parsedStyleOverrides` / `parsedTextOverrides` block from Task 9 Step 1.

Then extend `input`:

```ts
  const input = {
    name: (form.get("name") as string) || "",
    status: (form.get("status") as string) || "draft",
    productId: (form.get("productId") as string) || "",
    tiers: tiersRaw.map((t) => ({
      qty: t.qty,
      discountType: t.discountType as "percentage" | "flat" | "fixed_per_unit",
      discountValue: t.discountValue,
      label: t.label,
      isMostPopular: t.isMostPopular,
      freeGiftVariantId: (t as { freeGiftVariantId?: string | null }).freeGiftVariantId ?? undefined,
      bogo: (() => {
        const raw = (t as { bogo?: { mode: "add_same" | "add_different" | "nth_free"; targetVariantId?: string | null; bonusQty: number } | null }).bogo;
        if (!raw) return undefined;
        return {
          mode: raw.mode,
          targetVariantId: raw.targetVariantId ?? undefined,
          bonusQty: raw.bonusQty,
        };
      })(),
    })),
    combinable: form.get("combinable") === "on",
    headline: (form.get("headline") as string) || null,
    ctaLabel: (form.get("ctaLabel") as string) || null,
    styleOverrides: parsedStyleOverrides,
    textOverrides: parsedTextOverrides,
  };
```

In the `qbRepo.create(...)` call (~line 75), remove the `styleOverrides: null` line and add `headline`, `ctaLabel`, `textOverrides` so it relies on the spread:

```ts
  const created = await qbRepo.create(db, session.shop, {
    name: input.name,
    status: input.status as "draft" | "active" | "paused",
    productId: input.productId,
    collectionId: null,
    tiers: input.tiers,
    combinable: input.combinable,
    styleOverrides: input.styleOverrides as typeof input.styleOverrides extends null ? null : import("../../drizzle/schema").StyleOverrides | null,
    textOverrides: input.textOverrides,
    headline: input.headline,
    ctaLabel: input.ctaLabel,
  });
```

If the `import(...)` cast is awkward, simplify by spreading the relevant fields. Goal: the `qbRepo.create` second argument satisfies `CreateQbInput` (which is `Omit<QuantityBreak, "id" | "shopId" | "createdAt" | "updatedAt">`) and includes the new fields.

- [ ] **Step 2: Mirror changes in edit route**

Same changes in `apps/admin/app/routes/app.quantity-breaks.$id.tsx` action. Find the `qbRepo.update(...)` call and pass through the new fields. Find where the form is rendered with `<QbForm initialValues={...}>` and hydrate:

```tsx
<QbForm
  initialValues={{
    name: qb.name,
    product: /* existing */,
    tiers: /* existing */,
    combinable: qb.combinable,
    status: qb.status as "draft" | "active" | "paused",
    headline: qb.headline ?? "",
    ctaLabel: qb.ctaLabel ?? "",
    primaryColor: (qb.styleOverrides as { primaryColor?: string } | null)?.primaryColor ?? "",
    textColor: (qb.styleOverrides as { textColor?: string } | null)?.textColor ?? "",
    backgroundColor: (qb.styleOverrides as { backgroundColor?: string } | null)?.backgroundColor ?? "",
    borderRadius: (qb.styleOverrides as { borderRadius?: number } | null)?.borderRadius?.toString() ?? "",
    textOverrides: {
      "qb.tierLabel": (qb.textOverrides as Record<string, string> | null)?.["qb.tierLabel"] ?? "",
      "qb.savingsBadge": (qb.textOverrides as Record<string, string> | null)?.["qb.savingsBadge"] ?? "",
      "qb.mostPopular": (qb.textOverrides as Record<string, string> | null)?.["qb.mostPopular"] ?? "",
      "qb.giftBadge": (qb.textOverrides as Record<string, string> | null)?.["qb.giftBadge"] ?? "",
    },
  }}
  // ...
/>
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter admin tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Run full admin + widget test suites**

Run: `pnpm --filter admin vitest run && pnpm --filter widget vitest run`
Expected: PASS — both suites green.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/routes/app.quantity-breaks.new.tsx apps/admin/app/routes/app.quantity-breaks.\$id.tsx
git commit -m "feat(admin): persist QB headline/ctaLabel + style/text overrides from form"
```

---

## Task 12: Build verification

**Files:** none

- [ ] **Step 1: Build admin**

Run: `pnpm --filter admin build`
Expected: PASS — Cloudflare Pages build succeeds.

- [ ] **Step 2: Build widget**

Run: `pnpm --filter widget build` (or whatever script bundles the IIFE — check `apps/widget-src/package.json` for the build command if `widget` isn't the package name).
Expected: PASS — widget bundle produced. Note the gzipped size; spec target is delta < 500 bytes.

- [ ] **Step 3: Run full test suite**

Run: `pnpm tsc --noEmit && pnpm vitest run`
Expected: PASS — all repos, validators, configs, i18n, render tests green.

- [ ] **Step 4: Commit any incidental fixes from build (if needed)**

If the build surfaces type or lint issues, fix them inline and:

```bash
git add -A
git commit -m "fix: resolve build issues from phase 9.A.1 wiring"
```

If the build is clean, no commit is needed in this step.

---

## Manual smoke test (post-deploy, not part of plan execution)

These belong in a follow-up checklist; do not block plan completion on them:

- [ ] On a test bundle: set primary color to `#FF0000`, save, reload PDP — widget renders red CTA
- [ ] Set bundle's "Total label" to "Your cost", save — widget shows "Your cost" instead of "Total"
- [ ] Clear the override field, save — widget reverts to "Total"
- [ ] On a test QB: set "Most popular" to "Best deal", save — tier badge shows "Best deal"
- [ ] Set QB tier label to `"Get {qty} for less!"`, save — widget shows "Get 3 for less!" (or whatever qty)
- [ ] Set QB headline to "Volume savings", save — widget headline shows "Volume savings"
- [ ] Mix-match bundle inherits its bundle's primary color override

---

## Risks recap

- Existing bundles' `headline`/`ctaLabel` columns continue to work — no migration of data, just new optional columns alongside.
- Form's hidden-input JSON serialization is the integration-fragility point. If a merchant pastes a string with literal `"`, `JSON.stringify` handles escaping correctly; the action `JSON.parse` round-trips cleanly.
- The validator strips unknown text-override keys at submit; safe to assume widget-side `tWith()` only ever sees curated keys after a save through this flow.
