# QB Widget — Add-to-cart + Buy-now buttons (show/hide + styling)

**Date:** 2026-06-11
**Status:** Approved design, ready for implementation planning
**Scope:** Re-introduce the QB widget's own **Add to cart** button and add a **Buy now** button, each independently show/hide-able per QB, with merchant-customizable button colors in the Color & Style panel. The theme quantity-sync (from the prior theme-ATC change) stays on as the no-buttons fallback.

## Context

The previous change removed the widget's `.pumper-cta` button to drive the theme's native add-to-cart (`theme-atc.ts`: `findProductForm`/`syncThemeQuantity`/`bindThemeAddToCart`). `render-qb.ts` now has `buildTierLines(tr)` + `tierHasExtraLines(tr)` and a `themeForm` wired after `renderAll()`. The widget's own buttons call Shopify's `/cart/add.js` directly via `addToCart(...)` — **theme-agnostic, works on every theme**; only the quantity-sync is theme-dependent (fallback). `addToCart` accepts `{ afterAddToCart: "drawer"|"cart"|"checkout" }` (Phase D). The Color & Style pipeline (`StyleOverrides` → `buildStyleOverrides` → `widget.ts` CSS vars → `widget.css`; editable via `StyleSections`) already exists. `quantity_breaks` latest column is `afterAddToCart`; latest migration is `0048`.

## Decisions (approved)
- Defaults: **`showAddToCart` = true**, **`showBuyNow` = false**.
- **Buy now** = `addToCart(...)` then redirect to `/checkout` (via `afterAddToCart: "checkout"`).
- Theme quantity-sync stays **always on** (fallback when both buttons hidden).
- Four customizable button colors: `ctaBg` / `ctaText` (Add to cart), `buyNowBg` / `buyNowText` (Buy now), each falling back to `--pumper-primary` / white.

## A. Data model (migration `0049`)
Add to `quantityBreaks` (`apps/admin/drizzle/schema.ts`), near `afterAddToCart`:
```ts
  showAddToCart: integer("show_add_to_cart", { mode: "boolean" }).notNull().default(true),
  showBuyNow: integer("show_buy_now", { mode: "boolean" }).notNull().default(false),
```
Hand-author the migration `apps/admin/drizzle/migrations/0049_qb_cta_buttons.sql` (drizzle-kit generate is broken here — repo convention is hand-written SQL, see `0048`):
```sql
ALTER TABLE quantity_breaks ADD COLUMN show_add_to_cart integer NOT NULL DEFAULT 1;
ALTER TABLE quantity_breaks ADD COLUMN show_buy_now integer NOT NULL DEFAULT 0;
```
Add the journal entry (`idx: 49`). Existing rows get `1`/`0` (Add-to-cart shown, Buy-now hidden) → matches the defaults.

## B. Button styling (Color & Style)
- **`StyleOverrides`** (`apps/admin/drizzle/schema.ts` + widget `apps/widget-src/src/types.ts`): add `ctaBg`, `ctaText`, `buyNowBg`, `buyNowText` (all `string`, optional in the `Partial`).
- **`StylePanelValues`** (`StylePanel.tsx`): add the four as `string` fields; **`EMPTY_STYLE_FORM`** / form defaults: `""`.
- **`StyleSections.tsx`**: add a `colorGroup("Buttons", [ {key:"ctaBg",label:"Add-to-cart bg"}, {key:"ctaText",label:"Add-to-cart text"}, {key:"buyNowBg",label:"Buy-now bg"}, {key:"buyNowText",label:"Buy-now text"} ])` after the existing groups.
- **`buildStyleOverrides`** (`apps/admin/app/lib/preview-overrides.ts`): include the four keys in the serialized overrides (only when non-empty, matching how the other color fields are emitted).
- **`widget.ts`**: apply CSS vars from the overrides: `setVar(target, "--pumper-cta-bg", o.ctaBg)`, `--pumper-cta-text` (o.ctaText), `--pumper-buynow-bg` (o.buyNowBg), `--pumper-buynow-text` (o.buyNowText) (using the existing `setVar` helper that skips undefined/empty).
- **`widget.css`**: the buttons consume the vars with fallbacks:
  - `.pumper-cta--atc { background: var(--pumper-cta-bg, var(--pumper-primary, #7B1E2A)); color: var(--pumper-cta-text, #fff); }`
  - `.pumper-cta--buynow { background: var(--pumper-buynow-bg, var(--pumper-primary, #7B1E2A)); color: var(--pumper-buynow-text, #fff); }`
  - shared `.pumper-cta` base (radius/padding/font, reuse the prior CTA styling that existed before removal).

## C. Widget buttons (`render-qb.ts` + i18n)
- `QbConfig` (`types.ts`): add `showAddToCart?: boolean; showBuyNow?: boolean;`.
- Add `qb.buyNow` to all 11 i18n locales: EN "Buy now", FR "Acheter maintenant", DE "Jetzt kaufen", ES "Comprar ahora", IT "Acquista ora", PT "Comprar agora", NL "Nu kopen", PL "Kup teraz", SV "Köp nu", JA "今すぐ購入", ZH "立即购买".
- Add `renderCtas()` returning the button(s) for the selected tier (default `showAddToCart !== false` to keep existing QBs showing it):
  - if `qb.showAddToCart !== false`: `<button class="pumper-cta pumper-cta--atc" data-action="add-to-cart" ${selectedTier.available ? "" : "disabled"}>${atcLabel}</button>` where `atcLabel` is `qb.ctaLabel || (savings>0 ? t("qb.ctaSavings", {...}) : t("qb.cta", {...}))` (reuse the prior label logic).
  - if `qb.showBuyNow`: `<button class="pumper-cta pumper-cta--buynow" data-action="buy-now" ${selectedTier.available ? "" : "disabled"}>${t("qb.buyNow")}</button>`.
- Insert `${renderCtas()}` into the template (where the old `${renderCta()}` was, after the tiers / purchase-options).
- Bind handlers (in `bindHandlers`, like the pre-removal CTA handler):
  - `[data-action=add-to-cart]` click → `addToCart(qb.id, buildTierLines(visibleTiers[selectedIndex]!), { afterAddToCart: qb.afterAddToCart })`.
  - `[data-action=buy-now]` click → `addToCart(qb.id, buildTierLines(visibleTiers[selectedIndex]!), { afterAddToCart: "checkout" })`.
  - Both: disable the clicked button during the await; re-emit the `add_to_cart` analytics event (restore the signal lost when the CTA was removed).
- **Theme integration unchanged:** `syncThemeQuantity` on render + selection change, and `bindThemeAddToCart` (extras intercept) stay as-is — they coexist with the widget buttons and serve as the fallback when both are hidden.
- **Preview mode** (`window._pumperPreview`): render the buttons (so the merchant sees them) but `addToCart` already no-ops in preview, so clicks do nothing harmful.

## D. Admin write path + config
- **`QbFormValues`** (`QbForm.tsx`): add `showAddToCart: boolean` (default true), `showBuyNow: boolean` (default false). Hidden inputs `name="showAddToCart"` / `name="showBuyNow"` (`"on"`/`""`).
- **Settings section UI:** two `Checkbox`es — "Show Add to cart button" (checked = showAddToCart), "Show Buy now button" (checked = showBuyNow).
- **`QbInput` / validate** (`quantity-breaks/validate.ts`): add `showAddToCart: boolean; showBuyNow: boolean;` (pass through).
- **Route actions** (`new.tsx`, `$id.tsx`): `showAddToCart: form.get("showAddToCart") === "on"`, `showBuyNow: form.get("showBuyNow") === "on"`. **Edit-page hydration:** pass `showAddToCart`/`showBuyNow` from the loaded QB row into the form `initialValues` (default true/false if absent).
- **repo** (`quantity-breaks/repo.ts`): persist both (spread or explicit, matching `afterAddToCart`).
- **storefront-config** (`storefront-config.ts`): QB config object adds `showAddToCart: q.showAddToCart ?? true`, `showBuyNow: q.showBuyNow ?? false`.

## Data / behavior
No effect on the discount function (the buttons add the same lines the tier already implies). Widget buttons use `/cart/add.js` (every theme). Buy-now reuses the Phase D `checkout` redirect path.

## Error handling / edge cases
- Unavailable selected tier → buttons render `disabled` (existing pattern).
- Both toggles off → no widget buttons; theme quantity-sync remains so the theme's button still adds the right quantity.
- Empty button-color fields → CSS var fallback to `--pumper-primary` / white (no broken colors).
- Existing QBs (pre-migration) → `show_add_to_cart=1` / `show_buy_now=0` via column defaults; storefront-config `?? true`/`?? false` covers any null.
- Buy now in admin preview → no-op (`_pumperPreview`).

## Testing
- **Widget (TDD):** `showAddToCart !== false` renders `.pumper-cta--atc` + a click triggers `addToCart` (existing fetch mock); `showBuyNow` renders `.pumper-cta--buynow` + click calls `addToCart` with `afterAddToCart:"checkout"` (assert `/checkout` redirect via the add-to-cart mock, or spy); both off → no `.pumper-cta`; the button uses `--pumper-cta-bg` when `ctaBg` set (widget.ts var application test or render check).
- **Admin:** validate/repo round-trip `showAddToCart`/`showBuyNow`; storefront-config carries them; `buildStyleOverrides` emits the four button-color fields; `StyleSections` renders a "Buttons" group.
- **Regression:** widget + admin suites green; migration applies local; typechecks + builds clean.
- **Manual:** toggle each button in the editor → preview shows/hides them; set a custom Add-to-cart bg → button recolors; on a dev store, Add to cart adds the tier, Buy now lands on `/checkout`; hide both → theme's native button still adds the selected quantity.

## Out of scope
A cart-permalink "Buy now" that bypasses the cart (we add→/checkout, simpler/reliable); these toggles/colors on bundle/BXGY widgets; a per-shop default for the toggles (per-QB only).
