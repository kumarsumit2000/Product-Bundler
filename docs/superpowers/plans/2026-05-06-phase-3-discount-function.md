# Phase 3 — Rust Discount Function Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Rust Shopify Function that powers Bundle and QB discounts at checkout. Per-rule combinability honored via two discount nodes per shop.

**Architecture:** One Wasm Function (Rust, target wasm32-wasip1) deployed to Shopify. Two `discountAutomaticAppNode`s per shop — combinable + non-combinable — both pointing at the same Function. Each node carries a `node_kind` metafield so the Function can filter the shop's `pumper.config` JSON to return only matching rules. Pure-function modules (`config`, `matcher`, `discount`) keep the Function logic testable in isolation.

**Tech Stack:** Rust 1.75+, `shopify_function` crate, `serde`/`serde_json`, target `wasm32-wasip1`, Shopify CLI for scaffolding/deploy/local testing, `cart.lines.discounts.generate.run` target API. Admin: existing TypeScript/Remix/Drizzle stack.

**Spec this plan implements:** [`docs/superpowers/specs/2026-05-06-phase-3-discount-function-design.md`](../specs/2026-05-06-phase-3-discount-function-design.md)

---

## Task 1: Install Rust target and scaffold the extension

**Files:**
- Create: `extensions/discount-function/` (full extension scaffold via Shopify CLI)

- [ ] **Step 1: Install the wasm32-wasip1 Rust target**

```bash
rustup target add wasm32-wasip1
rustup target list --installed | grep wasm32-wasip1
```

Expected: `wasm32-wasip1` appears in the installed list.

- [ ] **Step 2: Generate the extension via Shopify CLI**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
pnpm shopify app generate extension \
  --type=function \
  --template=product_discounts \
  --flavor=rust \
  --name=discount-function
```

Note: Shopify CLI prompts may vary by version. If it asks for the API target, choose **`cart.lines.discounts.generate.run`** (newer line-level discount API). If only `cart.discounts.run` is offered, accept that — we'll switch later if needed.

Expected: creates `extensions/discount-function/` with `Cargo.toml`, `src/main.rs`, `input.graphql`, `schema.graphql` (generated), `shopify.extension.toml`.

- [ ] **Step 3: Verify scaffold builds**

```bash
cd extensions/discount-function
cargo build --release --target=wasm32-wasip1 2>&1 | tail -5
```

Expected: `Finished release [optimized] target(s) in <time>`. The artifact lives at `target/wasm32-wasip1/release/<crate-name>.wasm`.

- [ ] **Step 4: Verify schema.graphql was generated**

```bash
ls -la extensions/discount-function/schema.graphql
head -30 extensions/discount-function/schema.graphql
```

Expected: file exists and contains GraphQL type definitions including `Cart`, `CartLine`, `ProductVariant`, etc.

- [ ] **Step 5: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add extensions/discount-function/
git commit -m "chore(discount-function): scaffold Rust Shopify Function extension"
```

---

## Task 2: `config.rs` — types + deserialization (TDD)

**Files:**
- Create: `extensions/discount-function/src/config.rs`
- Create: `extensions/discount-function/tests/config_test.rs`
- Modify: `extensions/discount-function/Cargo.toml` (ensure tests compile)

- [ ] **Step 1: Write `extensions/discount-function/tests/config_test.rs`**

```rust
use bundler_discount::config::{Config, Bundle, BundleProduct, QuantityBreak, QbTier};

#[test]
fn deserializes_empty_config() {
    let json = r#"{"schemaVersion":1,"bundles":[],"quantityBreaks":[]}"#;
    let config: Config = serde_json::from_str(json).unwrap();
    assert_eq!(config.schema_version, 1);
    assert!(config.bundles.is_empty());
    assert!(config.quantity_breaks.is_empty());
}

#[test]
fn deserializes_bundle_with_two_products() {
    let json = r#"{
        "schemaVersion": 1,
        "bundles": [{
            "id": "abc",
            "name": "Test",
            "status": "active",
            "products": [
                {"productId": "gid://shopify/Product/1", "variantId": null, "qty": 2},
                {"productId": "gid://shopify/Product/2", "variantId": "gid://shopify/ProductVariant/9", "qty": 1}
            ],
            "discountType": "percentage",
            "discountValue": 20.0,
            "combinable": true,
            "triggerProductIds": [],
            "headline": "Save 20%"
        }],
        "quantityBreaks": []
    }"#;
    let config: Config = serde_json::from_str(json).unwrap();
    assert_eq!(config.bundles.len(), 1);
    let b = &config.bundles[0];
    assert_eq!(b.id, "abc");
    assert_eq!(b.products.len(), 2);
    assert_eq!(b.products[0].qty, 2);
    assert!(b.products[0].variant_id.is_none());
    assert_eq!(
        b.products[1].variant_id.as_deref(),
        Some("gid://shopify/ProductVariant/9")
    );
    assert!(b.combinable);
    assert_eq!(b.discount_value, 20.0);
}

#[test]
fn deserializes_qb_with_three_tiers() {
    let json = r#"{
        "schemaVersion": 1,
        "bundles": [],
        "quantityBreaks": [{
            "id": "qb1",
            "name": "Tiered",
            "status": "active",
            "productId": "gid://shopify/Product/5",
            "tiers": [
                {"qty": 1, "discountType": "percentage", "discountValue": 0, "label": "Buy 1", "isMostPopular": false},
                {"qty": 2, "discountType": "percentage", "discountValue": 10, "label": "10% off", "isMostPopular": false},
                {"qty": 3, "discountType": "percentage", "discountValue": 15, "label": "15% off", "isMostPopular": true}
            ],
            "combinable": false
        }]
    }"#;
    let config: Config = serde_json::from_str(json).unwrap();
    assert_eq!(config.quantity_breaks.len(), 1);
    let qb = &config.quantity_breaks[0];
    assert_eq!(qb.tiers.len(), 3);
    assert_eq!(qb.tiers[2].discount_value, 15.0);
    assert!(qb.tiers[2].is_most_popular);
    assert!(!qb.combinable);
}
```

- [ ] **Step 2: Run tests, verify failure**

```bash
cd extensions/discount-function
cargo test --test config_test 2>&1 | tail -10
```

Expected: errors about `bundler_discount` crate not having a `config` module.

- [ ] **Step 3: Create `extensions/discount-function/src/config.rs`**

```rust
use serde::Deserialize;

#[derive(Deserialize, Debug, Clone)]
pub struct Config {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    pub bundles: Vec<Bundle>,
    #[serde(rename = "quantityBreaks")]
    pub quantity_breaks: Vec<QuantityBreak>,
}

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
}

#[derive(Deserialize, Debug, Clone)]
pub struct BundleProduct {
    #[serde(rename = "productId")]
    pub product_id: String,
    #[serde(rename = "variantId")]
    pub variant_id: Option<String>,
    pub qty: u32,
}

#[derive(Deserialize, Debug, Clone)]
pub struct QuantityBreak {
    pub id: String,
    pub name: String,
    pub status: String,
    #[serde(rename = "productId")]
    pub product_id: String,
    pub tiers: Vec<QbTier>,
    pub combinable: bool,
}

#[derive(Deserialize, Debug, Clone)]
pub struct QbTier {
    pub qty: u32,
    #[serde(rename = "discountType")]
    pub discount_type: String,
    #[serde(rename = "discountValue")]
    pub discount_value: f64,
    pub label: String,
    #[serde(rename = "isMostPopular")]
    pub is_most_popular: bool,
}
```

- [ ] **Step 4: Create `extensions/discount-function/src/lib.rs`**

```rust
pub mod config;
pub mod matcher;
pub mod discount;
```

(`matcher` and `discount` will exist after Tasks 3-4. The lib.rs already mentions them so we don't have to update it later. Empty stubs may be needed if `cargo build` runs before those tasks — see step 5.)

- [ ] **Step 5: Stub matcher.rs and discount.rs so the crate compiles**

`extensions/discount-function/src/matcher.rs`:
```rust
// Filled in Task 3
```

`extensions/discount-function/src/discount.rs`:
```rust
// Filled in Task 4
```

- [ ] **Step 6: Update Cargo.toml to ensure `cdylib` + `lib` targets coexist**

Open `extensions/discount-function/Cargo.toml`. Verify these sections exist (Shopify CLI scaffolds them, but confirm):

```toml
[lib]
crate-type = ["cdylib"]
path = "src/lib.rs"
```

If `[lib]` block is missing, add it. Add `serde_json` to dev-dependencies if not present:

```toml
[dev-dependencies]
serde_json = "1"
```

- [ ] **Step 7: Run tests, verify pass**

```bash
cargo test --test config_test 2>&1 | tail -10
```

Expected: 3 tests pass.

- [ ] **Step 8: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add extensions/discount-function/src/ extensions/discount-function/tests/ extensions/discount-function/Cargo.toml
git commit -m "feat(discount-function): add config types with serde deserialization (TDD)"
```

---

## Task 3: `matcher.rs` — cart line matching (TDD)

**Files:**
- Replace: `extensions/discount-function/src/matcher.rs`
- Create: `extensions/discount-function/tests/matcher_test.rs`

- [ ] **Step 1: Write `extensions/discount-function/tests/matcher_test.rs`**

```rust
use bundler_discount::config::{Bundle, BundleProduct, QbTier, QuantityBreak};
use bundler_discount::matcher::{match_bundle, match_qb_tier, CartLine};

fn line(id: &str, product: &str, variant: Option<&str>, qty: u32) -> CartLine {
    CartLine {
        id: id.into(),
        product_id: product.into(),
        variant_id: variant.map(String::from),
        quantity: qty,
    }
}

fn bundle(products: Vec<BundleProduct>) -> Bundle {
    Bundle {
        id: "b1".into(),
        name: "B".into(),
        status: "active".into(),
        products,
        discount_type: "percentage".into(),
        discount_value: 20.0,
        combinable: true,
        trigger_product_ids: vec![],
        headline: None,
    }
}

fn bp(product: &str, variant: Option<&str>, qty: u32) -> BundleProduct {
    BundleProduct {
        product_id: product.into(),
        variant_id: variant.map(String::from),
        qty,
    }
}

#[test]
fn match_bundle_returns_targets_when_all_products_in_cart() {
    let lines = vec![
        line("L1", "P1", None, 1),
        line("L2", "P2", None, 1),
    ];
    let b = bundle(vec![bp("P1", None, 1), bp("P2", None, 1)]);
    let result = match_bundle(&lines, &b);
    assert_eq!(result, Some(vec!["L1".into(), "L2".into()]));
}

#[test]
fn match_bundle_returns_none_when_one_product_missing() {
    let lines = vec![line("L1", "P1", None, 1)];
    let b = bundle(vec![bp("P1", None, 1), bp("P2", None, 1)]);
    assert!(match_bundle(&lines, &b).is_none());
}

#[test]
fn match_bundle_requires_specific_variant_when_set() {
    let lines = vec![
        line("L1", "P1", Some("V_other"), 1),
        line("L2", "P2", None, 1),
    ];
    let b = bundle(vec![
        bp("P1", Some("V_required"), 1),
        bp("P2", None, 1),
    ]);
    assert!(match_bundle(&lines, &b).is_none());
}

#[test]
fn match_bundle_accepts_any_variant_when_required_variant_is_null() {
    let lines = vec![
        line("L1", "P1", Some("V_anything"), 1),
        line("L2", "P2", None, 1),
    ];
    let b = bundle(vec![bp("P1", None, 1), bp("P2", None, 1)]);
    assert!(match_bundle(&lines, &b).is_some());
}

#[test]
fn match_bundle_requires_minimum_qty_per_product() {
    let lines = vec![
        line("L1", "P1", None, 1),  // need 2, have 1
        line("L2", "P2", None, 1),
    ];
    let b = bundle(vec![bp("P1", None, 2), bp("P2", None, 1)]);
    assert!(match_bundle(&lines, &b).is_none());
}

#[test]
fn match_qb_tier_returns_highest_satisfied_tier() {
    let qb = QuantityBreak {
        id: "q".into(),
        name: "Q".into(),
        status: "active".into(),
        product_id: "P1".into(),
        tiers: vec![
            QbTier { qty: 1, discount_type: "percentage".into(), discount_value: 0.0, label: "1".into(), is_most_popular: false },
            QbTier { qty: 2, discount_type: "percentage".into(), discount_value: 10.0, label: "2".into(), is_most_popular: false },
            QbTier { qty: 3, discount_type: "percentage".into(), discount_value: 15.0, label: "3".into(), is_most_popular: true },
        ],
        combinable: true,
    };
    let l = line("L", "P1", None, 3);
    let tier = match_qb_tier(&l, &qb).unwrap();
    assert_eq!(tier.qty, 3);
}

#[test]
fn match_qb_tier_returns_none_for_wrong_product() {
    let qb = QuantityBreak {
        id: "q".into(), name: "Q".into(), status: "active".into(),
        product_id: "P1".into(),
        tiers: vec![QbTier { qty: 1, discount_type: "percentage".into(), discount_value: 0.0, label: "1".into(), is_most_popular: false }],
        combinable: true,
    };
    let l = line("L", "P_OTHER", None, 5);
    assert!(match_qb_tier(&l, &qb).is_none());
}

#[test]
fn match_qb_tier_returns_none_when_qty_below_lowest_tier() {
    let qb = QuantityBreak {
        id: "q".into(), name: "Q".into(), status: "active".into(),
        product_id: "P1".into(),
        tiers: vec![QbTier { qty: 5, discount_type: "percentage".into(), discount_value: 10.0, label: "5".into(), is_most_popular: false }],
        combinable: true,
    };
    let l = line("L", "P1", None, 3);
    assert!(match_qb_tier(&l, &qb).is_none());
}
```

- [ ] **Step 2: Run tests, verify failure**

```bash
cd extensions/discount-function
cargo test --test matcher_test 2>&1 | tail -15
```

Expected: errors about `match_bundle`, `match_qb_tier`, `CartLine` not found in `matcher` module.

- [ ] **Step 3: Replace `extensions/discount-function/src/matcher.rs`**

```rust
use crate::config::{Bundle, QbTier, QuantityBreak};

pub struct CartLine {
    pub id: String,
    pub product_id: String,
    pub variant_id: Option<String>,
    pub quantity: u32,
}

/// Returns target cart line IDs if every required product is present in the cart with sufficient quantity.
pub fn match_bundle(lines: &[CartLine], bundle: &Bundle) -> Option<Vec<String>> {
    let mut targets = Vec::with_capacity(bundle.products.len());
    for required in &bundle.products {
        let line = lines.iter().find(|line| {
            line.product_id == required.product_id
                && variant_matches(&required.variant_id, &line.variant_id)
                && line.quantity >= required.qty
        })?;
        targets.push(line.id.clone());
    }
    Some(targets)
}

/// For a single cart line, returns the highest tier whose qty threshold is met.
pub fn match_qb_tier<'a>(line: &CartLine, qb: &'a QuantityBreak) -> Option<&'a QbTier> {
    if line.product_id != qb.product_id {
        return None;
    }
    qb.tiers
        .iter()
        .filter(|t| line.quantity >= t.qty)
        .max_by_key(|t| t.qty)
}

fn variant_matches(required: &Option<String>, actual: &Option<String>) -> bool {
    match required {
        Some(req) => actual.as_ref() == Some(req),
        None => true,  // null required = any variant matches
    }
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cargo test --test matcher_test 2>&1 | tail -10
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add extensions/discount-function/src/matcher.rs extensions/discount-function/tests/matcher_test.rs
git commit -m "feat(discount-function): add cart-line matcher (TDD)"
```

---

## Task 4: `discount.rs` — discount math (TDD)

**Files:**
- Replace: `extensions/discount-function/src/discount.rs`
- Create: `extensions/discount-function/tests/discount_test.rs`

- [ ] **Step 1: Write `extensions/discount-function/tests/discount_test.rs`**

```rust
use bundler_discount::config::{Bundle, BundleProduct, QbTier};
use bundler_discount::discount::{compute_bundle_value, compute_qb_tier_value, DiscountValue};

fn bundle(discount_type: &str, value: f64) -> Bundle {
    Bundle {
        id: "b".into(),
        name: "B".into(),
        status: "active".into(),
        products: vec![],
        discount_type: discount_type.into(),
        discount_value: value,
        combinable: true,
        trigger_product_ids: vec![],
        headline: None,
    }
}

fn tier(discount_type: &str, value: f64) -> QbTier {
    QbTier {
        qty: 2,
        discount_type: discount_type.into(),
        discount_value: value,
        label: "L".into(),
        is_most_popular: false,
    }
}

#[test]
fn bundle_percentage_returns_pct_value() {
    let b = bundle("percentage", 20.0);
    match compute_bundle_value(&b, 100.0) {
        DiscountValue::Percentage(p) => assert_eq!(p, 20.0),
        _ => panic!("expected Percentage"),
    }
}

#[test]
fn bundle_flat_returns_fixed_amount() {
    let b = bundle("flat", 5.0);
    match compute_bundle_value(&b, 100.0) {
        DiscountValue::FixedAmount(a) => assert_eq!(a, 5.0),
        _ => panic!("expected FixedAmount"),
    }
}

#[test]
fn bundle_fixed_total_returns_subtotal_minus_target() {
    let b = bundle("fixed_total", 30.0);
    match compute_bundle_value(&b, 100.0) {
        DiscountValue::FixedAmount(off) => assert_eq!(off, 70.0),  // 100 - 30
        _ => panic!("expected FixedAmount"),
    }
}

#[test]
fn bundle_fixed_total_clamps_to_zero_when_target_exceeds_subtotal() {
    let b = bundle("fixed_total", 200.0);
    match compute_bundle_value(&b, 100.0) {
        DiscountValue::FixedAmount(off) => assert_eq!(off, 0.0),
        _ => panic!("expected FixedAmount"),
    }
}

#[test]
fn bundle_unknown_type_returns_zero_percentage() {
    let b = bundle("bogus", 50.0);
    match compute_bundle_value(&b, 100.0) {
        DiscountValue::Percentage(p) => assert_eq!(p, 0.0),
        _ => panic!("expected Percentage"),
    }
}

#[test]
fn qb_percentage_tier() {
    let t = tier("percentage", 15.0);
    match compute_qb_tier_value(&t, 50.0) {
        DiscountValue::Percentage(p) => assert_eq!(p, 15.0),
        _ => panic!("expected Percentage"),
    }
}

#[test]
fn qb_flat_tier() {
    let t = tier("flat", 5.0);
    match compute_qb_tier_value(&t, 50.0) {
        DiscountValue::FixedAmount(a) => assert_eq!(a, 5.0),
        _ => panic!("expected FixedAmount"),
    }
}

#[test]
fn qb_fixed_per_unit_returns_per_unit_offset() {
    let t = tier("fixed_per_unit", 18.0);  // set unit price to $18
    match compute_qb_tier_value(&t, 25.0) {
        DiscountValue::FixedAmount(off) => assert_eq!(off, 7.0),  // 25 - 18
        _ => panic!("expected FixedAmount"),
    }
}

#[test]
fn qb_fixed_per_unit_clamps_to_zero() {
    let t = tier("fixed_per_unit", 100.0);
    match compute_qb_tier_value(&t, 25.0) {
        DiscountValue::FixedAmount(off) => assert_eq!(off, 0.0),
        _ => panic!("expected FixedAmount"),
    }
}
```

- [ ] **Step 2: Run, verify failure**

```bash
cd extensions/discount-function
cargo test --test discount_test 2>&1 | tail -10
```

- [ ] **Step 3: Replace `extensions/discount-function/src/discount.rs`**

```rust
use crate::config::{Bundle, QbTier};

#[derive(Debug, PartialEq)]
pub enum DiscountValue {
    Percentage(f64),
    FixedAmount(f64),
}

pub fn compute_bundle_value(bundle: &Bundle, line_subtotal: f64) -> DiscountValue {
    match bundle.discount_type.as_str() {
        "percentage" => DiscountValue::Percentage(bundle.discount_value),
        "flat" => DiscountValue::FixedAmount(bundle.discount_value),
        "fixed_total" => {
            let off = (line_subtotal - bundle.discount_value).max(0.0);
            DiscountValue::FixedAmount(off)
        }
        _ => DiscountValue::Percentage(0.0),
    }
}

pub fn compute_qb_tier_value(tier: &QbTier, line_amount_per_unit: f64) -> DiscountValue {
    match tier.discount_type.as_str() {
        "percentage" => DiscountValue::Percentage(tier.discount_value),
        "flat" => DiscountValue::FixedAmount(tier.discount_value),
        "fixed_per_unit" => {
            let per_unit_off = (line_amount_per_unit - tier.discount_value).max(0.0);
            DiscountValue::FixedAmount(per_unit_off)
        }
        _ => DiscountValue::Percentage(0.0),
    }
}
```

- [ ] **Step 4: Run, verify pass**

```bash
cargo test --test discount_test 2>&1 | tail -10
```

Expected: 9 tests pass.

- [ ] **Step 5: Run all Rust tests + verify total**

```bash
cargo test 2>&1 | tail -15
```

Expected: ~20 tests pass (3 config + 8 matcher + 9 discount).

- [ ] **Step 6: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add extensions/discount-function/src/discount.rs extensions/discount-function/tests/discount_test.rs
git commit -m "feat(discount-function): add discount math (TDD)"
```

---

## Task 5: `main.rs` — Function entry orchestration

**Files:**
- Modify: `extensions/discount-function/src/main.rs`
- Modify: `extensions/discount-function/input.graphql`

- [ ] **Step 1: Replace `extensions/discount-function/input.graphql`**

```graphql
query Input {
  cart {
    lines {
      id
      quantity
      merchandise {
        ... on ProductVariant {
          id
          product { id }
        }
      }
      cost {
        amountPerQuantity { amount currencyCode }
      }
    }
  }
  shop {
    metafield(namespace: "pumper", key: "config") { value }
  }
  discountNode {
    metafield(namespace: "pumper", key: "node_kind") { value }
  }
  presentmentCurrencyRate
}
```

- [ ] **Step 2: Regenerate the schema for this input**

```bash
cd extensions/discount-function
pnpm shopify app function typegen 2>&1 | tail -5
```

This regenerates `src/main.rs` typings (or creates a generated types module — exact behavior depends on Shopify CLI version). If the command isn't `function typegen`, try `pnpm shopify app generate schema` or check `pnpm shopify app function --help`. The goal: get fresh Rust types matching our updated `input.graphql`.

Expected: command succeeds; `schema.graphql` may be re-written; generated Rust types in `src/` (often `src/run.rs` or generated module) reflect the new input shape.

- [ ] **Step 3: Replace `extensions/discount-function/src/main.rs`**

The exact `output::FunctionRunResult` shape depends on the API target. The version below targets `cart.lines.discounts.generate.run`. **If this doesn't compile cleanly**, inspect the generated types in `extensions/discount-function/src/run.rs` (or wherever Shopify CLI scaffolded the response types) and adjust the output construction accordingly.

```rust
use shopify_function::prelude::*;
use shopify_function::Result;

pub mod config;
pub mod matcher;
pub mod discount;

use config::Config;
use matcher::CartLine;

#[shopify_function]
fn cart_lines_discounts_generate_run(input: input::ResponseData) -> Result<output::CartLinesDiscountsGenerateRunResult> {
    let node_kind = input
        .discount_node()
        .metafield()
        .map(|m| m.value().as_str())
        .unwrap_or("combinable");

    let config: Config = match input.shop().metafield() {
        Some(m) => serde_json::from_str(m.value()).map_err(|e| {
            shopify_function::Error::msg(format!("Failed to parse config: {e}"))
        })?,
        None => return Ok(output::CartLinesDiscountsGenerateRunResult { operations: vec![] }),
    };

    let want_combinable = node_kind == "combinable";

    // Convert Shopify input cart lines to our internal CartLine
    let lines: Vec<CartLine> = input
        .cart()
        .lines()
        .iter()
        .filter_map(|l| {
            let merchandise = l.merchandise();
            let variant = match merchandise {
                input::cart::lines::Merchandise::ProductVariant(pv) => pv,
                _ => return None,
            };
            Some(CartLine {
                id: l.id().to_string(),
                product_id: variant.product().id().to_string(),
                variant_id: Some(variant.id().to_string()),
                quantity: *l.quantity() as u32,
            })
        })
        .collect();

    let mut operations = Vec::new();

    for bundle in config.bundles.iter()
        .filter(|b| b.combinable == want_combinable && b.status == "active")
    {
        if let Some(target_line_ids) = matcher::match_bundle(&lines, bundle) {
            let line_subtotal: f64 = target_line_ids.iter().filter_map(|tid| {
                input.cart().lines().iter()
                    .find(|l| l.id() == tid)
                    .and_then(|l| l.cost().amount_per_quantity().amount().parse::<f64>().ok())
            }).sum();
            let value = discount::compute_bundle_value(bundle, line_subtotal);
            operations.push(build_discount_operation(&bundle.name, &target_line_ids, value));
        }
    }

    for qb in config.quantity_breaks.iter()
        .filter(|q| q.combinable == want_combinable && q.status == "active")
    {
        for line in &lines {
            if let Some(tier) = matcher::match_qb_tier(line, qb) {
                let amount_per_unit = input.cart().lines().iter()
                    .find(|l| l.id() == &line.id)
                    .and_then(|l| l.cost().amount_per_quantity().amount().parse::<f64>().ok())
                    .unwrap_or(0.0);
                let value = discount::compute_qb_tier_value(tier, amount_per_unit);
                operations.push(build_discount_operation(&qb.name, &[line.id.clone()], value));
            }
        }
    }

    Ok(output::CartLinesDiscountsGenerateRunResult { operations })
}

/// Construct a discount operation. The exact shape depends on the generated output types —
/// adjust struct field names if compilation fails.
fn build_discount_operation(
    message: &str,
    line_ids: &[String],
    value: discount::DiscountValue,
) -> output::CartOperation {
    use output::*;
    let candidate_value = match value {
        discount::DiscountValue::Percentage(p) => CartLineDiscountValue::Percentage(Percentage { value: Decimal(p.to_string()) }),
        discount::DiscountValue::FixedAmount(a) => CartLineDiscountValue::FixedAmount(FixedAmount { amount: Decimal(a.to_string()) }),
    };
    let targets: Vec<CartLineTarget> = line_ids.iter().map(|id| CartLineTarget {
        cart_line: CartLineTargetCartLine { id: id.clone() },
        quantity: None,
    }).collect();
    CartOperation::AddProductDiscounts(ProductDiscountsAddOperation {
        candidates: vec![ProductDiscountCandidate {
            message: Some(message.to_string()),
            targets,
            value: ProductDiscountCandidateValue { discount: candidate_value },
            associated_discount_code: None,
        }],
        selection_strategy: ProductDiscountSelectionStrategy::First,
    })
}
```

**This main.rs is a starting point — the EXACT struct names and method casing depend on what Shopify CLI generates.** Strategy if it doesn't compile:
1. Run `cargo build --release --target=wasm32-wasip1` and read the errors carefully.
2. Open `src/run.rs` (or wherever the generated module is) to see the actual type signatures.
3. Adjust struct field names, method names, enum variants to match.
4. Iterate. The logic stays the same; only the binding to Shopify types needs adjustment.

- [ ] **Step 4: Build, fix any compile errors**

```bash
cd extensions/discount-function
cargo build --release --target=wasm32-wasip1 2>&1 | tail -30
```

Expected: builds successfully, OR specific compile errors pointing to mismatched type names. Fix iteratively per Step 3 strategy.

- [ ] **Step 5: Verify Wasm artifact size**

```bash
ls -lh target/wasm32-wasip1/release/*.wasm
```

Expected: artifact under 256KB (Shopify Function size limit).

- [ ] **Step 6: Run all Rust tests still pass**

```bash
cargo test 2>&1 | tail -10
```

Expected: ~20 tests still pass (no test changes, only main.rs added).

- [ ] **Step 7: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add extensions/discount-function/src/main.rs extensions/discount-function/input.graphql extensions/discount-function/schema.graphql
git commit -m "feat(discount-function): wire main.rs orchestration with node_kind filter"
```

---

## Task 6: First deploy of the Function

**Files:** none (deployment only)

- [ ] **Step 1: Push the extension via Shopify CLI**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
pnpm shopify app deploy --no-release --force 2>&1 | tail -10
```

Expected: `New version created. product-bundler-N`. The output includes a URL to the version in the Partner dashboard.

- [ ] **Step 2: Verify the Function appears in Partner dashboard**

Open the URL printed by step 1. Navigate to the version. Look for "Bundler discount" extension in the version's extension list.

Expected: Function present, status "Active" or "Draft" depending on release state.

- [ ] **Step 3: Verify `shopifyFunctions` query returns it**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
cat <<'EOF' > /tmp/query-functions.sh
#!/bin/bash
curl -s -X POST \
  -H "X-Shopify-Access-Token: $(grep SHOPIFY_API_SECRET apps/admin/.dev.vars | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  -d '{"query":"{shopifyFunctions(first:25,apiType:\"discount\"){nodes{id title}}}"}' \
  "https://deepseatools.myshopify.com/admin/api/2026-01/graphql.json"
EOF
chmod +x /tmp/query-functions.sh
```

This script needs an Admin API token (not the API secret). The dev.vars file doesn't have one, so we skip this verification step and rely on the Partner dashboard visual check + Task 11's TS test that mocks the same query.

If you want manual verification: use Shopify GraphiQL inside the dev store admin (Apps → Develop apps → Bundler → API access) to run the query.

- [ ] **Step 4: Mark deploy as a checkpoint commit**

No file changes; just a marker. Skip if no scratch files exist.

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git status
# If nothing to commit, proceed to Task 7
```

---

## Task 7: Local fixture testing via `shopify app function run`

**Files:**
- Create: `extensions/discount-function/test/fixtures/empty-config.json`
- Create: `extensions/discount-function/test/fixtures/bundle-match-combinable.json`
- Create: `extensions/discount-function/test/fixtures/bundle-no-match.json`
- Create: `extensions/discount-function/test/fixtures/qb-tier-match.json`
- Create: `extensions/discount-function/test/fixtures/non-combinable-node.json`

The exact JSON shape for fixture inputs depends on the Shopify-generated `schema.graphql` for `cart.lines.discounts.generate.run`. The simplest way to capture a valid input shape: deploy the Function (Task 6) and use Shopify CLI's `shopify app function run` interactively to capture a real input, then save and modify.

- [ ] **Step 1: Capture a baseline input via the CLI**

```bash
cd extensions/discount-function
pnpm shopify app function run 2>&1 | head -30
```

Without an `--input` flag, Shopify CLI prompts for sample input or generates one. Save the printed input JSON to `test/fixtures/empty-config.json` (no bundles in shop config).

If the command requires a deployed store with the Function active, use the dev store. If it generates a sample, capture that.

- [ ] **Step 2: Create variations of the baseline**

For each fixture, copy `empty-config.json` and modify:

`bundle-match-combinable.json`: Set `shop.metafield.value` to a JSON string with one combinable bundle requiring 2 products both present in `cart.lines`. Set `discountNode.metafield.value` to `"combinable"`.

`bundle-no-match.json`: Same bundle config but cart has only 1 of the 2 required products.

`qb-tier-match.json`: `shop.metafield.value` has a QB with 3 tiers; cart has 3 of the QB's product on a single line.

`non-combinable-node.json`: Same as `bundle-match-combinable.json` but `discountNode.metafield.value = "non_combinable"`. Bundle is `combinable: true` so it should NOT match.

- [ ] **Step 3: Run each fixture and verify expected output**

```bash
cd extensions/discount-function
for f in test/fixtures/*.json; do
  echo "=== $f ==="
  pnpm shopify app function run --input="$f" 2>&1 | tail -20
done
```

Expected output per fixture:
- `empty-config.json` → `operations: []`
- `bundle-match-combinable.json` → `operations` array with one `AddProductDiscounts` op containing the bundle's targets and value
- `bundle-no-match.json` → `operations: []`
- `qb-tier-match.json` → `operations` with the highest-matching tier's discount
- `non-combinable-node.json` → `operations: []` (filtered out by node_kind mismatch)

- [ ] **Step 4: Commit fixtures**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add extensions/discount-function/test/fixtures/
git commit -m "test(discount-function): add 5 input fixtures for shopify app function run"
```

---

## Task 8: Schema migration `0002` — discount node ID columns

**Files:**
- Modify: `apps/admin/drizzle/schema.ts`
- Create: `apps/admin/drizzle/migrations/0002_*.sql` (auto-generated)

- [ ] **Step 1: Modify `apps/admin/drizzle/schema.ts` `shops` table**

Find the `shops` table block (currently has `shopifyDiscountId` line). Add two new columns immediately after it:

```ts
shopifyDiscountId: text("shopify_discount_id"),
shopifyDiscountIdCombinable: text("shopify_discount_id_combinable"),
shopifyDiscountIdNonCombinable: text("shopify_discount_id_non_combinable"),
shopifyShopGid: text("shopify_shop_gid"),
```

(Keep `shopifyDiscountId` — cleanup deferred. Insert the two new columns between it and `shopifyShopGid`.)

- [ ] **Step 2: Generate the migration**

```bash
cd apps/admin
pnpm db:generate 2>&1 | tail -5
```

Expected: creates `drizzle/migrations/0002_<random_name>.sql` with `ALTER TABLE shops ADD COLUMN shopify_discount_id_combinable text` and `ALTER TABLE shops ADD COLUMN shopify_discount_id_non_combinable text`.

- [ ] **Step 3: Apply migration locally**

```bash
pnpm db:migrate:local 2>&1 | tail -5
```

Expected: `🚣 Executed N commands`.

- [ ] **Step 4: Apply migration to remote prod D1**

```bash
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" CLOUDFLARE_ACCOUNT_ID=e3dfc3a3d6ef58eb226c8eaeec1ab73f \
  pnpm db:migrate:prod 2>&1 | tail -5
```

Expected: same success on remote.

- [ ] **Step 5: Verify columns exist on remote**

```bash
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" CLOUDFLARE_ACCOUNT_ID=e3dfc3a3d6ef58eb226c8eaeec1ab73f \
  pnpm wrangler d1 execute bundler-prod --remote \
  --command "PRAGMA table_info(shops)" 2>&1 | grep -E "shopify_discount_id"
```

Expected: 3 lines mentioning `shopify_discount_id`, `shopify_discount_id_combinable`, `shopify_discount_id_non_combinable`.

- [ ] **Step 6: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/drizzle/schema.ts apps/admin/drizzle/migrations/
git commit -m "feat(admin): add shopifyDiscountIdCombinable + shopifyDiscountIdNonCombinable columns (migration 0002)"
```

---

## Task 9: `ensureDiscountNodes` helper (TDD)

**Files:**
- Create: `apps/admin/test/discount-nodes.test.ts`
- Create: `apps/admin/app/lib/discount-nodes.ts`

- [ ] **Step 1: Write tests at `apps/admin/test/discount-nodes.test.ts`**

```ts
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
  failNonCombinable?: boolean;
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
              nodes: [{ id: opts.fnId ?? FUNCTION_ID, title: "Bundler discount" }],
            },
          },
        }));
      }
      if (query.includes("discountAutomaticAppCreate")) {
        const isCombinable = (options?.variables as { d: { combinesWith: { productDiscounts: boolean } } })?.d?.combinesWith?.productDiscounts === true;
        if (!isCombinable && opts.failNonCombinable) {
          return new Response(JSON.stringify({
            data: {
              discountAutomaticAppCreate: {
                automaticAppDiscount: null,
                userErrors: [{ field: ["functionId"], message: "fail" }],
              },
            },
          }));
        }
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

  it("attaches correct node_kind metafield per kind", async () => {
    const { admin, calls } = makeAdmin();
    await ensureDiscountNodes(admin, db, SHOP);
    const createCalls = calls.filter((c) => c.query.includes("discountAutomaticAppCreate"));
    const kinds = createCalls.map((c) => {
      const vars = c.variables as { d: { metafields: { value: string }[] } };
      return vars.d.metafields[0]!.value;
    });
    expect(kinds.sort()).toEqual(["combinable", "non_combinable"]);
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

```bash
cd apps/admin
pnpm test discount-nodes 2>&1 | tail -10
```

Expected: 6 failing tests.

- [ ] **Step 3: Implement `apps/admin/app/lib/discount-nodes.ts`**

```ts
import { eq } from "drizzle-orm";
import type { DB } from "~/db.server";
import { schema } from "~/db.server";

type AdminGraphqlClient = {
  graphql(query: string, options?: { variables?: unknown }): Promise<Response>;
};

export async function ensureDiscountNodes(
  admin: AdminGraphqlClient,
  db: DB,
  shopId: string,
): Promise<{ combinable: string; nonCombinable: string }> {
  const row = (
    await db.select().from(schema.shops).where(eq(schema.shops.id, shopId)).limit(1)
  )[0];

  let combinableId = row?.shopifyDiscountIdCombinable ?? null;
  let nonCombinableId = row?.shopifyDiscountIdNonCombinable ?? null;

  if (combinableId && nonCombinableId) {
    return { combinable: combinableId, nonCombinable: nonCombinableId };
  }

  const functionId = await getOrFetchFunctionId(admin);

  if (!combinableId) {
    combinableId = await createDiscountNode(admin, functionId, "combinable", true);
  }
  if (!nonCombinableId) {
    nonCombinableId = await createDiscountNode(admin, functionId, "non_combinable", false);
  }

  await db
    .update(schema.shops)
    .set({
      shopifyDiscountIdCombinable: combinableId,
      shopifyDiscountIdNonCombinable: nonCombinableId,
    })
    .where(eq(schema.shops.id, shopId));

  return { combinable: combinableId, nonCombinable: nonCombinableId };
}

async function getOrFetchFunctionId(admin: AdminGraphqlClient): Promise<string> {
  const res = await admin.graphql(
    `query { shopifyFunctions(first: 25, apiType: "discount") { nodes { id title } } }`,
  );
  const data = (await res.json()) as {
    data: { shopifyFunctions: { nodes: { id: string; title: string }[] } };
  };
  const fn = data.data.shopifyFunctions.nodes.find((n) => n.title === "Bundler discount");
  if (!fn) {
    throw new Error("Bundler discount Function not found. Run `shopify app deploy` first.");
  }
  return fn.id;
}

async function createDiscountNode(
  admin: AdminGraphqlClient,
  functionId: string,
  kind: "combinable" | "non_combinable",
  combines: boolean,
): Promise<string> {
  const res = await admin.graphql(
    `mutation Create($d: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $d) {
        automaticAppDiscount { discountId }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        d: {
          title: kind === "combinable" ? "Bundler (combinable)" : "Bundler (non-combinable)",
          functionId,
          startsAt: new Date().toISOString(),
          combinesWith: {
            productDiscounts: combines,
            orderDiscounts: combines,
            shippingDiscounts: combines,
          },
          metafields: [
            {
              namespace: "pumper",
              key: "node_kind",
              type: "single_line_text_field",
              value: kind,
            },
          ],
        },
      },
    },
  );
  const data = (await res.json()) as {
    data: {
      discountAutomaticAppCreate: {
        automaticAppDiscount: { discountId: string } | null;
        userErrors: { field: string[]; message: string }[];
      };
    };
  };
  const result = data.data.discountAutomaticAppCreate;
  if (result.userErrors.length > 0) {
    throw new Error(`discountAutomaticAppCreate failed: ${JSON.stringify(result.userErrors)}`);
  }
  if (!result.automaticAppDiscount) {
    throw new Error("discountAutomaticAppCreate returned null discount");
  }
  return result.automaticAppDiscount.discountId;
}
```

- [ ] **Step 4: Run tests, verify all 6 pass**

```bash
pnpm test discount-nodes 2>&1 | tail -10
```

Expected: 6 passing.

- [ ] **Step 5: Run full test suite + typecheck**

```bash
pnpm test && pnpm typecheck
```

Expected: 74 tests passing total (68 prior + 6 new), clean typecheck.

- [ ] **Step 6: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/lib/discount-nodes.ts apps/admin/test/discount-nodes.test.ts
git commit -m "feat(admin): add ensureDiscountNodes helper (TDD)"
```

---

## Task 10: Wire `ensureDiscountNodes` into 4 save routes

**Files:**
- Modify: `apps/admin/app/routes/app.bundles.new.tsx`
- Modify: `apps/admin/app/routes/app.bundles.$id.tsx`
- Modify: `apps/admin/app/routes/app.quantity-breaks.new.tsx`
- Modify: `apps/admin/app/routes/app.quantity-breaks.$id.tsx`

In each route, add an import and a single line in the `action` after the repo `create`/`update` call but before `syncShopConfig`.

- [ ] **Step 1: Modify `apps/admin/app/routes/app.bundles.new.tsx`**

Add to imports:
```ts
import { ensureDiscountNodes } from "~/lib/discount-nodes";
```

Find the line `await syncShopConfig(db, admin, session.shop);` and insert immediately before it:
```ts
await ensureDiscountNodes(admin, db, session.shop);
```

- [ ] **Step 2: Modify `apps/admin/app/routes/app.bundles.$id.tsx`** — same change as Step 1.

- [ ] **Step 3: Modify `apps/admin/app/routes/app.quantity-breaks.new.tsx`** — same change.

- [ ] **Step 4: Modify `apps/admin/app/routes/app.quantity-breaks.$id.tsx`** — same change.

- [ ] **Step 5: Run typecheck + build**

```bash
cd apps/admin
pnpm typecheck && pnpm build 2>&1 | tail -3
```

Expected: clean typecheck, build succeeds.

- [ ] **Step 6: Run full test suite (no test changes, all pass)**

```bash
pnpm test 2>&1 | tail -5
```

Expected: 74 passing.

- [ ] **Step 7: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add 'apps/admin/app/routes/app.bundles.new.tsx' \
  'apps/admin/app/routes/app.bundles.$id.tsx' \
  'apps/admin/app/routes/app.quantity-breaks.new.tsx' \
  'apps/admin/app/routes/app.quantity-breaks.$id.tsx'
git commit -m "feat(admin): wire ensureDiscountNodes into bundle/QB save routes"
```

---

## Task 11: Deploy admin to Cloudflare Pages

**Files:** none (deployment only)

- [ ] **Step 1: Build admin**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App/apps/admin"
pnpm build 2>&1 | tail -3
```

- [ ] **Step 2: Deploy**

```bash
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" CLOUDFLARE_ACCOUNT_ID=e3dfc3a3d6ef58eb226c8eaeec1ab73f \
  pnpm exec wrangler pages deploy ./build/client \
  --project-name=bundler-admin --branch=main --commit-dirty=false 2>&1 | tail -5
```

Expected: `✨ Deployment complete!`.

- [ ] **Step 3: Wait for live**

```bash
until curl -sI https://bundler.deepseatools.in/app/bundles 2>/dev/null | grep -qE "HTTP"; do sleep 2; done
echo "Live"
```

- [ ] **Step 4: Push commits**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git push 2>&1 | tail -2
```

---

## Task 12: Release the Function (move from Draft to Active)

**Files:** none.

The Task 6 deploy created a new app version with the Function. We deployed `--no-release` (creates draft). We must release for the Function to actually run on the dev store.

- [ ] **Step 1: Release the latest version**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
pnpm shopify app release 2>&1 | tail -15
```

Expected: prompts for confirmation; pick the latest version (the one with the Function); confirm release.

If the CLI doesn't prompt and the command isn't `release`, try `pnpm shopify app deploy --release` or run `pnpm shopify app deploy` (without `--no-release`) to push + release in one step.

- [ ] **Step 2: Verify Function is active**

In Partner dashboard → app → Versions → most recent version → confirm extension status is "Released" or "Active".

---

## Task 13: End-to-end smoke test — combinable bundle

**Files:** none (manual verification).

- [ ] **Step 1: Create a bundle via admin**

1. Open `https://admin.shopify.com/store/deepseatools/apps/deepseatools-product-bundler`.
2. Click "Bundles" → "Create bundle".
3. Pick 2 distinct products from your dev store via ResourcePicker.
4. Set discount: type=Percentage, value=20.
5. Toggle "Combinable with other discounts" ON.
6. Set status: Active.
7. Click "Save bundle".

Expected: redirect to bundle list. Verify the bundle is present.

- [ ] **Step 2: Verify both discount nodes were created**

In Shopify admin → Discounts. Expected: two new entries — "Bundler (combinable)" and "Bundler (non-combinable)" — both Active.

- [ ] **Step 3: Verify D1 row populated**

```bash
curl -s -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"sql":"SELECT id, shopify_discount_id_combinable, shopify_discount_id_non_combinable FROM shops"}' \
  "https://api.cloudflare.com/client/v4/accounts/e3dfc3a3d6ef58eb226c8eaeec1ab73f/d1/database/d464f2ae-af1d-45f0-a8d0-f63e9c32e9ec/query" | python3 -c "import sys, json; d=json.load(sys.stdin); print(json.dumps(d.get('result', [{}])[0].get('results', []), indent=2))"
```

Expected: output includes both `shopify_discount_id_combinable` and `shopify_discount_id_non_combinable` as non-null GIDs.

- [ ] **Step 4: Test discount applies at checkout**

1. Visit the dev store storefront.
2. Add product 1 from the bundle to cart.
3. Add product 2 from the bundle to cart.
4. Proceed to checkout.
5. Verify discount summary shows "Bundler (combinable)" with 20% applied to the bundle's targets.

If the discount does NOT show:
- Check Shopify admin → Discounts → "Bundler (combinable)" → verify status is Active and combinesWith is permissive.
- Check the metafield via GraphiQL: `query { shop { metafield(namespace: "pumper", key: "config") { value } } }` — should contain the bundle.
- Check the Function's Run history in Partner dashboard for any errors.

---

## Task 14: End-to-end smoke test — QB tier + non-combinable separation

- [ ] **Step 1: Create a QB**

In admin: Quantity Breaks → Create quantity break:
- Pick a single product (any product on dev store).
- Add 3 tiers: qty=1 / 0% / "Buy 1", qty=2 / 10% / "10% off", qty=3 / 15% / "15% off, popular".
- Status: Active.
- Save.

- [ ] **Step 2: Test tier discount at checkout**

1. Visit storefront, navigate to the QB's product.
2. Add 3 of the product to cart.
3. Checkout.
4. Verify discount shows: 15% off on the tier-3 line.
5. Reduce quantity to 2; verify 10% off applies. Reduce to 1; verify no discount.

- [ ] **Step 3: Test non-combinable bundle separation**

1. Create another bundle. Same 2 products as Task 13's bundle. Set status=Active. **Toggle "Combinable" OFF.** Discount: 30% off.
2. Walk through cart with the 2 bundle products.
3. Checkout.
4. Expected behavior: Only ONE bundle's discount applies at a time. Shopify resolves the conflict via `combinesWith` rules (the non-combinable one will exclude the other from combining).
5. Verify in checkout discount summary that only one of "Bundler (combinable)" or "Bundler (non-combinable)" is line-itemized — not both.

---

## Task 15: Tag and push

- [ ] **Step 1: Final test + typecheck**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App/apps/admin"
pnpm test && pnpm typecheck
cd ../../extensions/discount-function
cargo test 2>&1 | tail -5
```

Expected: 74 TS tests pass, ~20 Rust tests pass.

- [ ] **Step 2: Tag**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git push 2>&1 | tail -2
git tag phase-3-complete
git push origin --tags 2>&1 | tail -3
```

Expected: tag pushed; GitHub repo shows `phase-3-complete`.

---

## Phase 3 Done Checklist

- [ ] `extensions/discount-function/` exists with `Cargo.toml`, source files, `shopify.extension.toml`.
- [ ] `cargo build --release --target=wasm32-wasip1` produces a Wasm artifact (<256KB).
- [ ] Rust unit tests pass: `cargo test` shows ~20 tests passing (3 config + 8 matcher + 9 discount).
- [ ] All 5 fixture inputs produce expected outputs via `shopify app function run`.
- [ ] `shopify app deploy` + `shopify app release` published the Function on the Partner dashboard.
- [ ] Schema migration `0002` applied locally + remotely.
- [ ] `apps/admin/app/lib/discount-nodes.ts` implemented; 6 TS tests passing; total TS suite at 74.
- [ ] All 4 save routes call `ensureDiscountNodes` before `syncShopConfig`.
- [ ] Production admin deploy succeeds.
- [ ] Saving a bundle on dev store creates 2 discount nodes (verified in Shopify admin Discounts page).
- [ ] D1 `shops` row has `shopify_discount_id_combinable` and `shopify_discount_id_non_combinable` populated.
- [ ] Combinable bundle: discount applies at checkout.
- [ ] QB: tier-3 discount applies at checkout when 3 of the product are in cart.
- [ ] Non-combinable bundle: discount applies under the "Bundler (non-combinable)" node, doesn't combine with combinable bundle's discount.
- [ ] `phase-3-complete` git tag pushed.
