# Subscribe & Save — Purchase Options over third-party selling plans

**Date:** 2026-06-08
**Status:** Approved design, ready for implementation planning

## Context

Competitor bundle apps (Pumper and similar) advertise a "Subscribe & Save" / "Purchase
Options" surface. Their own config UI states it plainly: *"Subscription settings should be
set in a third-party subscription app."* They do **not** run subscription billing — they read
the **selling plans** a third-party app (Shopify Subscriptions, Recharge, Seal, …) has already
attached to a product, render a styled One-time vs Subscribe toggle, and attach the chosen
`selling_plan` to the cart line. Shopify + the third-party app own the recurring billing.

This is the only widget type from that reference we don't have. We previously had a `subscription`
JSON column holding a fake `{ enabled, discountPercent, interval }` "intent" that never touched
real selling plans and whose admin UI was orphaned; it was removed in migration `0046`. This
feature is the **correct** version: a display/config layer over real selling plans.

**Goal:** Surface third-party selling plans as a per-offer "Purchase Options / Subscribe & Save"
block on Quantity Break, Bundle, and BXGY widgets, plus a standalone-looking dashboard preset.

## Approach (chosen: A — reuse, no new entity)

One shared purchase-options module, configured per-offer, added to the three existing widget
types. The "standalone Subscribe & Save" card is a Quantity Break **preset** (1 Pack / 2 Packs with
subscription enabled) surfaced as a dashboard template — no new table, routes, render path, or
liquid block. (Rejected Approach B: a dedicated `subscription_offers` entity — duplicated CRUD,
render, and liquid for a card that is functionally a QB-with-subscribe.)

## Data model

Re-add a `subscription` JSON column to `bundles`, `quantity_breaks`, and `bxgy_offers`
(migration `0047`). Display/config shape (NOT the deleted intent shape):

```ts
export type SubscriptionConfig = {
  enabled: boolean;
  heading: string;            // "Purchase Options" — heading above the options
  title: string;              // "Subscribe & Save"
  subtitle: string;           // "Cancel anytime"
  details: string;            // "Enjoy flexible billing & discounts"
  widgetStyle: "modern" | "classic";
  showDiscountLabel: boolean; // show e.g. "Save 10%" next to the subscribe price
  hideThirdPartyWidget: boolean;
};
```

Default when absent: `null` (subscription block not shown). A sensible `EMPTY_SUBSCRIPTION`
default seeds the admin panel when the merchant toggles it on.

## Components

### 1. Liquid — `extensions/theme-app-extension/blocks/app-embed.liquid`
Expose what Shopify already computes (no price math on our side):
- `_pumperConfig.sellingPlanGroups`: `[{ id, name, plans: [{ id, name }] }]` from
  `product.selling_plan_groups`.
- Each `productVariant` gains `sellingPlanAllocations`: `[{ planId, priceCents }]` from
  `variant.selling_plan_allocations` (Shopify's already-discounted per-variant subscribe price).
- `requiresSellingPlan` from `product.requires_selling_plan`.

### 2. Widget — `apps/widget-src/src/render-purchase-options.ts` (new)
Shared `renderPurchaseOptions(mount, offer, ctx)` consumed by `render-qb.ts`,
`render-bundle.ts`, `render-bxgy.ts`:
- Renders `heading`, a **One-time** radio (standard price) and a **Subscribe & Save** radio
  (`title` / `subtitle` / `details`, subscribe price from the variant's allocation, optional
  `showDiscountLabel` chip computed from one-time vs subscribe price).
- Selling-plan dropdown when the selected group exposes >1 plan (e.g. "2 Months Subscription").
- Exposes selected state `{ mode: "onetime" | "subscribe", sellingPlanId: string | null }` via a
  getter / callback. The host widget reads it when building cart lines.
- `widgetStyle` switches class names only (`modern` vs `classic`).

### 3. Widget — `apps/widget-src/src/add-to-cart.ts`
`CartLineInput` gains `sellingPlanId?: string`. When present, append
`items[i][selling_plan]` (numeric id, via `toCartVariantId`-style normalization) to the FormData.
No other cart change.

### 4. Widget types — `apps/widget-src/src/types.ts`
Re-add `SubscriptionConfig`; add `subscription?: SubscriptionConfig | null` to the QB / Bundle /
BXGY config types; add `sellingPlanAllocations?` to the product-variant type and
`sellingPlanGroups?` to `_pumperConfig`.

### 5. Admin — `apps/admin/app/components/SubscriptionPanel.tsx` (rebuilt)
A card rendered in `QbForm.tsx`, `BundleForm.tsx`, `BxgyForm.tsx`:
- Enable toggle (card header), the two info banners from the reference, Widget Style select,
  Purchase Options Heading, Subscription Title, Subtitle, Details, "Show subscription discount
  label" toggle, "Hide third party subscription Widget" toggle.
- Serializes to a single hidden `subscription` input (JSON). New
  `apps/admin/app/lib/parse-subscription.ts` parses + validates it back to `SubscriptionConfig`.

### 6. Admin wiring
The four create/edit routes (`app.bundles.new/$id`, `app.quantity-breaks.new/$id`,
`app.bxgy-offers.new/$id`) parse the field and pass it through validate → repo (mirrors how the
deleted version was wired, now restored with the new shape). Validation input types in
`lib/bundles/validate.ts` and `lib/quantity-breaks/validate.ts` (and the BXGY equivalent) gain the
`subscription` field.

### 7. Storefront config — `apps/admin/app/lib/storefront-config.ts`
Serialize `subscription` for QB, bundle, and BXGY entries (mirror of the lines removed in `0046`,
now with the new shape).

### 8. Preview — `apps/admin/app/lib/preview-config.ts`
Thread `subscription` into the preview iframe payload and inject a **mock selling plan** so the
merchant always sees the Subscribe option rendered while editing, regardless of whether the
preview product has real selling plans.

### 9. Dashboard standalone card — `apps/admin/app/routes/app._index.tsx`
Add a `qb_subscribe` template ("Subscribe & Save") with a preview component and a prefill that
opens `/app/quantity-breaks/new` with 1 Pack / 2 Packs tiers and subscription enabled.

## Data flow

1. Merchant configures real subscriptions in a third-party app → selling plans land on products.
2. Merchant enables **Subscription** on a QB/Bundle/BXGY offer and sets copy/style.
3. Storefront: `app-embed.liquid` exposes selling plans + allocations → widget renders Purchase
   Options → customer picks Subscribe + a plan → `add-to-cart` attaches `selling_plan` → Shopify +
   the third-party app handle recurring billing.

## Error handling

- Product has **no selling plans** → the subscription block is hidden entirely even if `enabled`;
  the widget shows one-time only. Never render an empty/broken toggle.
- Missing allocation price → fall back to the variant's one-time price (no discount label).
- Preview always renders the block via the injected mock plan.
- `hideThirdPartyWidget` → hide known third-party subscription widgets via a small selector list
  (same MutationObserver pattern as `cart-drawer-bridge.ts`). Best-effort; documented as such.

## Known constraints (v1)

- Selling plans are read from the **current PDP product** (Liquid only sees that product). Subscribe
  options therefore show when the widget's product is the page's product — the normal case. Widgets
  pointed at a *different* product than the PDP will not show subscribe options in v1.
- `hideThirdPartyWidget` covers a curated selector list, not every subscription app.

## Testing

- **Unit:** `parse-subscription` (round-trip + clamping), `add-to-cart` `selling_plan` formatting,
  `renderPurchaseOptions` selection state (onetime ↔ subscribe, plan switch), storefront-config
  serialization includes `subscription`.
- **Build:** admin typecheck + widget typecheck/build clean; widget bundle stays within budget.
- **Manual:** dev store with a real subscription app + a selling plan → verify the subscribe price
  displays, the discount label is correct, and the added cart line carries the selling plan id.

## Out of scope

- Running/managing subscriptions, creating selling plans, billing intervals (third-party owns this).
- Cross-product selling plans (widget product ≠ PDP product).
- A dedicated standalone `subscription_offers` entity (Approach B).
