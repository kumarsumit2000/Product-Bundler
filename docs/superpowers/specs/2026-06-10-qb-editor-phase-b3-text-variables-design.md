# QB Editor Redesign — Phase B3: Dynamic text variables + show/hide toggles

**Date:** 2026-06-10
**Status:** Approved design, ready for implementation planning
**Part of:** the QB editor redesign. Phases A (shell), B1 (discount tabs + BOGO), B2 (per-tier add-ons) shipped. This is **B3**. Remaining: B4 (price rounding + sold-out), then C/D.

## Context

The Pumper reference lets merchants customize the widget's tier text with **dynamic variables** (`{DiscountPercentage}`, `{DiscountAmountTotal}`) and per-element **show/hide (eye) toggles**, with a `{!}` button to insert variables. Our codebase already has the machinery:
- **`textOverrides`** — a JSON Record on QB (`Record<QbTextKey, string>`); an empty value falls back to the i18n default.
- **`tWith(overrides, key, vars)`** (`apps/widget-src/src/i18n.ts`) — uses the override if non-empty else the i18n default, then interpolates `{var}` tokens. Today the widget passes `{qty}` (for `qb.tierLabel`) and `{savings}` (for `qb.savingsBadge`).
- **Show/hide pattern** — `qb.freeGiftCallout.hidden` already exists: when that override key has a value, the widget omits the free-gift callout.
- Widget render sites (`render-qb.ts`): `qb.tierLabel` (line ~217, with `{qty}`), `qb.savingsBadge` (line ~171, with `{savings}`), `qb.mostPopular` (line ~168), `qb.freeGiftCallout` (line ~208).

B3 extends this — it adds two variables, two `.hidden` keys, and a better admin panel. No schema column changes (textOverrides is a flexible Record).

## Goal

Let merchants insert `{DiscountPercentage}` / `{DiscountAmountTotal}` into QB text and toggle the savings badge and "Most Popular" on/off, via a Pumper-style "Customize text" panel.

## Decisions (approved)
- Support the **reference variable names** `{DiscountPercentage}` and `{DiscountAmountTotal}`, while keeping the existing `{qty}` / `{savings}` working.

## Data model
Extend the `QbTextKey` union in `apps/admin/drizzle/schema.ts` with:
```ts
  | "qb.savingsBadge.hidden"
  | "qb.mostPopular.hidden"
```
(no new DB column — these are keys inside the existing `textOverrides` Record). The admin form's `textOverrides` default object gains empty entries for the new keys.

## Components

### 1. Widget interpolation — `render-qb.ts` (+ no i18n default change needed)
At each tier's render, compute and pass two extra interpolation vars to the relevant `tWith(...)` calls:
- `DiscountPercentage`: the tier's effective discount percentage as an integer string. For `discountType === "percentage"` it's `discountValue`; for `flat` / `fixed_per_unit`, derive it from the per-unit saving: `round((1 - unitCents / variant.priceCents) * 100)` (0 when base price is 0). Provide it on `qb.tierLabel` and `qb.savingsBadge` (and any element a merchant might template).
- `DiscountAmountTotal`: the formatted total savings — the SAME value currently passed as `savings` (`formatMoney(savings, currency, locale)`). Pass it under both names (`savings` for backward-compat AND `DiscountAmountTotal`).
The `interpolate()` function in `i18n.ts` already replaces any `{name}` token present in the `vars` map, so no i18n change is required — just pass the new vars. (Token names are case-sensitive; use exactly `DiscountPercentage` / `DiscountAmountTotal`.)

### 2. Show/hide in the widget — `render-qb.ts`
- Savings badge: render only when `savings > 0` AND `qb.textOverrides?.["qb.savingsBadge.hidden"]` is not truthy.
- Most-popular badge: render only when the tier `isMostPopular` AND `qb.textOverrides?.["qb.mostPopular.hidden"]` is not truthy.
Mirror exactly how `qb.freeGiftCallout.hidden` is already checked in the code.

### 3. Admin "Customize text" panel — `QbForm.tsx` + a small new helper/component
Rework the existing flat Text-overrides fields (in the "Settings" / text section) into rows, one per editable element: **Tier label** (`qb.tierLabel`), **Savings text** (`qb.savingsBadge`), **Most Popular** (`qb.mostPopular`), **Free-gift callout** (`qb.freeGiftCallout`). Each row has:
- a `TextField` bound to `textOverrides[key]` (placeholder = the i18n default so an empty field shows the fallback);
- a **`{!}` variable-insert** control (a Polaris `Popover` + `ActionList`, or a small `Select`) listing the tokens valid for that field (`{qty}`, `{DiscountPercentage}`, `{DiscountAmountTotal}`) — choosing one appends it to the field value via a pure helper;
- an **eye show/hide** toggle (only for elements that support `.hidden`: savings, most-popular, free-gift callout) that sets/clears `textOverrides[key + ".hidden"]` (any non-empty value = hidden; use `"1"`).
A new pure helper `apps/admin/app/lib/insert-token.ts` exports `insertToken(value, token)` returning `value + (value && !value.endsWith(" ") ? " " : "") + token` — unit-tested.

### 4. Variable list (single source)
Define the available tokens once (e.g. in `insert-token.ts` or a tiny constant module) as `QB_TEXT_TOKENS = ["{qty}", "{DiscountPercentage}", "{DiscountAmountTotal}"]` so the admin `{!}` menu and any docs stay consistent.

## Error handling / edge cases
- Unknown tokens a merchant types (e.g. `{foo}`) are left as-is by `interpolate()` (it only replaces known `vars`) — acceptable; the `{!}` menu only offers valid ones.
- `DiscountPercentage` for a 0-price base or `none`-discount tier resolves to `0`.
- Hiding the savings badge or most-popular only suppresses display; it doesn't change discount math.
- `.hidden` keys store `"1"`; the widget treats any non-empty string as hidden (matching the existing free-gift logic).

## Testing
- **Widget (TDD):** `interpolate`/`tWith` resolves `{DiscountPercentage}` and `{DiscountAmountTotal}` when passed; `render-qb` (a) interpolates a custom `qb.savingsBadge` override containing `{DiscountPercentage}` to the tier's percent, (b) omits the savings badge when `qb.savingsBadge.hidden` is set, (c) omits the most-popular badge when `qb.mostPopular.hidden` is set.
- **Admin (TDD):** `insertToken` appends a token with a single separating space (and no leading space when the field is empty).
- **Regression:** existing 233 admin + 113 widget tests stay green; typechecks + builds clean.
- **Manual:** set `qb.savingsBadge` to `"You save {DiscountAmountTotal} ({DiscountPercentage}% off)"`, confirm each tier renders its own numbers; toggle the eye to hide the savings badge / most-popular and confirm they disappear in the live preview.

## Out of scope (later)
A standalone discount-badge element separate from the per-tier `label` (the per-tier free-text `label` already serves that); price rounding `.99` + mark-as-sold-out (B4); font/color controls (Phase C).
