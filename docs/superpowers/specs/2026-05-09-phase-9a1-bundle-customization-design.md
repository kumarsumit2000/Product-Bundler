# Phase 9.A.1: Bundle Widget Customization — Design Spec

**Date:** 2026-05-09
**Status:** Draft for review
**Parent:** Phase 9.A (customization bucket) → 9.A.1 first sub-project. Followed by 9.A.2 (Sticky ATC) and 9.A.3 (Countdown timer).

---

## 1. Goal

Let merchants override per-bundle (and per-QB):

- **Colors / radius** — primary, text, background, border-radius
- **A curated set of widget strings** — headlines, CTAs, badges, labels

Without forcing them to. Empty value = inherit from shop-level setting (which itself falls back to i18n default).

## 2. Architecture

Render-time precedence, lowest to highest:

```
i18n default  →  shop.settings  →  bundle.styleOverrides / bundle.textOverrides
```

The widget's `/api/storefront/config/:shop` payload already serializes full bundle/QB rows including `styleOverrides` JSON; we add `textOverrides` to that same payload. No new endpoints.

The admin form gains one Polaris Card ("Style & Text") in both BundleForm and QbForm, below existing sections.

## 3. Schema

`apps/admin/drizzle/schema.ts`:

**Both `bundles` and `quantity_breaks`:**
- Add `textOverrides` JSON column, nullable. Shape: `Partial<Record<TextKey, string>>` where `TextKey` is the curated set in §4.

**`quantity_breaks` only** (parity with bundles, which already have these):
- Add `headline` text column, nullable
- Add `ctaLabel` text column, nullable

`styleOverrides` JSON column already exists on both tables (currently dead — schema present, never consumed by the widget). No schema change there; we just start using it.

Migration `NNNN_qb_text_and_overrides.sql` adds the three new columns. No data migration needed; everything defaults to NULL.

## 4. Curated text keys (10 total)

```ts
export type BundleTextKey =
  | "bundle.totalLabel"
  | "bundle.savingsBadge";   // NEW i18n key — see §7

export type QbTextKey =
  | "qb.tierLabel"
  | "qb.savingsBadge"
  | "qb.mostPopular"
  | "qb.giftBadge";

export type TextKey = BundleTextKey | QbTextKey;
```

**Bundle (4 effective fields):**
| Field | Storage |
|---|---|
| `bundle.heading` | existing `headline` column |
| `bundle.cta` / `bundle.ctaSavings` | existing `ctaLabel` column (one input drives both) |
| `bundle.totalLabel` | `textOverrides` JSON |
| `bundle.savingsBadge` | `textOverrides` JSON |

**QB (6 effective fields):**
| Field | Storage |
|---|---|
| `qb.heading` | new `headline` column |
| `qb.cta` / `qb.ctaSavings` | new `ctaLabel` column |
| `qb.tierLabel` | `textOverrides` JSON |
| `qb.savingsBadge` | `textOverrides` JSON |
| `qb.mostPopular` | `textOverrides` JSON |
| `qb.giftBadge` | `textOverrides` JSON |

Mix-match uses the bundle's headline/CTA (it's a bundle subtype). No mix-specific keys.

Merchant overrides support the same `{var}` template substitution as i18n. E.g. a merchant can write `"Save {percent}% — buy {qty}+"` and `{percent}`/`{qty}` get substituted at render time.

## 5. Form UI

New Polaris Card "Style & Text" appended to `BundleForm.tsx` and `QbForm.tsx`, below existing sections (Products, Discount, Placement, etc.).

```
┌─ Style & Text ──────────────────────────────────────┐
│  Style                                              │
│  ┌─────────────┬─────────────┬─────────────┐        │
│  │ Primary     │ Text        │ Background  │        │
│  │ [#RRGGBB ▾] │ [#RRGGBB ▾] │ [#RRGGBB ▾] │        │
│  └─────────────┴─────────────┴─────────────┘        │
│  Border radius: ──●──── 8px                         │
│                                                     │
│  Text                                               │
│  Headline       [_________________________]         │
│  CTA            [_________________________]         │
│  Total label    [_________________________]   ← bundle only
│  Tier label     [_________________________]   ← QB only
│  Savings badge  [_________________________]         │
│  Most popular   [_________________________]   ← QB only
│  Free gift      [_________________________]   ← QB only
│                                                     │
│  Leave empty to use the shop default.               │
└─────────────────────────────────────────────────────┘
```

- Color pickers: Polaris `<TextField>` with type=color (or a small custom component if Polaris lacks one — fall back to hex `<input type="color">` wrapped with a Polaris label).
- Radius: `<RangeSlider min={0} max={24} step={1} />`. Empty state = inherit (slider hidden behind a checkbox toggle "Override radius").
- Text fields: each shows the resolved default (shop setting or i18n) as the `placeholder`. Help text under each input: "Leave empty to use the default."

Form state shape (`BundleFormValues`):

```ts
{
  // ...existing fields
  styleOverrides: {
    primaryColor: string;       // "" = inherit
    textColor: string;
    backgroundColor: string;
    borderRadius: number | null; // null = inherit
  };
  textOverrides: Record<TextKey, string>;  // "" = inherit
}
```

On submit, the action serializes empty strings / nulls into omitted keys before writing to D1, so the JSON column stores only actual overrides.

## 6. Widget consumption

### 6.1 CSS vars (per-mount)

`apps/widget-src/src/widget.ts:46-52` `applyCssVars()` changes from reading shop settings only to reading the layered value:

```ts
function applyCssVars(target: HTMLElement, cfg: WidgetConfig, override: StyleOverrides | null) {
  const s = cfg.settings;
  target.style.setProperty("--pumper-primary",  override?.primaryColor    ?? s.primaryColor);
  target.style.setProperty("--pumper-text",     override?.textColor       ?? s.textColor);
  target.style.setProperty("--pumper-bg",       override?.backgroundColor ?? s.backgroundColor);
  target.style.setProperty("--pumper-radius",   `${override?.borderRadius ?? s.borderRadius}px`);
  target.style.setProperty("--pumper-font",     s.fontFamily);  // shop-level only
}
```

Caller passes the bundle/QB's `styleOverrides`. Mix-match uses the bundle's overrides.

### 6.2 Text helper

New helper in `apps/widget-src/src/i18n.ts`. The existing `t(key, vars)` function already does `{var}` template substitution against the EN table — we factor that substitution out into a reusable `interpolate(template, vars)` and have both `t` and `tWith` call it:

```ts
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name) =>
    name in vars ? String(vars[name]) : m
  );
}

export function t(key: string, vars?: Record<string, string | number>): string {
  return interpolate(EN[key] ?? key, vars);
}

export function tWith(
  overrides: Record<string, string> | null | undefined,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const override = overrides?.[key];
  const template = override && override.length > 0 ? override : (EN[key] ?? key);
  return interpolate(template, vars);
}
```

All render call sites in `render-bundle.ts`, `render-qb.ts`, `render-mix.ts` switch from `t(key, vars)` to `tWith(entity.textOverrides, key, vars)` for the curated keys.

Non-curated keys (the other 18 i18n strings — error messages, BOGO variants, `pickMore`, etc.) keep using `t(key, vars)` with no override. Out of scope for v1.

### 6.3 Type updates

`apps/widget-src/src/types.ts`:

```ts
export type StyleOverrides = Partial<{
  primaryColor: string;
  textColor: string;
  backgroundColor: string;
  borderRadius: number;
}>;

// On Bundle, Qb, MixMatch entities:
styleOverrides: StyleOverrides | null;
textOverrides: Record<string, string> | null;
```

(Currently `styleOverrides` is typed as `Record<string, unknown> | null` — an obvious sharpening.)

## 7. New i18n key

Add `bundle.savingsBadge` to `apps/widget-src/src/i18n.ts` EN table:

```
"bundle.savingsBadge": "Save {amount}",
```

Render bundle uses it next to the total when discount > 0. (Currently the savings string is concatenated inline — extract it to a key so merchants can rename it.)

## 8. Storefront config payload

`apps/admin/app/lib/storefront-config.ts` and `preview-config.ts` already serialize `styleOverrides`. Add `textOverrides` to the shape they emit, plus `headline` + `ctaLabel` for QB (which previously didn't exist on QB rows).

No backwards-compat dance needed — the widget tolerates absent fields (`null` short-circuits in the `??` chain).

## 9. File manifest

**Created (1):**
- `apps/admin/drizzle/migrations/NNNN_qb_text_and_overrides.sql`

**Modified (12):**
- `apps/admin/drizzle/schema.ts` — three new columns + `TextKey` types
- `apps/admin/app/components/BundleForm.tsx` — Style & Text card, form state extension
- `apps/admin/app/components/QbForm.tsx` — Style & Text card, form state extension, headline/CTA inputs
- `apps/admin/app/lib/storefront-config.ts` — pass new fields through
- `apps/admin/app/lib/preview-config.ts` — pass new fields through
- `apps/admin/app/routes/app.bundles.new.tsx` — accept new form fields in action
- `apps/admin/app/routes/app.bundles.$id.tsx` — same
- `apps/admin/app/routes/app.quantity-breaks.new.tsx` — same + headline/ctaLabel
- `apps/admin/app/routes/app.quantity-breaks.$id.tsx` — same
- `apps/widget-src/src/types.ts` — sharpen `styleOverrides`, add `textOverrides`, add QB headline/ctaLabel
- `apps/widget-src/src/i18n.ts` — `bundle.savingsBadge` key + `tWith` helper
- `apps/widget-src/src/widget.ts` — `applyCssVars` accepts overrides
- `apps/widget-src/src/render-bundle.ts`, `render-qb.ts`, `render-mix.ts` — switch curated keys to `tWith`

(File count is 12 modified + 1 created = 13. The render trio counts as 3.)

## 10. Out of scope

- Live preview iframe alongside the form (deferred — costs are real; revisit in 9.A.3 polish)
- Per-tier text overrides on QB (each tier already has a `label`; that's the per-tier escape hatch)
- Custom CSS escape hatch per-bundle (shop-level `customCss` already exists, sanitized)
- Font picker per-bundle (shop-global is sufficient; bloats form for rare use)
- Overrides for the 18 non-curated i18n keys (error messages, BOGO variants, `pickMore`, `viewAll`, etc.) — defaults are good; revisit if support tickets surface specific renaming requests
- Color presets / "themes" picker (Phase 2 polish)
- A/B testing different copy per bundle (Phase 2)

## 11. Testing

**Automated (vitest):**
- `bundles-repo.test.ts` — round-trip `textOverrides` + `styleOverrides` through D1
- `quantity-breaks-repo.test.ts` — same, plus new headline/ctaLabel columns
- `storefront-config.test.ts` — payload includes both override fields and QB headline/ctaLabel
- `preview-config.test.ts` — same
- `i18n.test.ts` (new) — `tWith` returns override when present, falls back to i18n when null/empty, template `{var}` substitution works on overrides
- `render-bundle.test.ts`, `render-qb.test.ts` — render with `styleOverrides` sets correct CSS vars on root; render with `textOverrides` displays override strings

**Manual smoke (post-deploy):**
- [ ] Edit existing bundle → set primary color to red, save → widget on PDP renders red CTA
- [ ] Set bundle headline to "Bundle deal!" → widget shows it
- [ ] Clear the headline field → widget falls back to shop-default headline
- [ ] Set QB tier label to "Get {qty} for {percent}% off" → widget interpolates correctly
- [ ] Set QB "Most popular" to "Best value" → tier badge updates
- [ ] Mix-match bundle inherits its bundle's overrides (no surprise text)

## 12. Risks

| Risk | Mitigation |
|---|---|
| JSON column grows unbounded if merchants paste massive strings | Form-side maxLength=120 per text field. Server validates on submit. |
| Override with bad `{var}` (e.g. `{Percent}` mis-cased) renders the literal placeholder | `tWith` substitutes only known vars; unknown placeholders pass through unchanged. Help text on form: "Available variables: {percent}, {qty}, {amount}". |
| Color picker value is invalid hex | Form validates `/^#[0-9a-fA-F]{6}$/` before submit. Empty = inherit (allowed). |
| Migrating existing QB rows that have NULL headline/ctaLabel | Widget already falls back via `??` chain. No data backfill needed. |
| Existing bundle's top-level `headline` + `ctaLabel` columns conflict with merchant expectations of "all overrides in one place" | UX: form positions both inside the same Card, so merchant sees them as one group regardless of underlying storage. |

## 13. Definition of done

- Migration applied to local D1; `pnpm tsc --noEmit` clean
- BundleForm and QbForm render new Card; submitting persists overrides
- Widget renders bundle with custom primary color + custom headline (verified against a test store)
- All vitest suites pass; new tests for `tWith` and render-with-overrides land green
- `pnpm build` succeeds; widget bundle size delta < 500 bytes gzipped
- Spec self-review pass + user review pass before plan is written
