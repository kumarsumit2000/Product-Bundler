# QB Editor Redesign — Phase B2: Per-tier Add-Ons (+Free Gift / +Image / +Free Ship)

**Date:** 2026-06-10
**Status:** Approved design, ready for implementation planning
**Part of:** the QB editor redesign. Phase A (shell), B1 (discount-type tabs + BOGO) shipped. This is **B2** — the per-tier Add-Ons. Remaining: B3 (dynamic text variables), B4 (rounding + sold-out).

## Context

The Pumper reference shows per-tier **Add-Ons** chips: **+Image**, **+Free Gift**, **+Free Ship**. Current state:
- **Free gift** is ~90% built — `QbTierBuilder` already renders a per-tier free-gift `VariantPicker` (in an "Advanced" section), the widget renders per-tier free gifts (`render-qb.ts`), and B1's `serializeTierForm` persists it. B2 just reorganizes it into a proper Add-On chip.
- **Image** — no per-tier image exists anywhere. New field + admin picker + widget display.
- **Free shipping** — there is a Rust `shipping-discount-function`. Today free shipping is **subtotal-based** for Progressive Gifts only (the function reads `shop.metafield("pumper","config")` + cart subtotal, grants 100%-off delivery if subtotal ≥ the lowest PG `shippingThresholds.minSpendCents`). The discount-function matches a QB's active tier by **product id + line quantity** (highest tier with `qty ≤ line.quantity`). Per-tier QB free shipping must mirror that quantity-based matching in the shipping function.

## Goal

Add per-tier **image** and **free shipping**, and surface free gift + image + free shipping as Add-On chips in the tier editor. Free shipping is granted at checkout when the customer's **active tier** (the highest tier their cart quantity reaches) has `freeShipping: true`.

## Decisions (approved)
- **Free-ship trigger = the active tier** (highest `qty ≤ line.quantity`), identical to the discount-function rule. Lower tiers' flags don't apply.
- **+Image = an image URL** chosen via the existing `ShopifyImageField` (upload / Shopify Files), shown on the tier row.

## Data model (no migration — `tiers` is a JSON column)

Add to `QbTier` (`apps/admin/drizzle/schema.ts`) and the widget `QbTier` (`apps/widget-src/src/types.ts`):
```ts
  image?: string;          // tier image URL (display only)
  freeShipping?: boolean;  // grant free shipping when this tier is the active tier
```
Add to `TierFormValue` (`QbTierBuilder.tsx`): `image?: string;` and `freeShipping?: boolean;` (+ defaults in `DEFAULT_TIER`: `image: undefined`, `freeShipping: false`).

`serializeTierForm` (`apps/admin/app/lib/serialize-qb-tier.ts`) gains `image: t.image || undefined` and `freeShipping: t.freeShipping || undefined`.

## Components

### 1. Add-Ons chips — `QbTierBuilder.tsx`
In the expanded tier body, a row of toggle chips: **+ Free Gift**, **+ Image**, **+ Free Ship**. Each chip shows "active" styling when its data is set, and toggling it reveals/hides its config:
- **+ Free Gift** → the existing per-tier `VariantPicker` (relocate it from the current "Advanced" section to this chip's revealed block; the chip is "on" when `freeGiftVariant` is set; turning it off clears `freeGiftVariant`).
- **+ Image** → a `ShopifyImageField` (reuse the existing component used elsewhere, e.g. newsletter/QB image fields) bound to `tier.image`; the chip is on when `image` is set; off clears it.
- **+ Free Ship** → no extra config; toggling sets `tier.freeShipping` true/false (chip on = `freeShipping === true`).
Use the existing tier `updateTier(i, patch)` setter for all three.

### 2. Widget — `apps/widget-src/src/render-qb.ts`
- When a tier has `image`, render a small thumbnail in the tier row (next to the title), reserving space to keep CLS = 0.
- When a tier has `freeShipping`, render a **"Free shipping"** badge/line on that tier (use an i18n key `qb.freeShipping` = "🚚 Free shipping" added to all 11 locales in `i18n.ts`, mirroring the B-phase i18n approach).
- Per-tier free gift rendering is unchanged.

### 3. Storefront config — `apps/admin/app/lib/storefront-config.ts`
The QB tier serializer adds `image: tr.image ?? null` and `freeShipping: tr.freeShipping ?? false` so the widget receives them. (Widget tier type gains these fields in step Data model.)

### 4. Metafield config (functions) — `apps/admin/app/lib/metafield-sync.ts`
In the `quantityBreaks[].tiers[]` mapping, add `freeShipping: tr.freeShipping ?? false`. (Do **not** sync `image` — it's display-only and irrelevant to the functions; keep the 50 KB metafield lean.)

### 5. Rust `shipping-discount-function`
- **`src/run.graphql`** — extend the cart query to read, per line, `quantity` and `merchandise { ... on ProductVariant { product { id } } }` (today only subtotal + delivery options).
- **`src/run.rs`** — extend `ShopConfig` to also deserialize `quantityBreaks: Vec<QuantityBreak>` where `QuantityBreak { status: String, productId: String, tiers: Vec<QbTier{ qty: u32, freeShipping: bool }> }` (serde `default` on new fields; product id field renamed via serde). Logic: after the existing PG subtotal check, also grant free shipping if **any active QB** has a cart line whose `product.id == qb.productId` and whose **active tier** (the max-qty tier with `qty ≤ line.quantity`) has `freeShipping == true`. Grant = the existing 100%-off-all-delivery-options result. Union semantics: free shipping if PG-subtotal OR QB-tier qualifies.
- **`discount-function`** — no change (serde ignores the new tier fields).

## Data flow (free shipping)

admin tier `freeShipping=true` → `serializeTierForm` → DB `quantity_breaks.tiers` → `syncShopConfig` writes it into `shop.metafield("pumper","config").quantityBreaks[].tiers[].freeShipping` → shipping function reads cart lines + that config, matches the active tier by product+qty → grants free shipping at checkout.

## Error handling / edge cases

- A tier with `image` but unavailable/empty URL → widget simply renders no thumbnail (no broken image: guard on a non-empty string).
- Free shipping union: if a Progressive Gift subtotal threshold AND a QB tier both qualify, free shipping is granted once (idempotent — the function returns a single 100%-off result).
- Only the **active** tier's `freeShipping` counts; a `freeShipping` flag on a lower, non-active tier does nothing.
- Turning a chip "off" clears its data (`freeGiftVariant`/`image`) so stale data isn't persisted; `freeShipping` toggles boolean.
- Config size: two new tier fields are negligible vs the 50 KB metafield cap.

## Testing

- **Admin (TDD):** extend `serialize-qb-tier.test.ts` (image + freeShipping carried); a `metafield-sync` test asserting QB tier `freeShipping` reaches the synced config and `image` does **not**; a `storefront-config` test asserting QB tiers carry `image` + `freeShipping`.
- **Widget (TDD):** `render-qb.test.ts` — a tier with `image` renders a thumbnail; a tier with `freeShipping` renders the free-shipping badge; absence renders neither.
- **Rust:** add a `#[cfg(test)]` unit test in `shipping-discount-function/src/run.rs` for the new tier-match (a cart line qty meeting a `freeShipping` tier → free shipping; not meeting → none; PG-union still works). Build check: `cargo build --release --target wasm32-wasip1` (or the project's target) succeeds.
- **Regression:** existing admin (229) + widget (110) tests stay green; typechecks + builds clean.
- **Manual:** set a tier image + free-ship; save; storefront shows the thumbnail + free-ship badge; at checkout, reaching that tier's quantity grants free shipping (dev store).

## Out of scope (later B-phases)
Dynamic text variables (`{DiscountPercentage}` etc.) + show/hide eye toggles (B3); price rounding (.99) + mark-as-sold-out (B4). Per-tier free shipping does **not** introduce a per-tier minimum spend (it triggers purely on the active tier); a spend threshold could be a later enhancement.
