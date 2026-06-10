# QB Editor Redesign — Phase B3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let merchants drop `{DiscountPercentage}` / `{DiscountAmountTotal}` variables into QB tier text and toggle the savings badge + "Most Popular" on/off, via a `{!}`-insert + eye-toggle "Customize text" panel.

**Architecture:** Extend the existing `textOverrides` + `tWith`/`interpolate` machinery. The widget computes two new per-tier interpolation vars and honors two new `.hidden` override keys (mirroring `qb.freeGiftCallout.hidden`). The admin reworks the flat text fields into rows with a variable-insert menu (backed by a pure `insertToken` helper) and eye toggles.

**Tech Stack:** Remix + Polaris, vanilla-TS widget (vitest), Drizzle. No new deps, no DB migration, no Rust/function change.

**Spec:** `docs/superpowers/specs/2026-06-10-qb-editor-phase-b3-text-variables-design.md`

**Commands:** admin `pnpm --filter admin test <pat>` / `typecheck` · widget `pnpm --filter widget-src test <pat>` / `typecheck` / `build`

**Key existing facts:**
- `interpolate(template, vars)` in `i18n.ts`: `template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`))` — replaces any `{Word}` token present in `vars`. `DiscountPercentage`/`DiscountAmountTotal` are `\w+`, so NO i18n change needed.
- `render-qb.ts` `renderRows()` per tier `tr`: has `unitCents`, `variant.priceCents`, `savings`. Renders `popularBadge` (when `tr.isMostPopular`, via `tWith(qb.textOverrides,"qb.mostPopular")`), `savingsBadge` (when `savings>0`, via `tWith(...,"qb.savingsBadge",{savings: formatMoney(...)})`), and the tier title (`tWith(...,"qb.tierLabel",{qty:tr.qty})`). The `.hidden` pattern already used: `qb.textOverrides?.["qb.freeGiftCallout.hidden"] === "1"`.

---

## Task 1: Type + form defaults for the new `.hidden` keys

**Files:**
- Modify: `apps/admin/drizzle/schema.ts` (QbTextKey), `apps/admin/app/components/QbForm.tsx` (textOverrides default)

- [ ] **Step 1: Extend `QbTextKey`.** In `apps/admin/drizzle/schema.ts`, add to the `QbTextKey` union (after `"qb.freeGiftCallout.hidden"`):
```ts
  | "qb.savingsBadge.hidden"
  | "qb.mostPopular.hidden"
```

- [ ] **Step 2: Add empty defaults.** In `QbForm.tsx`, the `textOverrides` default object (the `{ "qb.tierLabel": "", "qb.savingsBadge": "", ... }` block), add:
```ts
    "qb.savingsBadge.hidden": "",
    "qb.mostPopular.hidden": "",
```

- [ ] **Step 3: Typecheck.** Run: `pnpm --filter admin typecheck` — Expected: clean.

- [ ] **Step 4: Commit.**
```bash
git add apps/admin/drizzle/schema.ts apps/admin/app/components/QbForm.tsx
git commit -m "feat(qb): add savingsBadge.hidden + mostPopular.hidden text keys"
```

---

## Task 2: Widget — dynamic vars + show/hide (TDD)

**Files:**
- Modify: `apps/widget-src/src/render-qb.ts`
- Test: `apps/widget-src/src/render-qb.test.ts`

- [ ] **Step 1: Write failing tests** in `render-qb.test.ts` (mirror the file's QB fixture; the QB needs a tier with a discount so `savings>0`, e.g. percentage 20 on a priced variant, and a `isMostPopular` tier):
```ts
it("interpolates {DiscountPercentage} and {DiscountAmountTotal} in a savings override", () => {
  // qb.textOverrides["qb.savingsBadge"] = "{DiscountPercentage}% off — save {DiscountAmountTotal}"
  // tier: percentage 20 on a $24.95 variant
  const badge = mount.querySelector(".pumper-qb-savings")!;
  expect(badge.textContent).toContain("20% off");
});
it("hides the savings badge when qb.savingsBadge.hidden is set", () => {
  // qb.textOverrides["qb.savingsBadge.hidden"] = "1"
  expect(mount.querySelector(".pumper-qb-savings")).toBeNull();
});
it("hides the most-popular badge when qb.mostPopular.hidden is set", () => {
  // a tier with isMostPopular: true + qb.textOverrides["qb.mostPopular.hidden"] = "1"
  expect(mount.querySelector(".pumper-qb-popular-badge")).toBeNull();
});
```
(Use the file's real fixture shape; only `textOverrides` + tier flags vary.)

- [ ] **Step 2: Run, verify FAIL.** Run: `pnpm --filter widget-src test render-qb` — Expected: FAIL.

- [ ] **Step 3: Implement in `render-qb.ts` `renderRows()`.** Compute the new vars per tier and use them:
```ts
const discountPercent = variant.priceCents > 0 ? Math.round((1 - unitCents / variant.priceCents) * 100) : 0;
const savingsFormatted = formatMoney(savings, config.settings.currency, config.settings.locale);
const tierVars = { qty: tr.qty, DiscountPercentage: discountPercent, DiscountAmountTotal: savingsFormatted };
```
Update the three render lines:
- `popularBadge`: gate on the hidden key —
```ts
const popularHidden = qb.textOverrides?.["qb.mostPopular.hidden"] === "1";
const popularBadge = tr.isMostPopular && !popularHidden
  ? `<span class="pumper-qb-popular-badge">${tWith(qb.textOverrides, "qb.mostPopular")}</span>`
  : "";
```
- `savingsBadge`: gate on hidden + pass the new vars (keep `savings` for back-compat) —
```ts
const savingsHidden = qb.textOverrides?.["qb.savingsBadge.hidden"] === "1";
const savingsBadge = savings > 0 && !savingsHidden
  ? `<span class="pumper-qb-savings">${tWith(qb.textOverrides, "qb.savingsBadge", { savings: savingsFormatted, ...tierVars })}</span>`
  : "";
```
- tier title: pass the new vars to the `qb.tierLabel` `tWith`: change `{ qty: tr.qty }` to `tierVars`.

- [ ] **Step 4: Run, verify PASS + full suite + build.** Run: `pnpm --filter widget-src test render-qb && pnpm --filter widget-src typecheck && pnpm --filter widget-src build` — Expected: pass, clean, build success (copies widget.js/css to extensions + admin/public).

- [ ] **Step 5: Commit (incl. rebuilt assets).**
```bash
git add apps/widget-src/src/render-qb.ts apps/widget-src/src/render-qb.test.ts extensions/theme-app-extension/assets apps/admin/public
git commit -m "feat(widget): {DiscountPercentage}/{DiscountAmountTotal} vars + savings/most-popular hide"
```

---

## Task 3: `insertToken` helper + token list (TDD)

**Files:**
- Create: `apps/admin/app/lib/qb-text-tokens.ts`
- Test: `apps/admin/test/qb-text-tokens.test.ts`

- [ ] **Step 1: Write the failing test** `apps/admin/test/qb-text-tokens.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { insertToken, QB_TEXT_TOKENS } from "../app/lib/qb-text-tokens";

describe("insertToken", () => {
  it("appends a token to an empty string with no leading space", () => {
    expect(insertToken("", "{qty}")).toBe("{qty}");
  });
  it("appends with a single separating space when needed", () => {
    expect(insertToken("Buy", "{qty}")).toBe("Buy {qty}");
  });
  it("does not double the space when the value already ends with one", () => {
    expect(insertToken("Buy ", "{qty}")).toBe("Buy {qty}");
  });
});
describe("QB_TEXT_TOKENS", () => {
  it("lists the supported tokens", () => {
    expect(QB_TEXT_TOKENS).toEqual(["{qty}", "{DiscountPercentage}", "{DiscountAmountTotal}"]);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** Run: `pnpm --filter admin test qb-text-tokens` — Expected: FAIL.

- [ ] **Step 3: Implement** `apps/admin/app/lib/qb-text-tokens.ts`:
```ts
// Variables a merchant can drop into QB tier text. The widget interpolates
// these per tier (see render-qb.ts).
export const QB_TEXT_TOKENS = ["{qty}", "{DiscountPercentage}", "{DiscountAmountTotal}"] as const;

// Append a token to a text field value with exactly one separating space
// (no leading space when the field is empty).
export function insertToken(value: string, token: string): string {
  if (value.length === 0) return token;
  return value.endsWith(" ") ? value + token : value + " " + token;
}
```

- [ ] **Step 4: Run, verify PASS.** Run: `pnpm --filter admin test qb-text-tokens` — Expected: 4 pass.

- [ ] **Step 5: Commit.**
```bash
git add apps/admin/app/lib/qb-text-tokens.ts apps/admin/test/qb-text-tokens.test.ts
git commit -m "feat(admin): insertToken helper + QB text token list"
```

---

## Task 4: Admin "Customize text" panel in `QbForm`

**Files:**
- Modify: `apps/admin/app/components/QbForm.tsx`

- [ ] **Step 1: Find the existing text-overrides UI.** In `QbForm.tsx`, the "Settings" CollapsibleSection (or wherever the `textOverrides` `TextField`s render) currently renders flat fields for `qb.tierLabel` / `qb.savingsBadge` / `qb.mostPopular` / `qb.freeGiftCallout`. Read that block.

- [ ] **Step 2: Replace each field with a row** containing the field + a `{!}` insert menu + (for hideable elements) an eye toggle. Add imports: `import { Popover, ActionList, Icon } from "@shopify/polaris";` (if not present) and `import { insertToken, QB_TEXT_TOKENS } from "~/lib/qb-text-tokens";`. Define the rows:
```tsx
const TEXT_ROWS: { key: string; label: string; defaultText: string; hideable: boolean }[] = [
  { key: "qb.tierLabel", label: "Tier label", defaultText: "Buy {qty}", hideable: false },
  { key: "qb.savingsBadge", label: "Savings text", defaultText: "Save {DiscountAmountTotal}", hideable: true },
  { key: "qb.mostPopular", label: "Most Popular badge", defaultText: "MOST POPULAR", hideable: true },
  { key: "qb.freeGiftCallout", label: "Free-gift callout", defaultText: "Unlock Free Gift 🎁", hideable: true },
];
```
Render each row (use a small local component or inline map). For the `{!}` menu use a `Popover` whose activator is a `Button` `{!}` and content an `ActionList` of `QB_TEXT_TOKENS` items; selecting one calls `update("textOverrides", { ...values.textOverrides, [key]: insertToken(values.textOverrides[key] ?? "", token) })`. The `TextField` is bound to `values.textOverrides[key] ?? ""` with `placeholder={row.defaultText}` and onChange updating that key. The eye toggle (a `Button` with an eye/eye-off icon, or a `Checkbox` "Hide") writes `[key + ".hidden"]: hidden ? "1" : ""` — `hidden` is `values.textOverrides[key + ".hidden"] === "1"`. Manage the per-row Popover open state with a local `useState<string | null>(null)` keyed by row key. Keep using the existing single hidden `textOverrides` form input (already serialized in QbForm) — do NOT add new hidden inputs; the data still lives in `values.textOverrides`.

- [ ] **Step 3: Typecheck + tests.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, all green (no test asserts QbForm structure).

- [ ] **Step 4: Commit.**
```bash
git add apps/admin/app/components/QbForm.tsx
git commit -m "feat(admin): Customize-text panel with {!} variable insert + eye toggles"
```

---

## Task 5: Full verification + deploy

- [ ] **Step 1: Admin.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, green.
- [ ] **Step 2: Widget.** Run: `pnpm --filter widget-src typecheck && pnpm --filter widget-src test && pnpm --filter widget-src build` — Expected: clean, green, build success.
- [ ] **Step 3: Manual.** In the editor's text panel: set Savings text to `"{DiscountPercentage}% off — save {DiscountAmountTotal}"`, confirm each tier in the live preview shows its own percent + amount; click the eye on Most Popular and confirm the badge disappears; use `{!}` to insert a token and confirm it appends with one space.
- [ ] **Step 4: Deploy (when approved).** Admin: `pnpm --filter admin build && cd apps/admin && pnpm run deploy`. Widget: `pnpm shopify app deploy --force` (render-qb changed; no function change).

---

## Self-review notes
- **Spec coverage:** `.hidden` keys + form defaults (T1), widget vars + hide gating (T2), insertToken + token list (T3), Customize-text panel (T4), verify+deploy (T5). All spec sections covered.
- **No i18n change** — `interpolate` already replaces any `{Word}` token in `vars`; T2 only passes new vars.
- **DiscountAmountTotal == savings value** — T2 passes the same `savingsFormatted` under both `savings` and `DiscountAmountTotal` (back-compat).
- **Type consistency:** `.hidden` keys `"qb.savingsBadge.hidden"` / `"qb.mostPopular.hidden"` identical in schema (T1) and widget checks (T2); token names `{DiscountPercentage}`/`{DiscountAmountTotal}` consistent across T2/T3/T4; `QB_TEXT_TOKENS` shared by T3/T4.
- **No DB migration / no Rust** — admin + widget only; T5 deploys Pages + `shopify app deploy`.
