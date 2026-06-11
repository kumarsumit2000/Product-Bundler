# QB Add-to-cart + Buy-now Buttons — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-introduce the QB widget's Add-to-cart button and add a Buy-now button — each show/hide-able per QB, with merchant-customizable button colors — while keeping the theme quantity-sync as the no-buttons fallback.

**Architecture:** Two boolean columns gate widget buttons rendered by a new `renderCtas()` (both call `/cart/add.js` via `addToCart`, theme-agnostic; Buy-now redirects to `/checkout`). Four button-color fields flow through the existing Color & Style pipeline into CSS vars. No discount-function change.

**Tech Stack:** Drizzle/D1, vanilla-TS widget (vitest), Remix + Polaris. No new deps.

**Spec:** `docs/superpowers/specs/2026-06-11-qb-cta-buttons-design.md`

**Commands:** admin `pnpm --filter admin test <pat>` / `typecheck` / `db:migrate:local`; widget `pnpm --filter widget-src test <pat>` / `typecheck` / `build`.

**Key facts:** `quantity_breaks` latest column `afterAddToCart` (line ~224); latest migration `0048`; DB `bundler-prod`. `render-qb.ts` has `buildTierLines(tr)` (~254), `tierHasExtraLines` (~338), `themeForm` wiring after `renderAll()`, `bindHandlers()` (~the select-tier handler at ~459); the old CTA + handler were removed. `addToCart(qb.id, lines, { afterAddToCart })` from `./add-to-cart`. Style pipeline: `StyleOverrides`/`StylePanelValues` → `buildStyleOverrides` (`preview-overrides.ts`) → `widget.ts` `setVar(...)` → `widget.css`; `StyleSections.tsx` renders color groups via `colorGroup(title, fields)`. `EMPTY_STYLE_FORM` is in `preview-overrides.ts`.

---

## Task 1: Schema columns + migration `0049`

**Files:** Modify `apps/admin/drizzle/schema.ts`; Create `apps/admin/drizzle/migrations/0049_qb_cta_buttons.sql`; Modify `apps/admin/drizzle/migrations/meta/_journal.json`; (keep-green) `apps/admin/app/routes/app.quantity-breaks.new.tsx` + affected fixtures.

- [ ] **Step 1: Add columns.** In `quantityBreaks` (after `afterAddToCart`):
```ts
  showAddToCart: integer("show_add_to_cart", { mode: "boolean" }).notNull().default(true),
  showBuyNow: integer("show_buy_now", { mode: "boolean" }).notNull().default(false),
```

- [ ] **Step 2: Hand-author the migration** `apps/admin/drizzle/migrations/0049_qb_cta_buttons.sql` (drizzle-kit generate is broken in this repo — mirror `0048`'s hand-written style):
```sql
-- Per-QB toggles for the widget Add-to-cart / Buy-now buttons.
ALTER TABLE quantity_breaks ADD COLUMN show_add_to_cart integer NOT NULL DEFAULT 1;
ALTER TABLE quantity_breaks ADD COLUMN show_buy_now integer NOT NULL DEFAULT 0;
```
Add a journal entry to `migrations/meta/_journal.json` with `idx: 49`, the same `version`/`when` shape as the `0048` entry (copy the last entry, bump `idx`, set `tag: "0049_qb_cta_buttons"`).

- [ ] **Step 3: Apply locally.** Run: `pnpm --filter admin db:migrate:local` — Expected: applies `0049` cleanly.

- [ ] **Step 4: Keep typecheck green.** The Drizzle select-derived `CreateQbInput` now requires the two fields. Add `showAddToCart: true, showBuyNow: false` to the create payload in `app.quantity-breaks.new.tsx` (placeholder — Task 4 replaces with form values) and to any QB fixtures the typecheck/tests flag (e.g. `quantity-breaks-repo.test.ts`, `metafield-sync.test.ts`). Run `pnpm --filter admin typecheck && pnpm --filter admin test` until clean/green.

- [ ] **Step 5: Commit.**
```bash
git add apps/admin/drizzle/schema.ts apps/admin/drizzle/migrations apps/admin/app/routes/app.quantity-breaks.new.tsx apps/admin/test
git commit -m "feat(qb): add show_add_to_cart + show_buy_now columns (migration 0049)"
```

---

## Task 2: Button-color style fields (plumbing, TDD)

**Files:** Modify `apps/admin/drizzle/schema.ts` (StyleOverrides), `apps/widget-src/src/types.ts` (StyleOverrides), `apps/admin/app/components/StylePanel.tsx` (StylePanelValues), `apps/admin/app/lib/preview-overrides.ts` (EMPTY_STYLE_FORM + buildStyleOverrides); Test `apps/admin/test/preview-overrides.test.ts` (or wherever buildStyleOverrides is tested — find it).

- [ ] **Step 1: Add to both `StyleOverrides` types.** In `schema.ts` `StyleOverrides` and `apps/widget-src/src/types.ts` `StyleOverrides` (both are `Partial<{...}>`), add: `ctaBg: string; ctaText: string; buyNowBg: string; buyNowText: string;`.

- [ ] **Step 2: Add to `StylePanelValues`** (`StylePanel.tsx`): `ctaBg: string; ctaText: string; buyNowBg: string; buyNowText: string;`. In `EMPTY_STYLE_FORM` (`preview-overrides.ts`) add the four with `""`.

- [ ] **Step 3: Write the failing test.** Find the existing `buildStyleOverrides` test (grep `buildStyleOverrides` under `apps/admin/test`). Add a case: a form value with `ctaBg: "#112233"` and `buyNowText: "#ffeedd"` (others empty) → the built overrides include `ctaBg: "#112233"` and `buyNowText: "#ffeedd"` and OMIT the empty ones (matching how the existing color fields are emitted — likely "only non-empty"). Mirror an existing color-field assertion in that test.

- [ ] **Step 4: Run, verify FAIL.** Run: `pnpm --filter admin test <buildStyleOverrides-test-file>` — Expected: FAIL.

- [ ] **Step 5: Implement in `buildStyleOverrides`.** Add the four keys to the serialization exactly how the other color fields are handled (e.g. if it iterates a list of color keys, append `ctaBg`, `ctaText`, `buyNowBg`, `buyNowText`; if explicit, add `...(v.ctaBg ? { ctaBg: v.ctaBg } : {})` etc.).

- [ ] **Step 6: Run + typecheck.** Run: `pnpm --filter admin test <file> && pnpm --filter admin typecheck && pnpm --filter widget-src typecheck` — Expected: pass, clean.

- [ ] **Step 7: Commit.**
```bash
git add apps/admin/drizzle/schema.ts apps/widget-src/src/types.ts apps/admin/app/components/StylePanel.tsx apps/admin/app/lib/preview-overrides.ts apps/admin/test
git commit -m "feat(qb): button color style fields (ctaBg/ctaText/buyNowBg/buyNowText)"
```

---

## Task 3: Widget buttons (TDD)

**Files:** Modify `apps/widget-src/src/types.ts` (QbConfig), `apps/widget-src/src/i18n.ts`, `apps/widget-src/src/render-qb.ts`, `apps/widget-src/src/widget.ts`, `extensions/theme-app-extension/assets/widget.css`; Test `apps/widget-src/src/render-qb.test.ts`.

- [ ] **Step 1: QbConfig type.** In `types.ts` `QbConfig`, add `showAddToCart?: boolean; showBuyNow?: boolean;`.

- [ ] **Step 2: i18n.** In `i18n.ts`, add `"qb.buyNow": "..."` to all 11 locales (anchor near `qb.cta`): EN "Buy now", FR "Acheter maintenant", DE "Jetzt kaufen", ES "Comprar ahora", IT "Acquista ora", PT "Comprar agora", NL "Nu kopen", PL "Kup teraz", SV "Köp nu", JA "今すぐ購入", ZH "立即购买".

- [ ] **Step 3: Failing tests** in `render-qb.test.ts` (the QB render fixture; reuse the add-to-cart fetch + `window.location` mock the file already uses):
```ts
it("renders the Add-to-cart button by default and adds on click", async () => {
  // QB with showAddToCart undefined/true
  const btn = mount.querySelector(".pumper-cta--atc") as HTMLButtonElement;
  expect(btn).not.toBeNull();
  // mock a 200 /cart/add.js, click, await microtasks, assert fetch called with /cart/add.js
});
it("renders a Buy-now button when showBuyNow is true and redirects to /checkout", async () => {
  // QB with showBuyNow: true; mock 200 + window.location
  const btn = mount.querySelector(".pumper-cta--buynow") as HTMLButtonElement;
  expect(btn).not.toBeNull();
  // click, await, expect window.location.href === "/checkout"
});
it("renders no widget buttons when both toggles are off", () => {
  // QB with showAddToCart:false, showBuyNow:false
  expect(mount.querySelector(".pumper-cta")).toBeNull();
});
```
(Match the file's real add-to-cart success-mock pattern. For the default test, ensure the fixture's `showAddToCart` is undefined or true.)

- [ ] **Step 4: Run, verify FAIL.** Run: `pnpm --filter widget-src test render-qb` — Expected: FAIL.

- [ ] **Step 5: Implement `renderCtas()` in `render-qb.ts`** (place near where the old `renderCta` was; reuse the selected-tier label logic):
```ts
const renderCtas = () => {
  const tr = visibleTiers[selectedIndex];
  if (!tr || !variant) return "";
  const unitCents = tierUnitCents(tr, variant.priceCents);
  const savings = Math.max(0, (variant.priceCents - unitCents) * tr.qty);
  const atcLabel = qb.ctaLabel || (savings > 0
    ? t("qb.ctaSavings", { qty: tr.qty, savings: formatMoney(savings, config.settings.currency, config.settings.locale) })
    : t("qb.cta", { qty: tr.qty }));
  const disabled = tr.available ? "" : "disabled";
  const atc = qb.showAddToCart !== false
    ? `<button class="pumper-cta pumper-cta--atc" data-action="add-to-cart" ${disabled}>${escapeHtml(atcLabel)}</button>`
    : "";
  const buy = qb.showBuyNow
    ? `<button class="pumper-cta pumper-cta--buynow" data-action="buy-now" ${disabled}>${escapeHtml(t("qb.buyNow"))}</button>`
    : "";
  return atc + buy;
};
```
Insert `${renderCtas()}` into the `renderAll()` template where the old `${renderCta()}` was (after tiers / purchase-options, before close). In `bindHandlers()`, add (mirror the old add-to-cart handler, but route through `buildTierLines`):
```ts
const runAdd = async (btn: HTMLButtonElement, after: "drawer" | "cart" | "checkout" | undefined) => {
  if (!variant) return;
  btn.disabled = true;
  emit("add_to_cart", { widgetType: "qb", widgetId: qb.id, productId: qb.productId, tierQty: visibleTiers[selectedIndex]!.qty });
  const res = await addToCart(qb.id, buildTierLines(visibleTiers[selectedIndex]!), { afterAddToCart: after });
  if (!res.ok) { btn.disabled = false; /* keep existing error surface if any */ }
};
mount.querySelector<HTMLButtonElement>("[data-action=add-to-cart]")?.addEventListener("click", (e) => runAdd(e.currentTarget as HTMLButtonElement, qb.afterAddToCart));
mount.querySelector<HTMLButtonElement>("[data-action=buy-now]")?.addEventListener("click", (e) => runAdd(e.currentTarget as HTMLButtonElement, "checkout"));
```
(Use the file's existing `emit(...)` signature — match it; if `emit`'s event name/args differ, adapt. `qb.afterAddToCart` may be typed as string — cast/normalize to the union as the existing code does.)

- [ ] **Step 6: Apply button CSS vars in `widget.ts`.** In the style-application block (where `setVar(target, "--pumper-...", o.X)` lines live), add:
```ts
setVar(target, "--pumper-cta-bg", o.ctaBg);
setVar(target, "--pumper-cta-text", o.ctaText);
setVar(target, "--pumper-buynow-bg", o.buyNowBg);
setVar(target, "--pumper-buynow-text", o.buyNowText);
```

- [ ] **Step 7: Button CSS** in `widget.css` (add near the other widget rules; if a `.pumper-cta` base rule still exists, keep it and add the variants):
```css
.pumper-cta { display: block; width: 100%; box-sizing: border-box; border: none; border-radius: var(--pumper-radius, 8px); padding: 12px 16px; font-size: 14px; font-weight: 700; cursor: pointer; margin-top: 8px; }
.pumper-cta[disabled] { opacity: .5; cursor: not-allowed; }
.pumper-cta--atc { background: var(--pumper-cta-bg, var(--pumper-primary, #7B1E2A)); color: var(--pumper-cta-text, #fff); }
.pumper-cta--buynow { background: var(--pumper-buynow-bg, var(--pumper-primary, #7B1E2A)); color: var(--pumper-buynow-text, #fff); }
```

- [ ] **Step 8: Run tests + build.** Run: `pnpm --filter widget-src test && pnpm --filter widget-src typecheck && pnpm --filter widget-src build` — Expected: green, clean, build success.

- [ ] **Step 9: Commit (incl. rebuilt assets).**
```bash
git add apps/widget-src/src/types.ts apps/widget-src/src/i18n.ts apps/widget-src/src/render-qb.ts apps/widget-src/src/widget.ts apps/widget-src/src/render-qb.test.ts extensions/theme-app-extension/assets apps/admin/public
git commit -m "feat(widget): Add-to-cart + Buy-now buttons with show/hide + color vars"
```

---

## Task 4: Admin UI + write path + storefront-config (TDD)

**Files:** Modify `apps/admin/app/components/QbForm.tsx`, `apps/admin/app/components/StyleSections.tsx`, `apps/admin/app/lib/quantity-breaks/validate.ts`, `apps/admin/app/lib/quantity-breaks/repo.ts`, `apps/admin/app/routes/app.quantity-breaks.new.tsx`, `apps/admin/app/routes/app.quantity-breaks.$id.tsx`, `apps/admin/app/lib/storefront-config.ts`; Test `apps/admin/test/quantity-breaks-validate.test.ts`, `apps/admin/test/storefront-config.test.ts`.

- [ ] **Step 1: StyleSections "Buttons" group.** In `StyleSections.tsx`, after the existing color groups (Upsell), add:
```tsx
{colorGroup("Buttons", [
  { key: "ctaBg", label: "Add-to-cart bg" },
  { key: "ctaText", label: "Add-to-cart text" },
  { key: "buyNowBg", label: "Buy-now bg" },
  { key: "buyNowText", label: "Buy-now text" },
])}
```

- [ ] **Step 2: validate — failing test.** In `quantity-breaks-validate.test.ts`, add: a valid input with `showAddToCart: false, showBuyNow: true` round-trips both; add `showAddToCart`/`showBuyNow` to the test's base input fixture. Run `pnpm --filter admin test quantity-breaks-validate` → FAIL. Then in `validate.ts`: add `showAddToCart: boolean; showBuyNow: boolean;` to `QbInput` and include them in the validator's output object (pass through). Run → PASS.

- [ ] **Step 3: Route actions.** In `new.tsx` and `$id.tsx`, in the form-parsed input object (next to `combinable`/`afterAddToCart`), add:
```ts
    showAddToCart: form.get("showAddToCart") === "on",
    showBuyNow: form.get("showBuyNow") === "on",
```
In `new.tsx`, REPLACE the Task-1 placeholder `showAddToCart: true, showBuyNow: false` with these parsed values.

- [ ] **Step 4: repo.** In `repo.ts`, ensure create + update persist `showAddToCart`/`showBuyNow` (spread of validated input should already carry them; confirm).

- [ ] **Step 5: storefront-config — failing test.** In `storefront-config.test.ts`, add: seed a QB with `showAddToCart: false, showBuyNow: true`; assert `out.quantityBreaks[0].showAddToCart === false` and `.showBuyNow === true`. Run → FAIL. Then in `storefront-config.ts` QB config object add `showAddToCart: q.showAddToCart ?? true, showBuyNow: q.showBuyNow ?? false`. Run → PASS.

- [ ] **Step 6: QbForm toggles + hydration.** In `QbForm.tsx`: add `showAddToCart: boolean; showBuyNow: boolean;` to `QbFormValues`; defaults `showAddToCart: true, showBuyNow: false` in `DEFAULTS`. Hidden inputs near the others: `<input type="hidden" name="showAddToCart" value={values.showAddToCart ? "on" : ""} />` and same for `showBuyNow`. In the "Settings" `CollapsibleSection`, two `Checkbox`es: "Show Add to cart button" (`checked={values.showAddToCart}`, `onChange={(v)=>update("showAddToCart", v)}`) and "Show Buy now button" (`showBuyNow`). On `$id.tsx`, pass `showAddToCart`/`showBuyNow` from the loaded QB row into the form `initialValues` (default true/false if absent).

- [ ] **Step 7: Full admin suite + typecheck.** Run: `pnpm --filter admin test && pnpm --filter admin typecheck` — Expected: green, clean.

- [ ] **Step 8: Commit.**
```bash
git add apps/admin/app/components/QbForm.tsx apps/admin/app/components/StyleSections.tsx apps/admin/app/lib/quantity-breaks/validate.ts apps/admin/app/lib/quantity-breaks/repo.ts apps/admin/app/routes/app.quantity-breaks.new.tsx "apps/admin/app/routes/app.quantity-breaks.\$id.tsx" apps/admin/app/lib/storefront-config.ts apps/admin/test
git commit -m "feat(qb): button toggles + Buttons color group + config wiring"
```

---

## Task 5: Full verification + deploy

- [ ] **Step 1: Admin.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, green.
- [ ] **Step 2: Widget.** Run: `pnpm --filter widget-src typecheck && pnpm --filter widget-src test && pnpm --filter widget-src build` — Expected: clean, green, build success.
- [ ] **Step 3: Manual.** Editor: toggle each button → preview shows/hides; set an Add-to-cart bg in Color & Style → button recolors; Settings shows both checkboxes. Dev store: Add to cart adds the tier; Buy now → `/checkout`; hide both → theme's native button still adds the selected quantity.
- [ ] **Step 4: Deploy (when approved).** Admin: `pnpm --filter admin build && cd apps/admin && pnpm run deploy`. Widget: `pnpm shopify app deploy --force`. Migration: `pnpm --filter admin db:migrate:prod` (remote — needs explicit approval; additive ADD COLUMN, non-destructive).

---

## Self-review notes
- **Spec coverage:** columns + migration (T1); 4 style fields plumbing (T2); widget buttons + i18n + CSS vars + analytics restore (T3); StyleSections group + toggles + validate/repo/actions/storefront-config + hydration (T4); verify+deploy incl. remote migration (T5). All spec sections covered.
- **No discount-fn change** — widget/admin/schema only.
- **Defaults preserve behavior:** `show_add_to_cart` default 1, validator/storefront-config `?? true`; `show_buy_now` default 0.
- **Type consistency:** `showAddToCart`/`showBuyNow` (boolean) consistent across schema, QbInput, QbFormValues, QbConfig, storefront-config; `ctaBg`/`ctaText`/`buyNowBg`/`buyNowText` consistent across StyleOverrides (both), StylePanelValues, EMPTY_STYLE_FORM, buildStyleOverrides, StyleSections, widget.ts vars (`--pumper-cta-bg` etc.), widget.css.
- **Theme integration untouched** — quantity-sync + extras-intercept remain; widget buttons coexist (T3 leaves them).
- **analytics:** `emit("add_to_cart", …)` restored in T3 step 5 for the widget-button path.
