# QB Editor Redesign — Phase B4: Price rounding (.99) + Mark as sold out

**Date:** 2026-06-11
**Status:** Approved design, ready for implementation planning
**Part of:** the QB editor redesign. Phases A (shell), B1 (discount tabs + BOGO), B2 (per-tier add-ons), B3 (text variables) shipped. This is **B4** — the last of Phase B. Then C (Color & Style), D (Advanced Settings).

## Context

The Pumper reference shows, per tier, a **Price Rounding** toggle + a `.99` ending selector, and a **Mark as Sold Out** toggle. Current state:
- The widget computes the per-unit discounted price via `tierUnitCents(tier, basePriceCents)` (`render-qb.ts`) — no charm rounding.
- The Rust `discount-function` applies the tier discount at checkout via `discount::compute_qb_tier_value(tier, line_amount_per_unit)` → `DiscountValue::Percentage(p)` or `FixedAmount(a)`; `build_discount(...)` currently emits FixedAmount with `applies_to_each_item: None`.
- Tiers have a computed `available` flag (from variant stock) and the widget already applies a `pumper-qb-tier--unavailable` class; there is no manual sold-out override.
- `QbTier` is a JSON column (no migration needed to add tier fields). `serializeTierForm` (form → DB), `storefront-config` (→ widget), and `metafield-sync` (→ functions) already carry tier fields.

## Goal

Add per-tier **mark-as-sold-out** (display + non-selectable, widget-only) and **checkout-accurate charm price rounding** (widget display, function config, and the Rust discount-function all land on the same `.99` price).

## Decisions (approved)
- Rounding endings: `.99` / `.95` / `.00`, **nearest-rounding** (may nudge a price up or down a few cents).
- Sold-out is **widget-only** (display + non-selectable); no function change. (A customer manually reaching the qty outside the widget would still get the discount — acceptable display nudge.)
- Both fields are **per-tier** (JSON, no migration).

## Data model

Add to `QbTier` (`apps/admin/drizzle/schema.ts`), the widget `QbTier` (`apps/widget-src/src/types.ts`), and `TierFormValue` (`QbTierBuilder.tsx`, with defaults `soldOut: false`, `priceRounding: undefined`):
```ts
  soldOut?: boolean;        // manual "this tier is unavailable"
  priceRounding?: number;   // charm ending in cents (99 | 95 | 0); absent = no rounding
```
`serializeTierForm` carries both: `soldOut: t.soldOut || undefined`, `priceRounding: t.priceRounding ?? undefined`.

## Shared rounding formula

A pure `roundCharmCents(priceCents: number, endingCents: number): number` implemented **identically** in TS (`apps/widget-src/src/round-charm.ts`, re-exported/duplicated for admin if needed) and Rust (`extensions/discount-function/src/discount.rs`):
- Let `dollars = Math.floor(priceCents / 100)`. Candidates: `[(dollars-1)*100 + ending, dollars*100 + ending, (dollars+1)*100 + ending]`, filtered to `>= 0`. Return the candidate with the smallest absolute distance to `priceCents` (ties → the lower one).
- Examples (ending 99): `1996 → 1999`, `1940 → 1899`, `2000 → 1999`. (ending 0): `1996 → 2000`, `1940 → 1900`.

## Components

### 1. Mark as sold out (TS only)
- **Admin (`QbTierBuilder`):** a per-tier "Mark as sold out" toggle (`Checkbox`/Switch) bound to `tier.soldOut` via `updateTier`.
- **Widget (`render-qb`):** compute `const unavailable = tr.soldOut === true || tr.available === false;`. Use `unavailable` for: the `pumper-qb-tier--unavailable` class, a "Sold out" label (new i18n key `qb.soldOut` in all 11 locales), and the **select guard** (the tier-select click handler and the default-selected-index computation must skip `unavailable` tiers — extend the existing `available === false` guard to also check `soldOut`). The add-to-cart for an unavailable tier is prevented (consistent with current unavailable handling).

### 2. Price rounding (checkout-accurate)
- **Widget (`render-qb`):** after `tierUnitCents(tr, variant.priceCents)`, if `tr.priceRounding != null`, set `unitCents = roundCharmCents(unitCents, tr.priceRounding)` before computing `totalCents`, `savings`, and display. (Total = roundedUnit × qty; savings recomputed from the rounded unit.)
- **storefront-config:** QB tier serializer adds `priceRounding: tr.priceRounding ?? null`.
- **metafield-sync:** QB tier mapping adds `priceRounding: tr.priceRounding ?? null` (functions need it).
- **Rust `discount-function`:**
  - `config.rs` `QbTier`: add `#[serde(rename = "priceRounding", default)] pub price_rounding: Option<u32>`.
  - `discount.rs`: add `pub fn round_charm_cents(price_cents: i64, ending: u32) -> i64` (the formula above) + unit tests. Extend the QB value computation so that when `price_rounding` is set: compute the discounted unit price in cents = `round(apply_discount(line_amount_per_unit))`, round it via `round_charm_cents`, and return a **per-unit FixedAmount** discount = `original_unit_cents − rounded_unit_cents` (as dollars). To apply per-item, `build_discount` (and `DiscountValue`) gain an `applies_to_each_item` path so the FixedAmount is charged per unit (set `applies_to_each_item: Some(true)` for rounded tiers). Non-rounded tiers keep today's exact behavior (Percentage / whole-line FixedAmount) unchanged.
  - Add a Rust unit test: a percentage-20 tier on a $24.95 unit with `priceRounding=99` yields a per-item FixedAmount that lands the unit at `$19.99` (i.e. `round_charm_cents(1996, 99) == 1999`, discount = `2495 − 1999 = 496` cents per unit).
- **Admin (`QbTierBuilder`):** a per-tier "Price rounding" toggle + an ending `Select` (`.99`→99, `.95`→95, `.00`→0). Toggling off sets `priceRounding = undefined`; on defaults to 99.

## Data flow (rounding)
tier `priceRounding=99` → `serializeTierForm` → DB `quantity_breaks.tiers` → `syncShopConfig` → shop metafield → Rust discount-function rounds the per-unit price to .99 at checkout (per-item FixedAmount); storefront-config → widget rounds the displayed price. Both land on $19.99.

## Error handling / edge cases
- `roundCharmCents` never returns negative (candidates filtered `>= 0`); a rounded price above the base price means a negative discount — clamp the per-unit FixedAmount to `>= 0` (never an upcharge at checkout). The widget display may show a rounded price slightly above the exact discount; that's the intended charm behavior, but the checkout discount is clamped to never increase price.
- `priceRounding` on a 0-price base → no-op (discount 0).
- A tier both `soldOut` and selected previously → the widget moves selection to the first available tier.
- Sold-out + price rounding are independent; a sold-out tier isn't purchasable so its rounding is moot.

## Testing
- **TS (TDD):** `roundCharmCents` cases (1996/1940/2000 @99; 1996/1940 @0); `serializeTierForm` carries `soldOut` + `priceRounding`; `render-qb` (a) marks a `soldOut` tier unavailable + shows "Sold out" + skips it in default selection, (b) shows a rounded unit price when `priceRounding` set; `storefront-config` + `metafield-sync` carry `priceRounding`.
- **Rust (TDD):** `round_charm_cents` unit test; the per-item rounded FixedAmount test above; `cargo build --target=wasm32-unknown-unknown --release` green.
- **Regression:** 237 admin + 116 widget tests stay green; typechecks + builds clean.
- **Manual (dev store):** a tier with `priceRounding=99` shows $19.99 on the PDP and charges $19.99 at checkout; a `soldOut` tier shows greyed "Sold out" and can't be selected.

## Out of scope
Per-offer/global rounding (this is per-tier); rounding the BOGO/free-gift lines (rounding applies to the main tier line only); preventing the discount when a sold-out tier's qty is reached outside the widget.
