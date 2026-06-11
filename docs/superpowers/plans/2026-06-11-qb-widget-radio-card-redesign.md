# QB Widget Radio-Card Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the QB tier cards to the radio-card layout — radio selector, inline discount badge, right-aligned total price with strikethrough compare-at, tinted discounted cards, centered divider heading.

**Architecture:** Rework the tier-card HTML in `render-qb.ts` `renderRows()` and restyle in `widget.css`, reusing the existing `--pumper-*` CSS vars so C1 palettes / C2 layout / C3 colors keep working. Add a `qb.standardPrice` i18n string. No data/schema change.

**Tech Stack:** vanilla-TS widget (tsup/vitest), CSS. No new deps.

**Spec:** `docs/superpowers/specs/2026-06-11-qb-widget-radio-card-redesign-design.md`

**Commands:** `pnpm --filter widget-src test <pat>` / `typecheck` / `build`.

**Key facts (current `render-qb.ts` `renderRows()`):** per tier it computes `unitCents` (post-rounding), `totalCents = unitCents*tr.qty`, `baseTotal = variant.priceCents*tr.qty`, `savings`, `discountPercent`, `unavailable`, `popularBadge`, `tierImage`, `freeShipBadge`, `soldOutLabel`, `savingsBadge` (to be removed), `extrasRow`, `giftCallout`, `qbGiftCallout`, and a `tierVars` object. `t(...)` and `tWith(...)` and `formatMoney(...)` are in scope. The returned card template is at ~lines 224–245. The heading is `<h3 class="pumper-qb-heading">` in `renderAll()`.

---

## Task 1: Add the `qb.standardPrice` i18n string

**Files:**
- Modify: `apps/widget-src/src/i18n.ts`

- [ ] **Step 1: Add the key to all 11 locales.** In `i18n.ts`, add `"qb.standardPrice": "..."` to each locale dict (anchor near `qb.mostPopular`): EN `"Standard Price"`, FR `"Prix standard"`, DE `"Standardpreis"`, ES `"Precio estándar"`, IT `"Prezzo standard"`, PT `"Preço padrão"`, NL `"Standaardprijs"`, PL `"Cena standardowa"`, SV `"Standardpris"`, JA `"通常価格"`, ZH `"标准价格"`.

- [ ] **Step 2: Typecheck.** Run: `pnpm --filter widget-src typecheck` — Expected: clean.

- [ ] **Step 3: Commit.**
```bash
git add apps/widget-src/src/i18n.ts
git commit -m "feat(widget): add qb.standardPrice i18n string (11 locales)"
```

---

## Task 2: Radio-card tier markup + CSS (TDD)

**Files:**
- Modify: `apps/widget-src/src/render-qb.ts`, `extensions/theme-app-extension/assets/widget.css`
- Test: `apps/widget-src/src/render-qb.test.ts`

- [ ] **Step 1: Write failing tests** in `render-qb.test.ts` (mirror the file's QB fixture; use a QB with a base tier qty 1 no-discount + at least one discounted tier with a non-empty `label`, e.g. percentage 20 on a priced variant):
```ts
it("renders a radio indicator on each tier", () => {
  const radios = mount.querySelectorAll(".pumper-qb-radio");
  expect(radios.length).toBe(mount.querySelectorAll(".pumper-qb-tier").length);
});
it("marks a discounted tier with --discount, a strike price, and a label badge", () => {
  // a tier with percentage 20 and label "20% OFF"
  const tier = mount.querySelector(".pumper-qb-tier--discount")!;
  expect(tier).not.toBeNull();
  expect(tier.querySelector(".pumper-qb-price-strike")).not.toBeNull();
  expect(tier.querySelector(".pumper-qb-tier-badge")!.textContent).toContain("20% OFF");
});
it("shows a Standard Price badge on the base (no-discount) tier", () => {
  // the qty-1 / discountValue 0 tier
  const tiers = [...mount.querySelectorAll(".pumper-qb-tier")];
  const base = tiers.find((t) => !t.className.includes("pumper-qb-tier--discount"))!;
  expect(base.querySelector(".pumper-qb-tier-badge")!.textContent).toContain("Standard Price");
});
it("shows the tier total in .pumper-qb-price-total", () => {
  const totals = mount.querySelectorAll(".pumper-qb-price-total");
  expect(totals.length).toBeGreaterThan(0);
  expect(totals[0]!.textContent).toMatch(/\d/);
});
```
(Use the file's real fixture shape; ensure one discounted tier's `label` is `"20% OFF"`.)

- [ ] **Step 2: Run, verify FAIL.** Run: `pnpm --filter widget-src test render-qb` — Expected: the new tests FAIL.

- [ ] **Step 3: Implement the markup in `render-qb.ts` `renderRows()`.** Remove the now-unused `savingsBadge` declaration. After `discountPercent`/`tierVars` are computed, add:
```ts
const badgeText = savings > 0 ? (tr.label.trim() || `${discountPercent}% OFF`) : t("qb.standardPrice");
```
Add `pumper-qb-tier--discount` to the `classes` array when `savings > 0`:
```ts
const classes = [
  "pumper-qb-tier",
  i === selectedIndex ? "pumper-qb-tier--selected" : "",
  savings > 0 ? "pumper-qb-tier--discount" : "",
  unavailable ? "pumper-qb-tier--unavailable" : "",
].filter(Boolean).join(" ");
```
Replace the returned card template (the old `<div class="${classes}" ...> … </div>`) with:
```ts
return `
  <div class="${classes}" data-tier-index="${i}" data-action="select-tier" role="button" tabindex="0">
    ${popularBadge}
    <div class="pumper-qb-tier-row">
      <span class="pumper-qb-radio" aria-hidden="true"></span>
      ${tierImage}
      <div class="pumper-qb-tier-meta">
        <div class="pumper-qb-tier-title">${escapeHtml(tWith(qb.textOverrides, "qb.tierLabel", tierVars))}<span class="pumper-qb-tier-badge">${escapeHtml(badgeText)}</span></div>
        ${soldOutLabel || freeShipBadge ? `<div class="pumper-qb-tier-subbadges">${soldOutLabel}${freeShipBadge}</div>` : ""}
      </div>
      <div class="pumper-qb-tier-price">
        <span class="pumper-qb-price-total">${formatMoney(totalCents, config.settings.currency, config.settings.locale)}</span>
        ${savings > 0 ? `<span class="pumper-qb-price-strike">${formatMoney(baseTotal, config.settings.currency, config.settings.locale)}</span>` : ""}
      </div>
    </div>
    ${extrasRow}
    ${giftCallout}
    ${qbGiftCallout}
  </div>
`;
```
(Keep `popularBadge`, `tierImage`, `soldOutLabel`, `freeShipBadge`, `extrasRow`, `giftCallout`, `qbGiftCallout` exactly as they are computed today; only the layout/markup changed. The old `.pumper-qb-tier-sub` "each · total" line is gone.)

- [ ] **Step 4: Update existing tests that assert old markup.** Search `render-qb.test.ts` for assertions on the removed structure and migrate them:
  - The B4 price-rounding test (asserts a rounded price like `"$19.99"` appeared) — make its QB tier **qty 1** so `totalCents === roundedUnit`, and assert the total via `mount.querySelector(".pumper-qb-price-total")!.textContent` contains `"$19.99"` (or keep `mount.textContent` contains `"$19.99"` if still true). 
  - Any test asserting `.pumper-qb-tier-sub` text or a `.pumper-qb-savings` "Save $X" pill → re-point to `.pumper-qb-price-total` / `.pumper-qb-price-strike` / `.pumper-qb-tier-badge`.
  Run `pnpm --filter widget-src test render-qb` and fix each failure by updating the assertion to the new markup (do NOT change behavior to satisfy a stale assertion).

- [ ] **Step 5: Add the CSS.** In `extensions/theme-app-extension/assets/widget.css`, restyle the QB tier. Update `.pumper-qb-tier-row` and add the new classes (place near the existing `.pumper-qb-tier` rules; the existing `.pumper-qb-tier` base + `--selected` rules can be adjusted in place):
```css
.pumper-qb-tier-row { display: flex; align-items: center; gap: 10px; }
.pumper-qb-radio { width: 18px; height: 18px; flex-shrink: 0; border: 2px solid var(--pumper-border, #cbd5e1); border-radius: 50%; position: relative; box-sizing: border-box; }
.pumper-qb-tier--selected .pumper-qb-radio { border-color: var(--pumper-primary, #7B1E2A); }
.pumper-qb-tier--selected .pumper-qb-radio::after { content: ""; position: absolute; inset: 3px; border-radius: 50%; background: var(--pumper-primary, #7B1E2A); }
.pumper-qb-tier-meta { flex: 1; min-width: 0; }
.pumper-qb-tier-title { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; color: var(--pumper-title-color, inherit); }
.pumper-qb-tier-badge { display: inline-block; margin-left: 4px; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--pumper-primary, #7B1E2A) 35%, #fff); color: var(--pumper-primary, #7B1E2A); white-space: nowrap; }
.pumper-qb-tier-subbadges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.pumper-qb-tier-price { margin-left: auto; text-align: right; flex-shrink: 0; }
.pumper-qb-price-total { font-size: 16px; font-weight: 700; color: var(--pumper-price-color, #1a1a1a); }
.pumper-qb-price-strike { display: block; font-size: 12px; text-decoration: line-through; color: #9aa0a6; }
.pumper-qb-tier--discount { background: var(--pumper-tier-bg, #fde7ea); border-color: color-mix(in srgb, var(--pumper-primary, #7B1E2A) 30%, #fff); }
.pumper-qb-heading { display: flex; align-items: center; justify-content: center; gap: 12px; text-align: center; }
.pumper-qb-heading::before, .pumper-qb-heading::after { content: ""; flex: 1; height: 1px; background: var(--pumper-border, #e3e3e3); }
.pumper-qb-tiers--horizontal .pumper-qb-tier-row { flex-wrap: wrap; }
```
Then ensure the SELECTED rule still wins over `--discount` (selected = white bg + primary border). If the existing `.pumper-qb-tier--selected` rule sits BEFORE `--discount` in the file, move/duplicate a selected override AFTER the `--discount` rule so it takes precedence:
```css
.pumper-qb-tier--selected { background: var(--pumper-selected-bg, #fff); border: 2px solid var(--pumper-primary, #7B1E2A); }
```
(Keep the existing `.pumper-qb-popular-badge`, `.pumper-qb-tier-img`, radius/spacing rules as-is. Remove or leave the now-unused `.pumper-qb-tier-sub` / `.pumper-qb-savings` rules — leaving them is harmless; removing is tidier.)

- [ ] **Step 6: Run tests + typecheck + build.** Run: `pnpm --filter widget-src test && pnpm --filter widget-src typecheck && pnpm --filter widget-src build` — Expected: all green, clean, build success (copies widget.js/css to extensions + admin/public).

- [ ] **Step 7: Commit (incl. rebuilt assets).**
```bash
git add apps/widget-src/src/render-qb.ts apps/widget-src/src/render-qb.test.ts extensions/theme-app-extension/assets apps/admin/public
git commit -m "feat(widget): radio-card QB tier redesign (badge + total/strike + tinted cards)"
```

---

## Task 3: Full verification + deploy

- [ ] **Step 1: Widget.** Run: `pnpm --filter widget-src typecheck && pnpm --filter widget-src test && pnpm --filter widget-src build` — Expected: clean, green, build success.
- [ ] **Step 2: Admin.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, green (admin renders the same widget.js in preview; no admin code changed).
- [ ] **Step 3: Manual.** Open a QB editor → live preview matches the reference: radio selectors, inline discount badge + "Standard Price" base badge, total price + strikethrough compare-at on the right, tinted discounted cards, centered divider heading. Click tiers → selection + filled radio move. Switch a C1 palette → recolors. Switch C2 Horizontal → grid still lays out. 
- [ ] **Step 4: Deploy (when approved).** Admin: `pnpm --filter admin build && cd apps/admin && pnpm run deploy`. Widget: `pnpm shopify app deploy --force` (render-qb + css changed).

---

## Self-review notes
- **Spec coverage:** i18n `qb.standardPrice` (T1); new card markup with radio/badge/total/strike + `--discount` class + removed sub-line/savings pill (T2 steps 3); CSS for radio/badge/price/tint/heading-dividers/horizontal (T2 step 5); existing-test migration incl. the rounding test (T2 step 4); verify+deploy (T3). All spec sections covered.
- **No data/schema change** — widget-only; reuses CSS vars so C1/C2/C3 customization holds.
- **Type/name consistency:** class names `pumper-qb-tier--discount`, `.pumper-qb-radio`, `.pumper-qb-tier-badge`, `.pumper-qb-price-total`, `.pumper-qb-price-strike`, `.pumper-qb-tier-subbadges` are identical across the markup (T2 step 3), CSS (T2 step 5), and tests (T2 step 1). `qb.standardPrice` used in T2 matches the key added in T1.
- **Selected-over-discount precedence** explicitly handled (T2 step 5).
- **color-mix** is already used elsewhere in this codebase's widget CSS, so it's safe.
