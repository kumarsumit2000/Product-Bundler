# QB Widget — Radio-Card Redesign

**Date:** 2026-06-11
**Status:** Approved design, ready for implementation planning
**Scope:** Restyle the Quantity-Break storefront widget's tier cards to the "radio-card" look (radio selector, inline discount badge, prominent total price with strikethrough compare-at, tinted cards, centered divider heading). Single surface: `render-qb.ts` + `widget.css` + `i18n.ts`. The same `render-qb` powers the admin live preview, so this updates both.

## Context

Today each QB tier renders as a compact row: `Buy {qty} — {label}` on the left, a sub-line `~$base~ $unit each · $total total`, and right-aligned badges (`MOST POPULAR`, `Save $X`). Structure (in `render-qb.ts` `renderRows()`): a column card (`.pumper-qb-tier`) containing `.pumper-qb-tier-row` (image + `.pumper-qb-tier-meta` with title + sub-line + badges), then extras/gift callouts below.

The widget already applies merchant styling via CSS vars on the mount (`--pumper-primary`, `--pumper-tier-bg`, `--pumper-selected-bg`, `--pumper-border`, `--pumper-cards-bg`, font vars) — set by C1 palettes / C3 controls. The redesign **reuses those vars** so all existing customization keeps working.

## Goal

Match the reference radio-card layout while preserving the widget's data, selection behavior, customization vars, and per-tier features (image, free-ship, sold-out, free-gift callouts, extras).

## Decisions (approved)
- **Price display:** prominent **total** price (right-aligned) with the **strikethrough compare-at total** beneath it; drop the "$X each" per-unit line.
- **Base (no-discount) tier** shows a **"Standard Price"** badge (new i18n key `qb.standardPrice`, all 11 locales).

## New tier-card structure (`render-qb.ts` `renderRows()`)

Per visible tier `tr` at index `i` (existing computed values reused: `unitCents` (post-rounding), `totalCents`, `baseTotal`, `savings`, `discountPercent`, `unavailable`):
```html
<div class="pumper-qb-tier{selected}{discount}{unavailable}" data-tier-index="${i}" data-action="select-tier" role="button" tabindex="0">
  ${popularBadge}                                  <!-- unchanged: .pumper-qb-popular-badge pinned top-right -->
  <div class="pumper-qb-tier-row">
    <span class="pumper-qb-radio" aria-hidden="true"></span>
    ${tierImage}                                   <!-- unchanged: .pumper-qb-tier-img -->
    <div class="pumper-qb-tier-meta">
      <div class="pumper-qb-tier-title">
        ${escapeHtml(tWith(qb.textOverrides, "qb.tierLabel", tierVars))}
        <span class="pumper-qb-tier-badge">${escapeHtml(badgeText)}</span>
      </div>
      <div class="pumper-qb-tier-subbadges">${soldOutLabel}${freeShipBadge}</div>
    </div>
    <div class="pumper-qb-tier-price">
      <span class="pumper-qb-price-total">${formatMoney(totalCents, …)}</span>
      ${savings > 0 ? `<span class="pumper-qb-price-strike">${formatMoney(baseTotal, …)}</span>` : ""}
    </div>
  </div>
  ${extrasRow}${giftCallout}${qbGiftCallout}        <!-- unchanged, below the row -->
</div>
```
- **Classes:** add `pumper-qb-tier--discount` when `savings > 0`; keep `--selected` (when `i === selectedIndex`) and `--unavailable`.
- **`badgeText`:** `savings > 0 ? (tr.label.trim() || \`${discountPercent}% OFF\`) : t("qb.standardPrice")`.
- **Removed from the card:** the old `.pumper-qb-tier-sub` "each · total" line and the standalone `.pumper-qb-savings` "Save $X" pill (the inline discount badge + strike total replace them). The `qb.savingsBadge` override/`.hidden` (B3) no longer renders in this layout — the per-tier `label` is the badge.
- **`.pumper-qb-tier-subbadges`** holds the small sold-out / free-ship chips under the title (only rendered when present).

## CSS (`widget.css`)

- `.pumper-qb-tier-row` → `display:flex; align-items:center; gap:10px;` (radio | image | meta | price). `.pumper-qb-tier-meta { flex:1; min-width:0; }`, `.pumper-qb-tier-price { margin-left:auto; text-align:right; }`.
- **Radio:** `.pumper-qb-radio { width:18px; height:18px; flex-shrink:0; border:2px solid var(--pumper-border,#cbd5e1); border-radius:50%; position:relative; }`; selected → `.pumper-qb-tier--selected .pumper-qb-radio { border-color:var(--pumper-primary,#7B1E2A); }` with a filled inner dot via `::after` (`background:var(--pumper-primary)`).
- **Card states:**
  - base: `.pumper-qb-tier { background:var(--pumper-cards-bg,#fff); border:1px solid var(--pumper-border,#e3e3e3); }`
  - discount (unselected): `.pumper-qb-tier--discount { background:var(--pumper-tier-bg,#fde7ea); border-color:color-mix(in srgb, var(--pumper-primary,#7B1E2A) 30%, #fff); }`
  - selected: `.pumper-qb-tier--selected { background:var(--pumper-selected-bg,#fff); border:2px solid var(--pumper-primary,#7B1E2A); }` (overrides the discount tint).
- **Badge:** `.pumper-qb-tier-badge { display:inline-block; margin-left:8px; font-size:11px; font-weight:600; padding:2px 8px; border-radius:999px; border:1px solid color-mix(in srgb, var(--pumper-primary) 35%, #fff); color:var(--pumper-primary,#7B1E2A); }`
- **Price:** `.pumper-qb-price-total { font-size:16px; font-weight:700; color:var(--pumper-price-color,#1a1a1a); }`; `.pumper-qb-price-strike { display:block; font-size:12px; text-decoration:line-through; color:#9aa0a6; }`.
- **Subbadges:** `.pumper-qb-tier-subbadges { display:flex; flex-wrap:wrap; gap:6px; margin-top:4px; }` (empty → no visual gap since children absent).
- **Heading (centered + dividers):** `.pumper-qb-heading { display:flex; align-items:center; justify-content:center; gap:12px; text-align:center; }` with `::before`/`::after { content:""; flex:1; height:1px; background:var(--pumper-border,#e3e3e3); }`.
- **Horizontal (C2):** in `.pumper-qb-tiers--horizontal .pumper-qb-tier-row` allow the price to wrap under the meta in narrow cells (e.g. `flex-wrap:wrap` on the row within horizontal); the radio-card styling otherwise applies unchanged.
- Keep the rounded-radius/spacing vars (`--pumper-radius`, `--pumper-spacing`) honored as today.

## i18n (`i18n.ts`)
Add `"qb.standardPrice"` to all 11 locale dicts: EN "Standard Price", FR "Prix standard", DE "Standardpreis", ES "Precio estándar", IT "Prezzo standard", PT "Preço padrão", NL "Standaardprijs", PL "Cena standardowa", SV "Standardpris", JA "通常価格", ZH "标准价格".

## Data / behavior
No schema, config, or data change. Selection (`selectedIndex`, `data-action="select-tier"`, keyboard), add-to-cart, CTA, gift/extras logic all unchanged. CSS vars keep palette/customization working.

## Error handling / edge cases
- Base tier with `savings === 0` → "Standard Price" badge, no strike, no `--discount` tint.
- `unavailable` tier keeps the dimmed `--unavailable` style; the radio still renders (non-selectable per existing guard).
- A discounted tier with an empty `label` falls back to `${discountPercent}% OFF`.
- Horizontal layout: price wraps under the title in narrow grid cells (no overflow).
- All `formatMoney`/currency/locale handling unchanged.

## Testing
- **Widget (TDD), `render-qb.test.ts`:** (a) each tier renders a `.pumper-qb-radio`; (b) the selected tier card has `pumper-qb-tier--selected`; (c) a discounted tier has `pumper-qb-tier--discount`, a `.pumper-qb-price-strike`, and a `.pumper-qb-tier-badge` with the label text; (d) the base/no-discount tier's badge text is "Standard Price"; (e) `.pumper-qb-price-total` shows the tier total.
- **Update existing tests** that assert the old markup: any test checking the `.pumper-qb-tier-sub` "each · total" line or the `.pumper-qb-savings` pill must move to the new `.pumper-qb-price-total`/`-strike`/`-badge`. The B4 rounding test (`$19.99`) should assert the **total** reflects the rounded unit (use a qty-1 tier so total == rounded unit, or assert the rounded unit appears in the total).
- **Regression:** all other widget tests (sold-out, horizontal layout, image, free-ship, gift callouts, add-to-cart) stay green; `pnpm --filter widget-src typecheck`/`build` clean; admin suite unaffected.
- **Manual:** the live preview + a dev-store PDP match the reference — radio selectors, inline badges, total+strike on the right, tinted discounted cards, centered divider heading; palettes (C1) recolor it; Horizontal (C2) still lays out.

## Out of scope
The B3 `qb.savingsBadge` "Save $X" pill in this layout (replaced by the inline discount badge); changing bundle / BXGY / mix-match widgets (QB only); any data/schema change.
