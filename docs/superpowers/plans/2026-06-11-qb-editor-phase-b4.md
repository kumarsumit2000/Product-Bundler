# QB Editor Redesign — Phase B4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-tier **mark-as-sold-out** (widget-only: greyed, "Sold out", non-selectable) and **checkout-accurate charm price rounding** (the widget display AND the Rust discount-function both land on the same `.99` price).

**Architecture:** Two per-tier JSON fields (`soldOut`, `priceRounding`) thread admin → DB → storefront-config (widget) and → metafield-sync (functions). A shared integer `roundCharmCents` formula is implemented identically in TS (widget) and Rust (checkout); the Rust discount-function converts a rounded tier to a per-item FixedAmount discount that lands on the charm price.

**Tech Stack:** Remix + Polaris + Drizzle, vanilla-TS widget (vitest), Rust (`shopify_function`, wasm). No new deps, no DB migration.

**Spec:** `docs/superpowers/specs/2026-06-11-qb-editor-phase-b4-rounding-soldout-design.md`

**Commands:** admin `pnpm --filter admin test <pat>` / `typecheck` · widget `pnpm --filter widget-src test <pat>` / `typecheck` / `build` · Rust: `cd extensions/discount-function && cargo build --target=wasm32-unknown-unknown --release` and `cargo test`.

**Key existing code:**
- Widget `tierUnitCents(tier, basePriceCents)` (`render-qb.ts`): `percentage → Math.round(base*(1-dv/100))`, `flat → Math.max(0, base - Math.round(dv*100))`, `fixed_per_unit → Math.max(0, Math.round(dv*100))`.
- Rust `discount.rs`: `compute_qb_tier_value(tier, line_amount_per_unit) -> DiscountValue` (enum `Percentage(f64) | FixedAmount(f64)`). `run.rs build_discount(...)` emits `FixedAmount { applies_to_each_item: None }` today. `config.rs QbTier` has `qty, discount_type, discount_value, ...` (serde rename camelCase).

---

## Task 1: Data model + serializer (`soldOut`, `priceRounding`) (TDD)

**Files:**
- Modify: `apps/admin/drizzle/schema.ts` (QbTier), `apps/widget-src/src/types.ts` (QbTier), `apps/admin/app/components/QbTierBuilder.tsx` (TierFormValue + DEFAULT_TIER), `apps/admin/app/lib/serialize-qb-tier.ts`
- Test: extend `apps/admin/test/serialize-qb-tier.test.ts`

- [ ] **Step 1: Add fields to both QbTier types.** In `apps/admin/drizzle/schema.ts` `QbTier` (after `freeShipping?`):
```ts
  soldOut?: boolean;        // manual "this tier is unavailable"
  priceRounding?: number;   // charm ending in cents (99 | 95 | 0); absent = no rounding
```
In `apps/widget-src/src/types.ts` `QbTier` add the same two lines.

- [ ] **Step 2: Add to the form shape.** In `QbTierBuilder.tsx` `TierFormValue` add `soldOut?: boolean;` and `priceRounding?: number;`. In `DEFAULT_TIER` add `soldOut: false,` and `priceRounding: undefined,`.

- [ ] **Step 3: Write the failing test** — append to `apps/admin/test/serialize-qb-tier.test.ts`:
```ts
it("carries soldOut and priceRounding", () => {
  const out = serializeTierForm({ qty: 2, discountType: "percentage", discountValue: 20, label: "", isMostPopular: false, soldOut: true, priceRounding: 99 } as never);
  expect(out.soldOut).toBe(true);
  expect(out.priceRounding).toBe(99);
});
it("omits soldOut/priceRounding when unset/false", () => {
  const out = serializeTierForm({ qty: 1, discountType: "percentage", discountValue: 0, label: "", isMostPopular: false } as never);
  expect(out.soldOut).toBeUndefined();
  expect(out.priceRounding).toBeUndefined();
});
```

- [ ] **Step 4: Run, verify FAIL.** Run: `pnpm --filter admin test serialize-qb-tier` — Expected: FAIL.

- [ ] **Step 5: Implement in `serialize-qb-tier.ts`.** Add to the returned object:
```ts
    soldOut: t.soldOut || undefined,
    priceRounding: t.priceRounding ?? undefined,
```

- [ ] **Step 6: Run + typecheck.** Run: `pnpm --filter admin test serialize-qb-tier && pnpm --filter admin typecheck && pnpm --filter widget-src typecheck` — Expected: pass, clean.

- [ ] **Step 7: Commit.**
```bash
git add apps/admin/drizzle/schema.ts apps/widget-src/src/types.ts apps/admin/app/components/QbTierBuilder.tsx apps/admin/app/lib/serialize-qb-tier.ts apps/admin/test/serialize-qb-tier.test.ts
git commit -m "feat(qb): add per-tier soldOut + priceRounding fields + serializer"
```

---

## Task 2: `roundCharmCents` + widget rounding + sold-out (TDD)

**Files:**
- Create: `apps/widget-src/src/round-charm.ts`
- Modify: `apps/widget-src/src/render-qb.ts`, `apps/widget-src/src/i18n.ts`
- Test: `apps/widget-src/src/round-charm.test.ts`, extend `apps/widget-src/src/render-qb.test.ts`

- [ ] **Step 1: Write the failing test** `apps/widget-src/src/round-charm.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { roundCharmCents } from "./round-charm";

describe("roundCharmCents", () => {
  it("rounds to nearest .99", () => {
    expect(roundCharmCents(1996, 99)).toBe(1999);
    expect(roundCharmCents(1940, 99)).toBe(1899);
    expect(roundCharmCents(2000, 99)).toBe(1999);
  });
  it("rounds to nearest .00", () => {
    expect(roundCharmCents(1996, 0)).toBe(2000);
    expect(roundCharmCents(1940, 0)).toBe(1900);
  });
  it("never returns negative", () => {
    expect(roundCharmCents(40, 99)).toBe(99); // candidates: -1, 99, 199 → 99 (>=0, nearest)
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** Run: `pnpm --filter widget-src test round-charm` — Expected: FAIL.

- [ ] **Step 3: Implement** `apps/widget-src/src/round-charm.ts`:
```ts
// Round a price (in cents) to the nearest value whose cents-part equals
// `ending` (0–99). Nearest wins; ties go to the lower candidate; never < 0.
export function roundCharmCents(priceCents: number, ending: number): number {
  const dollars = Math.floor(priceCents / 100);
  const candidates = [(dollars - 1) * 100 + ending, dollars * 100 + ending, (dollars + 1) * 100 + ending].filter((c) => c >= 0);
  let best = candidates[0]!;
  for (const c of candidates) {
    if (Math.abs(c - priceCents) < Math.abs(best - priceCents)) best = c;
  }
  return best;
}
```

- [ ] **Step 4: Run, verify PASS.** Run: `pnpm --filter widget-src test round-charm` — Expected: pass.

- [ ] **Step 5: Add the i18n key in all 11 locales.** In `i18n.ts`, add `"qb.soldOut": "..."` to each locale dict (anchor near `qb.tierUnavailable`): EN `"Sold out"`, FR `"Épuisé"`, DE `"Ausverkauft"`, ES `"Agotado"`, IT `"Esaurito"`, PT `"Esgotado"`, NL `"Uitverkocht"`, PL `"Wyprzedane"`, SV `"Slutsåld"`, JA `"売り切れ"`, ZH `"已售罄"`.

- [ ] **Step 6: Write failing widget tests** in `render-qb.test.ts` (mirror the file's QB fixture):
```ts
it("marks a soldOut tier unavailable, shows Sold out, and skips it in default selection", () => {
  // QB with tiers [{qty:1,...,soldOut:true},{qty:2,...}] — both available stock-wise
  const tiers = mount.querySelectorAll(".pumper-qb-tier");
  expect(tiers[0]!.className).toContain("pumper-qb-tier--unavailable");
  expect(tiers[0]!.textContent).toContain("Sold out");
  expect(mount.querySelector(".pumper-qb-tier--selected")).toBe(tiers[1]); // default selection skipped the sold-out tier
});
it("rounds the displayed unit price when priceRounding is set", () => {
  // a tier: percentage 20 on a $24.95 (2495) variant, priceRounding: 99 → unit rounds to $19.99
  expect(mount.textContent).toContain("$19.99");
});
```
(Use the file's real fixture shape; the default-selection assertion may need to match how the file marks the selected tier — adapt to the actual selector. If the first tier being sold-out makes selection land on index 1, assert that.)

- [ ] **Step 7: Run, verify FAIL.** Run: `pnpm --filter widget-src test render-qb` — Expected: FAIL.

- [ ] **Step 8: Implement in `render-qb.ts`.**
  - Import: `import { roundCharmCents } from "./round-charm";`.
  - In `renderRows()`, compute availability + rounding:
```ts
const unavailable = tr.soldOut === true || tr.available === false;
let unitCents = tierUnitCents(tr, variant.priceCents);
if (tr.priceRounding != null) unitCents = roundCharmCents(unitCents, tr.priceRounding);
```
   Use `unitCents` (rounded) for `totalCents`, `savings`, and the displayed price (replace the existing `tierUnitCents(...)` assignment). Use `unavailable` for the `pumper-qb-tier--unavailable` class (replace the current `tr.available ? "" : "..."` check) and add a "Sold out" label when `unavailable`:
```ts
const soldOutLabel = unavailable ? `<span class="pumper-qb-soldout">${escapeHtml(t("qb.soldOut"))}</span>` : "";
```
   (place it in the tier badge area).
  - **Selection guard:** find the default-selected-index computation and the tier-click handler. Extend them to skip `unavailable` tiers: the default selected index should be the first tier where `!(tr.soldOut || tr.available === false)` (fall back to 0 if all unavailable); the click handler that today early-returns on `available === false` must also early-return on `soldOut`. Mirror the existing guard exactly, just OR-in `soldOut`.

- [ ] **Step 9: Run, verify PASS + build.** Run: `pnpm --filter widget-src test render-qb && pnpm --filter widget-src typecheck && pnpm --filter widget-src build` — Expected: pass, clean, build success.

- [ ] **Step 10: Commit (incl. rebuilt assets).**
```bash
git add apps/widget-src/src/round-charm.ts apps/widget-src/src/round-charm.test.ts apps/widget-src/src/render-qb.ts apps/widget-src/src/render-qb.test.ts apps/widget-src/src/i18n.ts extensions/theme-app-extension/assets apps/admin/public
git commit -m "feat(widget): per-tier charm rounding + sold-out display/non-selectable"
```

---

## Task 3: storefront-config + metafield-sync carry `priceRounding` (TDD)

**Files:**
- Modify: `apps/admin/app/lib/storefront-config.ts`, `apps/admin/app/lib/metafield-sync.ts`
- Test: extend `apps/admin/test/storefront-config.test.ts`, `apps/admin/test/metafield-sync.test.ts`

- [ ] **Step 1: Write failing tests.** In `storefront-config.test.ts`: seed a QB whose tier has `soldOut: true` + `priceRounding: 99`; assert `out.quantityBreaks[0].tiers[0].soldOut === true` and `.priceRounding === 99`. In `metafield-sync.test.ts`: seed a QB tier with `priceRounding: 99`; assert the synced `quantityBreaks[0].tiers[0].priceRounding === 99`. (Mirror existing seeding in each test.)

- [ ] **Step 2: Run, verify FAIL.** Run: `pnpm --filter admin test storefront-config metafield-sync` — Expected: FAIL.

- [ ] **Step 3: Implement.** In `storefront-config.ts`, in the QB `tiers.map((tr) => ({ ... }))`, add `soldOut: tr.soldOut ?? false,` and `priceRounding: tr.priceRounding ?? null,`. In `metafield-sync.ts`, in the QB `tiers` mapping, add `priceRounding: tr.priceRounding ?? null,` (the function needs rounding; `soldOut` is widget-only so do NOT sync it). Add `priceRounding?: number` to the `SyncConfig` tier type if it enumerates fields.

- [ ] **Step 4: Run + typecheck.** Run: `pnpm --filter admin test && pnpm --filter admin typecheck` — Expected: all green, clean.

- [ ] **Step 5: Commit.**
```bash
git add apps/admin/app/lib/storefront-config.ts apps/admin/app/lib/metafield-sync.ts apps/admin/test/storefront-config.test.ts apps/admin/test/metafield-sync.test.ts
git commit -m "feat(qb): serialize soldOut (widget) + priceRounding (widget+functions)"
```

---

## Task 4: Admin tier UI — sold-out toggle + rounding toggle/select

**Files:**
- Modify: `apps/admin/app/components/QbTierBuilder.tsx`

- [ ] **Step 1: Add a "Mark as sold out" toggle.** In the expanded tier body, add a `Checkbox` "Mark as sold out" bound to `tier.soldOut`: `checked={tier.soldOut === true}`, `onChange={(v) => updateTier(i, { soldOut: v })}`.

- [ ] **Step 2: Add a "Price rounding" toggle + ending Select.** Add a `Checkbox` "Round price" (`checked={tier.priceRounding != null}`, on → `updateTier(i, { priceRounding: 99 })`, off → `updateTier(i, { priceRounding: undefined })`). When `tier.priceRounding != null`, show a `Select` of endings:
```tsx
<Select
  label="Ending"
  options={[{ label: ".99", value: "99" }, { label: ".95", value: "95" }, { label: ".00", value: "0" }]}
  value={String(tier.priceRounding ?? 99)}
  onChange={(v) => updateTier(i, { priceRounding: parseInt(v, 10) })}
/>
```
Place both near the discount-type controls; match the file's Polaris idioms (`Select`/`Checkbox` already imported).

- [ ] **Step 3: Typecheck + tests.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, green.

- [ ] **Step 4: Commit.**
```bash
git add apps/admin/app/components/QbTierBuilder.tsx
git commit -m "feat(qb): per-tier sold-out + price-rounding controls"
```

---

## Task 5: Rust discount-function — charm rounding at checkout

**Files:**
- Modify: `extensions/discount-function/src/config.rs`, `extensions/discount-function/src/discount.rs`, `extensions/discount-function/src/run.rs`

- [ ] **Step 1: Add the config field.** In `config.rs` `QbTier`, add:
```rust
    #[serde(rename = "priceRounding", default)]
    pub price_rounding: Option<u32>,
```

- [ ] **Step 2: Add `round_charm_cents` + a rounded-discount helper to `discount.rs` with tests.** Add:
```rust
/// Round a price (cents) to the nearest value whose cents-part == ending (0..=99).
/// Nearest wins, ties to lower, never < 0. Mirrors the widget's roundCharmCents.
pub fn round_charm_cents(price_cents: i64, ending: u32) -> i64 {
    let ending = ending as i64;
    let dollars = price_cents.div_euclid(100);
    let candidates = [(dollars - 1) * 100 + ending, dollars * 100 + ending, (dollars + 1) * 100 + ending];
    candidates.iter().copied().filter(|c| *c >= 0)
        .min_by_key(|c| (*c - price_cents).abs())
        .unwrap_or(0)
}

/// The discounted unit price in cents BEFORE charm rounding, matching the
/// widget's tierUnitCents exactly (integer cents).
fn discounted_unit_cents(tier: &QbTier, base_cents: i64) -> i64 {
    match tier.discount_type.as_str() {
        "percentage" => ((base_cents as f64) * (1.0 - tier.discount_value / 100.0)).round() as i64,
        "flat" => (base_cents - (tier.discount_value * 100.0).round() as i64).max(0),
        "fixed_per_unit" => ((tier.discount_value * 100.0).round() as i64).max(0),
        _ => base_cents,
    }
}

/// Per-item FixedAmount (in dollars) to make the unit land on the charm price.
/// Clamped >= 0 so checkout never upcharges.
pub fn rounded_per_item_off(tier: &QbTier, line_amount_per_unit: f64, ending: u32) -> f64 {
    let base_cents = (line_amount_per_unit * 100.0).round() as i64;
    let target = round_charm_cents(discounted_unit_cents(tier, base_cents), ending);
    ((base_cents - target).max(0)) as f64 / 100.0
}

#[cfg(test)]
mod charm_tests {
    use super::*;
    #[test]
    fn rounds_nearest() {
        assert_eq!(round_charm_cents(1996, 99), 1999);
        assert_eq!(round_charm_cents(1940, 99), 1899);
        assert_eq!(round_charm_cents(1996, 0), 2000);
    }
    #[test]
    fn per_item_off_lands_on_charm() {
        let tier = QbTier { qty: 2, discount_type: "percentage".into(), discount_value: 20.0, label: String::new(), is_most_popular: false, free_gift_variant_id: None, bogo: None, price_rounding: Some(99) };
        // base $24.95 → discounted 1996 → charm 1999 → per-item off = 2495-1999 = 4.96
        assert!((rounded_per_item_off(&tier, 24.95, 99) - 4.96).abs() < 1e-6);
    }
}
```
(Match the actual `QbTier` struct literal — include every field it has, e.g. `free_shipping` from B2 if present. Read `config.rs` and fill all fields in the test literal.)

- [ ] **Step 3: Add a per-item DiscountValue path.** In `discount.rs`, extend the `DiscountValue` enum with `FixedAmountPerItem(f64)`. In `run.rs` `build_discount`, handle it:
```rust
DiscountValue::FixedAmountPerItem(a) => schema::Value::FixedAmount(schema::FixedAmount {
    amount: Decimal(a),
    applies_to_each_item: Some(true),
}),
```

- [ ] **Step 4: Apply rounding in `run.rs`.** Where the QB tier discount is built:
```rust
let value = discount::compute_qb_tier_value(tier, amount_per_unit);
let value = match tier.price_rounding {
    Some(ending) => DiscountValue::FixedAmountPerItem(discount::rounded_per_item_off(tier, amount_per_unit, ending)),
    None => value,
};
discounts.push(build_discount(&qb.name, &[line.id.clone()], value));
```
(Leave non-rounded tiers exactly as today.)

- [ ] **Step 5: Build + test.** Run: `cd extensions/discount-function && cargo build --target=wasm32-unknown-unknown --release && cargo test` — Expected: wasm compiles, charm_tests pass. If `cargo test` can't compile natively due to the function macro, report it and rely on the wasm build + keep the `#[cfg(test)]` tests in place.

- [ ] **Step 6: Commit.**
```bash
git add extensions/discount-function/src/config.rs extensions/discount-function/src/discount.rs extensions/discount-function/src/run.rs
git commit -m "feat(discount-fn): checkout-accurate per-tier charm price rounding"
```

---

## Task 6: Full verification + deploy

- [ ] **Step 1: Admin.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, green.
- [ ] **Step 2: Widget.** Run: `pnpm --filter widget-src typecheck && pnpm --filter widget-src test && pnpm --filter widget-src build` — Expected: clean, green, build success.
- [ ] **Step 3: Rust.** Run: `cd extensions/discount-function && cargo build --target=wasm32-unknown-unknown --release && cargo test` — Expected: wasm builds, tests green.
- [ ] **Step 4: Manual (dev store).** Set a tier `priceRounding=.99`; PDP shows $19.99 and checkout charges $19.99 (the discount lands the unit on the charm price). Mark a tier sold out; it shows greyed "Sold out" and can't be selected; selection defaults to the first available tier.
- [ ] **Step 5: Deploy (when approved).** Admin: `pnpm --filter admin build && cd apps/admin && pnpm run deploy`. Widget + Rust discount-function: `pnpm shopify app deploy --force` (from repo root).

---

## Self-review notes
- **Spec coverage:** fields + serializer (T1), roundCharmCents + widget rounding + sold-out display/selection + i18n (T2), storefront-config + metafield-sync (T3), admin controls (T4), Rust round + per-item FixedAmount + config (T5), verify+deploy (T6). All spec sections covered.
- **soldOut NOT synced to metafield** — honored in T3 (only `priceRounding` synced).
- **Widget==checkout:** T2 widget and T5 Rust both round via the SAME integer formula (`roundCharmCents` / `round_charm_cents`) over the SAME `discounted_unit_cents` math (mirrors `tierUnitCents`).
- **Clamp:** Rust `rounded_per_item_off` clamps `>= 0` (no upcharge).
- **Type consistency:** `soldOut?: boolean` / `priceRounding?: number` identical across schema QbTier, widget QbTier, TierFormValue; Rust `price_rounding: Option<u32>` matches the synced `priceRounding` key; `roundCharmCents`/`round_charm_cents` names parallel.
- **Ships the function:** T6 step 5 runs `shopify app deploy`.
