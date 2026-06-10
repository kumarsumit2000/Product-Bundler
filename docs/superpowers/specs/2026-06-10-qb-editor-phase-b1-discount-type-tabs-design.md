# QB Editor Redesign — Phase B1: Discount-type tabs + BOGO

**Date:** 2026-06-10
**Status:** Approved design, ready for implementation planning
**Part of:** the multi-phase QB editor redesign. Phase A (shell + tier-row chrome) shipped. Phase B is the tier-editor inner upgrade, decomposed into B1 (this), B2 (per-tier add-ons), B3 (dynamic text variables), B4 (price rounding + sold-out). This spec is **B1 only**.

## Context

The Pumper reference shows each tier's discount as a row of tabs — **% Off / Flat / Specific / BOGO / None** — with per-type inputs and a BOGO config block. Our QB tier already supports the underlying data: `discountType: "percentage" | "flat" | "fixed_per_unit"`, an optional `bogo { mode, targetVariantId, bonusQty }`, and `discountValue`. The widget (`render-qb.ts`) already renders all discount types **and** per-tier BOGO. The admin, however, only exposes a plain discount-type `Select` (percentage / flat / fixed_per_unit) and has **no UI** for BOGO.

There is also a latent **bug**: `TierFormValue` stores BOGO as flat fields (`bogoMode` / `bogoTargetVariant` / `bogoBonusQty`), but the QB route actions build the persisted tier's `bogo` by reading `t.bogo` — which `TierFormValue` does not have. So any BOGO a merchant could set today would silently not persist. B1 fixes this.

## Goal

Replace the discount-type `Select` with a 5-tab control (% Off / Flat / Specific / BOGO / None), add the BOGO config UI, and fix the form→action serialization so BOGO + per-tier free gift actually save. No schema change, no migration, no widget change.

## The model (derived tabs, no schema change)

The 5 tabs map onto existing fields:

| Tab | Sets on the tier | Input shown |
|---|---|---|
| **% Off** | `discountType="percentage"`, `bogo=undefined` | "Discount in %" (discountValue) |
| **Flat** | `discountType="flat"`, `bogo=undefined` | "Discount amount" (discountValue) |
| **Specific** | `discountType="fixed_per_unit"`, `bogo=undefined` | "Price per unit" (discountValue) |
| **BOGO** | `bogo={mode,targetVariantId?,bonusQty}` | BOGO config block |
| **None** | `discountType="percentage"`, `discountValue=0`, `bogo=undefined` | (no input) |

The **active tab is derived** from the tier value, in this order:
1. `bogo` present → `BOGO`
2. `discountType === "fixed_per_unit"` → `Specific`
3. `discountValue === 0` (and no bogo) → `None`
4. `discountType === "flat"` → `Flat`
5. otherwise → `% Off`

So a "Buy 1 at standard price" tier (value 0) reads as **None**, matching Pumper. (Rejected alternative: an explicit `discountKind` field — unnecessary schema; the derivation is unambiguous for real tiers.)

## Components

### 1. Pure helpers — `apps/admin/app/lib/qb-tier-discount.ts` (new)
- `type DiscountTab = "percentage" | "flat" | "fixed_per_unit" | "bogo" | "none";`
- `tierDiscountTab(tier): DiscountTab` — the derivation above. Operates on the flat `TierFormValue` shape (`discountType`, `discountValue`, `bogoMode`).
- `applyDiscountTab(tier, tab): TierFormValue` — returns a new tier with the fields set per the table (e.g. switching to `% Off` clears `bogoMode`/`bogoTargetVariant`; switching to `bogo` sets `bogoMode` to a default `"add_same"` and `bogoBonusQty` to `1` if unset; `none` sets `discountValue=0`, `discountType="percentage"`, clears bogo). Pure, fully unit-tested.

### 2. `QbTierBuilder.tsx` — tier body UI
In the expanded tier body, replace the discount-type `Select` with:
- A **tab row**: 5 `Button`s (pressed/`variant` state for the active tab from `tierDiscountTab(tier)`); clicking calls `updateTier(i, applyDiscountTab(tier, tab))` (delta-applied via the existing `updateTier`).
- **Per-type input** (conditional on active tab):
  - `% Off` → "Discount in %" number field → `discountValue`
  - `Flat` → "Discount amount" number field → `discountValue`
  - `Specific` → "Price per unit" number field → `discountValue`
  - `None` → no input (helper text: "This tier sells at standard price.")
  - `BOGO` → **BOGO config block**: a `Select` for mode (`Add same` = `add_same`, `Add different` = `add_different`, `Nth free` = `nth_free`) → `bogoMode`; a **`VariantPicker`** shown only when mode is `add_different` → `bogoTargetVariant`; a "Bonus quantity" number field → `bogoBonusQty`.
- Keep the existing label field. The `discountValue` field's label changes per tab (above).

### 3. Serialization fix — `app.quantity-breaks.new.tsx` and `app.quantity-breaks.$id.tsx`
In each route action's `tiersRaw.map(...)`, build the persisted tier from the **flat form fields**, not a non-existent `t.bogo`:
```ts
bogo: t.bogoMode ? { mode: t.bogoMode, targetVariantId: t.bogoTargetVariant?.variantId ?? undefined, bonusQty: t.bogoBonusQty ?? 1 } : undefined,
freeGiftVariantId: t.freeGiftVariant?.variantId ?? undefined,
```
(Today these read `t.bogo` / `t.freeGiftVariantId` which are absent on `TierFormValue`, so they never persist.) Keep `enabled`, `extraProducts`, and all other tier fields exactly as wired in Phase A.

### 4. Preview parity
The live preview already builds the QB config from the form's tiers via `buildPreviewQbConfig`. Confirm the preview path carries `bogo` from the same flat fields (it spreads/maps the tier — verify BOGO reaches the preview so merchants see it). If the preview tier mapping reads `t.bogo`, apply the same flat-field fix there.

## Data / widget

**No schema change, no migration, no widget change.** `discountType`, `bogo`, `freeGiftVariantId` already exist on `QbTier`; `render-qb.ts` already renders BOGO and all discount types. B1 is admin UI + the serialization fix only.

## Error handling / edge cases

- Switching tabs never loses the label or qty; it only changes discount fields per the table.
- `BOGO` + `add_different` with no target variant chosen → persist `bogo` with `targetVariantId` undefined; the widget already falls back (it handles a missing target by using the tier's own variant — confirm in render-qb; if not, the admin shows a hint to pick a target).
- `None` forces `discountValue=0`; re-selecting `% Off` leaves value at 0 until the merchant types one.
- Bonus qty clamps to `>= 1`.

## Testing

- **Unit (admin):** `qb-tier-discount.test.ts` — `tierDiscountTab` returns the right tab for each of: percentage>0, flat>0, fixed_per_unit, value 0, and a tier with `bogoMode` set; `applyDiscountTab` sets/clears the right fields for each of the 5 tabs (esp. switching to bogo sets defaults, switching away clears `bogoMode`/`bogoTargetVariant`).
- **Unit (admin):** a route/repo-level test (extend an existing QB action/repo test or add one) asserting a form tier with `bogoMode="add_different"` + a target variant serializes to a persisted `bogo: { mode, targetVariantId, bonusQty }`, and a `freeGiftVariant` serializes to `freeGiftVariantId`.
- **Regression:** existing 216 admin + 110 widget tests stay green; typecheck + builds clean.
- **Manual:** in the editor, select each tab; set BOGO add-different + a target variant + bonus qty; save; reopen and confirm the tab + BOGO persisted; confirm the live preview shows the BOGO badge.

## Out of scope (later B-phases)

Per-tier Add-Ons (+Image / +Free Gift card / +Free Ship), dynamic text variables (`{DiscountPercentage}` etc.) + show/hide eye toggles, price rounding (.99), mark-as-sold-out. (Note: per-tier **free gift** data serialization is fixed here as a byproduct, but the +Free Gift *UI card* belongs to B2.)
