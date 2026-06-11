# QB Theme-ATC + First-Tier Default + Preview Product Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the QB widget's own add-to-cart button and drive the theme's native add-to-cart (quantity sync + best-effort extras interception), default-select the first tier, and add a product picker to the admin live preview that uses the real product price.

**Architecture:** A new pure-DOM `theme-atc.ts` (find form / sync quantity / bind ATC) is wired into `render-qb`, which drops its CTA and extracts the tier-line builder. The selection init changes to first-available. The QB routes load a product list and a Select feeds the chosen product's price into the preview config.

**Tech Stack:** vanilla-TS widget (vitest/jsdom), Remix + Polaris admin, Admin GraphQL. No schema change.

**Spec:** `docs/superpowers/specs/2026-06-11-qb-theme-atc-first-tier-preview-product-design.md`

**Commands:** widget `pnpm --filter widget-src test <pat>` / `typecheck` / `build`; admin `pnpm --filter admin typecheck` / `test`.

**Key facts:**
- `render-qb.ts`: default selection lines 108–110; tier-select click handler lines ~366–378; CTA button in the template at line ~359 (`${renderCta()}`); `renderCta()` at ~244; the add-to-cart click handler at ~380 builds `const lines: CartLineInput[] = [...]` (main variant + free gift + QB gift + BOGO + extras) and ends by calling `addToCart(qb.id, lines, { afterAddToCart: qb.afterAddToCart })`. `window._pumperPreview` is true in the admin preview iframe.
- Admin preview: `app.quantity-breaks.new.tsx` builds `previewConfig` via `buildPreviewQbConfig({ product: { …, priceCents: 4999 }, settings: defaultPreviewSettings(), … })` (lines ~237–260) and renders `<PreviewPane type="qb" id="new" config={previewConfig} />`. `app.quantity-breaks.$id.tsx` is analogous. Both have a `loader`.

---

## Task 1: `theme-atc.ts` — find form / sync quantity / bind ATC (TDD)

**Files:**
- Create: `apps/widget-src/src/theme-atc.ts`
- Test: `apps/widget-src/src/theme-atc.test.ts`

- [ ] **Step 1: Write the failing test** `apps/widget-src/src/theme-atc.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { findProductForm, syncThemeQuantity, bindThemeAddToCart } from "./theme-atc";

function makeForm() {
  document.body.innerHTML = `
    <form action="/cart/add" method="post">
      <input name="quantity" value="1" />
      <button type="submit" name="add">Add to cart</button>
    </form>`;
  return document.querySelector("form") as HTMLFormElement;
}

describe("findProductForm", () => {
  it("finds the cart-add form in the document", () => {
    makeForm();
    const mount = document.createElement("div");
    document.body.appendChild(mount);
    expect(findProductForm(mount)).not.toBeNull();
  });
});

describe("syncThemeQuantity", () => {
  it("sets the quantity input and dispatches input/change", () => {
    const form = makeForm();
    const input = form.querySelector('input[name="quantity"]') as HTMLInputElement;
    const onChange = vi.fn();
    input.addEventListener("change", onChange);
    syncThemeQuantity(form, 3);
    expect(input.value).toBe("3");
    expect(onChange).toHaveBeenCalled();
  });
  it("no-ops on null form", () => {
    expect(() => syncThemeQuantity(null, 2)).not.toThrow();
  });
});

describe("bindThemeAddToCart", () => {
  it("intercepts submit and runs addLines when hasExtras is true", async () => {
    const form = makeForm();
    const addLines = vi.fn().mockResolvedValue(undefined);
    bindThemeAddToCart(form, { hasExtras: () => true, addLines });
    const ev = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(addLines).toHaveBeenCalled();
  });
  it("lets submit proceed and does not run addLines when hasExtras is false", () => {
    const form = makeForm();
    const addLines = vi.fn();
    bindThemeAddToCart(form, { hasExtras: () => false, addLines });
    const ev = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(addLines).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** Run: `pnpm --filter widget-src test theme-atc` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `apps/widget-src/src/theme-atc.ts`:
```ts
// Integrate the QB widget with the theme's native product form add-to-cart.
// Quantity sync is the robust core; extras interception is best-effort.

export function findProductForm(mount: HTMLElement): HTMLFormElement | null {
  return (
    (mount.closest('form[action*="/cart/add"]') as HTMLFormElement | null) ??
    (document.querySelector('form[action*="/cart/add"]') as HTMLFormElement | null)
  );
}

export function syncThemeQuantity(form: HTMLFormElement | null, qty: number): void {
  if (!form) return;
  const input = form.querySelector('input[name="quantity"]') as HTMLInputElement | null;
  if (!input) return;
  input.value = String(qty);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export function bindThemeAddToCart(
  form: HTMLFormElement,
  opts: { hasExtras: () => boolean; addLines: () => Promise<void> },
): () => void {
  const handler = (e: Event) => {
    if (!opts.hasExtras()) return; // native flow proceeds with the synced quantity
    e.preventDefault();
    e.stopPropagation();
    void opts.addLines();
  };
  form.addEventListener("submit", handler, true);
  const atc = form.querySelector('button[type="submit"], [name="add"]');
  atc?.addEventListener("click", handler, true);
  return () => {
    form.removeEventListener("submit", handler, true);
    atc?.removeEventListener("click", handler, true);
  };
}
```

- [ ] **Step 4: Run, verify PASS.** Run: `pnpm --filter widget-src test theme-atc && pnpm --filter widget-src typecheck` — Expected: pass, clean.

- [ ] **Step 5: Commit.**
```bash
git add apps/widget-src/src/theme-atc.ts apps/widget-src/src/theme-atc.test.ts
git commit -m "feat(widget): theme-atc helpers (find form, sync qty, bind ATC)"
```

---

## Task 2: `render-qb` — first-tier default, remove CTA, wire theme ATC (TDD)

**Files:**
- Modify: `apps/widget-src/src/render-qb.ts`
- Test: `apps/widget-src/src/render-qb.test.ts`

- [ ] **Step 1: First-tier default.** Replace `render-qb.ts` lines 108–110:
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

- [ ] **Step 2: Extract the tier-line builder.** In the add-to-cart click handler (~line 380), the body builds `const lines: CartLineInput[] = [...]` (main variant) then pushes free-gift / QB-gift / BOGO / extras lines, ending with `await addToCart(qb.id, lines, { afterAddToCart: qb.afterAddToCart })`. MOVE all the line-building code (everything that constructs `lines` up to but not including the `addToCart` call) into a new function defined in `renderQb` scope:
```ts
function buildTierLines(tr: typeof visibleTiers[number]): CartLineInput[] {
  // <paste the existing line-building logic here, using `tr` for the tier,
  //  `variant` for the product variant, and `purchaseOptions.getSelection()` as before>
  return lines;
}
function tierHasExtraLines(tr: typeof visibleTiers[number]): boolean {
  return buildTierLines(tr).length > 1;
}
```
(Keep the exact same line construction — it must produce identical `lines` to today. `variant` is non-null in `renderQb` scope per the top guard.)

- [ ] **Step 3: Remove the CTA.** Delete `renderCta()` (the function ~line 244) and the `${renderCta()}` line in the template (~line 359). Delete the `const cta = mount.querySelector("[data-action=add-to-cart]")` block and its entire async click handler (~lines 380–end of that block) — its line-building logic now lives in `buildTierLines`.

- [ ] **Step 4: Wire theme ATC.** Add the import: `import { findProductForm, syncThemeQuantity, bindThemeAddToCart } from "./theme-atc";`. In `renderQb` scope, after `mount` is defined and BEFORE/at the first render, compute the theme form once (storefront only):
```ts
const isPreview = typeof window !== "undefined" && !!(window as unknown as { _pumperPreview?: boolean })._pumperPreview;
const themeForm = isPreview ? null : findProductForm(mount);
```
After the existing final `renderAll();` call (end of `renderQb`), add:
```ts
syncThemeQuantity(themeForm, visibleTiers[selectedIndex]?.qty ?? 1);
if (themeForm) {
  bindThemeAddToCart(themeForm, {
    hasExtras: () => tierHasExtraLines(visibleTiers[selectedIndex]!),
    addLines: () => addToCart(qb.id, buildTierLines(visibleTiers[selectedIndex]!), { afterAddToCart: qb.afterAddToCart }).then(() => {}),
  });
}
```
In the tier-select click handler (after `selectedIndex = idx;`), add `syncThemeQuantity(themeForm, visibleTiers[idx]!.qty);` (alongside the existing `renderAll()`).

- [ ] **Step 5: Add/adjust tests** in `render-qb.test.ts`:
```ts
it("preselects the first available tier (ignores most-popular)", () => {
  // QB tiers [Buy1, Buy2(isMostPopular:true), Buy4]; all available
  const tiers = [...mount.querySelectorAll(".pumper-qb-tier")];
  expect(tiers[0]!.className).toContain("pumper-qb-tier--selected");
});
it("does not render its own add-to-cart button", () => {
  expect(mount.querySelector("[data-action=add-to-cart]")).toBeNull();
  expect(mount.querySelector(".pumper-cta")).toBeNull();
});
```
Then run `pnpm --filter widget-src test render-qb` and FIX any existing tests that asserted the CTA button / `add-to-cart` action / clicked it — re-point them: tests that previously clicked `[data-action=add-to-cart]` to assert `addToCart` should instead render inside a mock product form and assert `syncThemeQuantity` set the quantity, OR assert `tierHasExtraLines`-driven interception. If a test specifically verified the add-to-cart line payload (gift/bogo/extras), keep it by calling the extracted `buildTierLines` indirectly through the theme-form submit path (render a `<form action="/cart/add"><input name=quantity><button name=add></form>` around `mount`, select the relevant tier, dispatch the form submit, and assert the `fetch` to `/cart/add.js` — reusing the existing add-to-cart fetch mock). Do NOT delete coverage of gift/bogo/extras line building; route it through the new path.

- [ ] **Step 6: Run widget suite + build.** Run: `pnpm --filter widget-src test && pnpm --filter widget-src typecheck && pnpm --filter widget-src build` — Expected: all green, clean, build success.

- [ ] **Step 7: Commit (incl. rebuilt assets).**
```bash
git add apps/widget-src/src/render-qb.ts apps/widget-src/src/render-qb.test.ts extensions/theme-app-extension/assets apps/admin/public
git commit -m "feat(widget): drive theme add-to-cart, first-tier default, drop widget CTA"
```

---

## Task 3: Preview product picker (admin)

**Files:**
- Modify: `apps/admin/app/routes/app.quantity-breaks.new.tsx`, `apps/admin/app/routes/app.quantity-breaks.$id.tsx`

- [ ] **Step 1: Load products in the loader.** In each route's `loader`, after the existing auth/admin setup, fetch products via the admin GraphQL client already in scope (mirror how other loaders call `admin.graphql`):
```ts
const prodRes = await admin.graphql(`#graphql
  query PreviewProducts {
    products(first: 50, sortKey: TITLE) {
      nodes { id title featuredImage { url } variants(first: 1) { nodes { id price } } }
    }
  }`);
const prodJson = (await prodRes.json()) as {
  data?: { products?: { nodes?: Array<{ id: string; title: string; featuredImage?: { url?: string } | null; variants?: { nodes?: Array<{ id: string; price: string }> } }> } };
};
const previewProducts = (prodJson.data?.products?.nodes ?? []).map((p) => ({
  id: p.id,
  title: p.title,
  image: p.featuredImage?.url ?? null,
  variantId: p.variants?.nodes?.[0]?.id ?? "",
  priceCents: Math.round(parseFloat(p.variants?.nodes?.[0]?.price ?? "0") * 100),
}));
```
Add `previewProducts` to the loader's returned `json({...})`.

- [ ] **Step 2: Select + price wiring in the component.** In each route's default component: read `previewProducts` from `useLoaderData`. Add state defaulting to the QB's target product if present else the first product:
```ts
const [previewProductId, setPreviewProductId] = useState(
  values?.product?.[0]?.productId ?? previewProducts[0]?.id ?? "",
);
const previewProduct = previewProducts.find((p) => p.id === previewProductId) ?? previewProducts[0];
```
(On `app.quantity-breaks.$id.tsx`, default to the loaded QB's `productId` if set.) Render a Polaris `Select` just above the `<PreviewPane …>`:
```tsx
{previewProducts.length > 0 && (
  <div style={{ marginBottom: 12 }}>
    <Select
      label="Choose a product to preview"
      options={previewProducts.map((p) => ({ label: p.title, value: p.id }))}
      value={previewProductId}
      onChange={setPreviewProductId}
    />
  </div>
)}
```
In the `buildPreviewQbConfig({...})` call, replace the hardcoded `priceCents: 4999` (and the mock product `title`/`image`/`variantId` if present) with the selected product's values:
```ts
product: {
  productId: previewProduct?.id ?? "preview-product",
  variantId: previewProduct?.variantId ?? "preview-variant",
  title: previewProduct?.title ?? "Sample product",
  image: previewProduct?.image ?? null,
  priceCents: previewProduct?.priceCents || 4999,
  available: true,
  qty: 1,
},
```
(Match the exact field names the existing `buildPreviewQbConfig` product arg uses — read the current call and keep its shape; only swap the values to `previewProduct`.) Apply the same swap to any second hardcoded `4999` in the same file (the variant list at line ~258).

- [ ] **Step 3: Typecheck + tests.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, green (no test asserts the preview internals).

- [ ] **Step 4: Commit.**
```bash
git add apps/admin/app/routes/app.quantity-breaks.new.tsx "apps/admin/app/routes/app.quantity-breaks.\$id.tsx"
git commit -m "feat(qb): live-preview product picker with real product price"
```

---

## Task 4: Full verification + deploy

- [ ] **Step 1: Widget.** Run: `pnpm --filter widget-src typecheck && pnpm --filter widget-src test && pnpm --filter widget-src build` — Expected: clean, green, build success.
- [ ] **Step 2: Admin.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, green.
- [ ] **Step 3: Manual.** Admin preview: pick a product in "Choose a product to preview" → tiers reprice from its real price; first tier preselected; no button. Dev-store PDP: radio cards, no widget button; selecting a tier updates the theme qty input; the theme's Add to cart adds that quantity at the tier price; a free-gift tier attaches the gift (best-effort).
- [ ] **Step 4: Deploy (when approved).** Admin: `pnpm --filter admin build && cd apps/admin && pnpm run deploy`. Widget: `pnpm shopify app deploy --force`.

---

## Self-review notes
- **Spec coverage:** theme-atc module (T1); first-tier default + CTA removal + buildTierLines extraction + theme wiring + preview-mode skip (T2); loader products + Select + price wiring (T3); verify+deploy (T4). All spec sections covered.
- **No schema change** — widget behavior + admin loader/preview only.
- **Coverage preserved:** T2 step 5 explicitly routes the gift/bogo/extras line-building coverage through the new theme-form submit path rather than deleting it.
- **Degradation:** `syncThemeQuantity`/binding no-op without a form (T1); preview mode skips theme binding (T2 step 4).
- **Type/name consistency:** `findProductForm`/`syncThemeQuantity`/`bindThemeAddToCart` identical across T1 (def+tests) and T2 (wiring); `buildTierLines`/`tierHasExtraLines` defined and used within T2; `previewProducts`/`previewProduct`/`previewProductId` consistent across T3.
- **afterAddToCart (Phase D)** still honored inside `addLines()` for extras tiers (T2 step 4).
