# Phase 5 — Cart Transform Function + Free Gift / BOGO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visually merge bundle cart lines into a single parent line, and let merchants attach a free gift / BOGO to each QB tier (gift adds a $0 line; BOGO has 3 modes including a "Nth unit free" math-only mode).

**Architecture:** New Rust `cart-transform-function/` extension targeting `cart.transform.run` with a `merge` operation grouped by `_pumper_bundle_id`. Existing Discount Function gains a `_pumper_gift_id` line attribute pass that applies 100% off, and a `nth_free` BOGO override of `compute_qb_tier_value`. Widget tags gift / BOGO add lines with both `_pumper_bundle_id` and `_pumper_gift_id`. No D1 migration; `QbTier` JSON shape extended with optional `freeGiftVariantId` and `bogo`.

**Tech Stack:** Rust + `shopify_function` 2.x for the new Function; existing TypeScript widget + Remix admin code for the rest. Vitest for admin/widget tests; cargo for Rust tests.

**Spec:** `docs/superpowers/specs/2026-05-07-phase-5-cart-transform-and-gifts-design.md`.

---

## Conventions

- Repo root: `/Users/sumit/Desktop/Shopify Apps/Bundler App`.
- Admin tests: `pnpm --filter admin test -- <pattern>`. Widget tests: `pnpm --filter widget-src test -- <pattern>`. Rust tests: `cd extensions/<crate> && cargo test --release`.
- Atomic commits per task; commit messages follow `feat(scope): subject` / `test(scope): subject` / `chore(scope): subject`.
- After Phase 4, the widget source lives in `apps/widget-src/src/` (NOT `extensions/theme-app-extension/`). Built `widget.js` is copied to `extensions/theme-app-extension/assets/` and `apps/admin/public/`.

---

## Group A — Schema types + validation (admin)

---

### Task 1: Extend QbTier type with `freeGiftVariantId` + `bogo`

**Files:**
- Modify: `apps/admin/drizzle/schema.ts`

- [ ] **Step 1: Update the `QbTier` type**

Open `apps/admin/drizzle/schema.ts`. Find the `QbTier` type. Replace with:

```ts
export type QbTier = {
  qty: number;
  discountType: "percentage" | "flat" | "fixed_per_unit";
  discountValue: number;
  label: string;
  isMostPopular: boolean;
  freeGiftVariantId?: string;
  bogo?: {
    mode: "add_same" | "add_different" | "nth_free";
    targetVariantId?: string;
    bonusQty: number;
  };
};
```

This replaces the previous `freeGiftVariantId?: string;` / `bogoTargetVariantId?: string;` fields with the new shape (`bogoTargetVariantId` becomes part of the `bogo` object).

- [ ] **Step 2: Run typecheck**

```bash
pnpm --filter admin typecheck
```

Expected: pass. (Existing rows in D1 with the old `bogoTargetVariantId` field are still valid JSON — they decode without the new fields and `bogo` defaults to `undefined`. Old rows just lose their previous BOGO setting on next save; that's acceptable since no production data exists yet.)

- [ ] **Step 3: Commit**

```bash
git add apps/admin/drizzle/schema.ts
git commit -m "feat(db): extend QbTier shape with freeGiftVariantId + bogo"
```

---

### Task 2: Validation rules for the new tier fields

**Files:**
- Modify: `apps/admin/app/lib/quantity-breaks/validate.ts`
- Test: `apps/admin/test/quantity-breaks-validate.test.ts`

- [ ] **Step 1: Read existing validate.ts**

Read `apps/admin/app/lib/quantity-breaks/validate.ts` end-to-end. Note the `validateQb` signature, the `QbInput` type, and how tier validation iterates.

- [ ] **Step 2: Add 6 failing tests**

Append to `apps/admin/test/quantity-breaks-validate.test.ts` (inside the existing `describe("validateQb", ...)` block, before the closing `});`):

```ts
  it("accepts a tier with a free gift variant", () => {
    const r = validateQb({
      ...VALID,
      tiers: [
        { ...VALID.tiers[0]!, freeGiftVariantId: "gid://shopify/ProductVariant/1" },
      ],
    });
    expect(r).toEqual({ valid: true });
  });

  it("accepts a tier with bogo add_same + targetVariantId + bonusQty", () => {
    const r = validateQb({
      ...VALID,
      tiers: [
        { ...VALID.tiers[0]!, bogo: { mode: "add_same", targetVariantId: "gid://shopify/ProductVariant/1", bonusQty: 1 } },
      ],
    });
    expect(r).toEqual({ valid: true });
  });

  it("accepts a tier with bogo nth_free where bonusQty < qty", () => {
    const r = validateQb({
      ...VALID,
      tiers: [
        { ...VALID.tiers[0]!, qty: 3, bogo: { mode: "nth_free", bonusQty: 1 } },
      ],
    });
    expect(r).toEqual({ valid: true });
  });

  it("rejects bogo add_same without a targetVariantId", () => {
    const r = validateQb({
      ...VALID,
      tiers: [
        { ...VALID.tiers[0]!, bogo: { mode: "add_same", bonusQty: 1 } },
      ],
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.tiers).toBeDefined();
  });

  it("rejects bogo nth_free with bonusQty >= qty", () => {
    const r = validateQb({
      ...VALID,
      tiers: [
        { ...VALID.tiers[0]!, qty: 2, bogo: { mode: "nth_free", bonusQty: 2 } },
      ],
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.tiers).toBeDefined();
  });

  it("rejects bogo with bonusQty < 1", () => {
    const r = validateQb({
      ...VALID,
      tiers: [
        { ...VALID.tiers[0]!, bogo: { mode: "add_same", targetVariantId: "gid://shopify/ProductVariant/1", bonusQty: 0 } },
      ],
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.tiers).toBeDefined();
  });
```

- [ ] **Step 3: Run tests, expect failure**

```bash
pnpm --filter admin test -- quantity-breaks-validate
```

Expected: at least the 6 new tests fail (validation hasn't been written yet).

- [ ] **Step 4: Implement validation**

Open `apps/admin/app/lib/quantity-breaks/validate.ts`. Find the per-tier loop. Add the new field checks immediately before the closing brace of the per-tier validation block:

```ts
    if (tier.freeGiftVariantId !== undefined && tier.freeGiftVariantId !== null) {
      if (typeof tier.freeGiftVariantId !== "string"
          || !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(tier.freeGiftVariantId)) {
        errors.tiers = `Tier ${i + 1}: free gift variant id must be a valid Shopify variant GID`;
        break;
      }
    }

    if (tier.bogo !== undefined && tier.bogo !== null) {
      const b = tier.bogo;
      if (!["add_same", "add_different", "nth_free"].includes(b.mode)) {
        errors.tiers = `Tier ${i + 1}: invalid BOGO mode`;
        break;
      }
      if (typeof b.bonusQty !== "number" || !Number.isInteger(b.bonusQty) || b.bonusQty < 1) {
        errors.tiers = `Tier ${i + 1}: BOGO bonus quantity must be an integer >= 1`;
        break;
      }
      if ((b.mode === "add_same" || b.mode === "add_different")) {
        if (!b.targetVariantId
            || !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(b.targetVariantId)) {
          errors.tiers = `Tier ${i + 1}: BOGO target variant id is required for ${b.mode}`;
          break;
        }
      }
      if (b.mode === "nth_free" && b.bonusQty >= tier.qty) {
        errors.tiers = `Tier ${i + 1}: BOGO bonus quantity must be less than tier qty for nth_free`;
        break;
      }
    }
```

If the existing `QbInput` type doesn't include the new fields, extend the per-tier shape inside that type to include `freeGiftVariantId?: string` and `bogo?: { mode: string; targetVariantId?: string; bonusQty: number }`.

- [ ] **Step 5: Run tests, expect pass**

```bash
pnpm --filter admin test -- quantity-breaks-validate
```

Expected: ALL tests pass (existing + 6 new).

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/lib/quantity-breaks/validate.ts apps/admin/test/quantity-breaks-validate.test.ts
git commit -m "feat(qb): validate freeGiftVariantId + bogo per tier"
```

---

## Group B — Discount Function changes (Rust)

---

### Task 3: Extend `Bundle`-side config types in Rust

**Files:**
- Modify: `extensions/discount-function/src/config.rs`

- [ ] **Step 1: Read existing `QbTier` struct**

Read `extensions/discount-function/src/config.rs` end-to-end.

- [ ] **Step 2: Add `BogoConfig` and extend `QbTier`**

Append to the file (after the existing `QbTier` struct):

```rust
#[derive(Deserialize, Debug, Clone)]
pub struct BogoConfig {
    pub mode: String,
    #[serde(rename = "targetVariantId", default)]
    pub target_variant_id: Option<String>,
    #[serde(rename = "bonusQty")]
    pub bonus_qty: u32,
}
```

Then update the `QbTier` struct to add two new fields just before the closing `}`:

```rust
    #[serde(rename = "freeGiftVariantId", default)]
    pub free_gift_variant_id: Option<String>,
    #[serde(default)]
    pub bogo: Option<BogoConfig>,
```

- [ ] **Step 3: Build to confirm**

```bash
cd extensions/discount-function && cargo build --target=wasm32-unknown-unknown --release
```

Expected: builds successfully.

- [ ] **Step 4: Commit**

```bash
git add extensions/discount-function/src/config.rs
git commit -m "feat(function): add freeGiftVariantId + BogoConfig to QbTier"
```

---

### Task 4: Add `_pumper_gift_id` line attribute query + `gift_attr` field

**Files:**
- Modify: `extensions/discount-function/src/run.graphql`
- Modify: `extensions/discount-function/src/matcher.rs`
- Modify: `extensions/discount-function/src/run.rs`
- Modify: `extensions/discount-function/tests/matcher_test.rs`

- [ ] **Step 1: Update run.graphql**

Open `extensions/discount-function/src/run.graphql`. Find the existing `attribute(key: "_pumper_bundle_id") { value }` line inside `cart.lines`. Add an aliased gift attribute query:

```graphql
      attribute(key: "_pumper_bundle_id") { value }
      giftAttr: attribute(key: "_pumper_gift_id") { value }
```

The aliased name keeps the generated Rust API distinct.

- [ ] **Step 2: Add `gift_attr` to `CartLine`**

Open `extensions/discount-function/src/matcher.rs`. Update the `CartLine` struct to add the field:

```rust
pub struct CartLine {
    pub id: String,
    pub product_id: String,
    pub variant_id: Option<String>,
    pub quantity: u32,
    pub bundle_attr: Option<String>,
    pub gift_attr: Option<String>,
}
```

- [ ] **Step 3: Populate `gift_attr` in run.rs cart-line conversion**

Open `extensions/discount-function/src/run.rs`. Find the `filter_map` that builds `lines: Vec<CartLine>`. After the existing `bundle_attr` line, add:

```rust
            let gift_attr = l.gift_attr().and_then(|a| a.value().map(|v| v.to_string()));
```

And include it in the returned `CartLine { ... }`:

```rust
                bundle_attr,
                gift_attr,
```

- [ ] **Step 4: Update matcher_test.rs fixtures**

Open `extensions/discount-function/tests/matcher_test.rs`. Find the `line` and `line_with_attr` helper functions. They construct `CartLine`. Add `gift_attr: None` to both helpers' literals.

```rust
fn line(id: &str, product: &str, variant: Option<&str>, qty: u32) -> CartLine {
    CartLine {
        id: id.into(),
        product_id: product.into(),
        variant_id: variant.map(String::from),
        quantity: qty,
        bundle_attr: None,
        gift_attr: None,
    }
}
```

Apply the same `gift_attr: None` to `line_with_attr`. (Both helpers are in the file from Phase 4; just add the missing field.)

- [ ] **Step 5: Build to confirm**

```bash
cd extensions/discount-function && cargo build --target=wasm32-unknown-unknown --release
```

Expected: builds successfully. If the codegen for `giftAttr` produces a different accessor name than `l.gift_attr()`, adjust the call accordingly (the alias name is camelCased to snake_case — should be `gift_attr` per `rename_all = "camelCase"` shopify_function macro).

- [ ] **Step 6: Run Rust tests**

```bash
cd extensions/discount-function && cargo test --release
```

Expected: all existing 24 tests pass.

- [ ] **Step 7: Commit**

```bash
git add extensions/discount-function/src/run.graphql extensions/discount-function/src/matcher.rs extensions/discount-function/src/run.rs extensions/discount-function/tests/matcher_test.rs
git commit -m "feat(function): query _pumper_gift_id + add gift_attr to CartLine"
```

---

### Task 5: Apply 100% off on gift lines + nth_free override

**Files:**
- Modify: `extensions/discount-function/src/run.rs`
- Modify: `extensions/discount-function/src/discount.rs`
- Modify: `extensions/discount-function/tests/discount_test.rs`

- [ ] **Step 1: Add 3 failing tests**

Open `extensions/discount-function/tests/discount_test.rs`. Read it to learn the test fixture pattern (it likely has a helper that calls `compute_qb_tier_value`).

Append:

```rust
#[test]
fn nth_free_overrides_tier_discount_to_one_third() {
    let tier = QbTier {
        qty: 3,
        discount_type: "percentage".into(),
        discount_value: 0.0,
        label: "".into(),
        is_most_popular: false,
        free_gift_variant_id: None,
        bogo: Some(BogoConfig {
            mode: "nth_free".into(),
            target_variant_id: None,
            bonus_qty: 1,
        }),
    };
    let value = compute_qb_tier_value(&tier, 100.0);
    match value {
        DiscountValue::Percentage(p) => assert!((p - (100.0_f64 / 3.0)).abs() < 0.001),
        _ => panic!("expected percentage"),
    }
}

#[test]
fn nth_free_with_bonus_qty_zero_falls_through() {
    let tier = QbTier {
        qty: 3,
        discount_type: "percentage".into(),
        discount_value: 25.0,
        label: "".into(),
        is_most_popular: false,
        free_gift_variant_id: None,
        bogo: Some(BogoConfig {
            mode: "nth_free".into(),
            target_variant_id: None,
            bonus_qty: 0,
        }),
    };
    let value = compute_qb_tier_value(&tier, 100.0);
    match value {
        DiscountValue::Percentage(p) => assert!((p - 25.0).abs() < 0.001),
        _ => panic!("expected percentage"),
    }
}

#[test]
fn add_same_bogo_does_not_override_tier_discount() {
    let tier = QbTier {
        qty: 3,
        discount_type: "percentage".into(),
        discount_value: 10.0,
        label: "".into(),
        is_most_popular: false,
        free_gift_variant_id: None,
        bogo: Some(BogoConfig {
            mode: "add_same".into(),
            target_variant_id: Some("gid://shopify/ProductVariant/1".into()),
            bonus_qty: 1,
        }),
    };
    let value = compute_qb_tier_value(&tier, 100.0);
    match value {
        DiscountValue::Percentage(p) => assert!((p - 10.0).abs() < 0.001),
        _ => panic!("expected percentage"),
    }
}
```

Add the imports at the top of the file: `use discount_function::config::BogoConfig;` (alongside existing `QbTier` import).

- [ ] **Step 2: Run tests, expect failure**

```bash
cd extensions/discount-function && cargo test --release nth_free
```

Expected: `nth_free_overrides_tier_discount_to_one_third` fails because compute returns the existing `discount_value` (0.0), not 33.33%.

- [ ] **Step 3: Update `compute_qb_tier_value`**

Open `extensions/discount-function/src/discount.rs`. Find `compute_qb_tier_value`. Add the bogo override at the very top of the function body (before the existing `match tier.discount_type.as_str()`):

```rust
pub fn compute_qb_tier_value(tier: &QbTier, amount_per_unit: f64) -> DiscountValue {
    if let Some(bogo) = &tier.bogo {
        if bogo.mode == "nth_free" && bogo.bonus_qty > 0 && bogo.bonus_qty < tier.qty {
            let pct = (bogo.bonus_qty as f64 / tier.qty as f64) * 100.0;
            return DiscountValue::Percentage(pct);
        }
    }
    // ... existing match block stays unchanged
```

- [ ] **Step 4: Add gift-line discount pass in run.rs**

Open `extensions/discount-function/src/run.rs`. Find where `discounts` vector is built (after the QB matching loop, before the `Ok(...)` return). Add a final loop over gift lines:

```rust
    // Free gift / BOGO add_* lines: 100% off any line tagged with _pumper_gift_id
    for line in &lines {
        if line.gift_attr.is_some() {
            discounts.push(build_discount(
                "Free gift",
                &[line.id.clone()],
                DiscountValue::Percentage(100.0),
            ));
        }
    }
```

Add a fourth test for the gift pass. Append to `tests/discount_test.rs`:

Hmm — the gift pass is in `run.rs`, not testable in isolation via `compute_qb_tier_value`. Skip a unit test for the gift pass; cover it manually on the dev store. Move on.

- [ ] **Step 5: Build + run all tests**

```bash
cd extensions/discount-function && cargo build --target=wasm32-unknown-unknown --release && cargo test --release
```

Expected: build succeeds, all tests pass (existing 24 + 3 new = 27).

- [ ] **Step 6: Commit**

```bash
git add extensions/discount-function/src/run.rs extensions/discount-function/src/discount.rs extensions/discount-function/tests/discount_test.rs
git commit -m "feat(function): apply 100% off on gift lines + nth_free tier override"
```

---

## Group C — Cart Transform Function (new Rust crate)

---

### Task 6: Scaffold cart-transform-function crate

**Files:**
- Create: `extensions/cart-transform-function/Cargo.toml`
- Create: `extensions/cart-transform-function/shopify.extension.toml`
- Create: `extensions/cart-transform-function/src/lib.rs`
- Create: `extensions/cart-transform-function/src/main.rs`

- [ ] **Step 1: Create Cargo.toml**

```toml
[package]
name = "cart-transform-function"
version = "1.0.0"
edition = "2021"

[lib]
path = "src/lib.rs"

[[bin]]
name = "cart-transform-function"
path = "src/main.rs"

[dependencies]
shopify_function = "2.1.0"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[profile.release]
lto = true
opt-level = 'z'
```

- [ ] **Step 2: Create shopify.extension.toml**

```toml
api_version = "2026-04"

[[extensions]]
name = "Bundler Cart Transform"
handle = "cart-transform-function"
type = "function"
description = "Merges bundle cart lines into a single visual parent line."

  [[extensions.targeting]]
  target = "cart.transform.run"
  input_query = "src/run.graphql"
  export = "run"

  [extensions.build]
  command = "cargo build --target=wasm32-unknown-unknown --release"
  path = "target/wasm32-unknown-unknown/release/cart-transform-function.wasm"
  watch = [ "src/**/*.rs" ]
```

(`uid` will be auto-added by Shopify CLI on first deploy.)

- [ ] **Step 3: Create src/lib.rs**

```rust
pub mod transform;
```

- [ ] **Step 4: Create src/main.rs**

```rust
use shopify_function::prelude::*;
use std::process;

pub mod run;
pub mod transform;

#[typegen("schema.graphql")]
pub mod schema {
    #[query("src/run.graphql")]
    pub mod run {}
}

fn main() {
    log!("Please invoke a named export.");
    process::abort();
}
```

- [ ] **Step 5: Verify scaffold compiles (will fail — missing run.rs / run.graphql / schema.graphql)**

```bash
cd extensions/cart-transform-function && cargo check 2>&1 | tail -10
```

Expected: errors about missing `run.rs` or `run.graphql`. That's fine; Tasks 7–9 fill them in.

- [ ] **Step 6: Commit**

```bash
git add extensions/cart-transform-function/Cargo.toml extensions/cart-transform-function/shopify.extension.toml extensions/cart-transform-function/src/lib.rs extensions/cart-transform-function/src/main.rs
git commit -m "chore(function): scaffold cart-transform-function crate"
```

---

### Task 7: Cart Transform — input GraphQL + schema.graphql

**Files:**
- Create: `extensions/cart-transform-function/src/run.graphql`
- Create: `extensions/cart-transform-function/schema.graphql`

- [ ] **Step 1: Get the Function API schema**

Run from the cart-transform-function directory:

```bash
cd extensions/cart-transform-function && pnpm shopify app function schema 2>&1 | tail -10
```

This pulls Shopify's schema for the `cart.transform.run` target into `schema.graphql`. If the command isn't available or fails, copy the schema from another cart-transform sample (Shopify provides one in their CLI generator). As a fallback, run `pnpm shopify app generate extension --type=cart_transform --name=tmp-cart-transform` in a scratch directory and copy `schema.graphql` from there.

- [ ] **Step 2: Create run.graphql**

```graphql
query Input {
  cart {
    lines {
      id
      quantity
      bundleAttr: attribute(key: "_pumper_bundle_id") { value }
      giftAttr: attribute(key: "_pumper_gift_id") { value }
      merchandise {
        __typename
        ... on ProductVariant {
          id
          title
          product { id title }
        }
      }
    }
  }
}
```

- [ ] **Step 3: Build to confirm GraphQL is accepted by Shopify's typegen**

```bash
cd extensions/cart-transform-function && cargo build --target=wasm32-unknown-unknown --release 2>&1 | tail -15
```

Expected: build still fails (no `run.rs` yet) but the GraphQL query passes typegen.

If typegen complains that `attribute(key: ...)` isn't on the cart line type, the `cart.transform.run` schema may differ from `purchase.product-discount.run`. Inspect the freshly-pulled `schema.graphql` for the actual cart line type and adjust the attribute fetch accordingly. Common alternative: lines have `attributes: [Attribute!]!` instead of `attribute(key:)`. If that's the case, change to:

```graphql
      attributes { key value }
```

…and the matcher logic in Task 8 reads from a list rather than two separate fields.

- [ ] **Step 4: Commit**

```bash
git add extensions/cart-transform-function/src/run.graphql extensions/cart-transform-function/schema.graphql
git commit -m "feat(cart-transform): input query + Shopify schema"
```

---

### Task 8: Cart Transform — `transform.rs` grouping logic + tests

**Files:**
- Create: `extensions/cart-transform-function/src/transform.rs`
- Create: `extensions/cart-transform-function/tests/transform_test.rs`

- [ ] **Step 1: Create the transform module skeleton**

Create `extensions/cart-transform-function/src/transform.rs`:

```rust
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub struct GroupedLine {
    pub line_id: String,
    pub quantity: i64,
    pub variant_id: String,
    pub product_title: String,
    pub is_gift: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MergeOp {
    pub bundle_id: String,
    pub parent_variant_id: String,
    pub parent_title: String,
    pub child_lines: Vec<(String, i64)>,
}

pub fn build_merge_ops(grouped: HashMap<String, Vec<GroupedLine>>) -> Vec<MergeOp> {
    let mut ops = Vec::new();
    for (bundle_id, lines) in grouped {
        if lines.len() < 2 {
            continue;
        }

        let titles: Vec<String> = lines
            .iter()
            .filter(|l| !l.is_gift)
            .map(|l| l.product_title.clone())
            .collect();
        let mut parent_title = format!("Bundle: {}", titles.join(" + "));
        if lines.iter().any(|l| l.is_gift) {
            parent_title.push_str(" + 🎁 Gift");
        }

        let parent_variant_id = lines
            .iter()
            .find(|l| !l.is_gift)
            .or_else(|| lines.first())
            .map(|l| l.variant_id.clone());

        let parent_variant_id = match parent_variant_id {
            Some(v) => v,
            None => continue,
        };

        ops.push(MergeOp {
            bundle_id,
            parent_variant_id,
            parent_title,
            child_lines: lines.iter().map(|l| (l.line_id.clone(), l.quantity)).collect(),
        });
    }
    ops
}

pub fn group_lines<I>(lines: I) -> HashMap<String, Vec<GroupedLine>>
where
    I: IntoIterator<Item = (Option<String>, GroupedLine)>,
{
    let mut groups: HashMap<String, Vec<GroupedLine>> = HashMap::new();
    for (bundle_id_opt, line) in lines {
        if let Some(bundle_id) = bundle_id_opt {
            groups.entry(bundle_id).or_default().push(line);
        }
    }
    groups
}
```

- [ ] **Step 2: Add unit tests**

Create `extensions/cart-transform-function/tests/transform_test.rs`:

```rust
use cart_transform_function::transform::{build_merge_ops, group_lines, GroupedLine};

fn line(id: &str, qty: i64, variant: &str, product: &str, gift: bool) -> GroupedLine {
    GroupedLine {
        line_id: id.into(),
        quantity: qty,
        variant_id: variant.into(),
        product_title: product.into(),
        is_gift: gift,
    }
}

#[test]
fn empty_cart_emits_no_ops() {
    let groups = group_lines(std::iter::empty());
    let ops = build_merge_ops(groups);
    assert!(ops.is_empty());
}

#[test]
fn single_line_group_is_skipped() {
    let groups = group_lines(vec![
        (Some("b1".into()), line("L1", 1, "V1", "Snowboard", false)),
    ]);
    let ops = build_merge_ops(groups);
    assert!(ops.is_empty());
}

#[test]
fn two_line_group_merges_into_one_op() {
    let groups = group_lines(vec![
        (Some("b1".into()), line("L1", 1, "V1", "Snowboard", false)),
        (Some("b1".into()), line("L2", 1, "V2", "Bindings", false)),
    ]);
    let ops = build_merge_ops(groups);
    assert_eq!(ops.len(), 1);
    assert_eq!(ops[0].bundle_id, "b1");
    assert_eq!(ops[0].parent_title, "Bundle: Snowboard + Bindings");
    assert_eq!(ops[0].child_lines.len(), 2);
}

#[test]
fn three_line_group_with_gift_appends_gift_suffix() {
    let groups = group_lines(vec![
        (Some("b1".into()), line("L1", 3, "V1", "Snowboard", false)),
        (Some("b1".into()), line("L2", 1, "V2", "Bindings", false)),
        (Some("b1".into()), line("L3", 1, "V_GIFT", "Hat", true)),
    ]);
    let ops = build_merge_ops(groups);
    assert_eq!(ops.len(), 1);
    assert_eq!(ops[0].parent_title, "Bundle: Snowboard + Bindings + 🎁 Gift");
    assert_eq!(ops[0].child_lines.len(), 3);
    // Parent variant should be the first non-gift variant
    assert_eq!(ops[0].parent_variant_id, "V1");
}

#[test]
fn two_parallel_groups_emit_two_ops() {
    let groups = group_lines(vec![
        (Some("b1".into()), line("L1", 1, "V1", "A", false)),
        (Some("b1".into()), line("L2", 1, "V2", "B", false)),
        (Some("b2".into()), line("L3", 1, "V3", "C", false)),
        (Some("b2".into()), line("L4", 1, "V4", "D", false)),
    ]);
    let ops = build_merge_ops(groups);
    assert_eq!(ops.len(), 2);
    let mut bundles: Vec<&str> = ops.iter().map(|o| o.bundle_id.as_str()).collect();
    bundles.sort();
    assert_eq!(bundles, vec!["b1", "b2"]);
}

#[test]
fn lines_without_bundle_id_are_excluded() {
    let groups = group_lines(vec![
        (Some("b1".into()), line("L1", 1, "V1", "A", false)),
        (Some("b1".into()), line("L2", 1, "V2", "B", false)),
        (None, line("L3", 1, "V3", "Loose", false)),
    ]);
    let ops = build_merge_ops(groups);
    assert_eq!(ops.len(), 1);
    assert_eq!(ops[0].child_lines.len(), 2);
}
```

- [ ] **Step 3: Run tests, expect pass**

```bash
cd extensions/cart-transform-function && cargo test --release
```

Expected: 6 tests pass.

- [ ] **Step 4: Commit**

```bash
git add extensions/cart-transform-function/src/transform.rs extensions/cart-transform-function/tests/transform_test.rs
git commit -m "feat(cart-transform): grouping + merge-op builder with 6 unit tests"
```

---

### Task 9: Cart Transform — wire `run.rs` to the Shopify Function entry

**Files:**
- Create: `extensions/cart-transform-function/src/run.rs`

- [ ] **Step 1: Create run.rs**

```rust
use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;
use crate::transform::{self, GroupedLine};

#[shopify_function]
fn run(input: schema::run::Input) -> Result<schema::FunctionRunResult> {
    use schema::run::input::cart::lines::Merchandise;

    let pairs: Vec<(Option<String>, GroupedLine)> = input
        .cart()
        .lines()
        .iter()
        .filter_map(|line| {
            let variant = match line.merchandise() {
                Merchandise::ProductVariant(pv) => pv,
                _ => return None,
            };
            let bundle_id = line.bundle_attr().and_then(|a| a.value().map(String::from));
            let is_gift = line.gift_attr().and_then(|a| a.value()).is_some();
            Some((
                bundle_id,
                GroupedLine {
                    line_id: line.id().to_string(),
                    quantity: *line.quantity(),
                    variant_id: variant.id().to_string(),
                    product_title: variant.product().title().to_string(),
                    is_gift,
                },
            ))
        })
        .collect();

    let groups = transform::group_lines(pairs);
    let ops = transform::build_merge_ops(groups);

    let operations: Vec<schema::Operation> = ops
        .into_iter()
        .map(|op| schema::Operation::Merge(schema::MergeOperation {
            cart_lines: op.child_lines.into_iter().map(|(id, qty)| schema::CartLineInput {
                cart_line_id: id,
                quantity: qty,
            }).collect(),
            parent_variant_id: op.parent_variant_id,
            title: Some(op.parent_title),
            image: None,
            attributes: None,
            price: None,
        }))
        .collect();

    Ok(schema::FunctionRunResult { operations })
}
```

NOTE: the exact field names on `MergeOperation` (e.g., `image`, `attributes`, `price`, `parent_variant_id`) depend on the Shopify schema for `cart.transform.run`. After you run `cargo build` (next step), if the compiler complains about unknown / missing fields, inspect the generated schema (in the Cargo target dir or in `schema.graphql`) and adjust field names accordingly. Common variations:

- `parent_variant_id` may be a nested `merchandise: ProductVariantInput { variant_id: String }` shape.
- `image` may not exist; remove if so.
- `attributes` may need to be `vec![]` instead of `None` if it's a non-nullable list.

Adapt without changing the high-level logic.

- [ ] **Step 2: Build the Function**

```bash
cd extensions/cart-transform-function && cargo build --target=wasm32-unknown-unknown --release 2>&1 | tail -20
```

Expected: builds successfully. Fix any signature mismatches per the note above.

- [ ] **Step 3: Run all Rust tests**

```bash
cd extensions/cart-transform-function && cargo test --release
```

Expected: 6 transform tests pass.

- [ ] **Step 4: Commit**

```bash
git add extensions/cart-transform-function/src/run.rs
git commit -m "feat(cart-transform): wire run() to Shopify Function entry"
```

---

## Group D — Metafield sync + storefront config

---

### Task 10: Metafield sync includes new tier fields

**Files:**
- Modify: `apps/admin/app/lib/metafield-sync.ts`
- Modify: `apps/admin/test/metafield-sync.test.ts`

- [ ] **Step 1: Read existing metafield-sync.ts**

Read `apps/admin/app/lib/metafield-sync.ts`. Find the `SyncConfig` interface's `quantityBreaks[].tiers[]` shape.

- [ ] **Step 2: Extend `SyncConfig` tier shape**

In the `SyncConfig` interface, find the inner `tiers` type and replace its inline shape with:

```ts
    tiers: Array<{
      qty: number;
      discountType: string;
      discountValue: number;
      label: string;
      isMostPopular: boolean;
      freeGiftVariantId?: string | null;
      bogo?: {
        mode: string;
        targetVariantId?: string | null;
        bonusQty: number;
      } | null;
    }>;
```

Adjust the existing free-gift / bogo references in the file to use the new shape if needed (the existing fields in the interface — `freeGiftVariantId`, `bogoTargetVariantId` — should be removed from any tier shape that defined them).

In `syncShopConfig`, the per-tier mapping inside `quantityBreaks: qbs.map(...)` should pass through `freeGiftVariantId` and `bogo` directly:

```ts
    tiers: q.tiers.map((tr) => ({
      qty: tr.qty,
      discountType: tr.discountType,
      discountValue: tr.discountValue,
      label: tr.label,
      isMostPopular: tr.isMostPopular,
      freeGiftVariantId: tr.freeGiftVariantId ?? null,
      bogo: tr.bogo ?? null,
    })),
```

- [ ] **Step 3: Add a failing test**

Append to `apps/admin/test/metafield-sync.test.ts` (inside the existing `describe(...)` block):

```ts
  it("includes freeGiftVariantId + bogo in synced QB tier metafield", async () => {
    const { db, admin, captured } = setup();
    db.insert(schema.shops).values({ id: SHOP, scopes: "", installedAt: new Date(), shopifyShopGid: "gid://shopify/Shop/1" }).run();
    db.insert(schema.quantityBreaks).values({
      id: "q1", shopId: SHOP, name: "Q",
      status: "active",
      productId: "gid://shopify/Product/1",
      collectionId: null,
      tiers: [
        {
          qty: 3, discountType: "percentage", discountValue: 10,
          label: "10% off", isMostPopular: true,
          freeGiftVariantId: "gid://shopify/ProductVariant/9",
          bogo: { mode: "add_same", targetVariantId: "gid://shopify/ProductVariant/8", bonusQty: 1 },
        },
      ],
      combinable: false,
      styleOverrides: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).run();

    await syncShopConfig(db, admin, SHOP);

    const json = JSON.parse(captured.metafields[0]!.value);
    const tier = json.quantityBreaks[0].tiers[0];
    expect(tier.freeGiftVariantId).toBe("gid://shopify/ProductVariant/9");
    expect(tier.bogo.mode).toBe("add_same");
    expect(tier.bogo.targetVariantId).toBe("gid://shopify/ProductVariant/8");
    expect(tier.bogo.bonusQty).toBe(1);
  });
```

(Adapt `setup`, `SHOP`, `captured` to whatever helpers exist in the file — read it first.)

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm --filter admin test -- metafield-sync
```

Expected: all metafield-sync tests pass (existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/lib/metafield-sync.ts apps/admin/test/metafield-sync.test.ts
git commit -m "feat(metafield-sync): include freeGiftVariantId + bogo per tier"
```

---

### Task 11: `fetchVariantDetails` helper

**Files:**
- Modify: `apps/admin/app/lib/shopify-product-fetch.ts`
- Modify: `apps/admin/test/shopify-product-fetch.test.ts`

- [ ] **Step 1: Add a failing test**

Append to `apps/admin/test/shopify-product-fetch.test.ts`:

```ts
const variantNodesResponse = {
  data: {
    nodes: [
      {
        __typename: "ProductVariant",
        id: "gid://shopify/ProductVariant/11",
        title: "Default Title",
        image: { url: "https://cdn.example.com/v.jpg" },
        product: { id: "gid://shopify/Product/1", title: "Snowboard" },
      },
    ],
  },
};

describe("fetchVariantDetails", () => {
  it("returns title + image + product title for each requested variant", async () => {
    const admin = mockAdmin(variantNodesResponse);
    const out = await fetchVariantDetails(admin, ["gid://shopify/ProductVariant/11"]);
    expect(out["gid://shopify/ProductVariant/11"]?.variantTitle).toBe("Default Title");
    expect(out["gid://shopify/ProductVariant/11"]?.productTitle).toBe("Snowboard");
    expect(out["gid://shopify/ProductVariant/11"]?.image).toBe("https://cdn.example.com/v.jpg");
  });

  it("returns empty object when variantIds is empty", async () => {
    const admin = mockAdmin(variantNodesResponse);
    const out = await fetchVariantDetails(admin, []);
    expect(out).toEqual({});
    expect(admin.graphql).not.toHaveBeenCalled();
  });
});
```

Add the import at the top of the test file: `import { fetchVariantDetails } from "../app/lib/shopify-product-fetch";`

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm --filter admin test -- shopify-product-fetch
```

Expected: import error.

- [ ] **Step 3: Implement `fetchVariantDetails`**

Append to `apps/admin/app/lib/shopify-product-fetch.ts`:

```ts
export type VariantDetail = {
  variantId: string;
  variantTitle: string;
  productTitle: string;
  image: string | null;
};

export async function fetchVariantDetails(
  admin: AdminGraphqlClient,
  variantIds: string[],
): Promise<Record<string, VariantDetail>> {
  if (variantIds.length === 0) return {};
  const res = await admin.graphql(
    `query Variants($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProductVariant {
          __typename
          id
          title
          image { url }
          product { id title }
        }
      }
    }`,
    { variables: { ids: variantIds } },
  );
  const data = (await res.json()) as {
    data: {
      nodes: Array<
        | {
            __typename: "ProductVariant";
            id: string;
            title: string;
            image: { url: string } | null;
            product: { id: string; title: string };
          }
        | null
      >;
    };
  };
  const out: Record<string, VariantDetail> = {};
  for (const node of data.data.nodes) {
    if (!node || node.__typename !== "ProductVariant") continue;
    out[node.id] = {
      variantId: node.id,
      variantTitle: node.title,
      productTitle: node.product.title,
      image: node.image?.url ?? null,
    };
  }
  return out;
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm --filter admin test -- shopify-product-fetch
```

Expected: all tests pass (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/lib/shopify-product-fetch.ts apps/admin/test/shopify-product-fetch.test.ts
git commit -m "feat(admin): fetchVariantDetails helper for tier gift/BOGO chips"
```

---

### Task 12: Storefront config payload enriches tier with availability

**Files:**
- Modify: `apps/admin/app/lib/storefront-config.ts`
- Modify: `apps/admin/test/storefront-config.test.ts`

- [ ] **Step 1: Read existing storefront-config.ts**

Find the `qbs.map(...)` block where tiers get mapped. Currently each tier gets `{ qty, discountType, discountValue, label, isMostPopular, available }`.

- [ ] **Step 2: Add a failing test**

Append to `apps/admin/test/storefront-config.test.ts`:

```ts
  it("enriches QB tier with freeGiftAvailable + bogo.targetAvailable", async () => {
    db.insert(schema.shops).values({ id: SHOP, scopes: "", installedAt: new Date() }).run();
    db.insert(schema.shopSettings).values({ shopId: SHOP }).run();
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
      createdAt: new Date(), updatedAt: new Date(),
    }).run();

    // First call: fetchProductDetails for QB main product (gid://shopify/Product/1)
    // Second call: fetchVariantDetails for [gift variant 9, bogo target 8]
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
          { __typename: "ProductVariant", id: "gid://shopify/ProductVariant/9", title: "Hat", image: null, product: { id: "p9", title: "Hat" }, availableForSale: true },
          { __typename: "ProductVariant", id: "gid://shopify/ProductVariant/8", title: "Tee", image: null, product: { id: "p8", title: "Tee" }, availableForSale: false },
        ]},
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const admin = { graphql: adminGraphql };

    const cfg = await buildStorefrontConfig(db, admin, SHOP);
    const tier = cfg.quantityBreaks[0]!.tiers[0]!;
    expect(tier.freeGiftAvailable).toBe(true);
    expect(tier.bogo!.targetAvailable).toBe(false);
  });
```

- [ ] **Step 3: Run tests, expect failure**

```bash
pnpm --filter admin test -- storefront-config
```

Expected: failures.

- [ ] **Step 4: Update storefront-config.ts**

Open `apps/admin/app/lib/storefront-config.ts`. Add after the existing `productMap` collection step:

```ts
  // Collect all gift / BOGO target variant ids referenced by any QB tier
  const variantIds = new Set<string>();
  for (const q of qbs) {
    for (const tr of q.tiers as Array<{ freeGiftVariantId?: string | null; bogo?: { targetVariantId?: string | null } | null }>) {
      if (tr.freeGiftVariantId) variantIds.add(tr.freeGiftVariantId);
      if (tr.bogo?.targetVariantId) variantIds.add(tr.bogo.targetVariantId);
    }
  }

  const variantAvailability: Record<string, boolean> = {};
  if (variantIds.size > 0) {
    // Fetch availability via a dedicated GraphQL query (variants need availableForSale, not just titles)
    const res = await admin.graphql(
      `query VariantsAvailable($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            __typename
            id
            availableForSale
          }
        }
      }`,
      { variables: { ids: [...variantIds] } },
    );
    const data = (await res.json()) as { data: { nodes: Array<{ __typename: string; id: string; availableForSale: boolean } | null> } };
    for (const node of data.data.nodes) {
      if (node && node.__typename === "ProductVariant") {
        variantAvailability[node.id] = node.availableForSale;
      }
    }
  }
```

Then update the per-tier mapping in `buildQb` to include the new fields:

```ts
    const tiers = q.tiers.map((tr) => ({
      qty: tr.qty,
      discountType: tr.discountType,
      discountValue: tr.discountValue,
      label: tr.label,
      isMostPopular: tr.isMostPopular,
      available: variants.some((v) => v.available),
      freeGiftVariantId: tr.freeGiftVariantId ?? null,
      freeGiftAvailable: tr.freeGiftVariantId ? (variantAvailability[tr.freeGiftVariantId] ?? false) : null,
      bogo: tr.bogo ? {
        mode: tr.bogo.mode,
        targetVariantId: tr.bogo.targetVariantId ?? null,
        bonusQty: tr.bogo.bonusQty,
        targetAvailable: tr.bogo.targetVariantId ? (variantAvailability[tr.bogo.targetVariantId] ?? false) : null,
      } : null,
    }));
```

- [ ] **Step 5: Run tests, expect pass**

```bash
pnpm --filter admin test -- storefront-config
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/lib/storefront-config.ts apps/admin/test/storefront-config.test.ts
git commit -m "feat(admin): storefront config enriches tier with freeGiftAvailable + bogo.targetAvailable"
```

---

## Group E — Widget changes

---

### Task 13: Widget — extend QbTier type + i18n strings

**Files:**
- Modify: `apps/widget-src/src/types.ts`
- Modify: `apps/widget-src/src/i18n.ts`

- [ ] **Step 1: Update QbTier type**

Open `apps/widget-src/src/types.ts`. Find `QbTier`. Replace with:

```ts
export type QbTier = {
  qty: number;
  discountType: DiscountType;
  discountValue: number;
  label: string;
  isMostPopular: boolean;
  available: boolean;
  freeGiftVariantId?: string | null;
  freeGiftVariantTitle?: string | null;
  freeGiftAvailable?: boolean | null;
  bogo?: {
    mode: "add_same" | "add_different" | "nth_free";
    targetVariantId?: string | null;
    bonusQty: number;
    targetVariantTitle?: string | null;
    targetAvailable?: boolean | null;
  } | null;
};
```

- [ ] **Step 2: Add i18n strings**

Open `apps/widget-src/src/i18n.ts`. Append to the `EN` map (before the closing `};`):

```ts
  "qb.giftBadge": "🎁 + Free {variantTitle}",
  "qb.giftBadgeUnavailable": "🎁 Free gift unavailable — out of stock",
  "qb.bogoSameOne": "🎁 + 1 free",
  "qb.bogoSameMany": "🎁 + {n} free",
  "qb.bogoDifferent": "🎁 + Free {variantTitle}",
  "qb.bogoNthFree": "🎁 Buy {qty}, pay for {paidQty}",
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter widget-src typecheck
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/widget-src/src/types.ts apps/widget-src/src/i18n.ts
git commit -m "feat(widget): extend QbTier types + add gift/bogo i18n strings"
```

---

### Task 14: Widget — extend addToCart for multi-line + gift tagging

**Files:**
- Modify: `apps/widget-src/src/add-to-cart.ts`
- Modify: `apps/widget-src/src/add-to-cart.test.ts`

- [ ] **Step 1: Add 2 failing tests**

Append to `apps/widget-src/src/add-to-cart.test.ts`:

```ts
  it("posts a multi-line cart-add when given multiple CartLineInputs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })));
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
    await addToCart("b1", [
      { variantId: "v1", qty: 2, bundleId: "b1" },
      { variantId: "v2", qty: 1, bundleId: "b1", giftBundleId: "b1" },
    ], { timeoutMs: 10 });
    const f = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } });
    const init = f.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.items.length).toBe(2);
    expect(body.items[0].properties._pumper_bundle_id).toBe("b1");
    expect(body.items[0].properties._pumper_gift_id).toBeUndefined();
    expect(body.items[1].properties._pumper_bundle_id).toBe("b1");
    expect(body.items[1].properties._pumper_gift_id).toBe("b1");
  });

  it("each line's qty is preserved in the cart-add request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })));
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
    await addToCart("b1", [
      { variantId: "v1", qty: 3, bundleId: "b1" },
      { variantId: "v2", qty: 2, bundleId: "b1", giftBundleId: "b1" },
    ], { timeoutMs: 10 });
    const f = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } });
    const init = f.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.items[0].quantity).toBe(3);
    expect(body.items[1].quantity).toBe(2);
  });
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm --filter widget-src test -- add-to-cart
```

Expected: TypeScript error or test failure (the existing `addToCart` accepts `CartLine[]` with different shape).

- [ ] **Step 3: Update add-to-cart.ts**

Read `apps/widget-src/src/add-to-cart.ts`. Replace the `CartLine` import and `addToCart` body. Final shape:

```ts
export type CartLineInput = {
  variantId: string;
  qty: number;
  bundleId?: string;
  giftBundleId?: string;
};

export type AddResult = { ok: true } | { ok: false; error: string };

export async function addToCart(
  bundleId: string,
  lines: CartLineInput[],
  opts: { timeoutMs?: number } = {},
): Promise<AddResult> {
  if (typeof window !== "undefined" && window._pumperPreview) {
    return { ok: true };
  }

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
        items: lines.map((l) => {
          const properties: Record<string, string> = {};
          if (l.bundleId) properties._pumper_bundle_id = l.bundleId;
          if (l.giftBundleId) properties._pumper_gift_id = l.giftBundleId;
          return {
            id: l.variantId,
            quantity: l.qty,
            properties,
          };
        }),
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

  const drawerOpened = await drawerWillOpen;
  document.dispatchEvent(new CustomEvent("cart:refresh"));
  document.dispatchEvent(new CustomEvent("cart:update"));
  if (!drawerOpened) {
    window.location.href = "/cart";
  }
  return { ok: true };
}
```

- [ ] **Step 4: Update existing tests' shape**

Open `apps/widget-src/src/add-to-cart.test.ts`. Find the existing test that calls `addToCart("b1", [{ variantId: "...", qty: 1 }])`. Update each line to include `bundleId: "b1"`:

```ts
await addToCart("b1", [{ variantId: "v1", qty: 1, bundleId: "b1" }], { timeoutMs: 10 });
```

Same for any other existing call sites in the test file. The test that asserts `_pumper_bundle_id` is `"b1"` will still pass.

- [ ] **Step 5: Update existing widget callers**

Open `apps/widget-src/src/render-bundle.ts`, `apps/widget-src/src/render-mix-match.ts`, `apps/widget-src/src/render-qb.ts`. Find their `addToCart(...)` invocations. Add `bundleId: <bundleId>` to each line in the `lines` array. Example for `render-bundle.ts`:

```ts
await addToCart(bundle.id, bundle.products
  .filter((p) => p.variantId)
  .map((p) => ({ variantId: p.variantId!, qty: p.qty, bundleId: bundle.id }))
);
```

`render-qb.ts` and `render-mix-match.ts` get the same `bundleId: <id>` field added to each CartLineInput. The render-qb.ts changes will be expanded further in Task 15.

- [ ] **Step 6: Run all widget tests**

```bash
pnpm --filter widget-src test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/widget-src/src/add-to-cart.ts apps/widget-src/src/add-to-cart.test.ts apps/widget-src/src/render-bundle.ts apps/widget-src/src/render-mix-match.ts apps/widget-src/src/render-qb.ts
git commit -m "feat(widget): addToCart accepts CartLineInput with optional bundleId+giftBundleId"
```

---

### Task 15: Widget — render gift/BOGO badges + multi-line click in render-qb

**Files:**
- Modify: `apps/widget-src/src/render-qb.ts`
- Modify: `apps/widget-src/src/render-qb.test.ts`

- [ ] **Step 1: Add 4 failing tests**

Append to `apps/widget-src/src/render-qb.test.ts` (inside the existing describe block):

```ts
  it("renders gift badge when freeGiftVariantId is set + available", () => {
    const q: QbConfig = { ...QB, tiers: [
      QB.tiers[0]!,
      { ...QB.tiers[1]!, freeGiftVariantId: "v9", freeGiftVariantTitle: "Hat", freeGiftAvailable: true },
      QB.tiers[2]!,
    ]};
    renderQb(mount, q, CONFIG);
    const tierRow = mount.querySelectorAll(".pumper-qb-tier")[1] as HTMLElement;
    expect(tierRow.textContent ?? "").toMatch(/Free Hat/);
  });

  it("renders bogo nth_free badge with paidQty hint", () => {
    const q: QbConfig = { ...QB, tiers: [
      QB.tiers[0]!,
      { ...QB.tiers[1]!, qty: 3, bogo: { mode: "nth_free", bonusQty: 1 } as const },
      QB.tiers[2]!,
    ]};
    renderQb(mount, q, CONFIG);
    const tierRow = mount.querySelectorAll(".pumper-qb-tier")[1] as HTMLElement;
    expect(tierRow.textContent ?? "").toMatch(/Buy 3, pay for 2/);
  });

  it("stacks gift + bogo badges when both set on a tier", () => {
    const q: QbConfig = { ...QB, tiers: [
      QB.tiers[0]!,
      {
        ...QB.tiers[1]!,
        freeGiftVariantId: "v9", freeGiftVariantTitle: "Hat", freeGiftAvailable: true,
        bogo: { mode: "add_same", targetVariantId: "v8", bonusQty: 1, targetAvailable: true } as const,
      },
      QB.tiers[2]!,
    ]};
    renderQb(mount, q, CONFIG);
    const badges = mount.querySelectorAll(".pumper-qb-gift-badge");
    expect(badges.length).toBeGreaterThanOrEqual(2);
  });

  it("shows muted unavailable badge when gift is OOS", () => {
    const q: QbConfig = { ...QB, tiers: [
      QB.tiers[0]!,
      { ...QB.tiers[1]!, freeGiftVariantId: "v9", freeGiftVariantTitle: "Hat", freeGiftAvailable: false },
      QB.tiers[2]!,
    ]};
    renderQb(mount, q, CONFIG);
    const tierRow = mount.querySelectorAll(".pumper-qb-tier")[1] as HTMLElement;
    expect(tierRow.querySelector(".pumper-qb-gift-badge--unavailable")).not.toBeNull();
  });
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm --filter widget-src test -- render-qb
```

Expected: 4 new tests fail.

- [ ] **Step 3: Update render-qb.ts to render badges + multi-line click**

Open `apps/widget-src/src/render-qb.ts`. Find the `renderRows` function that builds the tier markup HTML. Inside the per-tier template literal, append a `giftBadgesHtml` snippet built from a small helper:

Add a helper function near the top of the file (after imports):

```ts
function renderGiftBadges(tier: QbTier): string {
  const badges: string[] = [];

  if (tier.freeGiftVariantId) {
    if (tier.freeGiftAvailable === false) {
      badges.push(`<div class="pumper-qb-gift-badge pumper-qb-gift-badge--unavailable">${escapeHtml(t("qb.giftBadgeUnavailable"))}</div>`);
    } else {
      badges.push(`<div class="pumper-qb-gift-badge">${escapeHtml(t("qb.giftBadge", { variantTitle: tier.freeGiftVariantTitle ?? "gift" }))}</div>`);
    }
  }

  if (tier.bogo) {
    const b = tier.bogo;
    if (b.mode === "nth_free") {
      const paidQty = Math.max(0, tier.qty - b.bonusQty);
      badges.push(`<div class="pumper-qb-gift-badge">${escapeHtml(t("qb.bogoNthFree", { qty: tier.qty, paidQty }))}</div>`);
    } else if (b.mode === "add_same") {
      if (b.targetAvailable === false) {
        badges.push(`<div class="pumper-qb-gift-badge pumper-qb-gift-badge--unavailable">${escapeHtml(t("qb.giftBadgeUnavailable"))}</div>`);
      } else {
        const text = b.bonusQty === 1
          ? t("qb.bogoSameOne")
          : t("qb.bogoSameMany", { n: b.bonusQty });
        badges.push(`<div class="pumper-qb-gift-badge">${escapeHtml(text)}</div>`);
      }
    } else if (b.mode === "add_different") {
      if (b.targetAvailable === false) {
        badges.push(`<div class="pumper-qb-gift-badge pumper-qb-gift-badge--unavailable">${escapeHtml(t("qb.giftBadgeUnavailable"))}</div>`);
      } else {
        badges.push(`<div class="pumper-qb-gift-badge">${escapeHtml(t("qb.bogoDifferent", { variantTitle: b.targetVariantTitle ?? "gift" }))}</div>`);
      }
    }
  }

  return badges.join("");
}
```

In the existing tier-row template (`renderRows`), add the badges at the end of the row content (right before closing `</div>`):

```ts
        ${savingsBadge}
        ${renderGiftBadges(tr)}
      </div>
    `;
```

In the click handler that calls `addToCart`, replace the existing single-line array with a multi-line builder:

```ts
      cta.addEventListener("click", async () => {
        const tr = qb.tiers[selectedIndex]!;
        cta.disabled = true;

        const lines: CartLineInput[] = [
          { variantId: variant.variantId, qty: tr.qty, bundleId: qb.id },
        ];

        if (tr.freeGiftVariantId && tr.freeGiftAvailable !== false) {
          lines.push({
            variantId: tr.freeGiftVariantId,
            qty: 1,
            bundleId: qb.id,
            giftBundleId: qb.id,
          });
        }

        if (tr.bogo
            && (tr.bogo.mode === "add_same" || tr.bogo.mode === "add_different")
            && tr.bogo.targetVariantId
            && tr.bogo.targetAvailable !== false) {
          lines.push({
            variantId: tr.bogo.targetVariantId,
            qty: tr.bogo.bonusQty,
            bundleId: qb.id,
            giftBundleId: qb.id,
          });
        }
        // bogo nth_free: no extra line; Discount Function handles the math.

        const result = await addToCart(qb.id, lines);
        if (!result.ok) {
          cta.disabled = false;
          cta.textContent = t("addToCart.error");
        } else {
          const unitCents = tierUnitCents(tr, variant.priceCents);
          emit("add_to_cart", { widgetType: "qb", widgetId: qb.id, valueCents: unitCents * tr.qty });
        }
      });
```

Add `import type { CartLineInput } from "./add-to-cart";` at the top of the file (alongside the existing `addToCart` import).

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm --filter widget-src test -- render-qb
```

Expected: all render-qb tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/widget-src/src/render-qb.ts apps/widget-src/src/render-qb.test.ts
git commit -m "feat(widget): render gift/BOGO badges + multi-line click in render-qb"
```

---

### Task 16: Widget — CSS for gift badges

**Files:**
- Modify: `extensions/theme-app-extension/assets/widget.css`

- [ ] **Step 1: Append gift badge styles**

Open `extensions/theme-app-extension/assets/widget.css`. Append:

```css
/* Gift / BOGO badge inside QB tier rows */
.pumper-qb-gift-badge {
  display: inline-block;
  margin-top: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #fff7e6;
  color: #7c3a00;
  font-size: 11px;
  font-weight: 600;
}
.pumper-qb-gift-badge--unavailable {
  background: #f0f0f0;
  color: #888;
  font-weight: 400;
  font-style: italic;
}
.pumper-qb-tier .pumper-qb-gift-badge {
  align-self: flex-start;
}
```

- [ ] **Step 2: Rebuild widget**

```bash
pnpm --filter widget-src build 2>&1 | tail -3 && pnpm --filter widget-src check:size
```

Expected: build succeeds, gzipped size still under 30KB.

- [ ] **Step 3: Commit**

```bash
git add extensions/theme-app-extension/assets/widget.css apps/admin/public/widget.js apps/admin/public/widget.css extensions/theme-app-extension/assets/widget.js 2>/dev/null
git add -A apps/admin/public/ extensions/theme-app-extension/assets/
git commit -m "feat(widget): CSS for gift/BOGO badges"
```

---

## Group F — Admin UI: VariantPicker + tier builder

---

### Task 17: VariantPicker component

**Files:**
- Create: `apps/admin/app/components/VariantPicker.tsx`

- [ ] **Step 1: Read existing CollectionPicker for the pattern**

Read `apps/admin/app/components/CollectionPicker.tsx` end-to-end.

- [ ] **Step 2: Create VariantPicker.tsx**

Create `apps/admin/app/components/VariantPicker.tsx`:

```tsx
import { useAppBridge } from "@shopify/app-bridge-react";
import { Button, BlockStack, InlineStack, Text, Thumbnail } from "@shopify/polaris";
import { useCallback } from "react";

export type PickedVariant = {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  image?: string;
};

type Props = {
  variant: PickedVariant | null;
  onChange: (v: PickedVariant | null) => void;
  // When set, pickers reject variants whose product.id !== restrictToProductId.
  restrictToProductId?: string | null;
};

export function VariantPicker({ variant, onChange, restrictToProductId }: Props) {
  const shopify = useAppBridge();

  const open = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (shopify as any).resourcePicker({
      type: "product-variant",
      multiple: false,
      action: "select",
      selectionIds: variant ? [{ id: variant.variantId }] : [],
    });
    if (!result || !result.selection || result.selection.length === 0) return;
    const first = result.selection[0] as {
      id: string;
      title: string;
      product?: { id: string; title?: string; images?: Array<{ originalSrc?: string }> };
    };
    if (restrictToProductId && first.product?.id !== restrictToProductId) {
      shopify.toast.show("Pick a variant of the QB's product.", { isError: true });
      return;
    }
    onChange({
      variantId: first.id,
      productId: first.product?.id ?? "",
      productTitle: first.product?.title ?? "",
      variantTitle: first.title ?? first.id,
      image: first.product?.images?.[0]?.originalSrc,
    });
  }, [shopify, onChange, variant, restrictToProductId]);

  if (!variant) {
    return <Button onClick={open}>Choose variant</Button>;
  }

  return (
    <BlockStack gap="200">
      <InlineStack gap="300" align="start" blockAlign="center">
        <Thumbnail source={variant.image ?? ""} alt={variant.variantTitle} size="small" />
        <Text as="span" variant="bodyMd">
          {variant.productTitle} — {variant.variantTitle}
        </Text>
      </InlineStack>
      <InlineStack gap="200">
        <Button onClick={open}>Change</Button>
        <Button onClick={() => onChange(null)} variant="plain" tone="critical">Remove</Button>
      </InlineStack>
    </BlockStack>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter admin typecheck
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/components/VariantPicker.tsx
git commit -m "feat(admin): VariantPicker component for tier gift/BOGO"
```

---

### Task 18: QbTierBuilder — gift / BOGO controls per tier

**Files:**
- Modify: `apps/admin/app/components/QbTierBuilder.tsx`

- [ ] **Step 1: Extend `TierFormValue`**

Open `apps/admin/app/components/QbTierBuilder.tsx`. Replace the `TierFormValue` type:

```tsx
import { VariantPicker, type PickedVariant } from "./VariantPicker";

export type TierFormValue = {
  qty: number;
  discountType: "percentage" | "flat" | "fixed_per_unit";
  discountValue: number;
  label: string;
  isMostPopular: boolean;
  freeGiftVariant?: PickedVariant | null;
  bogoMode?: "" | "add_same" | "add_different" | "nth_free";
  bogoTargetVariant?: PickedVariant | null;
  bogoBonusQty?: number;
};
```

(`freeGiftVariant` and `bogoTargetVariant` carry the picker state for chip rendering; they're flattened into `freeGiftVariantId` + `bogo` on form submit by `QbForm`.)

Update `DEFAULT_TIER`:

```tsx
const DEFAULT_TIER: TierFormValue = {
  qty: 1,
  discountType: "percentage",
  discountValue: 0,
  label: "",
  isMostPopular: false,
  freeGiftVariant: null,
  bogoMode: "",
  bogoTargetVariant: null,
  bogoBonusQty: 1,
};
```

Add a `restrictToProductId` prop on the component:

```tsx
type Props = {
  tiers: TierFormValue[];
  onChange: (tiers: TierFormValue[]) => void;
  maxTiers?: number;
  restrictToProductId?: string | null;
};

export function QbTierBuilder({ tiers, onChange, maxTiers = 10, restrictToProductId }: Props) {
```

- [ ] **Step 2: Render the collapsible section per tier**

Inside the existing `tiers.map((tier, i) => (` row, after the existing `<Button onClick={() => removeTier(i)}>Remove</Button>`, wrap the row in a `<BlockStack>` and append a `<details>` element below:

Replace the existing single-row JSX with:

```tsx
        <BlockStack key={i} gap="200">
          <InlineStack gap="200" blockAlign="end">
            {/* existing qty / discount type / value / label / popular / remove inputs unchanged */}
          </InlineStack>
          <details
            open={!!(tier.freeGiftVariant || (tier.bogoMode && tier.bogoMode !== ""))}
            style={{ paddingLeft: 8 }}
          >
            <summary style={{ cursor: "pointer", fontSize: 13, color: "#5C5F62" }}>
              + Free gift / BOGO
            </summary>
            <BlockStack gap="300" inlineAlign="stretch">
              <BlockStack gap="100">
                <Text as="h4" variant="headingSm">Free gift</Text>
                <VariantPicker
                  variant={tier.freeGiftVariant ?? null}
                  onChange={(v) => updateTier(i, { freeGiftVariant: v })}
                />
              </BlockStack>

              <BlockStack gap="100">
                <Text as="h4" variant="headingSm">BOGO</Text>
                <Select
                  label="Mode"
                  options={[
                    { label: "None", value: "" },
                    { label: "Add 1 free of the same variant", value: "add_same" },
                    { label: "Add a different variant free", value: "add_different" },
                    { label: "Make the Nth unit free", value: "nth_free" },
                  ]}
                  value={tier.bogoMode ?? ""}
                  onChange={(v) => updateTier(i, { bogoMode: v as TierFormValue["bogoMode"] })}
                />

                {tier.bogoMode === "add_same" && (
                  <BlockStack gap="200">
                    <VariantPicker
                      variant={tier.bogoTargetVariant ?? null}
                      onChange={(v) => updateTier(i, { bogoTargetVariant: v })}
                      restrictToProductId={restrictToProductId ?? null}
                    />
                    <TextField
                      label="Bonus units"
                      type="number"
                      value={String(tier.bogoBonusQty ?? 1)}
                      onChange={(v) => updateTier(i, { bogoBonusQty: parseInt(v, 10) || 1 })}
                      autoComplete="off"
                      min={1}
                    />
                  </BlockStack>
                )}

                {tier.bogoMode === "add_different" && (
                  <BlockStack gap="200">
                    <VariantPicker
                      variant={tier.bogoTargetVariant ?? null}
                      onChange={(v) => updateTier(i, { bogoTargetVariant: v })}
                    />
                    <TextField
                      label="Bonus units"
                      type="number"
                      value={String(tier.bogoBonusQty ?? 1)}
                      onChange={(v) => updateTier(i, { bogoBonusQty: parseInt(v, 10) || 1 })}
                      autoComplete="off"
                      min={1}
                    />
                  </BlockStack>
                )}

                {tier.bogoMode === "nth_free" && (
                  <BlockStack gap="100">
                    <TextField
                      label="Free units (must be < tier qty)"
                      type="number"
                      value={String(tier.bogoBonusQty ?? 1)}
                      onChange={(v) => updateTier(i, { bogoBonusQty: parseInt(v, 10) || 1 })}
                      autoComplete="off"
                      min={1}
                      max={Math.max(1, tier.qty - 1)}
                    />
                    <Text as="p" variant="bodySm" tone="subdued">
                      Customer pays for {Math.max(0, tier.qty - (tier.bogoBonusQty ?? 1))} of {tier.qty} units
                      (~{Math.round(((tier.bogoBonusQty ?? 1) / Math.max(1, tier.qty)) * 100)}% off).
                    </Text>
                  </BlockStack>
                )}
              </BlockStack>
            </BlockStack>
          </details>
        </BlockStack>
```

The existing `<InlineStack key={i}>` becomes the inner row; the `key` moves to the outer `<BlockStack>`. The existing inputs inside the row stay unchanged.

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter admin typecheck
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/components/QbTierBuilder.tsx
git commit -m "feat(admin): tier builder gift/BOGO collapsible section"
```

---

### Task 19: QbForm + routes — serialize new tier fields

**Files:**
- Modify: `apps/admin/app/components/QbForm.tsx`
- Modify: `apps/admin/app/routes/app.quantity-breaks.new.tsx`
- Modify: `apps/admin/app/routes/app.quantity-breaks.$id.tsx`

- [ ] **Step 1: Read QbForm for current tier serialization**

Read `apps/admin/app/components/QbForm.tsx`. The `tiers` field is JSON-stringified into a hidden input. The exact serialization may need to flatten `freeGiftVariant` → `freeGiftVariantId` + chip metadata.

- [ ] **Step 2: Update QbForm tier serialization**

In the `<input type="hidden" name="tiers" value={...} />` block, change the value to map `TierFormValue` to the wire shape consumed by the action:

```tsx
<input
  type="hidden"
  name="tiers"
  value={JSON.stringify(values.tiers.map((t) => ({
    qty: t.qty,
    discountType: t.discountType,
    discountValue: t.discountValue,
    label: t.label,
    isMostPopular: t.isMostPopular,
    freeGiftVariantId: t.freeGiftVariant?.variantId ?? null,
    bogo: t.bogoMode && t.bogoMode !== ""
      ? {
          mode: t.bogoMode,
          targetVariantId: t.bogoTargetVariant?.variantId ?? null,
          bonusQty: t.bogoBonusQty ?? 1,
        }
      : null,
  })))}
/>
```

Add a `restrictToProductId` prop on `QbForm` and pass it through to `<QbTierBuilder>`:

```tsx
type Props = {
  initialValues?: Partial<QbFormValues>;
  errors?: Record<string, string>;
  submitLabel: string;
  onValuesChange?: (v: QbFormValues) => void;
};

// inside the component, pass:
<QbTierBuilder
  tiers={values.tiers}
  onChange={(t) => update("tiers", t)}
  restrictToProductId={values.product[0]?.productId ?? null}
/>
```

- [ ] **Step 3: Update both action handlers**

In each of `app.quantity-breaks.new.tsx` and `app.quantity-breaks.$id.tsx`, find the action block where `tiers` is parsed:

```ts
const tiersRaw: TierFormValue[] = JSON.parse(
  (form.get("tiers") as string) || "[]"
);
```

Change the mapping that builds `input.tiers` to pass through the new fields:

```ts
  tiers: tiersRaw.map((t) => ({
    qty: t.qty,
    discountType: t.discountType as "percentage" | "flat" | "fixed_per_unit",
    discountValue: t.discountValue,
    label: t.label,
    isMostPopular: t.isMostPopular,
    freeGiftVariantId: (t as { freeGiftVariantId?: string | null }).freeGiftVariantId ?? undefined,
    bogo: (t as { bogo?: { mode: string; targetVariantId?: string | null; bonusQty: number } | null }).bogo ?? undefined,
  })),
```

(The `as` casts here are because `TierFormValue` is the form-builder shape — after JSON serialization in QbForm, the wire shape has `freeGiftVariantId` + `bogo` fields directly. The cast lets us read them.)

- [ ] **Step 4: Update the `$id` loader to fetch picker chips**

In `app.quantity-breaks.$id.tsx` loader, after fetching the QB and product details, collect tier variant IDs and fetch their details:

```ts
import { fetchVariantDetails, type VariantDetail } from "~/lib/shopify-product-fetch";

// after existing productDetails fetch:
const tierVariantIds = new Set<string>();
for (const tr of qb.tiers) {
  if (tr.freeGiftVariantId) tierVariantIds.add(tr.freeGiftVariantId);
  if (tr.bogo?.targetVariantId) tierVariantIds.add(tr.bogo.targetVariantId);
}
const tierVariantDetails = await fetchVariantDetails(admin, [...tierVariantIds]);

return json({ qb, productTitle, productImage, tierVariantDetails });
```

In the component, when building `initial.tiers`, hydrate the picker fields:

```ts
    tiers: qb.tiers.map((t) => ({
      qty: t.qty,
      discountType: t.discountType,
      discountValue: t.discountValue,
      label: t.label,
      isMostPopular: t.isMostPopular,
      freeGiftVariant: t.freeGiftVariantId && tierVariantDetails[t.freeGiftVariantId]
        ? {
            variantId: t.freeGiftVariantId,
            productId: "",
            productTitle: tierVariantDetails[t.freeGiftVariantId]!.productTitle,
            variantTitle: tierVariantDetails[t.freeGiftVariantId]!.variantTitle,
            image: tierVariantDetails[t.freeGiftVariantId]!.image ?? undefined,
          }
        : null,
      bogoMode: t.bogo?.mode ?? "",
      bogoTargetVariant: t.bogo?.targetVariantId && tierVariantDetails[t.bogo.targetVariantId]
        ? {
            variantId: t.bogo.targetVariantId,
            productId: "",
            productTitle: tierVariantDetails[t.bogo.targetVariantId]!.productTitle,
            variantTitle: tierVariantDetails[t.bogo.targetVariantId]!.variantTitle,
            image: tierVariantDetails[t.bogo.targetVariantId]!.image ?? undefined,
          }
        : null,
      bogoBonusQty: t.bogo?.bonusQty ?? 1,
    })),
```

- [ ] **Step 5: Typecheck + run all admin tests**

```bash
pnpm --filter admin typecheck && pnpm --filter admin test
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/components/QbForm.tsx apps/admin/app/routes/app.quantity-breaks.new.tsx apps/admin/app/routes/app.quantity-breaks.\$id.tsx
git commit -m "feat(admin): qb new/edit serialize freeGiftVariantId + bogo per tier"
```

---

## Group G — Build, deploy, manual gate

---

### Task 20: Final verify + deploy

**No new files.**

- [ ] **Step 1: Full repo build**

```bash
pnpm --filter admin build
pnpm --filter widget-src build
cd extensions/discount-function && cargo build --target=wasm32-unknown-unknown --release && cd -
cd extensions/cart-transform-function && cargo build --target=wasm32-unknown-unknown --release && cd -
```

Expected: all 4 succeed.

- [ ] **Step 2: Full test pass**

```bash
pnpm --filter admin test
pnpm --filter widget-src test
cd extensions/discount-function && cargo test --release && cd -
cd extensions/cart-transform-function && cargo test --release && cd -
```

Expected: all green.

- [ ] **Step 3: Bundle size check**

```bash
pnpm --filter widget-src check:size
```

Expected: gzipped widget.js < 30KB.

- [ ] **Step 4: Stop here** — leave actual `shopify app deploy` / Pages deploy / git push for the user to run when they're ready to ship.

```bash
git status
```

If clean, no commit. Otherwise commit any incidental fixes before stopping.

- [ ] **Step 5: Tag (after user runs deploy)**

User-only, after manual gate (Task 21):

```bash
git tag phase-5-complete && git push --tags
```

---

### Task 21: Manual gate (post-deploy)

Run on the `deepseatools.myshopify.com` dev store after the user runs `shopify app deploy --force` and the Pages deploy.

- [ ] 1. Configure a QB with 3 tiers; tier 3 has `freeGiftVariantId = <hat>`. Save.
- [ ] 2. Visit the QB product PDP — tier 3 row shows `🎁 + Free Hat` badge.
- [ ] 3. Select tier 3 + click CTA — cart contains snowboard ×3 + hat ×1, hat at $0.
- [ ] 4. Cart drawer / page shows merged "Bundle: Snowboard + 🎁 Gift" parent line. (Cart Transform working.)
- [ ] 5. At checkout, the discount applies (snowboard tier discount + 100% off the hat).
- [ ] 6. Configure another QB tier: `bogo.mode = nth_free`, `bonusQty = 1`, `qty = 3`. Tier label preview reads "Buy 3, pay for 2 (33% off)". Customer adds qty 3 → 33.33% discount applied to all 3.
- [ ] 7. Configure third tier: `bogo.mode = add_same`, `targetVariantId` = the QB product's variant Y, `bonusQty = 2`. Customer adds qty 4 → cart has `Snowboard ×4 + Y ×2`, Y is at $0, all merged into one parent line in cart drawer.
- [ ] 8. Lighthouse on PDP: Performance ≥ 90, no CLS regression vs baseline.

After all 8 pass:

```bash
git tag phase-5-complete && git push --tags
```

---

## Spec coverage check

| Spec § | Subject | Tasks |
|---|---|---|
| §3 file layout | new + modified files | 1, 6, 17, 18 |
| §4 schema + validation | QbTier shape + per-tier rules | 1, 2 |
| §5 Cart Transform Function | Rust crate + grouping logic | 6, 7, 8, 9 |
| §6 Discount Function changes | gift pass + nth_free override | 3, 4, 5 |
| §7 widget changes | tier badges + multi-line click | 13, 14, 15, 16 |
| §8 admin UI | VariantPicker + tier builder + serialization | 17, 18, 19 |
| §9 error handling | OOS guards, single-line skip, etc. | covered in 12, 15 |
| §10 testing | unit tests + manual gate | 2, 5, 8, 10, 11, 12, 14, 15, 21 |

---

**Plan complete.**
