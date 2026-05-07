# Phase 4 — Storefront Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Theme App Extension widget that renders Bundle/QB/Mix & Match offers on the merchant's PDPs, with a live admin preview iframe on edit pages, and a public storefront-config endpoint backing both.

**Architecture:** Vanilla TS IIFE (`widget.js`) shipped as Theme App Extension asset, loaded site-wide by `app-embed.liquid`. Widget fetches `/api/storefront/config/:shop` (60s KV cache). Admin preview reuses the same widget JS in an iframe with config injected via `postMessage`. New `mode='mix_match'` flag plus `collectionId` + `targetQty` columns extend the existing `bundles` table.

**Tech Stack:** TypeScript (widget) + Liquid (theme blocks) + Remix on Cloudflare Pages (admin) + Drizzle ORM + tsup (widget bundler) + Vitest with jsdom for widget tests.

**Spec:** `docs/superpowers/specs/2026-05-07-phase-4-storefront-widget-design.md`.

---

## Conventions

- Repo root in commands below: `/Users/sumit/Desktop/Shopify Apps/Bundler App` (cd as needed; commands assume cwd = repo root unless noted).
- Admin tests: `pnpm --filter admin test -- <pattern>`.
- All commits are atomic per task; commit messages follow the existing style (`feat(scope): subject`, `test(scope): subject`, `chore(scope): subject`).
- Always run the test from the repo root with the filter; this avoids monorepo path issues.

---

## Group A — Schema & data foundation

Adds `mode`, `collectionId`, `targetQty` columns to the `bundles` table; updates schema types; updates validation; updates metafield sync; updates the Rust function to understand Mix & Match.

---

### Task 1: D1 migration — add Mix & Match columns

**Files:**
- Create: `apps/admin/drizzle/migrations/0003_mix_match.sql`
- Modify: `apps/admin/drizzle/schema.ts`

- [ ] **Step 1: Update Drizzle schema** to add 3 new columns to `bundles`

Open `apps/admin/drizzle/schema.ts`. In the `bundles` table definition, add these columns at the end of the column list (before the second arg `(t) => ({...})`):

```ts
  mode: text("mode", { enum: ["classic", "mix_match"] }).notNull().default("classic"),
  collectionId: text("collection_id"),
  targetQty: integer("target_qty"),
```

- [ ] **Step 2: Generate the migration**

Run from `apps/admin/`:
```bash
pnpm db:generate
```

Expected: Drizzle Kit emits a new migration in `apps/admin/drizzle/migrations/`. Inspect it. If the filename isn't `0003_mix_match.sql`, rename it (and the matching entry in `_journal.json` under `meta/`).

The SQL inside should look like (Drizzle may use slightly different but equivalent column-add SQL — accept it):
```sql
ALTER TABLE `bundles` ADD `mode` text DEFAULT 'classic' NOT NULL;
ALTER TABLE `bundles` ADD `collection_id` text;
ALTER TABLE `bundles` ADD `target_qty` integer;
```

- [ ] **Step 3: Apply migration locally**

```bash
pnpm --filter admin db:migrate:local
```

Expected: "Migrations applied" or similar success message. No errors.

- [ ] **Step 4: Run existing tests to verify nothing broke**

```bash
pnpm --filter admin test
```

Expected: all tests pass. (Existing repo tests use in-memory SQLite via `migrate(db, { migrationsFolder: "./drizzle/migrations" })` — they should pick up the new migration automatically.)

- [ ] **Step 5: Commit**

```bash
git add apps/admin/drizzle/schema.ts apps/admin/drizzle/migrations/
git commit -m "feat(db): add mode/collectionId/targetQty columns to bundles for mix-and-match"
```

---

### Task 2: Update bundles repo + Bundle TypeScript types

**Files:**
- Modify: `apps/admin/app/lib/bundles/repo.ts`
- Test: `apps/admin/test/bundles-repo.test.ts`

The `Bundle` type (inferred from Drizzle schema) auto-picks up the new columns. We just need to make sure `repo.create` and `repo.update` accept and persist them, plus add a regression test.

- [ ] **Step 1: Write a failing test for Mix & Match create**

Append to `apps/admin/test/bundles-repo.test.ts` (inside the `describe("bundles repo", ...)` block, after the existing tests, before the closing `});`):

```ts
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

  it("classic bundles default mode='classic' when not provided", async () => {
    const created = await repo.create(setup.db, SHOP_A, NEW_BUNDLE_INPUT);
    expect(created.mode).toBe("classic");
    expect(created.collectionId).toBeNull();
    expect(created.targetQty).toBeNull();
  });
```

Also add to the top-level `NEW_BUNDLE_INPUT` constant the new fields so the type checker is happy:

Find:
```ts
const NEW_BUNDLE_INPUT = {
  ...
  styleOverrides: null,
  headline: null,
  ctaLabel: null,
};
```

Replace with:
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
  headline: null,
  ctaLabel: null,
  mode: "classic" as const,
  collectionId: null,
  targetQty: null,
};
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm --filter admin test -- bundles-repo
```

Expected: TypeScript compile or runtime errors complaining about missing fields, OR tests pass already (Drizzle's typed insert may auto-pick up defaults). Either way, proceed.

- [ ] **Step 3: Verify repo handles new fields**

Open `apps/admin/app/lib/bundles/repo.ts`. The repo functions use `Bundle` type from the schema, so they should already accept the new fields. No code change needed — Drizzle picks up the new columns automatically via `$inferSelect` / `$inferInsert`.

If `eslint-disable-next-line @typescript-eslint/no-explicit-any` lines exist, leave them as-is (existing convention).

- [ ] **Step 4: Run tests**

```bash
pnpm --filter admin test -- bundles-repo
```

Expected: all bundles-repo tests PASS, including the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/test/bundles-repo.test.ts
git commit -m "test(bundles): cover mix_match repo create + classic default"
```

---

### Task 3: Validation — Mix & Match rules

**Files:**
- Modify: `apps/admin/app/lib/bundles/validate.ts`
- Test: `apps/admin/test/bundles-validate.test.ts`

Mix & Match changes the validation contract: `products` empty, `collectionId` required, `targetQty >= 2`.

- [ ] **Step 1: Add failing tests for Mix & Match validation**

Append to `apps/admin/test/bundles-validate.test.ts` (inside the `describe("validateBundle", ...)` block):

```ts
  it("accepts a valid mix_match bundle", () => {
    const r = validateBundle({
      ...VALID,
      products: [],
      mode: "mix_match",
      collectionId: "gid://shopify/Collection/1",
      targetQty: 3,
    });
    expect(r).toEqual({ valid: true });
  });

  it("rejects mix_match without collectionId", () => {
    const r = validateBundle({
      ...VALID,
      products: [],
      mode: "mix_match",
      collectionId: null,
      targetQty: 3,
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.collectionId).toBeDefined();
  });

  it("rejects mix_match with targetQty below 2", () => {
    const r = validateBundle({
      ...VALID,
      products: [],
      mode: "mix_match",
      collectionId: "gid://shopify/Collection/1",
      targetQty: 1,
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.targetQty).toBeDefined();
  });

  it("rejects mix_match with non-empty products", () => {
    const r = validateBundle({
      ...VALID,
      mode: "mix_match",
      collectionId: "gid://shopify/Collection/1",
      targetQty: 3,
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.products).toBeDefined();
  });

  it("rejects classic with empty products", () => {
    const r = validateBundle({
      ...VALID,
      products: [],
      mode: "classic",
    });
    expect(r.valid).toBe(false);
  });
```

Also update the `VALID` constant at the top to include `mode: "classic"`, `collectionId: null`, `targetQty: null`:

```ts
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
  mode: "classic",
  collectionId: null,
  targetQty: null,
};
```

- [ ] **Step 2: Run tests, expect failures**

```bash
pnpm --filter admin test -- bundles-validate
```

Expected: TypeScript errors (missing `mode`/`collectionId`/`targetQty` on `BundleInput`), and/or the new tests fail.

- [ ] **Step 3: Update validate.ts**

Replace the entire contents of `apps/admin/app/lib/bundles/validate.ts` with:

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
  mode: "classic" | "mix_match";
  collectionId: string | null;
  targetQty: number | null;
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

  if (input.mode === "mix_match") {
    if (Array.isArray(input.products) && input.products.length > 0) {
      errors.products = "Mix & Match bundles must not have specific products";
    }
    if (!input.collectionId) {
      errors.collectionId = "Collection is required for Mix & Match";
    }
    if (typeof input.targetQty !== "number" || input.targetQty < 2) {
      errors.targetQty = "Target quantity must be at least 2";
    }
  } else {
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

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm --filter admin test -- bundles-validate
```

Expected: ALL tests pass (existing 10 + new 5).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/lib/bundles/validate.ts apps/admin/test/bundles-validate.test.ts
git commit -m "feat(bundles): validate mix-and-match constraints (collectionId, targetQty)"
```

---

### Task 4: Metafield sync — include Mix & Match fields

**Files:**
- Modify: `apps/admin/app/lib/metafield-sync.ts`
- Test: `apps/admin/test/metafield-sync.test.ts`

The shop metafield JSON consumed by the Rust function needs to carry `mode`, `collectionId`, `targetQty` so the function can match Mix & Match cart lines.

- [ ] **Step 1: Read existing test** to learn its shape

Read `apps/admin/test/metafield-sync.test.ts` (full file). Locate the assertion that decodes the synced metafield value and asserts on bundle fields.

- [ ] **Step 2: Write a failing test**

Add a test inside the existing `describe(...)` block. Use the same setup helpers and pattern as the other tests in the file. Sample structure:

```ts
  it("includes mix_match mode + collectionId + targetQty in synced metafield", async () => {
    const { db, admin, captured } = setup();
    db.insert(schema.shops).values({ id: SHOP, scopes: "", installedAt: new Date(), shopifyShopGid: "gid://shopify/Shop/1" }).run();
    db.insert(schema.bundles).values({
      id: "b1",
      shopId: SHOP,
      name: "MM",
      status: "active",
      products: [],
      discountType: "percentage",
      discountValue: 20,
      combinable: false,
      triggerProductIds: [],
      styleOverrides: null,
      headline: null,
      ctaLabel: null,
      mode: "mix_match",
      collectionId: "gid://shopify/Collection/9",
      targetQty: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).run();

    await syncShopConfig(db, admin, SHOP);

    const json = JSON.parse(captured.metafields[0]!.value);
    expect(json.bundles[0].mode).toBe("mix_match");
    expect(json.bundles[0].collectionId).toBe("gid://shopify/Collection/9");
    expect(json.bundles[0].targetQty).toBe(3);
  });
```

(Adapt `setup`, `SHOP`, and `captured` to match the existing test file's helpers — read it first, follow its style.)

- [ ] **Step 3: Run tests, expect failure**

```bash
pnpm --filter admin test -- metafield-sync
```

Expected: the new test fails because `mode`/`collectionId`/`targetQty` are not in the sync output.

- [ ] **Step 4: Update SyncConfig + mapping in metafield-sync.ts**

Open `apps/admin/app/lib/metafield-sync.ts`. Update the `SyncConfig` interface so each bundle entry has:

```ts
  bundles: Array<{
    id: string;
    name: string;
    status: string;
    mode: "classic" | "mix_match";
    products: Array<{ productId: string; variantId: string | null; qty: number }>;
    collectionId: string | null;
    targetQty: number | null;
    discountType: string;
    discountValue: number;
    combinable: boolean;
    triggerProductIds: string[];
    headline: string | null;
    ctaLabel: string | null;
  }>;
```

Update the mapping inside `syncShopConfig` so each bundle entry pulls in those fields:

```ts
    bundles: bundles.map((b) => ({
      id: b.id,
      name: b.name,
      status: b.status,
      mode: b.mode,
      products: b.products,
      collectionId: b.collectionId,
      targetQty: b.targetQty,
      discountType: b.discountType,
      discountValue: b.discountValue,
      combinable: b.combinable,
      triggerProductIds: b.triggerProductIds,
      headline: b.headline,
      ctaLabel: b.ctaLabel,
    })),
```

- [ ] **Step 5: Run tests, expect pass**

```bash
pnpm --filter admin test -- metafield-sync
```

Expected: all metafield-sync tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/lib/metafield-sync.ts apps/admin/test/metafield-sync.test.ts
git commit -m "feat(metafield-sync): include mix-and-match fields in shop config"
```

---

### Task 5: Discount Function — Rust config struct for Mix & Match

**Files:**
- Modify: `extensions/discount-function/src/config.rs`
- Modify: `extensions/discount-function/src/matcher.rs`

We extend the Rust config so the Function can recognize `mode = "mix_match"` bundles. Match logic: cart contains ≥ `targetQty` line items each tagged with `_pumper_bundle_id == bundle.id` line property AND each line's product is in the bundle's `collection_id` (we don't have the collection membership inside the Function — we trust the cart-line tag).

Mix & Match logic in the Function trusts the `_pumper_bundle_id` line property because the widget is the only thing that adds those lines, and the line property is hidden from the customer (Shopify hides `_`-prefixed properties).

- [ ] **Step 1: Update `Bundle` struct in config.rs**

Open `extensions/discount-function/src/config.rs`. Add to the `Bundle` struct:

```rust
    #[serde(default = "default_mode")]
    pub mode: String,
    #[serde(rename = "collectionId", default)]
    pub collection_id: Option<String>,
    #[serde(rename = "targetQty", default)]
    pub target_qty: Option<u32>,
```

Add a default helper at the bottom of the file:

```rust
fn default_mode() -> String { "classic".to_string() }
```

The full updated `Bundle` block should be:

```rust
#[derive(Deserialize, Debug, Clone)]
pub struct Bundle {
    pub id: String,
    pub name: String,
    pub status: String,
    pub products: Vec<BundleProduct>,
    #[serde(rename = "discountType")]
    pub discount_type: String,
    #[serde(rename = "discountValue")]
    pub discount_value: f64,
    pub combinable: bool,
    #[serde(rename = "triggerProductIds")]
    pub trigger_product_ids: Vec<String>,
    #[serde(default)]
    pub headline: Option<String>,
    #[serde(default = "default_mode")]
    pub mode: String,
    #[serde(rename = "collectionId", default)]
    pub collection_id: Option<String>,
    #[serde(rename = "targetQty", default)]
    pub target_qty: Option<u32>,
}
```

- [ ] **Step 2: Build to confirm compile**

```bash
cd extensions/discount-function && cargo build --target=wasm32-unknown-unknown --release
```

Expected: build succeeds. (cd back to repo root after.)

- [ ] **Step 3: Add Mix & Match matcher**

The discount Function input doesn't expose line-property data by default. Update `extensions/discount-function/src/run.graphql` first to query line properties:

Read the existing `run.graphql`. In the `cart.lines` selection, the line attribute querying form depends on the Function API version. For 2026-04 the field is:

```graphql
        attribute(key: "_pumper_bundle_id") {
          value
        }
```

Place it inside each `lines` block alongside `id`, `quantity`, etc. The full lines block should look like:

```graphql
    lines {
      id
      quantity
      attribute(key: "_pumper_bundle_id") { value }
      cost {
        amountPerQuantity { amount }
      }
      merchandise {
        __typename
        ... on ProductVariant {
          id
          product { id }
        }
      }
    }
```

Then run:

```bash
cd extensions/discount-function && cargo build --target=wasm32-unknown-unknown --release
```

The `shopify_function` macro re-generates the schema module. Note any new field `attribute()` accessor name in the schema (typically `attribute()`).

- [ ] **Step 4: Update `CartLine` to carry the bundle attribute**

Open `extensions/discount-function/src/matcher.rs`. Update the `CartLine` struct:

```rust
pub struct CartLine {
    pub id: String,
    pub product_id: String,
    pub variant_id: Option<String>,
    pub quantity: u32,
    pub bundle_attr: Option<String>,
}
```

Add a Mix & Match match function at the bottom of the file:

```rust
/// Returns target cart line IDs for a Mix & Match bundle: every line tagged with
/// `_pumper_bundle_id == bundle.id` whose count of total qty meets `target_qty`.
pub fn match_mix_match_bundle(lines: &[CartLine], bundle: &Bundle) -> Option<Vec<String>> {
    if bundle.mode != "mix_match" { return None; }
    let target_qty = bundle.target_qty? as u32;
    let tagged: Vec<&CartLine> = lines.iter()
        .filter(|l| l.bundle_attr.as_deref() == Some(bundle.id.as_str()))
        .collect();
    let total_qty: u32 = tagged.iter().map(|l| l.quantity).sum();
    if total_qty < target_qty { return None; }
    Some(tagged.iter().map(|l| l.id.clone()).collect())
}
```

- [ ] **Step 5: Update `run.rs` to populate `bundle_attr` and call new matcher**

Open `extensions/discount-function/src/run.rs`. In the cart-line conversion loop, populate `bundle_attr` from the input. The accessor varies by codegen — check `target/wasm32-unknown-unknown/release/build/<crate>-*/out/` or just call it on `l` like other fields. Common form: `l.attribute().map(|a| a.value().to_string())`.

Updated loop:

```rust
    let lines: Vec<CartLine> = input
        .cart()
        .lines()
        .iter()
        .filter_map(|l| {
            use schema::run::input::cart::lines::Merchandise;
            let variant = match l.merchandise() {
                Merchandise::ProductVariant(pv) => pv,
                _ => return None,
            };
            let bundle_attr = l.attribute().and_then(|a| a.value().map(|v| v.to_string()));
            Some(CartLine {
                id: l.id().to_string(),
                product_id: variant.product().id().to_string(),
                variant_id: Some(variant.id().to_string()),
                quantity: *l.quantity() as u32,
                bundle_attr,
            })
        })
        .collect();
```

(If the codegen produces a different accessor signature, adapt accordingly. The `shopify_function` macro generates accessors from the GraphQL query — `attribute(key: "_pumper_bundle_id")` becomes `attribute()`.)

After the existing classic-bundle matching loop, add the Mix & Match loop:

```rust
    // Mix & Match matching
    for bundle in config.bundles.iter().filter(|b| b.status == "active" && b.mode == "mix_match") {
        if !matches_combinable(bundle.combinable, want_combinable) {
            continue;
        }
        if let Some(target_line_ids) = matcher::match_mix_match_bundle(&lines, bundle) {
            let line_subtotal: f64 = target_line_ids.iter().filter_map(|tid| {
                input.cart().lines().iter()
                    .find(|l| l.id() == tid.as_str())
                    .map(|l| l.cost().amount_per_quantity().amount().as_f64() * (*l.quantity() as f64))
            }).sum();
            let value = discount::compute_bundle_value(bundle, line_subtotal);
            discounts.push(build_discount(&bundle.name, &target_line_ids, value));
        }
    }
```

Update the existing classic loop to skip Mix & Match (it already checks `mode != "classic"` would be redundant — instead exclude mix_match):

In the existing classic loop, change the filter:

```rust
    for bundle in config.bundles.iter().filter(|b| b.status == "active" && b.mode != "mix_match") {
```

- [ ] **Step 6: Build the Function**

```bash
cd extensions/discount-function && cargo build --target=wasm32-unknown-unknown --release
```

Expected: build succeeds. If the `attribute()` accessor name differs, fix the generated-code path then rebuild.

- [ ] **Step 7: Commit**

```bash
git add extensions/discount-function/src/ extensions/discount-function/run.graphql 2>/dev/null
git add -A extensions/discount-function/
git commit -m "feat(function): handle mix-and-match bundles via _pumper_bundle_id line attr"
```

---

## Group B — Admin UI: Mix & Match form

Adds a `mode` toggle to the bundle form, a `CollectionPicker` component, and a `targetQty` input. Updates the bundle new/edit routes to pass these to the action.

---

### Task 6: CollectionPicker component

**Files:**
- Create: `apps/admin/app/components/CollectionPicker.tsx`

A thin wrapper around App Bridge's `ResourcePicker` for selecting one collection. Mirrors the existing `ProductPicker` pattern.

- [ ] **Step 1: Read existing ProductPicker for the pattern**

Read `apps/admin/app/components/ProductPicker.tsx` end-to-end. Note how it imports App Bridge, opens the picker, captures the selected resource(s), and renders chips.

- [ ] **Step 2: Create the CollectionPicker file**

Create `apps/admin/app/components/CollectionPicker.tsx` with:

```tsx
import { useAppBridge } from "@shopify/app-bridge-react";
import { Button, BlockStack, InlineStack, Text, Thumbnail } from "@shopify/polaris";
import { useCallback } from "react";

export type PickedCollection = {
  collectionId: string;
  title: string;
  image?: string;
};

type Props = {
  collection: PickedCollection | null;
  onChange: (c: PickedCollection | null) => void;
};

export function CollectionPicker({ collection, onChange }: Props) {
  const shopify = useAppBridge();

  const open = useCallback(async () => {
    const selection = await shopify.resourcePicker({
      type: "collection",
      multiple: false,
      action: "select",
    });
    if (!selection || selection.length === 0) return;
    const first = selection[0] as { id: string; title: string; image?: { originalSrc?: string } };
    onChange({
      collectionId: first.id,
      title: first.title,
      image: first.image?.originalSrc,
    });
  }, [shopify, onChange]);

  if (!collection) {
    return <Button onClick={open}>Choose collection</Button>;
  }

  return (
    <BlockStack gap="200">
      <InlineStack gap="300" align="start" blockAlign="center">
        <Thumbnail source={collection.image ?? ""} alt={collection.title} size="small" />
        <Text as="span" variant="bodyMd">{collection.title}</Text>
      </InlineStack>
      <InlineStack gap="200">
        <Button onClick={open}>Change</Button>
        <Button onClick={() => onChange(null)} variant="plain" tone="critical">Remove</Button>
      </InlineStack>
    </BlockStack>
  );
}
```

- [ ] **Step 3: Verify it compiles**

```bash
pnpm --filter admin typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/components/CollectionPicker.tsx
git commit -m "feat(admin): add CollectionPicker component for mix-and-match"
```

---

### Task 7: Update BundleForm — mode toggle + Mix & Match section

**Files:**
- Modify: `apps/admin/app/components/BundleForm.tsx`

- [ ] **Step 1: Update BundleFormValues + DEFAULTS**

Open `apps/admin/app/components/BundleForm.tsx`. Update the `BundleFormValues` type and `DEFAULTS`:

```tsx
type Mode = "classic" | "mix_match";

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
};

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
};
```

Add the import at the top:

```tsx
import { CollectionPicker, type PickedCollection } from "./CollectionPicker";
```

- [ ] **Step 2: Add hidden inputs for mode/collection/targetQty**

Just inside the `<Form method="post">` (alongside the existing hidden `products` and `triggerProducts` inputs), add:

```tsx
      <input type="hidden" name="mode" value={values.mode} />
      <input type="hidden" name="collectionId" value={values.collection?.collectionId ?? ""} />
      <input type="hidden" name="targetQty" value={values.targetQty} />
```

- [ ] **Step 3: Add mode toggle as first card**

Just before the first card (`1. Products in this bundle`), insert:

```tsx
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Bundle type</Text>
            <ChoiceList
              title="Type"
              titleHidden
              choices={[
                { label: "Classic — pick specific products to bundle together", value: "classic" },
                { label: "Mix & Match — let customers pick N items from a collection", value: "mix_match" },
              ]}
              selected={[values.mode]}
              onChange={(s) => update("mode", s[0] as Mode)}
            />
          </BlockStack>
        </Card>
```

- [ ] **Step 4: Branch the products card by mode**

Replace the existing first card (`1. Products in this bundle`) with:

```tsx
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              1. {values.mode === "mix_match" ? "Collection & target" : "Products in this bundle"}
            </Text>
            <TextField
              label="Bundle name"
              name="name"
              value={values.name}
              onChange={(v) => update("name", v)}
              error={errors?.name}
              autoComplete="off"
              maxLength={100}
            />
            {values.mode === "classic" ? (
              <>
                <ProductPicker
                  products={values.products}
                  onChange={(p) => update("products", p)}
                  multiple
                />
                {errors?.products && <Banner tone="critical">{errors.products}</Banner>}
              </>
            ) : (
              <>
                <CollectionPicker
                  collection={values.collection}
                  onChange={(c) => update("collection", c)}
                />
                {errors?.collectionId && <Banner tone="critical">{errors.collectionId}</Banner>}
                <TextField
                  label="Customer must pick this many items"
                  type="number"
                  min={2}
                  value={values.targetQty}
                  onChange={(v) => update("targetQty", v)}
                  error={errors?.targetQty}
                  autoComplete="off"
                />
              </>
            )}
          </BlockStack>
        </Card>
```

- [ ] **Step 5: Hide trigger products card for mix_match**

Wrap the existing `3. Trigger products` Card with `{values.mode === "classic" && ( ... )}`.

- [ ] **Step 6: Run typecheck and tests**

```bash
pnpm --filter admin typecheck && pnpm --filter admin test
```

Expected: no TypeScript errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/app/components/BundleForm.tsx
git commit -m "feat(admin): bundle form supports mix-and-match mode toggle"
```

---

### Task 8: Update bundles new/edit action to handle Mix & Match

**Files:**
- Modify: `apps/admin/app/routes/app.bundles.new.tsx`
- Modify: `apps/admin/app/routes/app.bundles.$id.tsx`

- [ ] **Step 1: Read both route files** to see existing action structure

Read `apps/admin/app/routes/app.bundles.new.tsx` and `apps/admin/app/routes/app.bundles.$id.tsx` end-to-end.

- [ ] **Step 2: Update both actions** to read the new fields

In each file's `action` function, just before `const input = {...}`, add:

```ts
  const mode = ((form.get("mode") as string) || "classic") as "classic" | "mix_match";
  const collectionIdRaw = (form.get("collectionId") as string) || "";
  const collectionId = collectionIdRaw || null;
  const targetQtyRaw = form.get("targetQty") as string;
  const targetQty = targetQtyRaw ? parseInt(targetQtyRaw, 10) : null;
```

Update the `input` object to include the new fields and clear classic-only fields when mode is mix_match:

```ts
  const input = {
    name: (form.get("name") as string) || "",
    status: (form.get("status") as string) || "draft",
    mode,
    products: mode === "mix_match" ? [] : products.map((p) => ({
      productId: p.productId,
      variantId: p.variantId,
      qty: p.qty,
    })),
    collectionId: mode === "mix_match" ? collectionId : null,
    targetQty: mode === "mix_match" ? targetQty : null,
    discountType: (form.get("discountType") as string) || "percentage",
    discountValue: parseFloat((form.get("discountValue") as string) || "0"),
    combinable: form.get("combinable") === "on",
    triggerProductIds: mode === "mix_match" ? [] : triggerProductIds,
    headline: (form.get("headline") as string) || null,
    ctaLabel: (form.get("ctaLabel") as string) || null,
  };
```

In the `repo.create(...)` / `repo.update(...)` call args, the existing `...input` spread now includes the new fields — just adjust the cast comment to keep the existing union casts. Keep the existing `status` and `discountType` cast lines.

- [ ] **Step 3: Update the loader for `$id` route** to pass `collection` data to the form

In `app.bundles.$id.tsx` loader, after fetching the bundle and product details, fetch the collection if Mix & Match:

```ts
  let collectionDetails: { id: string; title: string; image: string | null } | null = null;
  if (bundle.mode === "mix_match" && bundle.collectionId) {
    const cRes = await admin.graphql(
      `query Collection($id: ID!) { collection(id: $id) { id title image { url } } }`,
      { variables: { id: bundle.collectionId } },
    );
    const cData = (await cRes.json()) as {
      data: { collection: { id: string; title: string; image: { url: string } | null } | null };
    };
    if (cData.data.collection) {
      collectionDetails = {
        id: cData.data.collection.id,
        title: cData.data.collection.title,
        image: cData.data.collection.image?.url ?? null,
      };
    }
  }
  return json({ bundle, productDetails, collectionDetails });
```

In the component's `initial: Partial<BundleFormValues>`, add:

```ts
    mode: (bundle.mode ?? "classic") as "classic" | "mix_match",
    collection: collectionDetails ? {
      collectionId: collectionDetails.id,
      title: collectionDetails.title,
      image: collectionDetails.image ?? undefined,
    } : null,
    targetQty: bundle.targetQty ? String(bundle.targetQty) : "3",
```

- [ ] **Step 4: Typecheck and run tests**

```bash
pnpm --filter admin typecheck && pnpm --filter admin test
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/routes/app.bundles.new.tsx apps/admin/app/routes/app.bundles.$id.tsx
git commit -m "feat(admin): bundle new/edit routes accept mix-and-match form fields"
```

---

## Group C — Theme App Extension scaffold

Creates the new `extensions/theme-app-extension/` directory with `shopify.extension.toml`, three App Block Liquid files, the App Embed Liquid file, the `tsup` config, an `assets/widget.ts` stub, and a vitest jsdom setup so widget tests can run in subsequent tasks.

---

### Task 9: Theme App Extension — shopify.extension.toml + dirs

**Files:**
- Create: `extensions/theme-app-extension/shopify.extension.toml`
- Create: `extensions/theme-app-extension/blocks/.gitkeep`
- Create: `extensions/theme-app-extension/assets/.gitkeep`
- Create: `extensions/theme-app-extension/locales/.gitkeep`

- [ ] **Step 1: Create the extension toml**

Create `extensions/theme-app-extension/shopify.extension.toml`:

```toml
api_version = "2026-04"

[[extensions]]
name = "Bundler Theme Widget"
handle = "bundler-theme-widget"
type = "theme"
```

- [ ] **Step 2: Create empty subdirectories**

```bash
mkdir -p "extensions/theme-app-extension/blocks" \
         "extensions/theme-app-extension/assets" \
         "extensions/theme-app-extension/locales"
touch "extensions/theme-app-extension/blocks/.gitkeep" \
      "extensions/theme-app-extension/assets/.gitkeep" \
      "extensions/theme-app-extension/locales/.gitkeep"
```

- [ ] **Step 3: Verify Shopify CLI accepts it**

```bash
pnpm shopify app build 2>&1 | head -30
```

Expected: build either succeeds or errors with a clear message. Empty extension is OK; we just want the manifest accepted. If errors mention missing assets/blocks, that's normal — we add them in subsequent tasks.

- [ ] **Step 4: Commit**

```bash
git add extensions/theme-app-extension/
git commit -m "chore(extensions): scaffold theme-app-extension directory + manifest"
```

---

### Task 10: Theme App Extension — Liquid blocks (App Embed + 3 widgets)

**Files:**
- Create: `extensions/theme-app-extension/blocks/app-embed.liquid`
- Create: `extensions/theme-app-extension/blocks/bundle.liquid`
- Create: `extensions/theme-app-extension/blocks/qb.liquid`
- Create: `extensions/theme-app-extension/blocks/mix-match.liquid`
- Delete: `extensions/theme-app-extension/blocks/.gitkeep`

- [ ] **Step 1: Create app-embed.liquid**

Create `extensions/theme-app-extension/blocks/app-embed.liquid`:

```liquid
{% comment %} Bundler — App Embed. Loads the widget once per page. {% endcomment %}
<script>
  window._pumperConfig = {
    shop: "{{ shop.permanent_domain }}",
    locale: "{{ request.locale.iso_code }}",
    currency: "{{ cart.currency.iso_code }}",
    apiBase: "{{ block.settings.api_base | default: 'https://bundler.deepseatools.in/api/storefront' }}"
  };
</script>
<script src="{{ 'widget.js' | asset_url }}" defer></script>
<link rel="stylesheet" href="{{ 'widget.css' | asset_url }}">

{% schema %}
{
  "name": "Bundler",
  "target": "head",
  "settings": [
    { "type": "text", "id": "api_base", "label": "API base (advanced)", "default": "https://bundler.deepseatools.in/api/storefront" }
  ]
}
{% endschema %}
```

- [ ] **Step 2: Create bundle.liquid**

Create `extensions/theme-app-extension/blocks/bundle.liquid`:

```liquid
{% comment %} Bundler — classic bundle widget. Drag onto PDP via theme editor. {% endcomment %}
<div
  class="pumper-mount"
  data-pumper-type="bundle"
  data-product-id="{{ product.id }}"
  data-product-handle="{{ product.handle }}"
  data-shop="{{ shop.permanent_domain }}"
  style="min-height:180px"
></div>

{% schema %}
{
  "name": "Bundler — Bundle",
  "target": "section",
  "enabled_on": { "templates": ["product"] },
  "settings": []
}
{% endschema %}
```

- [ ] **Step 3: Create qb.liquid**

Create `extensions/theme-app-extension/blocks/qb.liquid`:

```liquid
{% comment %} Bundler — quantity break widget. {% endcomment %}
<div
  class="pumper-mount"
  data-pumper-type="qb"
  data-product-id="{{ product.id }}"
  data-product-handle="{{ product.handle }}"
  data-shop="{{ shop.permanent_domain }}"
  style="min-height:180px"
></div>

{% schema %}
{
  "name": "Bundler — Quantity Break",
  "target": "section",
  "enabled_on": { "templates": ["product"] },
  "settings": []
}
{% endschema %}
```

- [ ] **Step 4: Create mix-match.liquid**

Create `extensions/theme-app-extension/blocks/mix-match.liquid`:

```liquid
{% comment %} Bundler — mix and match widget. {% endcomment %}
<div
  class="pumper-mount"
  data-pumper-type="mix_match"
  data-product-id="{{ product.id }}"
  data-product-handle="{{ product.handle }}"
  data-shop="{{ shop.permanent_domain }}"
  style="min-height:180px"
></div>

{% schema %}
{
  "name": "Bundler — Mix & Match",
  "target": "section",
  "enabled_on": { "templates": ["product", "collection"] },
  "settings": []
}
{% endschema %}
```

- [ ] **Step 5: Remove .gitkeep**

```bash
rm "extensions/theme-app-extension/blocks/.gitkeep"
```

- [ ] **Step 6: Commit**

```bash
git add extensions/theme-app-extension/blocks/
git commit -m "feat(extensions): liquid blocks for app-embed and 3 widget mounts"
```

---

### Task 11: Widget — pnpm package, tsup, vitest jsdom setup

**Files:**
- Create: `extensions/theme-app-extension/package.json`
- Create: `extensions/theme-app-extension/tsconfig.json`
- Create: `extensions/theme-app-extension/tsup.config.ts`
- Create: `extensions/theme-app-extension/vitest.config.ts`
- Modify: `pnpm-workspace.yaml`

The widget needs its own tsup build pipeline (for `widget.js`) and its own vitest project (jsdom env). It is a sibling pnpm package.

- [ ] **Step 1: Inspect pnpm-workspace.yaml**

```bash
cat pnpm-workspace.yaml
```

Confirm it lists `apps/*` and likely `extensions/*` already. If `extensions/*` is missing, add it.

If file contents are:
```yaml
packages:
  - "apps/*"
  - "shared"
```

Update to:
```yaml
packages:
  - "apps/*"
  - "extensions/theme-app-extension"
  - "shared"
```

(Don't include `extensions/discount-function` — it's a Cargo crate, not pnpm.)

- [ ] **Step 2: Create package.json**

Create `extensions/theme-app-extension/package.json`:

```json
{
  "name": "theme-app-extension",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "jsdom": "^24.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

Create `extensions/theme-app-extension/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vitest/globals"]
  },
  "include": ["assets/**/*.ts", "vitest.config.ts", "tsup.config.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create tsup.config.ts**

Create `extensions/theme-app-extension/tsup.config.ts`:

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { widget: "assets/widget.ts" },
  outDir: "assets",
  format: ["iife"],
  globalName: "Pumper",
  minify: true,
  treeshake: true,
  sourcemap: false,
  clean: false,
  target: "es2018",
  // Output: assets/widget.global.js — tsup names IIFE outputs `<entry>.global.js`.
  // The .liquid blocks reference `widget.js`, so we rename via outExtension below.
  outExtension({ format }) {
    return { js: format === "iife" ? ".js" : ".js" };
  },
});
```

- [ ] **Step 5: Create vitest.config.ts (jsdom env)**

Create `extensions/theme-app-extension/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: false,
    include: ["assets/**/*.test.ts"],
  },
});
```

- [ ] **Step 6: Install workspace deps**

From repo root:
```bash
pnpm install
```

Expected: pnpm picks up the new workspace package and installs `tsup`, `vitest`, `jsdom`, `typescript`, `@types/node`. No errors.

- [ ] **Step 7: Verify the package builds (no source yet, will fail gracefully)**

```bash
pnpm --filter theme-app-extension build 2>&1 | tail -10
```

Expected: tsup errors that `assets/widget.ts` doesn't exist. That's fine — Task 12 creates it.

- [ ] **Step 8: Commit**

```bash
git add extensions/theme-app-extension/package.json extensions/theme-app-extension/tsconfig.json extensions/theme-app-extension/tsup.config.ts extensions/theme-app-extension/vitest.config.ts pnpm-workspace.yaml pnpm-lock.yaml 2>/dev/null
git add -A extensions/theme-app-extension/
git commit -m "chore(extensions): theme-app-extension as pnpm workspace package with tsup + vitest"
```

---

## Group D — Widget core (TypeScript)

Per-file TDD for the widget. Each file is small and focused. All files live in `extensions/theme-app-extension/assets/`.

---

### Task 12: Types module

**Files:**
- Create: `extensions/theme-app-extension/assets/types.ts`

Shared TypeScript types for the entire widget.

- [ ] **Step 1: Create types.ts**

Create `extensions/theme-app-extension/assets/types.ts`:

```ts
export type DiscountType = "percentage" | "flat" | "fixed_total" | "fixed_per_unit";

export type ProductRef = {
  productId: string;
  variantId: string | null;
  qty: number;
  title: string;
  image: string | null;
  available: boolean;
  priceCents: number;
};

export type CollectionProduct = {
  productId: string;
  variantId: string | null;
  title: string;
  image: string | null;
  available: boolean;
  priceCents: number;
};

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
  styleOverrides: Record<string, unknown> | null;
};

export type QbVariant = {
  variantId: string;
  title: string;
  available: boolean;
  priceCents: number;
};

export type QbTier = {
  qty: number;
  discountType: DiscountType;
  discountValue: number;
  label: string;
  isMostPopular: boolean;
  available: boolean;
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
  styleOverrides: Record<string, unknown> | null;
};

export type Settings = {
  primaryColor: string;
  textColor: string;
  backgroundColor: string;
  borderRadius: number;
  fontFamily: string;
  bundleHeadline: string;
  qbHeadline: string;
  showCompareAtPrice: boolean;
  currency: string;
  locale: string;
};

export type WidgetConfig = {
  shop: string;
  settings: Settings;
  bundles: BundleConfig[];
  quantityBreaks: QbConfig[];
};

export type CartLine = {
  variantId: string;
  qty: number;
};

export type WidgetType = "bundle" | "qb" | "mix_match";

declare global {
  interface Window {
    _pumperConfig?: { shop: string; locale: string; currency: string; apiBase: string };
    _pumperPreview?: boolean;
    _pumperPreviewConfig?: WidgetConfig;
    _pumperRerender?: () => void;
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter theme-app-extension typecheck
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add extensions/theme-app-extension/assets/types.ts
git commit -m "feat(widget): shared types module"
```

---

### Task 13: match.ts — config matching helpers

**Files:**
- Create: `extensions/theme-app-extension/assets/match.ts`
- Create: `extensions/theme-app-extension/assets/match.test.ts`

Pure functions: given a `WidgetConfig` and a current `productId`, return the matching bundle/QB/mix_match offer (or null).

- [ ] **Step 1: Write failing tests**

Create `extensions/theme-app-extension/assets/match.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { matchBundle, matchQb, matchMixMatch } from "./match";
import type { WidgetConfig } from "./types";

const SETTINGS: WidgetConfig["settings"] = {
  primaryColor: "#7B1E2A",
  textColor: "#1A1A1A",
  backgroundColor: "#FFFFFF",
  borderRadius: 8,
  fontFamily: "inherit",
  bundleHeadline: "Frequently bought together",
  qbHeadline: "Choose your savings",
  showCompareAtPrice: true,
  currency: "USD",
  locale: "en",
};

const CONFIG_BASE: WidgetConfig = {
  shop: "test.myshopify.com",
  settings: SETTINGS,
  bundles: [],
  quantityBreaks: [],
};

describe("matchBundle (classic)", () => {
  it("matches a classic bundle when productId is in triggerProductIds", () => {
    const config: WidgetConfig = {
      ...CONFIG_BASE,
      bundles: [{
        id: "b1", name: "B1", mode: "classic",
        products: [{ productId: "gid://shopify/Product/1", variantId: null, qty: 1, title: "P1", image: null, available: true, priceCents: 1000 }],
        collectionId: null, targetQty: null, collectionProducts: null,
        discountType: "percentage", discountValue: 10, combinable: false,
        triggerProductIds: ["gid://shopify/Product/1"],
        headline: null, ctaLabel: null, styleOverrides: null,
      }],
    };
    expect(matchBundle(config, "gid://shopify/Product/1")?.id).toBe("b1");
  });

  it("falls back to bundle.products when triggerProductIds is empty", () => {
    const config: WidgetConfig = {
      ...CONFIG_BASE,
      bundles: [{
        id: "b1", name: "B1", mode: "classic",
        products: [
          { productId: "gid://shopify/Product/1", variantId: null, qty: 1, title: "P1", image: null, available: true, priceCents: 1000 },
          { productId: "gid://shopify/Product/2", variantId: null, qty: 1, title: "P2", image: null, available: true, priceCents: 1000 },
        ],
        collectionId: null, targetQty: null, collectionProducts: null,
        discountType: "percentage", discountValue: 10, combinable: false,
        triggerProductIds: [],
        headline: null, ctaLabel: null, styleOverrides: null,
      }],
    };
    expect(matchBundle(config, "gid://shopify/Product/2")?.id).toBe("b1");
  });

  it("returns null when no bundle matches", () => {
    expect(matchBundle(CONFIG_BASE, "gid://shopify/Product/999")).toBeNull();
  });

  it("ignores mix_match bundles", () => {
    const config: WidgetConfig = {
      ...CONFIG_BASE,
      bundles: [{
        id: "mm1", name: "MM", mode: "mix_match",
        products: [], collectionId: "gid://shopify/Collection/1", targetQty: 3,
        collectionProducts: [{ productId: "gid://shopify/Product/1", variantId: null, title: "", image: null, available: true, priceCents: 100 }],
        discountType: "percentage", discountValue: 20, combinable: false,
        triggerProductIds: ["gid://shopify/Product/1"],
        headline: null, ctaLabel: null, styleOverrides: null,
      }],
    };
    expect(matchBundle(config, "gid://shopify/Product/1")).toBeNull();
  });
});

describe("matchQb", () => {
  it("matches QB by productId", () => {
    const config: WidgetConfig = {
      ...CONFIG_BASE,
      quantityBreaks: [{
        id: "q1", name: "Q1", productId: "gid://shopify/Product/1",
        productTitle: "P1", productImage: null,
        productVariants: [{ variantId: "gid://shopify/ProductVariant/1", title: "Default", available: true, priceCents: 1000 }],
        tiers: [{ qty: 2, discountType: "percentage", discountValue: 10, label: "10% off", isMostPopular: true, available: true }],
        combinable: false, styleOverrides: null,
      }],
    };
    expect(matchQb(config, "gid://shopify/Product/1")?.id).toBe("q1");
  });

  it("returns null when no QB matches", () => {
    expect(matchQb(CONFIG_BASE, "gid://shopify/Product/x")).toBeNull();
  });
});

describe("matchMixMatch", () => {
  it("matches via triggerProductIds", () => {
    const config: WidgetConfig = {
      ...CONFIG_BASE,
      bundles: [{
        id: "mm1", name: "MM", mode: "mix_match",
        products: [], collectionId: "gid://shopify/Collection/1", targetQty: 3,
        collectionProducts: [],
        discountType: "percentage", discountValue: 20, combinable: false,
        triggerProductIds: ["gid://shopify/Product/7"],
        headline: null, ctaLabel: null, styleOverrides: null,
      }],
    };
    expect(matchMixMatch(config, "gid://shopify/Product/7")?.id).toBe("mm1");
  });

  it("falls back to collectionProducts membership when triggerProductIds is empty", () => {
    const config: WidgetConfig = {
      ...CONFIG_BASE,
      bundles: [{
        id: "mm1", name: "MM", mode: "mix_match",
        products: [], collectionId: "gid://shopify/Collection/1", targetQty: 3,
        collectionProducts: [{ productId: "gid://shopify/Product/8", variantId: null, title: "", image: null, available: true, priceCents: 100 }],
        discountType: "percentage", discountValue: 20, combinable: false,
        triggerProductIds: [],
        headline: null, ctaLabel: null, styleOverrides: null,
      }],
    };
    expect(matchMixMatch(config, "gid://shopify/Product/8")?.id).toBe("mm1");
  });

  it("returns null otherwise", () => {
    expect(matchMixMatch(CONFIG_BASE, "gid://shopify/Product/x")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, expect failure (no implementation yet)**

```bash
pnpm --filter theme-app-extension test -- match
```

Expected: import failure.

- [ ] **Step 3: Implement match.ts**

Create `extensions/theme-app-extension/assets/match.ts`:

```ts
import type { BundleConfig, QbConfig, WidgetConfig } from "./types";

export function matchBundle(config: WidgetConfig, productId: string): BundleConfig | null {
  for (const b of config.bundles) {
    if (b.mode !== "classic") continue;
    if (b.triggerProductIds.length > 0) {
      if (b.triggerProductIds.includes(productId)) return b;
    } else {
      if (b.products.some((p) => p.productId === productId)) return b;
    }
  }
  return null;
}

export function matchQb(config: WidgetConfig, productId: string): QbConfig | null {
  for (const q of config.quantityBreaks) {
    if (q.productId === productId) return q;
  }
  return null;
}

export function matchMixMatch(config: WidgetConfig, productId: string): BundleConfig | null {
  for (const b of config.bundles) {
    if (b.mode !== "mix_match") continue;
    if (b.triggerProductIds.length > 0) {
      if (b.triggerProductIds.includes(productId)) return b;
    } else {
      const inCollection = (b.collectionProducts ?? []).some((p) => p.productId === productId);
      if (inCollection) return b;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm --filter theme-app-extension test -- match
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add extensions/theme-app-extension/assets/match.ts extensions/theme-app-extension/assets/match.test.ts
git commit -m "feat(widget): match.ts maps current productId to matching offer"
```

---

### Task 14: i18n.ts — translation helper

**Files:**
- Create: `extensions/theme-app-extension/assets/i18n.ts`
- Create: `extensions/theme-app-extension/locales/en.default.json`

A `t(key, vars)` helper that reads from a baked-in English string table. Phase 8 swaps in dynamic locale loading; for now, English-only and embedded.

- [ ] **Step 1: Create the locale file**

Create `extensions/theme-app-extension/locales/en.default.json`:

```json
{
  "bundle.heading": "Frequently bought together",
  "bundle.totalLabel": "Total",
  "bundle.cta": "Add bundle to cart",
  "bundle.ctaSavings": "Add bundle to cart — Save {savings}",
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
  "addToCart.unavailable": "Sorry, that item is no longer available."
}
```

- [ ] **Step 2: Create i18n.ts**

Create `extensions/theme-app-extension/assets/i18n.ts`:

```ts
import enStrings from "../locales/en.default.json";

type StringTable = Record<string, string>;
const TABLES: Record<string, StringTable> = { en: enStrings as StringTable };

let active: StringTable = TABLES.en!;

export function setLocale(loc: string): void {
  active = TABLES[loc.split("-")[0]!] ?? TABLES.en!;
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const tmpl = active[key] ?? key;
  if (!vars) return tmpl;
  return tmpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}
```

- [ ] **Step 3: Test it**

Create `extensions/theme-app-extension/assets/i18n.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { t, setLocale } from "./i18n";

describe("i18n", () => {
  it("returns the literal English string for known keys", () => {
    expect(t("bundle.heading")).toBe("Frequently bought together");
  });

  it("interpolates variables", () => {
    expect(t("bundle.ctaSavings", { savings: "$10.00" })).toBe("Add bundle to cart — Save $10.00");
  });

  it("returns the key when missing", () => {
    expect(t("nonexistent.key")).toBe("nonexistent.key");
  });

  it("setLocale falls back to en for unknown locales", () => {
    setLocale("xx-XX");
    expect(t("bundle.heading")).toBe("Frequently bought together");
  });
});
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm --filter theme-app-extension test -- i18n
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add extensions/theme-app-extension/assets/i18n.ts extensions/theme-app-extension/assets/i18n.test.ts extensions/theme-app-extension/locales/en.default.json
git commit -m "feat(widget): i18n helper with embedded en.default.json"
```

---

### Task 15: analytics.ts — sendBeacon emit helper

**Files:**
- Create: `extensions/theme-app-extension/assets/analytics.ts`
- Create: `extensions/theme-app-extension/assets/analytics.test.ts`

- [ ] **Step 1: Failing test**

Create `extensions/theme-app-extension/assets/analytics.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { emit, configureAnalytics } from "./analytics";

describe("analytics.emit", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete (window as any)._pumperPreview;
  });

  it("posts via sendBeacon when available", () => {
    const beacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    configureAnalytics({ apiBase: "https://x/api/storefront", shop: "s.myshopify.com" });
    emit("widget_impression", { widgetType: "bundle", widgetId: "b1", productId: "p1" });
    expect(beacon).toHaveBeenCalledOnce();
    const [url, payload] = beacon.mock.calls[0]!;
    expect(url).toBe("https://x/api/storefront/event");
    const parsed = JSON.parse(payload as string);
    expect(parsed.type).toBe("widget_impression");
    expect(parsed.shop).toBe("s.myshopify.com");
    expect(parsed.widgetId).toBe("b1");
    expect(typeof parsed.ts).toBe("number");
  });

  it("is a no-op in preview mode", () => {
    const beacon = vi.fn();
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    (window as any)._pumperPreview = true;
    configureAnalytics({ apiBase: "https://x/api/storefront", shop: "s" });
    emit("add_to_cart", { widgetType: "bundle", widgetId: "b1", valueCents: 100 });
    expect(beacon).not.toHaveBeenCalled();
  });

  it("falls back to fetch when sendBeacon is missing", async () => {
    Object.defineProperty(navigator, "sendBeacon", { value: undefined, configurable: true });
    const f = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", f);
    configureAnalytics({ apiBase: "https://x/api/storefront", shop: "s" });
    emit("widget_click", { widgetType: "qb", widgetId: "q1", productId: "p1", tierQty: 3 });
    expect(f).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm --filter theme-app-extension test -- analytics
```

- [ ] **Step 3: Implement analytics.ts**

Create `extensions/theme-app-extension/assets/analytics.ts`:

```ts
type EventType = "widget_impression" | "widget_click" | "add_to_cart";

type EventPayload = {
  widgetType: "bundle" | "qb" | "mix_match";
  widgetId: string;
  productId?: string;
  tierQty?: number;
  valueCents?: number;
};

let apiBase = "";
let shop = "";

export function configureAnalytics(opts: { apiBase: string; shop: string }): void {
  apiBase = opts.apiBase;
  shop = opts.shop;
}

export function emit(type: EventType, data: EventPayload): void {
  if (typeof window !== "undefined" && window._pumperPreview) return;
  if (!apiBase || !shop) return;
  const body = JSON.stringify({ type, shop, ts: Date.now(), ...data });
  const url = `${apiBase}/event`;
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      navigator.sendBeacon(url, body);
      return;
    } catch {
      // fall through to fetch
    }
  }
  try {
    fetch(url, { method: "POST", body, keepalive: true }).catch(() => {});
  } catch {
    // swallow
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm --filter theme-app-extension test -- analytics
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add extensions/theme-app-extension/assets/analytics.ts extensions/theme-app-extension/assets/analytics.test.ts
git commit -m "feat(widget): analytics.emit via sendBeacon with fetch fallback"
```

---

### Task 16: add-to-cart.ts — hybrid flow

**Files:**
- Create: `extensions/theme-app-extension/assets/add-to-cart.ts`
- Create: `extensions/theme-app-extension/assets/add-to-cart.test.ts`

- [ ] **Step 1: Failing test**

Create `extensions/theme-app-extension/assets/add-to-cart.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { addToCart } from "./add-to-cart";

describe("addToCart", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("posts to /cart/add.js with line items + _pumper_bundle_id", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", f);
    // Fake redirect target so we don't actually navigate in jsdom
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });

    await addToCart("b1", [
      { variantId: "gid://shopify/ProductVariant/1", qty: 1 },
      { variantId: "gid://shopify/ProductVariant/2", qty: 2 },
    ]);

    expect(f).toHaveBeenCalledOnce();
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("/cart/add.js");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.items.length).toBe(2);
    expect(body.items[0].properties._pumper_bundle_id).toBe("b1");
    expect(body.items[0].quantity).toBe(1);
    expect(body.items[1].quantity).toBe(2);
  });

  it("redirects to /cart when no theme drawer event fires within timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })));
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
    const result = await addToCart("b1", [{ variantId: "v1", qty: 1 }], { timeoutMs: 10 });
    expect(result.ok).toBe(true);
    expect(window.location.href).toBe("/cart");
  });

  it("does not redirect when cart:refresh event fires", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })));
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
    const promise = addToCart("b1", [{ variantId: "v1", qty: 1 }], { timeoutMs: 50 });
    document.dispatchEvent(new CustomEvent("cart:refresh"));
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(window.location.href).toBe("");
  });

  it("returns ok:false on /cart/add.js failure (no redirect)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ description: "not avail" }), { status: 422, headers: { "Content-Type": "application/json" } })));
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
    const result = await addToCart("b1", [{ variantId: "v1", qty: 1 }], { timeoutMs: 10 });
    expect(result.ok).toBe(false);
    expect(window.location.href).toBe("");
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm --filter theme-app-extension test -- add-to-cart
```

- [ ] **Step 3: Implement add-to-cart.ts**

Create `extensions/theme-app-extension/assets/add-to-cart.ts`:

```ts
import type { CartLine } from "./types";

export type AddResult = { ok: true } | { ok: false; error: string };

export async function addToCart(
  bundleId: string,
  lines: CartLine[],
  opts: { timeoutMs?: number } = {},
): Promise<AddResult> {
  const timeoutMs = opts.timeoutMs ?? 800;

  const drawerWillOpen = new Promise<boolean>((resolve) => {
    let done = false;
    const onChange = () => { if (!done) { done = true; resolve(true); } };
    document.addEventListener("cart:refresh", onChange, { once: true });
    document.addEventListener("cart:update", onChange, { once: true });
    setTimeout(() => { if (!done) { done = true; resolve(false); } }, timeoutMs);
  });

  let res: Response;
  try {
    res = await fetch("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({
        items: lines.map((l) => ({
          id: l.variantId,
          quantity: l.qty,
          properties: { _pumper_bundle_id: bundleId },
        })),
      }),
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Network error" };
  }

  if (!res.ok) {
    let errMsg = "Could not add to cart";
    try {
      const j = (await res.json()) as { description?: string };
      if (j.description) errMsg = j.description;
    } catch {
      // ignore
    }
    return { ok: false, error: errMsg };
  }

  document.dispatchEvent(new CustomEvent("cart:refresh"));
  document.dispatchEvent(new CustomEvent("cart:update"));

  if (!(await drawerWillOpen)) {
    window.location.href = "/cart";
  }

  return { ok: true };
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm --filter theme-app-extension test -- add-to-cart
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add extensions/theme-app-extension/assets/add-to-cart.ts extensions/theme-app-extension/assets/add-to-cart.test.ts
git commit -m "feat(widget): hybrid add-to-cart flow with /cart fallback"
```

---

### Task 17: format.ts — money formatting helper

**Files:**
- Create: `extensions/theme-app-extension/assets/format.ts`
- Create: `extensions/theme-app-extension/assets/format.test.ts`

- [ ] **Step 1: Failing test**

Create `extensions/theme-app-extension/assets/format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatMoney, computeBundleTotals } from "./format";

describe("formatMoney", () => {
  it("formats USD cents", () => {
    expect(formatMoney(135999, "USD", "en")).toMatch(/1,?359\.99/);
  });

  it("respects currency symbol", () => {
    const out = formatMoney(1000, "EUR", "en");
    expect(out).toContain("10");
  });
});

describe("computeBundleTotals", () => {
  it("percentage discount", () => {
    const t = computeBundleTotals({ products: [{ priceCents: 10000, qty: 1 }, { priceCents: 5000, qty: 2 }] }, "percentage", 10);
    expect(t.subtotalCents).toBe(20000);
    expect(t.discountedCents).toBe(18000);
    expect(t.savingsCents).toBe(2000);
  });

  it("flat discount per bundle", () => {
    const t = computeBundleTotals({ products: [{ priceCents: 10000, qty: 1 }] }, "flat", 1500);
    expect(t.subtotalCents).toBe(10000);
    expect(t.discountedCents).toBe(8500);
    expect(t.savingsCents).toBe(1500);
  });

  it("fixed_total — discountedCents equals discountValue (in cents)", () => {
    const t = computeBundleTotals({ products: [{ priceCents: 10000, qty: 2 }] }, "fixed_total", 50);
    // discountValue 50 = $50 = 5000 cents
    expect(t.subtotalCents).toBe(20000);
    expect(t.discountedCents).toBe(5000);
    expect(t.savingsCents).toBe(15000);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm --filter theme-app-extension test -- format
```

- [ ] **Step 3: Implement format.ts**

Create `extensions/theme-app-extension/assets/format.ts`:

```ts
export function formatMoney(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

type LineLite = { priceCents: number; qty: number };

export function computeBundleTotals(
  bundle: { products: LineLite[] },
  discountType: string,
  discountValue: number,
): { subtotalCents: number; discountedCents: number; savingsCents: number } {
  const subtotalCents = bundle.products.reduce((s, p) => s + p.priceCents * p.qty, 0);

  let discountedCents = subtotalCents;
  if (discountType === "percentage") {
    discountedCents = Math.round(subtotalCents * (1 - discountValue / 100));
  } else if (discountType === "flat") {
    // discountValue is in cents (matches what action passes through)
    discountedCents = Math.max(0, subtotalCents - Math.round(discountValue));
  } else if (discountType === "fixed_total") {
    // discountValue is in dollars (what merchant typed); convert to cents
    discountedCents = Math.max(0, Math.round(discountValue * 100));
  }

  return {
    subtotalCents,
    discountedCents,
    savingsCents: Math.max(0, subtotalCents - discountedCents),
  };
}
```

NOTE: `flat` semantics: the admin form lets the merchant type a dollar amount (e.g., `15` = $15 off). That value is stored as `discountValue: 15` in D1. So `flat` discountValue is in **dollars**, not cents. Let me revise:

Replace the `flat` branch:

```ts
  } else if (discountType === "flat") {
    discountedCents = Math.max(0, subtotalCents - Math.round(discountValue * 100));
  }
```

Update the corresponding test for `flat`:

```ts
  it("flat discount per bundle", () => {
    const t = computeBundleTotals({ products: [{ priceCents: 10000, qty: 1 }] }, "flat", 15);
    expect(t.subtotalCents).toBe(10000);
    expect(t.discountedCents).toBe(8500);
    expect(t.savingsCents).toBe(1500);
  });
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm --filter theme-app-extension test -- format
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add extensions/theme-app-extension/assets/format.ts extensions/theme-app-extension/assets/format.test.ts
git commit -m "feat(widget): money + bundle-total formatting helpers"
```

---

### Task 18: render-bundle.ts — classic bundle renderer

**Files:**
- Create: `extensions/theme-app-extension/assets/render-bundle.ts`
- Create: `extensions/theme-app-extension/assets/render-bundle.test.ts`

- [ ] **Step 1: Failing test**

Create `extensions/theme-app-extension/assets/render-bundle.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderBundle } from "./render-bundle";
import type { BundleConfig, WidgetConfig } from "./types";

const SETTINGS: WidgetConfig["settings"] = {
  primaryColor: "#7B1E2A", textColor: "#1A1A1A", backgroundColor: "#FFFFFF",
  borderRadius: 8, fontFamily: "inherit",
  bundleHeadline: "Frequently bought together", qbHeadline: "Choose your savings",
  showCompareAtPrice: true, currency: "USD", locale: "en",
};
const CONFIG: WidgetConfig = { shop: "s.myshopify.com", settings: SETTINGS, bundles: [], quantityBreaks: [] };

const BUNDLE: BundleConfig = {
  id: "b1", name: "Bundle 1", mode: "classic",
  products: [
    { productId: "p1", variantId: "v1", qty: 1, title: "Snowboard", image: null, available: true, priceCents: 72995 },
    { productId: "p2", variantId: "v2", qty: 1, title: "Bindings", image: null, available: true, priceCents: 62995 },
  ],
  collectionId: null, targetQty: null, collectionProducts: null,
  discountType: "percentage", discountValue: 10, combinable: false,
  triggerProductIds: [], headline: null, ctaLabel: null, styleOverrides: null,
};

describe("renderBundle", () => {
  let mount: HTMLElement;
  beforeEach(() => { mount = document.createElement("div"); document.body.appendChild(mount); });

  it("renders heading + each product row + CTA", () => {
    renderBundle(mount, BUNDLE, CONFIG);
    expect(mount.querySelector(".pumper-bundle-heading")?.textContent).toContain("Frequently bought together");
    expect(mount.querySelectorAll(".pumper-bundle-row").length).toBe(2);
    const cta = mount.querySelector("[data-action=add-to-cart]");
    expect(cta).not.toBeNull();
    expect(cta?.textContent ?? "").toMatch(/Add bundle to cart/);
  });

  it("shows OOS badge when one product is unavailable + disables CTA", () => {
    const b: BundleConfig = { ...BUNDLE, products: [
      { ...BUNDLE.products[0]!, available: false },
      BUNDLE.products[1]!,
    ]};
    renderBundle(mount, b, CONFIG);
    expect(mount.querySelector(".pumper-oos-badge")).not.toBeNull();
    const cta = mount.querySelector("[data-action=add-to-cart]") as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
  });

  it("clears mount and returns when all products are OOS (hide widget)", () => {
    const b: BundleConfig = { ...BUNDLE, products: BUNDLE.products.map((p) => ({ ...p, available: false })) };
    renderBundle(mount, b, CONFIG);
    expect(mount.innerHTML).toBe("");
    expect(mount.style.minHeight).toBe("");
  });

  it("renders savings inside the CTA label", () => {
    renderBundle(mount, BUNDLE, CONFIG);
    const cta = mount.querySelector("[data-action=add-to-cart]");
    // savings = 10% of (72995 + 62995) = 13599 cents
    expect((cta?.textContent ?? "").toLowerCase()).toMatch(/save/);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm --filter theme-app-extension test -- render-bundle
```

- [ ] **Step 3: Implement render-bundle.ts**

Create `extensions/theme-app-extension/assets/render-bundle.ts`:

```ts
import type { BundleConfig, WidgetConfig } from "./types";
import { addToCart } from "./add-to-cart";
import { emit } from "./analytics";
import { computeBundleTotals, formatMoney } from "./format";
import { t } from "./i18n";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function renderBundle(mount: HTMLElement, bundle: BundleConfig, config: WidgetConfig): void {
  const allOOS = bundle.products.every((p) => !p.available);
  if (allOOS) {
    mount.innerHTML = "";
    mount.style.minHeight = "";
    mount.removeAttribute("data-pumper-rendered");
    return;
  }

  const anyOOS = bundle.products.some((p) => !p.available);
  const totals = computeBundleTotals(bundle, bundle.discountType, bundle.discountValue);
  const heading = bundle.headline || config.settings.bundleHeadline || t("bundle.heading");

  const rows = bundle.products.map((p) => {
    const oosBadge = p.available
      ? ""
      : `<span class="pumper-oos-badge">Out of stock</span>`;
    const img = p.image
      ? `<img src="${escapeHtml(p.image)}" alt="" class="pumper-thumb" loading="lazy" />`
      : `<div class="pumper-thumb pumper-thumb-empty"></div>`;
    return `
      <div class="pumper-bundle-row${p.available ? "" : " pumper-bundle-row--oos"}">
        ${img}
        <div class="pumper-row-meta">
          <div class="pumper-row-title">${escapeHtml(p.title)}</div>
          <div class="pumper-row-sub">Qty ${p.qty} · ${formatMoney(p.priceCents, config.settings.currency, config.settings.locale)}</div>
        </div>
        ${oosBadge}
      </div>
    `;
  }).join('<div class="pumper-plus">+</div>');

  const totalLine = `
    <div class="pumper-total-row">
      <span class="pumper-total-label">${t("bundle.totalLabel")}
        ${config.settings.showCompareAtPrice ? `<span class="pumper-strike">${formatMoney(totals.subtotalCents, config.settings.currency, config.settings.locale)}</span>` : ""}
      </span>
      <span class="pumper-total-value">${formatMoney(totals.discountedCents, config.settings.currency, config.settings.locale)}</span>
    </div>
  `;

  const ctaLabel = anyOOS
    ? t("bundle.unavailable")
    : (bundle.ctaLabel ?? (totals.savingsCents > 0
        ? t("bundle.ctaSavings", { savings: formatMoney(totals.savingsCents, config.settings.currency, config.settings.locale) })
        : t("bundle.cta")));

  mount.innerHTML = `
    <section class="pumper-card pumper-bundle">
      <h3 class="pumper-bundle-heading">${escapeHtml(heading)}</h3>
      <div class="pumper-bundle-rows">${rows}</div>
      ${totalLine}
      <button class="pumper-cta" data-action="add-to-cart" ${anyOOS ? "disabled" : ""}>${escapeHtml(ctaLabel)}</button>
    </section>
  `;

  emit("widget_impression", { widgetType: "bundle", widgetId: bundle.id, productId: bundle.products[0]?.productId ?? "" });

  const cta = mount.querySelector<HTMLButtonElement>("[data-action=add-to-cart]");
  if (cta && !anyOOS) {
    cta.addEventListener("click", async () => {
      cta.disabled = true;
      emit("widget_click", { widgetType: "bundle", widgetId: bundle.id, productId: bundle.products[0]?.productId ?? "" });
      const result = await addToCart(bundle.id, bundle.products
        .filter((p) => p.variantId)
        .map((p) => ({ variantId: p.variantId!, qty: p.qty })));
      if (!result.ok) {
        cta.disabled = false;
        cta.textContent = t("addToCart.error");
        setTimeout(() => { cta.textContent = ctaLabel; }, 2500);
      } else {
        emit("add_to_cart", { widgetType: "bundle", widgetId: bundle.id, valueCents: totals.discountedCents });
      }
    });
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm --filter theme-app-extension test -- render-bundle
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add extensions/theme-app-extension/assets/render-bundle.ts extensions/theme-app-extension/assets/render-bundle.test.ts
git commit -m "feat(widget): renderBundle for classic bundles + OOS handling"
```

---

### Task 19: render-qb.ts — quantity break renderer

**Files:**
- Create: `extensions/theme-app-extension/assets/render-qb.ts`
- Create: `extensions/theme-app-extension/assets/render-qb.test.ts`

- [ ] **Step 1: Failing test**

Create `extensions/theme-app-extension/assets/render-qb.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderQb } from "./render-qb";
import type { QbConfig, WidgetConfig } from "./types";

const SETTINGS: WidgetConfig["settings"] = {
  primaryColor: "#7B1E2A", textColor: "#1A1A1A", backgroundColor: "#FFFFFF",
  borderRadius: 8, fontFamily: "inherit",
  bundleHeadline: "Frequently bought together", qbHeadline: "Choose your savings",
  showCompareAtPrice: true, currency: "USD", locale: "en",
};
const CONFIG: WidgetConfig = { shop: "s.myshopify.com", settings: SETTINGS, bundles: [], quantityBreaks: [] };

const QB: QbConfig = {
  id: "q1", name: "Q1", productId: "p1",
  productTitle: "Snowboard", productImage: null,
  productVariants: [{ variantId: "v1", title: "Default", available: true, priceCents: 72995 }],
  tiers: [
    { qty: 1, discountType: "percentage", discountValue: 0,  label: "Buy 1", isMostPopular: false, available: true },
    { qty: 2, discountType: "percentage", discountValue: 10, label: "10% off", isMostPopular: true,  available: true },
    { qty: 3, discountType: "percentage", discountValue: 15, label: "15% off", isMostPopular: false, available: true },
  ],
  combinable: false, styleOverrides: null,
};

describe("renderQb", () => {
  let mount: HTMLElement;
  beforeEach(() => { mount = document.createElement("div"); document.body.appendChild(mount); });

  it("renders all tiers, marks MOST POPULAR, and selects most-popular tier by default", () => {
    renderQb(mount, QB, CONFIG);
    const rows = mount.querySelectorAll(".pumper-qb-tier");
    expect(rows.length).toBe(3);
    expect(mount.querySelector(".pumper-qb-popular-badge")?.textContent ?? "").toContain("MOST POPULAR");
    expect(mount.querySelector(".pumper-qb-tier--selected")?.getAttribute("data-tier-index")).toBe("1");
  });

  it("clicking another tier re-renders with that tier selected", () => {
    renderQb(mount, QB, CONFIG);
    const tier3 = mount.querySelector("[data-tier-index='2']") as HTMLElement;
    tier3.click();
    expect(mount.querySelector(".pumper-qb-tier--selected")?.getAttribute("data-tier-index")).toBe("2");
    const cta = mount.querySelector("[data-action=add-to-cart]");
    expect(cta?.textContent ?? "").toMatch(/3/);
  });

  it("disables unavailable tier rows", () => {
    const q: QbConfig = { ...QB, tiers: [QB.tiers[0]!, QB.tiers[1]!, { ...QB.tiers[2]!, available: false }] };
    renderQb(mount, q, CONFIG);
    expect(mount.querySelector("[data-tier-index='2']")?.classList.contains("pumper-qb-tier--unavailable")).toBe(true);
  });

  it("hides widget if all variants unavailable", () => {
    const q: QbConfig = { ...QB, productVariants: [{ ...QB.productVariants[0]!, available: false }] };
    renderQb(mount, q, CONFIG);
    expect(mount.innerHTML).toBe("");
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm --filter theme-app-extension test -- render-qb
```

- [ ] **Step 3: Implement render-qb.ts**

Create `extensions/theme-app-extension/assets/render-qb.ts`:

```ts
import type { QbConfig, QbTier, WidgetConfig } from "./types";
import { addToCart } from "./add-to-cart";
import { emit } from "./analytics";
import { formatMoney } from "./format";
import { t } from "./i18n";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function tierUnitCents(tier: QbTier, basePriceCents: number): number {
  if (tier.discountType === "percentage") return Math.round(basePriceCents * (1 - tier.discountValue / 100));
  if (tier.discountType === "flat") return Math.max(0, basePriceCents - Math.round(tier.discountValue * 100));
  if (tier.discountType === "fixed_per_unit") return Math.max(0, Math.round(tier.discountValue * 100));
  return basePriceCents;
}

export function renderQb(mount: HTMLElement, qb: QbConfig, config: WidgetConfig): void {
  const variant = qb.productVariants.find((v) => v.available) ?? qb.productVariants[0];
  if (!variant || qb.productVariants.every((v) => !v.available)) {
    mount.innerHTML = "";
    mount.style.minHeight = "";
    return;
  }

  const popularIndex = qb.tiers.findIndex((tr) => tr.isMostPopular && tr.available);
  let selectedIndex = popularIndex >= 0 ? popularIndex : qb.tiers.findIndex((tr) => tr.available);
  if (selectedIndex < 0) selectedIndex = 0;

  const heading = config.settings.qbHeadline || t("qb.heading");

  const renderRows = () => qb.tiers.map((tr, i) => {
    const unitCents = tierUnitCents(tr, variant.priceCents);
    const totalCents = unitCents * tr.qty;
    const baseTotal = variant.priceCents * tr.qty;
    const savings = Math.max(0, baseTotal - totalCents);
    const popularBadge = tr.isMostPopular
      ? `<span class="pumper-qb-popular-badge">${t("qb.mostPopular")}</span>`
      : "";
    const savingsBadge = savings > 0
      ? `<span class="pumper-qb-savings">${t("qb.savingsBadge", { savings: formatMoney(savings, config.settings.currency, config.settings.locale) })}</span>`
      : "";
    const classes = [
      "pumper-qb-tier",
      i === selectedIndex ? "pumper-qb-tier--selected" : "",
      tr.available ? "" : "pumper-qb-tier--unavailable",
    ].filter(Boolean).join(" ");
    return `
      <div class="${classes}" data-tier-index="${i}" data-action="select-tier" role="button" tabindex="0">
        ${popularBadge}
        <div class="pumper-qb-tier-radio"></div>
        <div class="pumper-qb-tier-meta">
          <div class="pumper-qb-tier-title">${escapeHtml(t("qb.tierLabel", { qty: tr.qty }))}${tr.discountValue > 0 ? ` — ${escapeHtml(tr.label)}` : ""}</div>
          <div class="pumper-qb-tier-sub">${formatMoney(unitCents, config.settings.currency, config.settings.locale)} each · ${formatMoney(totalCents, config.settings.currency, config.settings.locale)} total</div>
        </div>
        ${savingsBadge}
      </div>
    `;
  }).join("");

  const renderCta = () => {
    const tr = qb.tiers[selectedIndex]!;
    const unitCents = tierUnitCents(tr, variant.priceCents);
    const savings = Math.max(0, (variant.priceCents - unitCents) * tr.qty);
    const label = savings > 0
      ? t("qb.ctaSavings", { qty: tr.qty, savings: formatMoney(savings, config.settings.currency, config.settings.locale) })
      : t("qb.cta", { qty: tr.qty });
    return `<button class="pumper-cta" data-action="add-to-cart" ${tr.available ? "" : "disabled"}>${escapeHtml(label)}</button>`;
  };

  const renderAll = () => {
    mount.innerHTML = `
      <section class="pumper-card pumper-qb">
        <h3 class="pumper-qb-heading">${escapeHtml(heading)}</h3>
        <div class="pumper-qb-tiers">${renderRows()}</div>
        ${renderCta()}
      </section>
    `;
    bindHandlers();
  };

  function bindHandlers() {
    mount.querySelectorAll<HTMLElement>("[data-action=select-tier]").forEach((row) => {
      row.addEventListener("click", () => {
        const idx = parseInt(row.dataset.tierIndex!, 10);
        if (qb.tiers[idx]?.available === false) return;
        selectedIndex = idx;
        emit("widget_click", { widgetType: "qb", widgetId: qb.id, productId: qb.productId, tierQty: qb.tiers[idx]!.qty });
        renderAll();
      });
    });

    const cta = mount.querySelector<HTMLButtonElement>("[data-action=add-to-cart]");
    if (cta) {
      cta.addEventListener("click", async () => {
        const tr = qb.tiers[selectedIndex]!;
        cta.disabled = true;
        const unitCents = tierUnitCents(tr, variant.priceCents);
        const result = await addToCart(qb.id, [{ variantId: variant.variantId, qty: tr.qty }]);
        if (!result.ok) {
          cta.disabled = false;
          cta.textContent = t("addToCart.error");
        } else {
          emit("add_to_cart", { widgetType: "qb", widgetId: qb.id, valueCents: unitCents * tr.qty });
        }
      });
    }
  }

  emit("widget_impression", { widgetType: "qb", widgetId: qb.id, productId: qb.productId });
  renderAll();
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm --filter theme-app-extension test -- render-qb
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add extensions/theme-app-extension/assets/render-qb.ts extensions/theme-app-extension/assets/render-qb.test.ts
git commit -m "feat(widget): renderQb with tier selection + OOS"
```

---

### Task 20: render-mix-match.ts — mix and match renderer

**Files:**
- Create: `extensions/theme-app-extension/assets/render-mix-match.ts`
- Create: `extensions/theme-app-extension/assets/render-mix-match.test.ts`

- [ ] **Step 1: Failing test**

Create `extensions/theme-app-extension/assets/render-mix-match.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderMixMatch } from "./render-mix-match";
import type { BundleConfig, WidgetConfig } from "./types";

const SETTINGS: WidgetConfig["settings"] = {
  primaryColor: "#7B1E2A", textColor: "#1A1A1A", backgroundColor: "#FFFFFF",
  borderRadius: 8, fontFamily: "inherit",
  bundleHeadline: "Frequently bought together", qbHeadline: "Choose your savings",
  showCompareAtPrice: true, currency: "USD", locale: "en",
};
const CONFIG: WidgetConfig = { shop: "s.myshopify.com", settings: SETTINGS, bundles: [], quantityBreaks: [] };

const MM: BundleConfig = {
  id: "mm1", name: "Mix3", mode: "mix_match",
  products: [], collectionId: "gid://shopify/Collection/1", targetQty: 3,
  collectionProducts: [
    { productId: "p1", variantId: "v1", title: "Tee Black", image: null, available: true, priceCents: 2400 },
    { productId: "p2", variantId: "v2", title: "Tee White", image: null, available: true, priceCents: 2400 },
    { productId: "p3", variantId: "v3", title: "Tee Olive", image: null, available: true, priceCents: 2400 },
    { productId: "p4", variantId: "v4", title: "Tee Navy",  image: null, available: true, priceCents: 2400 },
  ],
  discountType: "percentage", discountValue: 20, combinable: false,
  triggerProductIds: [], headline: null, ctaLabel: null, styleOverrides: null,
};

describe("renderMixMatch", () => {
  let mount: HTMLElement;
  beforeEach(() => { mount = document.createElement("div"); document.body.appendChild(mount); });

  it("renders the collection grid and a disabled CTA initially", () => {
    renderMixMatch(mount, MM, CONFIG);
    expect(mount.querySelectorAll(".pumper-mm-item").length).toBe(4);
    const cta = mount.querySelector("[data-action=add-to-cart]") as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
  });

  it("clicking up to targetQty enables CTA; further clicks rejected", () => {
    renderMixMatch(mount, MM, CONFIG);
    const items = mount.querySelectorAll<HTMLElement>("[data-action=toggle-mm-item]");
    items[0]!.click(); items[1]!.click(); items[2]!.click();
    const cta = mount.querySelector("[data-action=add-to-cart]") as HTMLButtonElement;
    expect(cta.disabled).toBe(false);
    items[3]!.click(); // 4th selection should not be allowed (targetQty exact)
    const checked = mount.querySelectorAll(".pumper-mm-item--selected");
    expect(checked.length).toBe(3);
  });

  it("clicking a selected item deselects it", () => {
    renderMixMatch(mount, MM, CONFIG);
    const item0 = mount.querySelector<HTMLElement>("[data-action=toggle-mm-item][data-product-index='0']")!;
    item0.click(); item0.click();
    expect(mount.querySelectorAll(".pumper-mm-item--selected").length).toBe(0);
  });

  it("hides widget when fewer than targetQty items are available", () => {
    const mm: BundleConfig = { ...MM, collectionProducts: MM.collectionProducts!.slice(0, 2) };
    renderMixMatch(mount, mm, CONFIG);
    // Has fewer products than targetQty (3) — widget shows insufficient stock state
    expect(mount.textContent).toMatch(/Not enough/i);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm --filter theme-app-extension test -- render-mix-match
```

- [ ] **Step 3: Implement render-mix-match.ts**

Create `extensions/theme-app-extension/assets/render-mix-match.ts`:

```ts
import type { BundleConfig, WidgetConfig } from "./types";
import { addToCart } from "./add-to-cart";
import { emit } from "./analytics";
import { formatMoney } from "./format";
import { t } from "./i18n";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function renderMixMatch(mount: HTMLElement, bundle: BundleConfig, config: WidgetConfig): void {
  const target = bundle.targetQty ?? 3;
  const items = (bundle.collectionProducts ?? []).filter((p) => p.available);
  const totalAvailable = items.length;
  const heading = bundle.headline || t("mm.heading", {
    target,
    discount: bundle.discountType === "percentage" ? `${bundle.discountValue}%` : formatMoney(Math.round(bundle.discountValue * 100), config.settings.currency, config.settings.locale),
  });

  const allItems = bundle.collectionProducts ?? [];

  if (totalAvailable < target) {
    mount.innerHTML = `
      <section class="pumper-card pumper-mm">
        <h3 class="pumper-mm-heading">${escapeHtml(heading)}</h3>
        <p class="pumper-mm-empty">${t("mm.notEnoughStock")}</p>
      </section>
    `;
    return;
  }

  const selected = new Set<number>(); // indices in allItems

  const renderHeader = () => {
    return `
      <div class="pumper-mm-header">
        <h3 class="pumper-mm-heading">${escapeHtml(heading)}</h3>
        <span class="pumper-mm-counter">${t("mm.picked", { count: selected.size, target })}</span>
      </div>
    `;
  };

  const renderGrid = () => {
    const slice = allItems.slice(0, 6); // top 6 visible
    return slice.map((p, i) => {
      const isSel = selected.has(i);
      const dis = !p.available;
      const classes = [
        "pumper-mm-item",
        isSel ? "pumper-mm-item--selected" : "",
        dis ? "pumper-mm-item--unavailable" : "",
      ].filter(Boolean).join(" ");
      const img = p.image
        ? `<img src="${escapeHtml(p.image)}" alt="" class="pumper-mm-thumb" loading="lazy" />`
        : `<div class="pumper-mm-thumb pumper-thumb-empty"></div>`;
      const check = isSel ? `<span class="pumper-mm-check">✓</span>` : "";
      return `
        <div class="${classes}" data-action="toggle-mm-item" data-product-index="${i}" role="button" tabindex="0" ${dis ? 'aria-disabled="true"' : ""}>
          ${check}
          ${img}
          <div class="pumper-mm-item-title">${escapeHtml(p.title)}</div>
          <div class="pumper-mm-item-price">${formatMoney(p.priceCents, config.settings.currency, config.settings.locale)}</div>
        </div>
      `;
    }).join("");
  };

  const renderCta = () => {
    const ready = selected.size === target;
    const remaining = target - selected.size;
    const discountLabel = bundle.discountType === "percentage"
      ? `${bundle.discountValue}%`
      : formatMoney(Math.round(bundle.discountValue * 100), config.settings.currency, config.settings.locale);
    const label = ready
      ? t("mm.cta")
      : t("mm.ctaPickMore", { n: remaining, discount: discountLabel });
    return `<button class="pumper-cta" data-action="add-to-cart" ${ready ? "" : "disabled"}>${escapeHtml(label)}</button>`;
  };

  const renderAll = () => {
    mount.innerHTML = `
      <section class="pumper-card pumper-mm">
        ${renderHeader()}
        <div class="pumper-mm-grid">${renderGrid()}</div>
        ${renderCta()}
      </section>
    `;
    bindHandlers();
  };

  function bindHandlers() {
    mount.querySelectorAll<HTMLElement>("[data-action=toggle-mm-item]").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = parseInt(el.dataset.productIndex!, 10);
        const item = allItems[idx];
        if (!item || !item.available) return;
        if (selected.has(idx)) {
          selected.delete(idx);
        } else {
          if (selected.size >= target) return; // exact target
          selected.add(idx);
        }
        emit("widget_click", { widgetType: "mix_match", widgetId: bundle.id, productId: item.productId });
        renderAll();
      });
    });

    const cta = mount.querySelector<HTMLButtonElement>("[data-action=add-to-cart]");
    if (cta && selected.size === target) {
      cta.addEventListener("click", async () => {
        cta.disabled = true;
        const lines = Array.from(selected)
          .map((i) => allItems[i]!)
          .filter((p) => p.variantId)
          .map((p) => ({ variantId: p.variantId!, qty: 1 }));
        const valueCents = Array.from(selected).reduce((s, i) => s + allItems[i]!.priceCents, 0);
        const result = await addToCart(bundle.id, lines);
        if (!result.ok) {
          cta.disabled = false;
          cta.textContent = t("addToCart.error");
        } else {
          emit("add_to_cart", { widgetType: "mix_match", widgetId: bundle.id, valueCents });
        }
      });
    }
  }

  emit("widget_impression", { widgetType: "mix_match", widgetId: bundle.id, productId: allItems[0]?.productId ?? "" });
  renderAll();
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm --filter theme-app-extension test -- render-mix-match
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add extensions/theme-app-extension/assets/render-mix-match.ts extensions/theme-app-extension/assets/render-mix-match.test.ts
git commit -m "feat(widget): renderMixMatch with grid selection (exact target qty)"
```

---

### Task 21: widget.ts — entry point + lifecycle

**Files:**
- Create: `extensions/theme-app-extension/assets/widget.ts`
- Create: `extensions/theme-app-extension/assets/widget.test.ts`

- [ ] **Step 1: Failing test**

Create `extensions/theme-app-extension/assets/widget.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { initWidget } from "./widget";
import type { WidgetConfig } from "./types";

const SETTINGS: WidgetConfig["settings"] = {
  primaryColor: "#7B1E2A", textColor: "#1A1A1A", backgroundColor: "#FFFFFF",
  borderRadius: 8, fontFamily: "inherit",
  bundleHeadline: "Frequently bought together", qbHeadline: "Choose your savings",
  showCompareAtPrice: true, currency: "USD", locale: "en",
};

const CONFIG: WidgetConfig = {
  shop: "test.myshopify.com",
  settings: SETTINGS,
  bundles: [{
    id: "b1", name: "B1", mode: "classic",
    products: [
      { productId: "gid://shopify/Product/1", variantId: "v1", qty: 1, title: "P1", image: null, available: true, priceCents: 1000 },
      { productId: "gid://shopify/Product/2", variantId: "v2", qty: 1, title: "P2", image: null, available: true, priceCents: 1000 },
    ],
    collectionId: null, targetQty: null, collectionProducts: null,
    discountType: "percentage", discountValue: 10, combinable: false,
    triggerProductIds: ["gid://shopify/Product/1"],
    headline: null, ctaLabel: null, styleOverrides: null,
  }],
  quantityBreaks: [],
};

describe("widget init", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    (window as any)._pumperPreview = true;
    (window as any)._pumperPreviewConfig = CONFIG;
  });
  afterEach(() => {
    delete (window as any)._pumperPreview;
    delete (window as any)._pumperPreviewConfig;
  });

  it("renders bundle when mount has matching productId", async () => {
    const mount = document.createElement("div");
    mount.className = "pumper-mount";
    mount.dataset.pumperType = "bundle";
    mount.dataset.productId = "1";
    mount.dataset.shop = "test.myshopify.com";
    document.body.appendChild(mount);

    await initWidget();

    expect(mount.querySelector(".pumper-bundle")).not.toBeNull();
    expect(mount.dataset.pumperRendered).toBe("1");
  });

  it("clears mount when no offer matches the productId", async () => {
    const mount = document.createElement("div");
    mount.className = "pumper-mount";
    mount.dataset.pumperType = "bundle";
    mount.dataset.productId = "999";
    mount.dataset.shop = "test.myshopify.com";
    document.body.appendChild(mount);

    await initWidget();

    expect(mount.innerHTML).toBe("");
  });
});
```

The data-product-id values in the test are bare numeric IDs (matches what Liquid emits via `{{ product.id }}`). The widget needs to convert to GID form for matching.

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm --filter theme-app-extension test -- widget
```

- [ ] **Step 3: Implement widget.ts**

Create `extensions/theme-app-extension/assets/widget.ts`:

```ts
import type { WidgetConfig, WidgetType } from "./types";
import { matchBundle, matchQb, matchMixMatch } from "./match";
import { renderBundle } from "./render-bundle";
import { renderQb } from "./render-qb";
import { renderMixMatch } from "./render-mix-match";
import { configureAnalytics } from "./analytics";
import { setLocale } from "./i18n";

let cachedConfig: WidgetConfig | null = null;
let configPromise: Promise<WidgetConfig> | null = null;

async function fetchConfigOnce(shop: string, apiBase: string): Promise<WidgetConfig> {
  if (window._pumperPreview && window._pumperPreviewConfig) {
    return window._pumperPreviewConfig;
  }
  if (cachedConfig) return cachedConfig;
  if (configPromise) return configPromise;

  configPromise = (async () => {
    const delays = [0, 200, 600, 1800];
    let lastErr: unknown;
    for (let i = 0; i < delays.length; i++) {
      if (delays[i]! > 0) await new Promise((r) => setTimeout(r, delays[i]!));
      try {
        const res = await fetch(`${apiBase}/config/${encodeURIComponent(shop)}`, { credentials: "omit" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as WidgetConfig;
        cachedConfig = data;
        return data;
      } catch (e) {
        lastErr = e;
      }
    }
    configPromise = null;
    throw lastErr ?? new Error("config fetch failed");
  })();
  return configPromise;
}

function toGid(productIdRaw: string): string {
  if (productIdRaw.startsWith("gid://")) return productIdRaw;
  return `gid://shopify/Product/${productIdRaw}`;
}

function applyCssVars(target: HTMLElement, cfg: WidgetConfig): void {
  const s = cfg.settings;
  target.style.setProperty("--pumper-primary", s.primaryColor);
  target.style.setProperty("--pumper-text", s.textColor);
  target.style.setProperty("--pumper-bg", s.backgroundColor);
  target.style.setProperty("--pumper-radius", `${s.borderRadius}px`);
  target.style.setProperty("--pumper-font", s.fontFamily);
}

function renderMount(mount: HTMLElement, cfg: WidgetConfig): void {
  const type = mount.dataset.pumperType as WidgetType | undefined;
  const productId = toGid(mount.dataset.productId ?? "");
  if (!type || !productId) {
    mount.innerHTML = "";
    return;
  }
  applyCssVars(mount, cfg);
  if (type === "bundle") {
    const b = matchBundle(cfg, productId);
    if (!b) { mount.innerHTML = ""; mount.style.minHeight = ""; return; }
    renderBundle(mount, b, cfg);
  } else if (type === "qb") {
    const q = matchQb(cfg, productId);
    if (!q) { mount.innerHTML = ""; mount.style.minHeight = ""; return; }
    renderQb(mount, q, cfg);
  } else if (type === "mix_match") {
    const m = matchMixMatch(cfg, productId);
    if (!m) { mount.innerHTML = ""; mount.style.minHeight = ""; return; }
    renderMixMatch(mount, m, cfg);
  }
  mount.dataset.pumperRendered = "1";
}

export async function initWidget(): Promise<void> {
  const mounts = Array.from(document.querySelectorAll<HTMLElement>(".pumper-mount:not([data-pumper-rendered])"));
  if (mounts.length === 0) return;

  const apiBase = (window._pumperConfig?.apiBase) ?? "https://bundler.deepseatools.in/api/storefront";
  const shopFromGlobal = window._pumperConfig?.shop;
  const shopFromMount = mounts[0]!.dataset.shop;
  const shop = shopFromGlobal ?? shopFromMount ?? "";
  if (!shop) return;

  configureAnalytics({ apiBase, shop });

  let cfg: WidgetConfig;
  try {
    cfg = await fetchConfigOnce(shop, apiBase);
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[pumper] config unreachable", e);
    }
    mounts.forEach((m) => { m.innerHTML = ""; m.style.minHeight = ""; });
    return;
  }

  setLocale(cfg.settings.locale ?? "en");

  for (const m of mounts) renderMount(m, cfg);

  startObserver(cfg);

  // Expose re-render hook for preview iframe
  window._pumperRerender = () => {
    cachedConfig = null;
    document.querySelectorAll<HTMLElement>(".pumper-mount").forEach((m) => {
      m.removeAttribute("data-pumper-rendered");
    });
    void initWidget();
  };
}

let observerStarted = false;
function startObserver(cfg: WidgetConfig): void {
  if (observerStarted) return;
  observerStarted = true;
  const cb = () => {
    document.querySelectorAll<HTMLElement>(".pumper-mount:not([data-pumper-rendered])").forEach((m) => {
      renderMount(m, cachedConfig ?? cfg);
    });
  };
  const obs = new MutationObserver(() => {
    // Throttle via requestIdleCallback (or setTimeout fallback)
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
    if (ric) ric(cb); else setTimeout(cb, 100);
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { void initWidget(); });
  } else {
    void initWidget();
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm --filter theme-app-extension test -- widget
```

Expected: 2 widget tests pass; all other widget package tests still pass.

- [ ] **Step 5: Run full widget test suite + build**

```bash
pnpm --filter theme-app-extension test
pnpm --filter theme-app-extension build
```

Expected: all tests pass; tsup produces `assets/widget.js`. Inspect file size:

```bash
gzip -c "extensions/theme-app-extension/assets/widget.js" | wc -c
```

Expected: under 30000 bytes.

- [ ] **Step 6: Commit**

```bash
git add extensions/theme-app-extension/assets/widget.ts extensions/theme-app-extension/assets/widget.test.ts
git commit -m "feat(widget): widget.ts entry — lifecycle, config fetch, mutation observer"
```

---

### Task 22: widget.css — styles

**Files:**
- Create: `extensions/theme-app-extension/assets/widget.css`

- [ ] **Step 1: Create widget.css**

Create `extensions/theme-app-extension/assets/widget.css`:

```css
/* Bundler widget styles. All classes prefixed .pumper- */
.pumper-mount { font-family: var(--pumper-font, inherit); color: var(--pumper-text, #1A1A1A); }
.pumper-card { background: var(--pumper-bg, #fff); border: 1px solid #e3e3e3; border-radius: var(--pumper-radius, 8px); padding: 16px; box-sizing: border-box; }
.pumper-bundle-heading,
.pumper-qb-heading,
.pumper-mm-heading { font-size: 14px; font-weight: 600; margin: 0 0 12px; }
.pumper-bundle-rows { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.pumper-bundle-row { background: #fff; border: 1px solid #e3e3e3; border-radius: 6px; padding: 10px; display: flex; gap: 10px; align-items: center; }
.pumper-bundle-row--oos { opacity: .55; }
.pumper-thumb { width: 48px; height: 48px; border-radius: 4px; object-fit: cover; flex-shrink: 0; }
.pumper-thumb-empty { background: #ddd; }
.pumper-row-meta { flex: 1; min-width: 0; }
.pumper-row-title { font-size: 13px; font-weight: 500; }
.pumper-row-sub { font-size: 11px; color: #888; }
.pumper-plus { text-align: center; color: #aaa; font-size: 12px; }
.pumper-oos-badge { color: #b00020; font-size: 11px; font-weight: 600; }
.pumper-total-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: #fafafa; border-radius: 6px; margin-bottom: 12px; }
.pumper-total-label { font-size: 12px; }
.pumper-total-value { font-size: 14px; font-weight: 700; color: var(--pumper-primary, #7B1E2A); }
.pumper-strike { text-decoration: line-through; color: #aaa; margin-left: 6px; }
.pumper-cta {
  width: 100%;
  background: var(--pumper-primary, #7B1E2A);
  color: #fff;
  border: 0;
  padding: 12px;
  border-radius: var(--pumper-radius, 6px);
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: opacity .15s;
}
.pumper-cta:disabled { opacity: .55; cursor: not-allowed; }
.pumper-cta:hover:not(:disabled) { opacity: .9; }

/* QB */
.pumper-qb-tiers { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.pumper-qb-tier { background: #fff; border: 1px solid #e3e3e3; border-radius: 8px; padding: 10px; display: flex; align-items: center; gap: 10px; cursor: pointer; position: relative; }
.pumper-qb-tier--selected { border-color: var(--pumper-primary, #7B1E2A); border-width: 2px; padding: 9px; }
.pumper-qb-tier--unavailable { opacity: .5; cursor: not-allowed; }
.pumper-qb-tier-radio { width: 14px; height: 14px; border: 2px solid #ccc; border-radius: 50%; flex-shrink: 0; }
.pumper-qb-tier--selected .pumper-qb-tier-radio { border-color: var(--pumper-primary, #7B1E2A); background: var(--pumper-primary, #7B1E2A); box-shadow: inset 0 0 0 2px #fff; }
.pumper-qb-tier-meta { flex: 1; }
.pumper-qb-tier-title { font-size: 13px; font-weight: 600; }
.pumper-qb-tier-sub { font-size: 11px; color: #888; }
.pumper-qb-savings { background: #fde7ea; color: var(--pumper-primary, #7B1E2A); font-size: 11px; padding: 3px 6px; border-radius: 4px; font-weight: 600; }
.pumper-qb-popular-badge { position: absolute; top: -8px; right: 10px; background: var(--pumper-primary, #7B1E2A); color: #fff; font-size: 9px; padding: 2px 6px; border-radius: 4px; font-weight: 700; letter-spacing: .5px; }

/* Mix & Match */
.pumper-mm-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.pumper-mm-counter { font-size: 11px; color: var(--pumper-primary, #7B1E2A); font-weight: 600; }
.pumper-mm-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 12px; }
.pumper-mm-item { background: #fff; border: 1px solid #e3e3e3; border-radius: 6px; padding: 8px; text-align: center; cursor: pointer; position: relative; }
.pumper-mm-item--selected { border: 2px solid var(--pumper-primary, #7B1E2A); padding: 7px; }
.pumper-mm-item--unavailable { opacity: .4; cursor: not-allowed; }
.pumper-mm-thumb { width: 100%; height: 56px; border-radius: 4px; object-fit: cover; }
.pumper-mm-item-title { font-size: 11px; margin-top: 4px; font-weight: 500; }
.pumper-mm-item-price { font-size: 10px; color: #888; }
.pumper-mm-check { position: absolute; top: 4px; right: 4px; background: var(--pumper-primary, #7B1E2A); color: #fff; border-radius: 50%; width: 16px; height: 16px; font-size: 10px; display: flex; align-items: center; justify-content: center; font-weight: 700; }
.pumper-mm-empty { color: #888; font-size: 12px; text-align: center; padding: 20px; }

/* Skeleton */
.pumper-skeleton { background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 37%, #f0f0f0 63%); background-size: 200% 100%; animation: pumper-skel 1.4s linear infinite; height: 100%; min-height: 180px; border-radius: var(--pumper-radius, 8px); }
@keyframes pumper-skel { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

@media (max-width: 480px) {
  .pumper-mm-grid { grid-template-columns: repeat(2, 1fr); }
  .pumper-bundle-row { padding: 8px; }
  .pumper-cta { padding: 14px; font-size: 14px; }
}
```

- [ ] **Step 2: Build to confirm CSS is included alongside JS**

```bash
pnpm --filter theme-app-extension build
ls -la extensions/theme-app-extension/assets/widget.* | head -5
```

Expected: `widget.js`, `widget.css` both present.

- [ ] **Step 3: Commit**

```bash
git add extensions/theme-app-extension/assets/widget.css
git commit -m "feat(widget): widget.css with scoped .pumper- prefix + CSS custom properties"
```

---

## Group E — Storefront API endpoints

Builds the public `/api/storefront/config/:shop` (60s KV cache) and `/api/storefront/event` beacon receiver, plus the new `collections/update` webhook handler.

---

### Task 23: shopify-product-fetch.ts — batch fetcher

**Files:**
- Create: `apps/admin/app/lib/shopify-product-fetch.ts`
- Create: `apps/admin/test/shopify-product-fetch.test.ts`

A helper that accepts a list of product GIDs and returns `Record<gid, { title, image, variants[{variantId, title, available, priceCents}] }>` via Admin GraphQL. Used by the storefront-config endpoint and preview routes.

- [ ] **Step 1: Failing test**

Create `apps/admin/test/shopify-product-fetch.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { fetchProductDetails, fetchCollectionTopProducts } from "../app/lib/shopify-product-fetch";

const productNodesResponse = {
  data: {
    nodes: [
      {
        __typename: "Product",
        id: "gid://shopify/Product/1",
        title: "Snowboard",
        featuredImage: { url: "https://cdn.example.com/snowboard.jpg" },
        variants: { nodes: [
          { id: "gid://shopify/ProductVariant/11", title: "Default", availableForSale: true, price: { amount: "729.95" } },
        ]},
      },
    ],
  },
};

const collectionResponse = {
  data: {
    collection: {
      products: { nodes: [
        {
          id: "gid://shopify/Product/2",
          title: "Tee",
          featuredImage: { url: "https://cdn.example.com/tee.jpg" },
          variants: { nodes: [
            { id: "gid://shopify/ProductVariant/22", title: "Default", availableForSale: true, price: { amount: "24.00" } },
          ]},
        },
      ]},
    },
  },
};

function mockAdmin(json: unknown) {
  return {
    graphql: vi.fn().mockResolvedValue(new Response(JSON.stringify(json), { status: 200, headers: { "Content-Type": "application/json" } })),
  };
}

describe("fetchProductDetails", () => {
  it("returns title + image + variants for each requested product", async () => {
    const admin = mockAdmin(productNodesResponse);
    const out = await fetchProductDetails(admin, ["gid://shopify/Product/1"]);
    expect(out["gid://shopify/Product/1"]?.title).toBe("Snowboard");
    expect(out["gid://shopify/Product/1"]?.image).toBe("https://cdn.example.com/snowboard.jpg");
    expect(out["gid://shopify/Product/1"]?.variants[0]?.priceCents).toBe(72995);
    expect(out["gid://shopify/Product/1"]?.variants[0]?.available).toBe(true);
  });

  it("returns empty object when the input list is empty", async () => {
    const admin = mockAdmin(productNodesResponse);
    const out = await fetchProductDetails(admin, []);
    expect(out).toEqual({});
    expect(admin.graphql).not.toHaveBeenCalled();
  });
});

describe("fetchCollectionTopProducts", () => {
  it("returns top N products from a collection", async () => {
    const admin = mockAdmin(collectionResponse);
    const out = await fetchCollectionTopProducts(admin, "gid://shopify/Collection/1", 12);
    expect(out.length).toBe(1);
    expect(out[0]?.productId).toBe("gid://shopify/Product/2");
    expect(out[0]?.priceCents).toBe(2400);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm --filter admin test -- shopify-product-fetch
```

- [ ] **Step 3: Implement shopify-product-fetch.ts**

Create `apps/admin/app/lib/shopify-product-fetch.ts`:

```ts
type AdminGraphqlClient = {
  graphql(query: string, options?: { variables?: unknown }): Promise<Response>;
};

export type ProductVariantDetail = {
  variantId: string;
  title: string;
  available: boolean;
  priceCents: number;
};

export type ProductDetail = {
  id: string;
  title: string;
  image: string | null;
  variants: ProductVariantDetail[];
};

export type CollectionProduct = {
  productId: string;
  variantId: string | null;
  title: string;
  image: string | null;
  available: boolean;
  priceCents: number;
};

function dollarsStrToCents(s: string): number {
  const parsed = parseFloat(s);
  if (Number.isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

export async function fetchProductDetails(
  admin: AdminGraphqlClient,
  productIds: string[],
): Promise<Record<string, ProductDetail>> {
  if (productIds.length === 0) return {};
  const res = await admin.graphql(
    `query Products($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
          __typename
          id
          title
          featuredImage { url }
          variants(first: 50) {
            nodes { id title availableForSale price { amount } }
          }
        }
      }
    }`,
    { variables: { ids: productIds } },
  );
  const data = (await res.json()) as {
    data: {
      nodes: Array<
        | {
            __typename: "Product";
            id: string;
            title: string;
            featuredImage: { url: string } | null;
            variants: { nodes: Array<{ id: string; title: string; availableForSale: boolean; price: { amount: string } }> };
          }
        | null
      >;
    };
  };
  const out: Record<string, ProductDetail> = {};
  for (const node of data.data.nodes) {
    if (!node || node.__typename !== "Product") continue;
    out[node.id] = {
      id: node.id,
      title: node.title,
      image: node.featuredImage?.url ?? null,
      variants: node.variants.nodes.map((v) => ({
        variantId: v.id,
        title: v.title,
        available: v.availableForSale,
        priceCents: dollarsStrToCents(v.price.amount),
      })),
    };
  }
  return out;
}

export async function fetchCollectionTopProducts(
  admin: AdminGraphqlClient,
  collectionId: string,
  limit: number,
): Promise<CollectionProduct[]> {
  const res = await admin.graphql(
    `query Collection($id: ID!, $first: Int!) {
      collection(id: $id) {
        products(first: $first, sortKey: MANUAL) {
          nodes {
            id
            title
            featuredImage { url }
            variants(first: 1) {
              nodes { id availableForSale price { amount } }
            }
          }
        }
      }
    }`,
    { variables: { id: collectionId, first: limit } },
  );
  const data = (await res.json()) as {
    data: {
      collection: {
        products: {
          nodes: Array<{
            id: string;
            title: string;
            featuredImage: { url: string } | null;
            variants: { nodes: Array<{ id: string; availableForSale: boolean; price: { amount: string } }> };
          }>;
        };
      } | null;
    };
  };
  const products = data.data.collection?.products.nodes ?? [];
  return products.map((p) => {
    const v = p.variants.nodes[0];
    return {
      productId: p.id,
      variantId: v?.id ?? null,
      title: p.title,
      image: p.featuredImage?.url ?? null,
      available: v?.availableForSale ?? false,
      priceCents: v ? dollarsStrToCents(v.price.amount) : 0,
    };
  });
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm --filter admin test -- shopify-product-fetch
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/lib/shopify-product-fetch.ts apps/admin/test/shopify-product-fetch.test.ts
git commit -m "feat(admin): batch product + collection top-N Shopify Admin fetchers"
```

---

### Task 24: storefront config builder

**Files:**
- Create: `apps/admin/app/lib/storefront-config.ts`
- Create: `apps/admin/test/storefront-config.test.ts`

Pure function that takes (db, admin, shopId) and returns the WidgetConfig payload (matching the spec §5 shape). Lives separate from the route so we can test without a real Remix request.

- [ ] **Step 1: Failing test**

Create `apps/admin/test/storefront-config.test.ts`:

```ts
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
          variants: { nodes: [{ id: "gid://shopify/ProductVariant/11", title: "Default", availableForSale: true, price: { amount: "100.00" } }] },
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

    // First call: nodes() — empty (no classic products)
    // Second call: collection.products
    const adminGraphql = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { nodes: [] } }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { collection: { products: { nodes: [
          { id: "gid://shopify/Product/9", title: "Tee", featuredImage: { url: "img" }, variants: { nodes: [{ id: "v9", availableForSale: true, price: { amount: "24.00" } }] } },
        ]}}},
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const admin = { graphql: adminGraphql };

    const cfg = await buildStorefrontConfig(db, admin, SHOP);
    expect(cfg.bundles[0]!.collectionProducts?.length).toBe(1);
    expect(cfg.bundles[0]!.collectionProducts?.[0]?.productId).toBe("gid://shopify/Product/9");
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm --filter admin test -- storefront-config
```

- [ ] **Step 3: Implement storefront-config.ts**

Create `apps/admin/app/lib/storefront-config.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { schema } from "~/db.server";
import * as bundleRepo from "./bundles/repo";
import * as qbRepo from "./quantity-breaks/repo";
import {
  fetchProductDetails,
  fetchCollectionTopProducts,
  type ProductDetail,
} from "./shopify-product-fetch";

type AdminGraphqlClient = {
  graphql(query: string, options?: { variables?: unknown }): Promise<Response>;
};

export async function buildStorefrontConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  admin: AdminGraphqlClient,
  shopId: string,
) {
  const [bundlesAll, qbsAll, settingsRow, shopRow] = await Promise.all([
    bundleRepo.listByShop(db, shopId),
    qbRepo.listByShop(db, shopId),
    db.select().from(schema.shopSettings).where(eq(schema.shopSettings.shopId, shopId)).limit(1).then((r: { shopId: string; primaryColor: string; textColor: string; backgroundColor: string; borderRadius: number; fontFamily: string; bundleHeadline: string; qbHeadline: string; showCompareAtPrice: boolean; }[]) => r[0] ?? null),
    db.select().from(schema.shops).where(eq(schema.shops.id, shopId)).limit(1).then((r: { currency: string; primaryLocale: string; }[]) => r[0] ?? null),
  ]);

  const bundles = bundlesAll.filter((b) => b.status === "active");
  const qbs = qbsAll.filter((q) => q.status === "active");

  const allProductIds = new Set<string>();
  for (const b of bundles) {
    for (const p of b.products) allProductIds.add(p.productId);
  }
  for (const q of qbs) allProductIds.add(q.productId);

  const productMap = await fetchProductDetails(admin, [...allProductIds]);

  const collectionMap: Record<string, Awaited<ReturnType<typeof fetchCollectionTopProducts>>> = {};
  for (const b of bundles) {
    if (b.mode === "mix_match" && b.collectionId && !collectionMap[b.collectionId]) {
      collectionMap[b.collectionId] = await fetchCollectionTopProducts(admin, b.collectionId, 12);
    }
  }

  const enrichBundleProduct = (p: { productId: string; variantId: string | null; qty: number }) => {
    const detail = productMap[p.productId];
    const variant = detail?.variants.find((v) => p.variantId ? v.variantId === p.variantId : true) ?? detail?.variants[0];
    return {
      productId: p.productId,
      variantId: variant?.variantId ?? p.variantId,
      qty: p.qty,
      title: detail?.title ?? "",
      image: detail?.image ?? null,
      available: variant?.available ?? false,
      priceCents: variant?.priceCents ?? 0,
    };
  };

  const buildQb = (q: typeof qbs[number]) => {
    const detail: ProductDetail | undefined = productMap[q.productId];
    const variants = (detail?.variants ?? []).map((v) => ({
      variantId: v.variantId,
      title: v.title,
      available: v.available,
      priceCents: v.priceCents,
    }));
    const tiers = q.tiers.map((tr) => ({
      qty: tr.qty,
      discountType: tr.discountType,
      discountValue: tr.discountValue,
      label: tr.label,
      isMostPopular: tr.isMostPopular,
      available: variants.some((v) => v.available),
    }));
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
    };
  };

  return {
    shop: shopId,
    settings: {
      primaryColor: settingsRow?.primaryColor ?? "#7B1E2A",
      textColor: settingsRow?.textColor ?? "#1A1A1A",
      backgroundColor: settingsRow?.backgroundColor ?? "#FFFFFF",
      borderRadius: settingsRow?.borderRadius ?? 8,
      fontFamily: settingsRow?.fontFamily ?? "inherit",
      bundleHeadline: settingsRow?.bundleHeadline ?? "Frequently bought together",
      qbHeadline: settingsRow?.qbHeadline ?? "Choose your savings",
      showCompareAtPrice: settingsRow?.showCompareAtPrice ?? true,
      currency: shopRow?.currency ?? "USD",
      locale: shopRow?.primaryLocale ?? "en",
    },
    bundles: bundles.map((b) => ({
      id: b.id,
      name: b.name,
      mode: b.mode,
      products: b.mode === "mix_match" ? [] : b.products.map(enrichBundleProduct),
      collectionId: b.collectionId,
      targetQty: b.targetQty,
      collectionProducts: b.mode === "mix_match" && b.collectionId ? (collectionMap[b.collectionId] ?? []) : null,
      discountType: b.discountType,
      discountValue: b.discountValue,
      combinable: b.combinable,
      triggerProductIds: b.triggerProductIds,
      headline: b.headline,
      ctaLabel: b.ctaLabel,
      styleOverrides: b.styleOverrides,
    })),
    quantityBreaks: qbs.map(buildQb),
  };
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm --filter admin test -- storefront-config
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/lib/storefront-config.ts apps/admin/test/storefront-config.test.ts
git commit -m "feat(admin): buildStorefrontConfig assembles widget payload from D1 + Admin API"
```

---

### Task 25: /api/storefront/config/:shop route

**Files:**
- Create: `apps/admin/app/routes/api.storefront.config.$shop.tsx`

CORS-open public endpoint with 60s KV cache. Auth: shop must be installed (i.e., row exists in `shops` with non-null `installedAt` and null `uninstalledAt`).

The Shopify Admin client (`admin.graphql`) requires session context. For the public storefront endpoint we don't have a session — we use the unauthenticated client constructed from the stored shop access token.

- [ ] **Step 1: Read existing shopify.server.ts** to understand how to construct an admin client without a request session

Read `apps/admin/app/shopify.server.ts` end-to-end. Look for `unauthenticated.admin(shop)` or similar. The standard pattern in `@shopify/shopify-app-remix` is `await shopify.unauthenticated.admin(shop)` which returns `{ admin }`.

- [ ] **Step 2: Implement the route**

Create `apps/admin/app/routes/api.storefront.config.$shop.tsx`:

```ts
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { unauthenticated, type AppLoadContext } from "~/shopify.server";
import { getDb, schema } from "~/db.server";
import { buildStorefrontConfig } from "~/lib/storefront-config";

const CACHE_TTL_SECONDS = 60;
const NEGATIVE_CACHE_TTL_SECONDS = 30;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  const ctx = context as AppLoadContext;
  const env = ctx.cloudflare.env;
  const shop = decodeURIComponent(params.shop ?? "").toLowerCase();
  if (!shop || !shop.endsWith(".myshopify.com")) {
    return new Response(JSON.stringify({ error: "Invalid shop" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Cache hit
  const cacheKey = `config:${shop}`;
  const cached = await env.SHOP_SETTINGS_CACHE.get(cacheKey, "text");
  if (cached) {
    return new Response(cached, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}`,
        "X-Pumper-Cache": "HIT",
      },
    });
  }

  // Verify shop is installed
  const db = getDb(env.DB);
  const shopRow = (await db.select().from(schema.shops).where(eq(schema.shops.id, shop)).limit(1))[0];
  if (!shopRow || shopRow.uninstalledAt) {
    return new Response(JSON.stringify({ error: "Shop not found" }), {
      status: 404,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Build payload via unauthenticated admin client (uses stored access token from KV session storage)
  const { admin } = await unauthenticated.admin(shop, ctx);
  const payload = await buildStorefrontConfig(db, admin, shop);
  const json = JSON.stringify(payload);

  const isEmpty = payload.bundles.length === 0 && payload.quantityBreaks.length === 0;
  await env.SHOP_SETTINGS_CACHE.put(cacheKey, json, {
    expirationTtl: isEmpty ? NEGATIVE_CACHE_TTL_SECONDS : CACHE_TTL_SECONDS,
  });

  return new Response(json, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${isEmpty ? NEGATIVE_CACHE_TTL_SECONDS : CACHE_TTL_SECONDS}, s-maxage=${isEmpty ? NEGATIVE_CACHE_TTL_SECONDS : CACHE_TTL_SECONDS}`,
      "X-Pumper-Cache": "MISS",
    },
  });
}
```

- [ ] **Step 3: Confirm `unauthenticated` is exported from shopify.server.ts**

Check `apps/admin/app/shopify.server.ts`. If `unauthenticated` is not currently exported, add to the export list. The standard pattern:

```ts
const shopify = shopifyApp({...});
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
```

If it's already exported as part of the app instance, just import accordingly. Adapt the import statement in the route file to whatever the `shopify.server.ts` actually exports.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter admin typecheck
```

Expected: no errors. If there are signature mismatches with `unauthenticated.admin(shop, ctx)`, adapt the call to match what `shopifyApp` provides for Cloudflare Pages (likely `shopify.unauthenticated.admin(shop)` without the context arg).

- [ ] **Step 5: Run all tests (no new test for the route — covered by storefront-config.test.ts)**

```bash
pnpm --filter admin test
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/routes/api.storefront.config.$shop.tsx apps/admin/app/shopify.server.ts
git commit -m "feat(admin): public /api/storefront/config/:shop endpoint with KV cache"
```

---

### Task 26: /api/storefront/event beacon receiver

**Files:**
- Create: `apps/admin/app/routes/api.storefront.event.tsx`
- Create: `apps/admin/test/api-storefront-event.test.ts`

- [ ] **Step 1: Failing test**

Create `apps/admin/test/api-storefront-event.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "../drizzle/schema";
import { action } from "../app/routes/api.storefront.event";

class InMemoryKV {
  private store = new Map<string, string>();
  async get(key: string) { return this.store.get(key) ?? null; }
  async put(key: string, val: string) { this.store.set(key, val); }
  async delete(key: string) { this.store.delete(key); }
}

function setup() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  return { db, sqlite };
}

function makeContext(db: ReturnType<typeof setup>["db"]) {
  const kv = new InMemoryKV();
  return {
    cloudflare: {
      env: {
        DB: db as unknown as D1Database,
        SHOP_SETTINGS_CACHE: kv as unknown as KVNamespace,
      },
    },
  } as never;
}

const SHOP = "s.myshopify.com";

describe("/api/storefront/event action", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
    s.db.insert(schema.shops).values({ id: SHOP, scopes: "", installedAt: new Date() }).run();
  });

  it("returns 204 on a valid event from an installed shop", async () => {
    const req = new Request("https://x/api/storefront/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "widget_impression", shop: SHOP, widgetType: "bundle", widgetId: "b1", productId: "p1", ts: Date.now() }),
    });
    const res = await action({ request: req, context: makeContext(s.db) } as never);
    expect((res as Response).status).toBe(204);
  });

  it("returns 413 on an oversized body", async () => {
    const req = new Request("https://x/api/storefront/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "x".repeat(5000),
    });
    const res = await action({ request: req, context: makeContext(s.db) } as never);
    expect((res as Response).status).toBe(413);
  });

  it("returns 400 on bad JSON", async () => {
    const req = new Request("https://x/api/storefront/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    const res = await action({ request: req, context: makeContext(s.db) } as never);
    expect((res as Response).status).toBe(400);
  });

  it("drops silently (204) for shops not installed", async () => {
    const req = new Request("https://x/api/storefront/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "widget_impression", shop: "other.myshopify.com", widgetType: "bundle", widgetId: "b1" }),
    });
    const res = await action({ request: req, context: makeContext(s.db) } as never);
    expect((res as Response).status).toBe(204);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm --filter admin test -- api-storefront-event
```

- [ ] **Step 3: Implement the route**

Create `apps/admin/app/routes/api.storefront.event.tsx`:

```ts
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { type AppLoadContext } from "~/shopify.server";
import { getDb, schema } from "~/db.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

const MAX_BODY = 4096;

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const env = ctx.cloudflare.env;
  const text = await request.text();
  if (text.length > MAX_BODY) {
    return new Response("Too large", { status: 413, headers: CORS_HEADERS });
  }
  let event: { type?: string; shop?: string };
  try {
    event = JSON.parse(text);
  } catch {
    return new Response("Bad JSON", { status: 400, headers: CORS_HEADERS });
  }

  const shop = (event.shop ?? "").toLowerCase();
  if (!shop) {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const db = getDb(env.DB);
  const row = (await db.select().from(schema.shops).where(eq(schema.shops.id, shop)).limit(1))[0];
  if (!row || row.uninstalledAt) {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Phase 4 stub: Analytics Engine binding wired in Phase 6.
  // If env.ANALYTICS exists at runtime (future), write here. Otherwise no-op.
  const anyEnv = env as unknown as { ANALYTICS?: { writeDataPoint(p: unknown): void } };
  if (anyEnv.ANALYTICS && typeof anyEnv.ANALYTICS.writeDataPoint === "function") {
    try {
      anyEnv.ANALYTICS.writeDataPoint({
        blobs: [String(event.type ?? ""), shop],
        doubles: [],
        indexes: [shop],
      });
    } catch {
      // swallow
    }
  }

  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm --filter admin test -- api-storefront-event
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/routes/api.storefront.event.tsx apps/admin/test/api-storefront-event.test.ts
git commit -m "feat(admin): /api/storefront/event beacon receiver (stub for phase 6)"
```

---

### Task 27: collections/update webhook

**Files:**
- Create: `apps/admin/app/routes/webhooks.collections.update.tsx`
- Modify: `shopify.app.toml`

When a merchant edits a collection (adds/removes products), invalidate `config:${shop}` so Mix & Match `collectionProducts` get re-fetched within 60s.

- [ ] **Step 1: Create the webhook route**

Read an existing webhook route (`apps/admin/app/routes/webhooks.app.uninstalled.tsx`) to copy the HMAC + handler pattern.

Create `apps/admin/app/routes/webhooks.collections.update.tsx`:

```ts
import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { type AppLoadContext } from "~/shopify.server";
import { verifyHmac } from "~/lib/webhooks/hmac";

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const env = ctx.cloudflare.env;

  const rawBody = await request.text();
  const hmac = request.headers.get("X-Shopify-Hmac-Sha256");
  if (!hmac || !(await verifyHmac(rawBody, hmac, env.SHOPIFY_API_SECRET))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const shop = (request.headers.get("X-Shopify-Shop-Domain") ?? "").toLowerCase();
  if (shop) {
    await env.SHOP_SETTINGS_CACHE.delete(`config:${shop}`);
  }

  return new Response("OK", { status: 200 });
}
```

- [ ] **Step 2: Subscribe to the topic in shopify.app.toml**

Add to `shopify.app.toml` under `[webhooks]`:

```toml
  [[webhooks.subscriptions]]
  topics = ["collections/update"]
  uri = "/webhooks/collections/update"
```

(Place it under the existing `[[webhooks.subscriptions]]` for `app/uninstalled`.)

- [ ] **Step 3: Typecheck and run tests**

```bash
pnpm --filter admin typecheck && pnpm --filter admin test
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/routes/webhooks.collections.update.tsx shopify.app.toml
git commit -m "feat(admin): collections/update webhook invalidates storefront config cache"
```

---

### Task 28: cache invalidation on bundle/QB save

**Files:**
- Modify: `apps/admin/app/routes/app.bundles.new.tsx`
- Modify: `apps/admin/app/routes/app.bundles.$id.tsx`
- Modify: `apps/admin/app/routes/app.bundles._index.tsx` (for delete action)
- Modify: `apps/admin/app/routes/app.quantity-breaks.new.tsx`
- Modify: `apps/admin/app/routes/app.quantity-breaks.$id.tsx`
- Modify: `apps/admin/app/routes/app.quantity-breaks._index.tsx`

The action handlers in each route already call `await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(\`config:${session.shop}\`)` (per existing code from Phase 3). Verify those are still there and add them if any are missing.

- [ ] **Step 1: Verify cache deletion calls in all 6 routes**

```bash
grep -n "config:" apps/admin/app/routes/app.bundles.*.tsx apps/admin/app/routes/app.quantity-breaks.*.tsx
```

Expected: every action handler that mutates D1 includes a `SHOP_SETTINGS_CACHE.delete(\`config:${session.shop}\`)` line. If any are missing, add them after the `syncShopConfig(...)` line.

- [ ] **Step 2: Run tests**

```bash
pnpm --filter admin test
```

Expected: pass.

- [ ] **Step 3: Commit (only if changes were necessary)**

```bash
git status -sb apps/admin/app/routes/
# If anything changed, stage and commit:
git add apps/admin/app/routes/app.bundles*.tsx apps/admin/app/routes/app.quantity-breaks*.tsx
git commit -m "fix(admin): ensure all save paths invalidate storefront config cache" 2>/dev/null || true
```

(Skip the commit if grep showed all 6 already have the cache delete.)

---

## Group F — Live admin preview

The PreviewPane component, the `/app/preview/$type/$id` iframe HTML doc route, and a `preview-config` builder that turns form state into a `WidgetConfig` shape.

---

### Task 29: preview-config builder

**Files:**
- Create: `apps/admin/app/lib/preview-config.ts`
- Create: `apps/admin/test/preview-config.test.ts`

Pure function: takes form state (per-bundle or per-QB) + a "mock product" + settings → `WidgetConfig` payload that the widget renders. No DB, no Shopify Admin calls.

- [ ] **Step 1: Failing test**

Create `apps/admin/test/preview-config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildPreviewBundleConfig, buildPreviewQbConfig, defaultMockProduct, defaultPreviewSettings } from "../app/lib/preview-config";

describe("buildPreviewBundleConfig", () => {
  it("wraps a single classic bundle in a WidgetConfig", () => {
    const cfg = buildPreviewBundleConfig({
      shop: "s.myshopify.com",
      mockProduct: defaultMockProduct(),
      settings: defaultPreviewSettings(),
      bundle: {
        id: "preview",
        name: "preview",
        mode: "classic",
        products: [
          { productId: "gid://shopify/Product/1", variantId: "v1", qty: 1, title: "P1", image: null, available: true, priceCents: 1000 },
          { productId: "gid://shopify/Product/2", variantId: "v2", qty: 1, title: "P2", image: null, available: true, priceCents: 1000 },
        ],
        collectionId: null, targetQty: null, collectionProducts: null,
        discountType: "percentage", discountValue: 10, combinable: false,
        triggerProductIds: ["gid://shopify/Product/1"],
        headline: null, ctaLabel: null, styleOverrides: null,
      },
    });
    expect(cfg.bundles[0]?.id).toBe("preview");
    expect(cfg.bundles[0]?.mode).toBe("classic");
    expect(cfg.quantityBreaks).toEqual([]);
  });

  it("wraps a mix_match bundle with collectionProducts", () => {
    const cfg = buildPreviewBundleConfig({
      shop: "s.myshopify.com",
      mockProduct: { productId: "gid://shopify/Product/9", title: "Demo", priceCents: 100 },
      settings: defaultPreviewSettings(),
      bundle: {
        id: "preview", name: "preview", mode: "mix_match",
        products: [],
        collectionId: "gid://shopify/Collection/1", targetQty: 3,
        collectionProducts: [
          { productId: "gid://shopify/Product/9", variantId: "v9", title: "Demo", image: null, available: true, priceCents: 100 },
        ],
        discountType: "percentage", discountValue: 20, combinable: false,
        triggerProductIds: ["gid://shopify/Product/9"],
        headline: null, ctaLabel: null, styleOverrides: null,
      },
    });
    expect(cfg.bundles[0]?.collectionProducts?.length).toBe(1);
  });
});

describe("buildPreviewQbConfig", () => {
  it("wraps a QB in a WidgetConfig", () => {
    const cfg = buildPreviewQbConfig({
      shop: "s.myshopify.com",
      mockProduct: { productId: "gid://shopify/Product/1", title: "Prod", priceCents: 1000 },
      settings: defaultPreviewSettings(),
      qb: {
        id: "preview", name: "preview", productId: "gid://shopify/Product/1",
        productTitle: "Prod", productImage: null,
        productVariants: [{ variantId: "v1", title: "Default", available: true, priceCents: 1000 }],
        tiers: [
          { qty: 1, discountType: "percentage", discountValue: 0, label: "Buy 1", isMostPopular: false, available: true },
          { qty: 2, discountType: "percentage", discountValue: 10, label: "10% off", isMostPopular: true, available: true },
        ],
        combinable: false, styleOverrides: null,
      },
    });
    expect(cfg.quantityBreaks[0]?.id).toBe("preview");
    expect(cfg.bundles).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm --filter admin test -- preview-config
```

- [ ] **Step 3: Implement preview-config.ts**

Create `apps/admin/app/lib/preview-config.ts`:

```ts
type Settings = {
  primaryColor: string;
  textColor: string;
  backgroundColor: string;
  borderRadius: number;
  fontFamily: string;
  bundleHeadline: string;
  qbHeadline: string;
  showCompareAtPrice: boolean;
  currency: string;
  locale: string;
};

type ProductRef = {
  productId: string;
  variantId: string | null;
  qty: number;
  title: string;
  image: string | null;
  available: boolean;
  priceCents: number;
};

type CollectionProduct = {
  productId: string;
  variantId: string | null;
  title: string;
  image: string | null;
  available: boolean;
  priceCents: number;
};

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
};

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
};

type MockProduct = { productId: string; title: string; priceCents: number };

export function defaultMockProduct(): MockProduct {
  return { productId: "gid://shopify/Product/0", title: "Sample product", priceCents: 4999 };
}

export function defaultPreviewSettings(): Settings {
  return {
    primaryColor: "#7B1E2A",
    textColor: "#1A1A1A",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    fontFamily: "inherit",
    bundleHeadline: "Frequently bought together",
    qbHeadline: "Choose your savings",
    showCompareAtPrice: true,
    currency: "USD",
    locale: "en",
  };
}

export function buildPreviewBundleConfig(args: { shop: string; mockProduct: MockProduct; settings: Settings; bundle: BundleShape }) {
  return {
    shop: args.shop,
    settings: args.settings,
    bundles: [args.bundle],
    quantityBreaks: [],
  };
}

export function buildPreviewQbConfig(args: { shop: string; mockProduct: MockProduct; settings: Settings; qb: QbShape }) {
  return {
    shop: args.shop,
    settings: args.settings,
    bundles: [],
    quantityBreaks: [args.qb],
  };
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm --filter admin test -- preview-config
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/lib/preview-config.ts apps/admin/test/preview-config.test.ts
git commit -m "feat(admin): preview-config builders for bundle + qb live preview"
```

---

### Task 30: /app/preview/$type/$id iframe HTML doc

**Files:**
- Create: `apps/admin/app/routes/app.preview.$type.$id.tsx`

This route returns a minimal HTML doc that the PreviewPane iframe loads. Auth: Shopify session required (so unauthenticated users can't load arbitrary previews). The route ignores its query/body — initial config arrives via `postMessage` from the PreviewPane.

- [ ] **Step 1: Implement the route**

Create `apps/admin/app/routes/app.preview.$type.$id.tsx`:

```tsx
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { authenticate, type AppLoadContext } from "~/shopify.server";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  await authenticate.admin(request, ctx);

  const type = String(params.type ?? "bundle");
  if (!["bundle", "qb", "mix_match"].includes(type)) {
    return new Response("Bad type", { status: 400 });
  }

  // Widget assets live on Shopify's CDN once `shopify app deploy` runs;
  // for local dev we fall back to a same-origin path. Either way the iframe
  // gets the JS via `<script src>`. We inline the script tag pointed at the
  // Shopify-hosted asset URL once deployed; for now use the asset_url
  // pattern via a simple env var.
  const widgetJsUrl = ctx.cloudflare.env.WIDGET_JS_URL ?? "/widget.js";
  const widgetCssUrl = ctx.cloudflare.env.WIDGET_CSS_URL ?? "/widget.css";

  const html = `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>Preview</title>
<link rel="stylesheet" href="${widgetCssUrl}">
<style>
  body { margin:0; padding:16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#fff; }
  .pumper-preview-context { padding: 12px; background:#f6f6f7; border-radius:8px; margin-bottom:16px; font-size:13px; color:#666; }
  .pumper-preview-context strong { color:#111; }
</style>
</head><body>
<div class="pumper-preview-context">
  <strong>Preview</strong> — this is how the widget will appear on a product page.
</div>
<div class="pumper-mount" data-pumper-type="${type}" data-product-id="0" data-shop="preview"></div>
<script>
  window._pumperPreview = true;
  window._pumperPreviewConfig = { shop: "preview", settings: {
    primaryColor: "#7B1E2A", textColor: "#1A1A1A", backgroundColor: "#FFFFFF",
    borderRadius: 8, fontFamily: "inherit",
    bundleHeadline: "Frequently bought together", qbHeadline: "Choose your savings",
    showCompareAtPrice: true, currency: "USD", locale: "en"
  }, bundles: [], quantityBreaks: [] };
  window.addEventListener("message", function (e) {
    if (e.data && e.data.type === "pumper:preview" && e.data.config) {
      window._pumperPreviewConfig = e.data.config;
      var firstBundleProductId = (e.data.config.bundles && e.data.config.bundles[0] && e.data.config.bundles[0].products && e.data.config.bundles[0].products[0] && e.data.config.bundles[0].products[0].productId)
        || (e.data.config.bundles && e.data.config.bundles[0] && e.data.config.bundles[0].collectionProducts && e.data.config.bundles[0].collectionProducts[0] && e.data.config.bundles[0].collectionProducts[0].productId)
        || (e.data.config.quantityBreaks && e.data.config.quantityBreaks[0] && e.data.config.quantityBreaks[0].productId)
        || "gid://shopify/Product/0";
      var bareId = String(firstBundleProductId).replace(/^gid:\\/\\/shopify\\/Product\\//, '');
      var mounts = document.querySelectorAll('.pumper-mount');
      mounts.forEach(function (m) {
        m.dataset.productId = bareId;
        m.removeAttribute('data-pumper-rendered');
      });
      if (window._pumperRerender) window._pumperRerender();
    }
  });
</script>
<script src="${widgetJsUrl}" defer></script>
</body></html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
```

- [ ] **Step 2: Add a redirect entry (optional) — N/A** — this route just renders.

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter admin typecheck
```

Expected: pass. (The `WIDGET_JS_URL` / `WIDGET_CSS_URL` env vars may not be in the env type — that's OK at runtime; a `as any` cast is acceptable.)

If TypeScript complains about `ctx.cloudflare.env.WIDGET_JS_URL`, replace with:

```ts
  const env = ctx.cloudflare.env as unknown as { WIDGET_JS_URL?: string; WIDGET_CSS_URL?: string };
  const widgetJsUrl = env.WIDGET_JS_URL ?? "/widget.js";
  const widgetCssUrl = env.WIDGET_CSS_URL ?? "/widget.css";
```

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/routes/app.preview.\$type.\$id.tsx
git commit -m "feat(admin): /app/preview/:type/:id iframe HTML doc"
```

---

### Task 31: PreviewPane component

**Files:**
- Create: `apps/admin/app/components/PreviewPane.tsx`

- [ ] **Step 1: Create the component**

Create `apps/admin/app/components/PreviewPane.tsx`:

```tsx
import { Card, Text, BlockStack } from "@shopify/polaris";
import { useEffect, useRef } from "react";

type Props = {
  type: "bundle" | "qb" | "mix_match";
  id: string;
  config: unknown;
};

export function PreviewPane({ type, id, config }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastSentRef = useRef<string>("");

  useEffect(() => {
    const next = JSON.stringify(config);
    if (next === lastSentRef.current) return;
    const handle = setTimeout(() => {
      lastSentRef.current = next;
      iframeRef.current?.contentWindow?.postMessage(
        { type: "pumper:preview", config },
        "*",
      );
    }, 300);
    return () => clearTimeout(handle);
  }, [config]);

  return (
    <Card>
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Live preview</Text>
        <iframe
          ref={iframeRef}
          src={`/app/preview/${type}/${encodeURIComponent(id)}`}
          style={{ width: "100%", height: "560px", border: "1px solid #e3e3e3", borderRadius: 8 }}
          title="Widget preview"
        />
      </BlockStack>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter admin typecheck
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/app/components/PreviewPane.tsx
git commit -m "feat(admin): PreviewPane component (iframe + debounced postMessage)"
```

---

### Task 32: Wire PreviewPane into bundle + QB edit pages

**Files:**
- Modify: `apps/admin/app/routes/app.bundles.new.tsx`
- Modify: `apps/admin/app/routes/app.bundles.$id.tsx`
- Modify: `apps/admin/app/routes/app.quantity-breaks.new.tsx`
- Modify: `apps/admin/app/routes/app.quantity-breaks.$id.tsx`
- Modify: `apps/admin/app/components/BundleForm.tsx` (lift form state up to expose values)
- Modify: `apps/admin/app/components/QbForm.tsx` (same)

The PreviewPane needs access to live form state. Two patterns:
1. Have BundleForm/QbForm accept an `onChange(values)` callback.
2. Move the `useState` up into the route component and pass `values` + `onChange` to the form.

Use pattern (1): add an optional `onValuesChange?: (v: BundleFormValues) => void` prop.

- [ ] **Step 1: Add `onValuesChange` prop to BundleForm**

Open `apps/admin/app/components/BundleForm.tsx`. Add to `Props`:

```tsx
type Props = {
  initialValues?: Partial<BundleFormValues>;
  errors?: Record<string, string>;
  submitLabel: string;
  onValuesChange?: (v: BundleFormValues) => void;
};
```

In the component, after the `useState` line, add a useEffect:

```tsx
import { useEffect, useState } from "react";

// existing useState...

  useEffect(() => {
    onValuesChange?.(values);
  }, [values, onValuesChange]);
```

Destructure `onValuesChange` from props.

- [ ] **Step 2: Same change for QbForm**

Read `apps/admin/app/components/QbForm.tsx`, apply the same `onValuesChange?` prop + effect.

- [ ] **Step 3: Update bundle edit pages to render PreviewPane**

In `app.bundles.$id.tsx`, in the `BundleEdit` component:

```tsx
import { useState } from "react";
import { PreviewPane } from "~/components/PreviewPane";
import { BundleForm, type BundleFormValues } from "~/components/BundleForm";
import { Layout } from "@shopify/polaris";
import { buildPreviewBundleConfig, defaultMockProduct, defaultPreviewSettings } from "~/lib/preview-config";

// inside the component, replace the existing <BundleForm .../> render with:

  const [values, setValues] = useState<BundleFormValues | null>(null);

  const previewConfig = values ? buildPreviewBundleConfig({
    shop: "preview",
    mockProduct: defaultMockProduct(),
    settings: defaultPreviewSettings(),
    bundle: {
      id: bundle.id,
      name: values.name,
      mode: values.mode,
      products: values.mode === "classic"
        ? values.products.map((p) => ({
            productId: p.productId,
            variantId: p.variantId,
            qty: p.qty,
            title: p.title ?? p.productId,
            image: p.image ?? null,
            available: true,
            priceCents: 4999,
          }))
        : [],
      collectionId: values.mode === "mix_match" ? (values.collection?.collectionId ?? null) : null,
      targetQty: values.mode === "mix_match" ? parseInt(values.targetQty || "0", 10) || null : null,
      collectionProducts: values.mode === "mix_match" && values.collection
        ? Array.from({ length: 6 }).map((_, i) => ({
            productId: `gid://shopify/Product/preview-${i}`,
            variantId: `gid://shopify/ProductVariant/preview-${i}`,
            title: `Sample item ${i + 1}`,
            image: values.collection?.image ?? null,
            available: true,
            priceCents: 2400,
          }))
        : null,
      discountType: values.discountType,
      discountValue: parseFloat(values.discountValue) || 0,
      combinable: values.combinable,
      triggerProductIds: values.triggerProducts.map((p) => p.productId),
      headline: values.headline || null,
      ctaLabel: values.ctaLabel || null,
      styleOverrides: null,
    },
  }) : null;

  return (
    <Page title={bundle.name} backAction={{ content: "Bundles", url: "/app/bundles" }}>
      <Layout>
        <Layout.Section>
          <BundleForm
            submitLabel="Save changes"
            errors={errors}
            initialValues={initial}
            onValuesChange={setValues}
          />
        </Layout.Section>
        <Layout.Section variant="oneThird">
          {previewConfig && <PreviewPane type="bundle" id={bundle.id} config={previewConfig} />}
        </Layout.Section>
      </Layout>
    </Page>
  );
```

- [ ] **Step 4: Same wiring for app.bundles.new.tsx**

In `app.bundles.new.tsx`, do the same. Use `id="new"` for the iframe URL.

- [ ] **Step 5: Same for QB edit + new pages**

In `app.quantity-breaks.$id.tsx` and `app.quantity-breaks.new.tsx`:

```tsx
import { useState } from "react";
import { PreviewPane } from "~/components/PreviewPane";
import { buildPreviewQbConfig, defaultMockProduct, defaultPreviewSettings } from "~/lib/preview-config";
import { Layout } from "@shopify/polaris";

// inside the component:

  const [values, setValues] = useState<QbFormValues | null>(null);

  const previewConfig = values ? buildPreviewQbConfig({
    shop: "preview",
    mockProduct: { productId: values.product[0]?.productId ?? "gid://shopify/Product/0", title: values.product[0]?.title ?? "Sample", priceCents: 4999 },
    settings: defaultPreviewSettings(),
    qb: {
      id: qb.id,
      name: values.name,
      productId: values.product[0]?.productId ?? "gid://shopify/Product/0",
      productTitle: values.product[0]?.title ?? "Sample product",
      productImage: values.product[0]?.image ?? null,
      productVariants: [{ variantId: values.product[0]?.variantId ?? "v0", title: "Default", available: true, priceCents: 4999 }],
      tiers: values.tiers.map((tr) => ({
        qty: tr.qty,
        discountType: tr.discountType,
        discountValue: tr.discountValue,
        label: tr.label,
        isMostPopular: tr.isMostPopular,
        available: true,
      })),
      combinable: values.combinable,
      styleOverrides: null,
    },
  }) : null;

  return (
    <Page title={qb.name} backAction={{ content: "Quantity Breaks", url: "/app/quantity-breaks" }}>
      <Layout>
        <Layout.Section>
          <QbForm submitLabel="Save changes" errors={errors} initialValues={initial} onValuesChange={setValues} />
        </Layout.Section>
        <Layout.Section variant="oneThird">
          {previewConfig && <PreviewPane type="qb" id={qb.id} config={previewConfig} />}
        </Layout.Section>
      </Layout>
    </Page>
  );
```

For the `new` route, use `id="new"`.

- [ ] **Step 6: Typecheck and run tests**

```bash
pnpm --filter admin typecheck && pnpm --filter admin test
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/app/components/BundleForm.tsx apps/admin/app/components/QbForm.tsx \
        apps/admin/app/routes/app.bundles.new.tsx apps/admin/app/routes/app.bundles.\$id.tsx \
        apps/admin/app/routes/app.quantity-breaks.new.tsx apps/admin/app/routes/app.quantity-breaks.\$id.tsx
git commit -m "feat(admin): two-column layout with live PreviewPane on bundle + qb edit pages"
```

---

## Group G — Build, deploy, manual gate

---

### Task 33: bundle-size CI gate

**Files:**
- Create: `extensions/theme-app-extension/scripts/check-bundle-size.sh`

- [ ] **Step 1: Create the script**

Create `extensions/theme-app-extension/scripts/check-bundle-size.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
JS="$(dirname "$0")/../assets/widget.js"
if [ ! -f "$JS" ]; then
  echo "widget.js not found at $JS — run pnpm build first" >&2
  exit 1
fi
SIZE=$(gzip -c "$JS" | wc -c | tr -d ' ')
LIMIT=30000
echo "widget.js gzipped size: $SIZE bytes (limit: $LIMIT)"
if [ "$SIZE" -gt "$LIMIT" ]; then
  echo "FAIL: bundle exceeds $LIMIT bytes gzipped" >&2
  exit 1
fi
echo "OK"
```

- [ ] **Step 2: chmod + run**

```bash
chmod +x extensions/theme-app-extension/scripts/check-bundle-size.sh
pnpm --filter theme-app-extension build
./extensions/theme-app-extension/scripts/check-bundle-size.sh
```

Expected: "OK".

- [ ] **Step 3: Add to extension package.json scripts**

Edit `extensions/theme-app-extension/package.json` `scripts` block:

```json
"scripts": {
  "build": "tsup",
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit",
  "check:size": "./scripts/check-bundle-size.sh"
}
```

- [ ] **Step 4: Commit**

```bash
git add extensions/theme-app-extension/scripts/check-bundle-size.sh extensions/theme-app-extension/package.json
git commit -m "chore(widget): bundle-size gate (30KB gzipped limit)"
```

---

### Task 34: Final build + deploy verification

**No new files; verify the world.**

- [ ] **Step 1: Full repo build**

```bash
pnpm --filter admin build
pnpm --filter theme-app-extension build
cd extensions/discount-function && cargo build --target=wasm32-unknown-unknown --release && cd -
```

Expected: all succeed.

- [ ] **Step 2: Full test pass**

```bash
pnpm --filter admin test
pnpm --filter theme-app-extension test
```

Expected: all green.

- [ ] **Step 3: Bundle size check**

```bash
pnpm --filter theme-app-extension check:size
```

Expected: "OK".

- [ ] **Step 4: Shopify deploy (manual — produces a deployment for the dev store)**

```bash
pnpm shopify app deploy --force
```

Expected: theme-app-extension and discount-function uploaded.

- [ ] **Step 5: Cloudflare Pages deploy**

```bash
pnpm --filter admin deploy
```

Expected: deployment URL printed.

- [ ] **Step 6: Apply D1 migration to prod**

```bash
pnpm --filter admin db:migrate:prod
```

Expected: "Migrations applied".

- [ ] **Step 7: Commit any cleanup**

(No code changes; this task is just running commands. If anything diverged, commit it.)

```bash
git status
# if clean: nothing to commit
```

---

### Task 35: Manual gate (must pass before declaring Phase 4 done)

Run through these on `deepseatools.myshopify.com` after deployment. If any step fails, file the issue and dispatch a fix subagent.

- [ ] 1. Theme editor: drop "Bundler — Bundle" App Block onto a PDP (Online Store → Customize → product template → Add section → Apps → Bundler).
- [ ] 2. Visit the PDP — the bundle widget renders within ~200ms after the page is interactive, no layout shift.
- [ ] 3. Click "Add bundle to cart" — modern theme cart drawer opens (Dawn 2.0+) OR `/cart` redirect happens.
- [ ] 4. At checkout, confirm the bundle discount is applied (re-verifies Phase 3).
- [ ] 5. Create a QB with 3 tiers; drop "Bundler — Quantity Break" App Block onto another PDP. Confirm tier selection works, "MOST POPULAR" badge displays, savings badge updates per tier.
- [ ] 6. Create a Mix & Match bundle: pick a collection, targetQty=3, 20% off. Visit a product in that collection. Confirm widget grid renders, picking 3 items enables the CTA, picking a 4th does nothing. Add — 3 line items end up in cart with `_pumper_bundle_id`, 20% off applied at checkout.
- [ ] 7. Live preview pane: edit a bundle, change `name`/`discountValue`. Within ~300ms the iframe widget reflects the change.
- [ ] 8. OOS gate: zero out a variant via Shopify admin, refresh PDP within 60s. Widget shows OOS row badge or hides bundle entirely (per spec).
- [ ] 9. Lighthouse on the PDP — Performance ≥ 90, CLS = 0.
- [ ] 10. Mobile (DevTools 320px) — all 3 widget types render without overflow, CTA tappable.

After all 10 pass, tag the commit:

```bash
git tag phase-4-complete
git push --tags
```

---

## Spec coverage check

Each spec section maps to one or more tasks above:

| Spec § | Subject | Tasks |
|---|---|---|
| §3 file layout | extension dir, admin routes | 9–11, 25, 26, 27, 30, 31 |
| §4 schema | mode/collectionId/targetQty | 1, 2, 3 |
| §5 storefront config payload | endpoint shape + KV cache | 23, 24, 25 |
| §6 lifecycle | mount, render, MutationObserver, CSS | 12–22 |
| §7 preview iframe | preview route + PreviewPane + form wiring | 29, 30, 31, 32 |
| §8 add-to-cart hybrid | `addToCart()` 800ms fallback | 16 |
| §9 analytics events | sendBeacon + /event endpoint | 15, 26 |
| §10 error/edge cases | OOS, retries, variant change | 18, 19, 20, 21 (renderers handle OOS rules; retry logic in 21) |
| §11 testing | unit + integration | every task has its own test |
| Mix & Match in Function | discount math + matching | 5 |
| Cache invalidation on collection edit | webhook | 27 |
| Bundle-size gate | CI check | 33 |
| Manual gate | end-to-end | 35 |

---

**Plan complete.**

