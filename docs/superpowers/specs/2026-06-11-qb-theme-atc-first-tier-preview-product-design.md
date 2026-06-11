# QB Widget — Theme-ATC integration + first-tier default + preview product picker

**Date:** 2026-06-11
**Status:** Approved design, ready for implementation planning
**Scope:** Three QB changes following the radio-card redesign: (A) remove the widget's own add-to-cart button and drive the theme's native add-to-cart; (B) default-select the first tier; (C) add a "Choose a product to preview" selector to the admin live preview using the real product price.

## Context

- `render-qb.ts` renders a `.pumper-cta` button (`renderCta()`, line ~244) and binds a `[data-action=add-to-cart]` click handler (line ~380) that builds `lines: CartLineInput[]` (main variant + free gift + QB gift + BOGO + extras) and calls `addToCart(qb.id, lines, { afterAddToCart })`.
- Default selection (lines 108–110): most-popular tier if any, else first available.
- Tier-select click handler (lines 366–378) sets `selectedIndex` and re-renders.
- The admin live preview is an iframe (`PreviewPane`, `/preview/qb/:id`) fed config via postMessage. The QB new/edit routes build the config with `buildPreviewQbConfig(...)` using a **hardcoded mock product `priceCents: 4999`** (`app.quantity-breaks.new.tsx` lines ~243/258). `window._pumperPreview` is true inside the preview iframe (the widget already no-ops `addToCart` there).

## Decisions (approved)
- **A:** Quantity-sync to the theme's `input[name="quantity"]` is the primary mechanism; best-effort interception adds extras/gift lines for those tiers; storefront keeps no widget button; preview shows no button.
- **B:** Default-selected tier = first available (drop the most-popular preselect).
- **C:** Preview product list loaded via the route loader (~50 products); the Select defaults to the QB's target product (else first product); its real price drives the preview.

## Component A — Theme add-to-cart integration (widget)

### New module `apps/widget-src/src/theme-atc.ts`
- `findProductForm(mount: HTMLElement): HTMLFormElement | null` — nearest enclosing or document product form: `mount.closest("form[action*='/cart/add']") ?? document.querySelector("form[action*='/cart/add']")`.
- `syncThemeQuantity(form: HTMLFormElement | null, qty: number): void` — set `form.querySelector('input[name="quantity"]')`'s `value` to `String(qty)` and dispatch `new Event("input", {bubbles:true})` + `new Event("change", {bubbles:true})`. No-op if form/input missing.
- `bindThemeAddToCart(form, opts: { hasExtras: () => boolean; addLines: () => Promise<void> }): () => void` — adds a capture-phase listener on the form `submit` AND on the ATC control (`form button[type="submit"], form [name="add"]`) `click`: when `hasExtras()` is true, `e.preventDefault(); e.stopPropagation();` then `await addLines()`; otherwise do nothing (native flow proceeds with the synced quantity). Returns a cleanup fn that removes the listeners. Pure-DOM, unit-testable with a mock form.

### `render-qb.ts` changes
- **Remove** `renderCta()`, the `.pumper-cta` button from the template (line ~359), and the `[data-action=add-to-cart]` click handler (lines ~380–end of that block).
- **Extract** the existing line-building logic into `buildTierLines(tr): CartLineInput[]` (the main variant + gift/BOGO/extras code currently inside the cta handler), and `tierHasExtraLines(tr): boolean` = `buildTierLines(tr).length > 1` (i.e. more than the single main variant line).
- After `renderAll()` (storefront only, i.e. `!window._pumperPreview`): `const form = findProductForm(mount); syncThemeQuantity(form, visibleTiers[selectedIndex].qty);` and bind once: `bindThemeAddToCart(form, { hasExtras: () => tierHasExtraLines(visibleTiers[selectedIndex]), addLines: () => addToCart(qb.id, buildTierLines(visibleTiers[selectedIndex]), { afterAddToCart: qb.afterAddToCart }).then(() => {}) })`. Guard against double-binding across re-renders (bind once on first mount; re-sync qty on every selection change).
- In the tier-select click handler, after setting `selectedIndex`, call `syncThemeQuantity(form, visibleTiers[selectedIndex].qty)` (in addition to the existing re-render).
- **Preview mode** (`window._pumperPreview`): skip `findProductForm`/binding/sync entirely — render the tiers with no button. (The reference preview has no CTA.)
- The `afterAddToCart` redirect (Phase D) still applies inside `addLines()` for extras tiers; for plain tiers the theme's own ATC handles post-add behavior.

## Component B — First-tier default (widget)
Replace `render-qb.ts` lines 108–110:
```ts
const popularIndex = visibleTiers.findIndex((tr) => tr.isMostPopular && !tierUnavailable(tr));
let selectedIndex = popularIndex >= 0 ? popularIndex : visibleTiers.findIndex((tr) => !tierUnavailable(tr));
if (selectedIndex < 0) selectedIndex = 0;
```
with:
```ts
let selectedIndex = visibleTiers.findIndex((tr) => !tierUnavailable(tr));
if (selectedIndex < 0) selectedIndex = 0;
```
(First available tier; the MOST POPULAR badge still renders on its tier — it just isn't preselected.)

## Component C — Preview product picker (admin)

### Loader (`app.quantity-breaks.new.tsx` + `app.quantity-breaks.$id.tsx`)
Fetch up to 50 products via Admin GraphQL: `products(first: 50)` → `{ id, title, featuredImage { url }, variants(first:1){ id, price } }`. Return `previewProducts: Array<{ id: string; title: string; image: string | null; priceCents: number; variantId: string }>` (price → cents via `Math.round(parseFloat(price)*100)`).

### Route render
- `const [previewProductId, setPreviewProductId] = useState(<QB target product id if set, else previewProducts[0]?.id>)`.
- Render a Polaris `Select` "Choose a product to preview" (options from `previewProducts`) above/inside the preview area, bound to `previewProductId`.
- In the `buildPreviewQbConfig(...)` call, replace the hardcoded `priceCents: 4999` (and the mock product title/image) with the selected product's `priceCents`/`title`/`image`/`variantId` (look it up from `previewProducts` by `previewProductId`; fall back to `4999`/"Sample product" if the list is empty).

### `preview-config.ts`
No signature change needed if it already accepts a product with `priceCents`/`title`/`image`; just pass the real values. (If it hardcodes anything, thread the product through.)

## Data / behavior
No schema/DB change. The widget change is storefront behavior (theme ATC) + default selection; the preview change is admin-only (loader + Select + price wiring). The discount function already prices the tier by quantity, so theme-added quantities get the tier discount at checkout.

## Error handling / edge cases
- No product form on the page (non-PDP embed) → `syncThemeQuantity`/binding no-op; tiers still selectable (graceful). 
- AJAX-ATC themes that swallow the submit/click before our capture listener → extras may not attach, but the synced quantity + discount still apply (documented degradation).
- `previewProducts` empty (new store) → fall back to the `4999` mock so the preview still renders.
- Preview iframe: never touches a theme form (it's `_pumperPreview`).
- All-unavailable tiers → `selectedIndex` falls back to 0 (existing guard).

## Testing
- **Widget (TDD), `render-qb.test.ts` + new `theme-atc.test.ts`:**
  - default `selectedIndex` is the first available tier (a QB with `isMostPopular` on tier 2 still selects tier 0).
  - no `.pumper-cta` / `[data-action=add-to-cart]` element renders.
  - `syncThemeQuantity(form, 3)` sets a mock form's `input[name="quantity"]` to "3" and fires input/change.
  - `bindThemeAddToCart`: with `hasExtras()===true`, a form submit is preventDefault'd and `addLines` runs; with `hasExtras()===false`, the submit proceeds and `addLines` is NOT called.
  - selecting a tier re-syncs the quantity.
- **Admin:** the loader returns `previewProducts`; the route typechecks with the Select + price wiring (light render/typecheck — no heavy test).
- **Update** existing tests that assert the CTA button / `add-to-cart` action → assert its absence + the new behavior.
- **Regression:** widget + admin suites green; typechecks + build clean.
- **Manual (dev store):** PDP shows the radio cards with **no widget button**; selecting a tier updates the theme's qty; clicking the theme's Add to cart adds that quantity at the tier price; a tier with a free gift attaches the gift (best-effort). Admin preview: product Select changes the previewed product + prices; first tier preselected; no button.

## Out of scope
Per-theme bespoke ATC adapters beyond the standard `form[action*="/cart/add"]` pattern (best-effort, documented); applying theme-ATC to bundle/BXGY/mix-match widgets; a preview product search box (a Select of the first 50 products suffices).
