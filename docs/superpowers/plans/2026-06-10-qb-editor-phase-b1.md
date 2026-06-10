# QB Editor Redesign — Phase B1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the QB tier discount-type `Select` with a 5-tab control (% Off / Flat / Specific / BOGO / None), add the BOGO config UI, and fix the form→action serialization so BOGO + per-tier free gift actually persist.

**Architecture:** Two pure, unit-tested helper modules — `serialize-qb-tier.ts` (form tier → DB tier, fixing the BOGO/free-gift bug, reused by both routes) and `qb-tier-discount.ts` (derive the active tab / apply a tab to a tier). `QbTierBuilder` renders the tab UI from those helpers. No schema change, no migration, no widget change (the widget already renders BOGO + all discount types).

**Tech Stack:** Remix + Polaris + Drizzle, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-10-qb-editor-phase-b1-discount-type-tabs-design.md`

**Commands:** admin tests `pnpm --filter admin test <pat>` · admin typecheck `pnpm --filter admin typecheck`

**Key existing shapes:**
- `TierFormValue` (in `apps/admin/app/components/QbTierBuilder.tsx`): `{ qty, discountType: "percentage"|"flat"|"fixed_per_unit", discountValue, label, isMostPopular, enabled?, freeGiftVariant?: PickedVariant|null, bogoMode?: ""|"add_same"|"add_different"|"nth_free", bogoTargetVariant?: PickedVariant|null, bogoBonusQty?, extraProducts?: PickedProduct[] }`
- `QbTier` (DB, in `apps/admin/drizzle/schema.ts`): `{ qty, discountType, discountValue, label, isMostPopular, enabled?, freeGiftVariantId?, bogo?: {mode, targetVariantId?, bonusQty}, extraProducts?: BundleProduct[] }`
- `PickedVariant` has `variantId`; `PickedProduct` has `productId, variantId, qty, title?, image?`.

---

## Task 1: `serialize-qb-tier.ts` — form tier → DB tier (TDD)

**Files:**
- Create: `apps/admin/app/lib/serialize-qb-tier.ts`
- Test: `apps/admin/test/serialize-qb-tier.test.ts`

- [ ] **Step 1: Write the failing test** `apps/admin/test/serialize-qb-tier.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { serializeTierForm } from "../app/lib/serialize-qb-tier";

const base = { qty: 2, discountType: "percentage" as const, discountValue: 20, label: "Buy 2", isMostPopular: false, enabled: true };

describe("serializeTierForm", () => {
  it("builds bogo from the flat bogo* fields", () => {
    const out = serializeTierForm({ ...base, bogoMode: "add_different", bogoTargetVariant: { variantId: "gid://v/9" } as never, bogoBonusQty: 2 });
    expect(out.bogo).toEqual({ mode: "add_different", targetVariantId: "gid://v/9", bonusQty: 2 });
  });
  it("omits bogo when bogoMode is empty", () => {
    const out = serializeTierForm({ ...base, bogoMode: "" });
    expect(out.bogo).toBeUndefined();
  });
  it("builds freeGiftVariantId from freeGiftVariant", () => {
    const out = serializeTierForm({ ...base, freeGiftVariant: { variantId: "gid://v/3" } as never });
    expect(out.freeGiftVariantId).toBe("gid://v/3");
  });
  it("passes through qty/discount/label/isMostPopular/enabled", () => {
    const out = serializeTierForm({ ...base });
    expect(out).toMatchObject({ qty: 2, discountType: "percentage", discountValue: 20, label: "Buy 2", isMostPopular: false, enabled: true });
    expect(out.bogo).toBeUndefined();
    expect(out.freeGiftVariantId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** Run: `pnpm --filter admin test serialize-qb-tier` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `apps/admin/app/lib/serialize-qb-tier.ts`:

```ts
import type { QbTier } from "../../drizzle/schema";
import type { TierFormValue } from "../components/QbTierBuilder";

// Converts a TierFormValue (flat form shape) into the persisted QbTier record.
// Reused by both QB route actions so BOGO + per-tier free gift serialize from
// the form's actual fields (bogoMode/bogoTargetVariant/bogoBonusQty,
// freeGiftVariant) rather than the non-existent t.bogo / t.freeGiftVariantId.
export function serializeTierForm(t: TierFormValue): QbTier {
  const hasBogo = !!t.bogoMode && t.bogoMode !== "";
  return {
    qty: t.qty,
    discountType: t.discountType,
    discountValue: t.discountValue,
    label: t.label,
    isMostPopular: t.isMostPopular,
    enabled: t.enabled,
    freeGiftVariantId: t.freeGiftVariant?.variantId ?? undefined,
    bogo: hasBogo
      ? { mode: t.bogoMode as "add_same" | "add_different" | "nth_free", targetVariantId: t.bogoTargetVariant?.variantId ?? undefined, bonusQty: t.bogoBonusQty ?? 1 }
      : undefined,
    extraProducts: (t.extraProducts ?? []).map((p) => ({ productId: p.productId, variantId: p.variantId, qty: p.qty, title: p.title, image: p.image })),
  };
}
```

- [ ] **Step 4: Run, verify PASS.** Run: `pnpm --filter admin test serialize-qb-tier` — Expected: 4 pass.

- [ ] **Step 5: Commit.**

```bash
git add apps/admin/app/lib/serialize-qb-tier.ts apps/admin/test/serialize-qb-tier.test.ts
git commit -m "feat(qb): serializeTierForm — fix BOGO/free-gift form→record mapping"
```

---

## Task 2: Use `serializeTierForm` in both QB route actions

**Files:**
- Modify: `apps/admin/app/routes/app.quantity-breaks.new.tsx`
- Modify: `apps/admin/app/routes/app.quantity-breaks.$id.tsx`

- [ ] **Step 1: Replace the inline tier map.** In each route action, the input currently does `tiers: tiersRaw.map((t) => ({ qty, discountType, ..., bogo: (() => { const raw = (t as {...}).bogo; ... })(), extraProducts: ... }))`. Replace that whole `tiers:` mapping with:

```ts
    tiers: tiersRaw.map(serializeTierForm),
```
Add the import at the top: `import { serializeTierForm } from "~/lib/serialize-qb-tier";`. Remove now-unused inline casts. `tiersRaw` is already typed `TierFormValue[]`.

- [ ] **Step 2: Typecheck + full admin tests.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, all green.

- [ ] **Step 3: Commit.**

```bash
git add apps/admin/app/routes/app.quantity-breaks.new.tsx apps/admin/app/routes/app.quantity-breaks.\$id.tsx
git commit -m "feat(qb): persist tier BOGO + free gift via serializeTierForm in both routes"
```

---

## Task 3: `qb-tier-discount.ts` — tab deriver + applier (TDD)

**Files:**
- Create: `apps/admin/app/lib/qb-tier-discount.ts`
- Test: `apps/admin/test/qb-tier-discount.test.ts`

- [ ] **Step 1: Write the failing test** `apps/admin/test/qb-tier-discount.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { tierDiscountTab, applyDiscountTab } from "../app/lib/qb-tier-discount";

const t = (over: Record<string, unknown> = {}) => ({ qty: 2, discountType: "percentage" as const, discountValue: 20, label: "", isMostPopular: false, bogoMode: "" as const, bogoBonusQty: 1, ...over });

describe("tierDiscountTab", () => {
  it("bogoMode set → bogo", () => { expect(tierDiscountTab(t({ bogoMode: "add_same" }))).toBe("bogo"); });
  it("fixed_per_unit → fixed_per_unit", () => { expect(tierDiscountTab(t({ discountType: "fixed_per_unit" }))).toBe("fixed_per_unit"); });
  it("value 0 → none", () => { expect(tierDiscountTab(t({ discountValue: 0 }))).toBe("none"); });
  it("flat>0 → flat", () => { expect(tierDiscountTab(t({ discountType: "flat", discountValue: 5 }))).toBe("flat"); });
  it("percentage>0 → percentage", () => { expect(tierDiscountTab(t())).toBe("percentage"); });
});

describe("applyDiscountTab", () => {
  it("none zeroes value + clears bogo", () => {
    const out = applyDiscountTab(t({ bogoMode: "add_same", discountValue: 30 }), "none");
    expect(out.discountValue).toBe(0); expect(out.bogoMode).toBe(""); expect(out.discountType).toBe("percentage");
  });
  it("bogo sets a default mode when none set", () => {
    const out = applyDiscountTab(t(), "bogo");
    expect(out.bogoMode).toBe("add_same"); expect(out.bogoBonusQty).toBe(1);
  });
  it("switching to flat clears bogo and sets type", () => {
    const out = applyDiscountTab(t({ bogoMode: "nth_free" }), "flat");
    expect(out.discountType).toBe("flat"); expect(out.bogoMode).toBe("");
  });
  it("fixed_per_unit sets type and clears bogo", () => {
    const out = applyDiscountTab(t({ bogoMode: "add_same" }), "fixed_per_unit");
    expect(out.discountType).toBe("fixed_per_unit"); expect(out.bogoMode).toBe("");
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** Run: `pnpm --filter admin test qb-tier-discount` — Expected: FAIL.

- [ ] **Step 3: Implement** `apps/admin/app/lib/qb-tier-discount.ts`:

```ts
import type { TierFormValue } from "../components/QbTierBuilder";

export type DiscountTab = "percentage" | "flat" | "fixed_per_unit" | "bogo" | "none";

// Derive which tab is active for a tier (see spec table).
export function tierDiscountTab(t: Pick<TierFormValue, "discountType" | "discountValue" | "bogoMode">): DiscountTab {
  if (t.bogoMode && t.bogoMode !== "") return "bogo";
  if (t.discountType === "fixed_per_unit") return "fixed_per_unit";
  if (t.discountValue === 0) return "none";
  if (t.discountType === "flat") return "flat";
  return "percentage";
}

// Apply a tab choice to a tier, returning a new tier with the right fields set.
export function applyDiscountTab(t: TierFormValue, tab: DiscountTab): TierFormValue {
  const clearBogo = { bogoMode: "" as const, bogoTargetVariant: null };
  switch (tab) {
    case "percentage": return { ...t, ...clearBogo, discountType: "percentage" };
    case "flat": return { ...t, ...clearBogo, discountType: "flat" };
    case "fixed_per_unit": return { ...t, ...clearBogo, discountType: "fixed_per_unit" };
    case "none": return { ...t, ...clearBogo, discountType: "percentage", discountValue: 0 };
    case "bogo": return { ...t, discountType: "percentage", bogoMode: t.bogoMode && t.bogoMode !== "" ? t.bogoMode : "add_same", bogoBonusQty: t.bogoBonusQty ?? 1 };
  }
}
```

- [ ] **Step 4: Run, verify PASS.** Run: `pnpm --filter admin test qb-tier-discount` — Expected: 9 pass.

- [ ] **Step 5: Commit.**

```bash
git add apps/admin/app/lib/qb-tier-discount.ts apps/admin/test/qb-tier-discount.test.ts
git commit -m "feat(qb): discount-tab deriver + applier helpers"
```

---

## Task 4: Tab UI + BOGO block in `QbTierBuilder`

**Files:**
- Modify: `apps/admin/app/components/QbTierBuilder.tsx`

- [ ] **Step 1: Import helpers.** Add `import { tierDiscountTab, applyDiscountTab, type DiscountTab } from "~/lib/qb-tier-discount";` and ensure `ButtonGroup` is imported from `@shopify/polaris` (add it to the existing polaris import). `VariantPicker` is already imported (used for free gifts) — reuse it.

- [ ] **Step 2: Replace the discount-type `Select` with the tab row + per-type input.** In the expanded tier body, where the `Select` with options percentage/flat/fixed_per_unit currently renders (calling `updateTier(i, { discountType })`), replace it with:

```tsx
{(() => {
  const activeTab = tierDiscountTab(tier);
  const TABS: { tab: DiscountTab; label: string }[] = [
    { tab: "percentage", label: "% Off" },
    { tab: "flat", label: "Flat" },
    { tab: "fixed_per_unit", label: "Specific" },
    { tab: "bogo", label: "BOGO" },
    { tab: "none", label: "None" },
  ];
  return (
    <BlockStack gap="200">
      <Text as="span" variant="bodySm" tone="subdued">Select discount type</Text>
      <ButtonGroup variant="segmented">
        {TABS.map(({ tab, label }) => (
          <Button key={tab} pressed={activeTab === tab} onClick={() => updateTier(i, applyDiscountTab(tier, tab))}>{label}</Button>
        ))}
      </ButtonGroup>
      {activeTab === "percentage" && (
        <TextField label="Discount in %" type="number" autoComplete="off" value={String(tier.discountValue)} onChange={(v) => updateTier(i, { discountValue: parseFloat(v) || 0 })} />
      )}
      {activeTab === "flat" && (
        <TextField label="Discount amount" type="number" autoComplete="off" value={String(tier.discountValue)} onChange={(v) => updateTier(i, { discountValue: parseFloat(v) || 0 })} />
      )}
      {activeTab === "fixed_per_unit" && (
        <TextField label="Price per unit" type="number" autoComplete="off" value={String(tier.discountValue)} onChange={(v) => updateTier(i, { discountValue: parseFloat(v) || 0 })} />
      )}
      {activeTab === "none" && (
        <Text as="p" tone="subdued" variant="bodySm">This tier sells at standard price.</Text>
      )}
      {activeTab === "bogo" && (
        <BlockStack gap="200">
          <Select
            label="BOGO type"
            options={[
              { label: "Add same product free", value: "add_same" },
              { label: "Add a different product free", value: "add_different" },
              { label: "Every Nth free", value: "nth_free" },
            ]}
            value={tier.bogoMode || "add_same"}
            onChange={(v) => updateTier(i, { bogoMode: v as TierFormValue["bogoMode"] })}
          />
          {tier.bogoMode === "add_different" && (
            <VariantPicker
              label="Free product"
              variant={tier.bogoTargetVariant ?? null}
              onChange={(pv) => updateTier(i, { bogoTargetVariant: pv })}
            />
          )}
          <TextField label="Bonus quantity" type="number" autoComplete="off" value={String(tier.bogoBonusQty ?? 1)} onChange={(v) => updateTier(i, { bogoBonusQty: Math.max(1, parseInt(v, 10) || 1) })} />
        </BlockStack>
      )}
    </BlockStack>
  );
})()}
```
IMPORTANT: match the EXISTING `VariantPicker` prop names — READ how `VariantPicker` is used elsewhere in `QbTierBuilder`/`QbForm` for free gifts (it may take `value`/`onChange` or `variant`/`onChange`, and a `restrictToProductId`). Use its real prop names; the snippet above assumes `variant`/`onChange`/`label`. Keep the existing `discountValue` parsing style the file already uses (it may store numbers, not strings — match it; if `discountValue` is a number in `TierFormValue`, `parseFloat` is correct).

- [ ] **Step 3: Remove the old `Select` for discountType** (the one being replaced) and any now-unused local pieces. Keep the qty field, the label field, and the existing free-gift/extra-products advanced UI untouched.

- [ ] **Step 4: Typecheck + tests.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, green.

- [ ] **Step 5: Commit.**

```bash
git add apps/admin/app/components/QbTierBuilder.tsx
git commit -m "feat(qb): discount-type tabs (% Off/Flat/Specific/BOGO/None) + BOGO config UI"
```

---

## Task 5: Live-preview parity for BOGO

**Files:**
- Modify (if needed): the QB preview tier mapping — likely in `apps/admin/app/routes/app.quantity-breaks.new.tsx` / `.$id.tsx` (where `buildPreviewQbConfig` is called from form values) or `apps/admin/app/lib/preview-config.ts`.

- [ ] **Step 1: Find where the form's tiers become the preview config tiers.** Search the QB routes for `buildPreviewQbConfig` and how `tiers` are passed. The preview must show BOGO, so the preview tier objects need `bogo` populated from the flat form fields.

- [ ] **Step 2: Fix if broken.** If the preview tier mapping reads `t.bogo` (absent) like the route bug, change it to use `serializeTierForm` (from Task 1) — i.e. map the form tiers through `serializeTierForm` before handing them to `buildPreviewQbConfig` (the resulting `QbTier[]` carries `bogo` + `freeGiftVariantId`, which the preview/widget consume). If the preview already builds a correct tier shape with `bogo`, leave it. Confirm by reasoning: a tier with `bogoMode="add_same"` must reach the preview as `bogo: { mode: "add_same", ... }`.

- [ ] **Step 3: Typecheck + tests.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, green.

- [ ] **Step 4: Commit (only if changed).**

```bash
git add -A
git commit -m "feat(qb): thread tier BOGO into the live preview"
```

---

## Task 6: Full verification

- [ ] **Step 1: Admin.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, all green (≥ 216 + the new tests).
- [ ] **Step 2: Widget unaffected.** Run: `pnpm --filter widget-src typecheck && pnpm --filter widget-src test` — Expected: clean, green (no widget change in B1).
- [ ] **Step 3: Admin build.** Run: `pnpm --filter admin build` — Expected: success.
- [ ] **Step 4: Manual.** On `/app/quantity-breaks/new`, expand a tier: the 5 tabs render; selecting each shows the right input; **None** shows the helper text and zeroes the value; **BOGO** shows the mode select, a variant picker for "Add different", and bonus qty. Save with BOGO add-different + a target; reopen the edit page and confirm the tab + BOGO persisted; confirm the live preview shows the BOGO badge.
- [ ] **Step 5: Deploy (when approved).** `pnpm --filter admin build && cd apps/admin && pnpm run deploy` (admin-only change — no widget change, so no `shopify app deploy` needed for B1).

---

## Self-review notes
- **Spec coverage:** derived tabs (T3 `tierDiscountTab`), apply-tab field setting (T3 `applyDiscountTab`), tab + per-type input + BOGO UI (T4), serialization bug fix for BOGO + free gift (T1 `serializeTierForm` + T2 wiring), preview parity (T5), no schema/widget change (honored). All spec sections covered.
- **No placeholders:** the only "verify/adapt" notes are about matching the real `VariantPicker` prop names and the preview mapping location — both require reading 1 file; the code shown is otherwise complete.
- **Type consistency:** `DiscountTab` union identical T3↔T4; `serializeTierForm`/`tierDiscountTab`/`applyDiscountTab` names consistent across tasks; `TierFormValue` fields (`bogoMode`/`bogoTargetVariant`/`bogoBonusQty`/`freeGiftVariant`) used consistently.
- **No DB change** — B1 deploys admin-only; widget untouched.
