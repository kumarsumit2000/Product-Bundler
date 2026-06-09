# QB Editor Redesign — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Quantity-Break editor into Pumper's collapsible accordion shell (3 groups) and give tiers draggable, collapsible rows with enable / duplicate / ⭐ controls — without changing what any existing field does.

**Architecture:** A reusable `CollapsibleSection` component provides accordion behavior; `QbForm` is reorganized into three groups; `QbTierBuilder` gets per-tier row chrome backed by a small pure tier-ops helper; a new per-tier `enabled` flag threads through parse → preview → storefront → widget; the route gets a sticky Save-as-draft / Publish footer.

**Tech Stack:** Remix + Polaris + Drizzle (D1), vanilla-TS widget (tsup), vitest. No new dependencies (drag uses native HTML5 DnD).

**Spec:** `docs/superpowers/specs/2026-06-10-qb-editor-redesign-phase-a-design.md`

**Commands:** admin tests `pnpm --filter admin test <pat>` · admin typecheck `pnpm --filter admin typecheck` · widget tests `pnpm --filter widget-src test <pat>` · widget typecheck `pnpm --filter widget-src typecheck` · widget build `pnpm --filter widget-src build`

---

## Task 1: `enabled` flag on the tier model (data layer)

**Files:**
- Modify: `apps/admin/drizzle/schema.ts` (QbTier type)
- Modify: `apps/widget-src/src/types.ts` (QbTier widget type)

- [ ] **Step 1: Add to schema `QbTier`.** In `apps/admin/drizzle/schema.ts`, add to the `QbTier` type (after `isMostPopular`):

```ts
  enabled?: boolean; // Phase A: a disabled tier is excluded from the widget. Absent = enabled (backward compatible).
```

- [ ] **Step 2: Add to widget `QbTier`.** In `apps/widget-src/src/types.ts`, in the `QbTier` type, add (after `isMostPopular`):

```ts
  enabled?: boolean;
```

- [ ] **Step 3: Typecheck both.** Run: `pnpm --filter admin typecheck && pnpm --filter widget-src typecheck` — Expected: clean.

- [ ] **Step 4: Commit.**

```bash
git add apps/admin/drizzle/schema.ts apps/widget-src/src/types.ts
git commit -m "feat(qb): add optional enabled flag to tier type (admin + widget)"
```

---

## Task 2: Widget skips disabled tiers (TDD)

**Files:**
- Modify: `apps/widget-src/src/render-qb.ts`
- Test: `apps/widget-src/src/render-qb.test.ts`

- [ ] **Step 1: Write the failing test** — add to `render-qb.test.ts` (mirror the file's existing render setup; build a QB with 2 tiers where the second has `enabled: false`):

```ts
it("does not render a tier whose enabled is false", () => {
  // ...render a QB whose tiers are [{qty:1,...,enabled:true},{qty:2,...,enabled:false}]...
  // assert only one tier row is in the DOM, and it is the qty:1 tier
  const rows = mount.querySelectorAll("[data-tier-index]");
  expect(rows.length).toBe(1);
});

it("renders a tier whose enabled is undefined (backward compatible)", () => {
  // ...render a QB whose single tier omits `enabled`...
  const rows = mount.querySelectorAll("[data-tier-index]");
  expect(rows.length).toBe(1);
});
```
(Use the same fixture/builder the nearest existing render-qb test uses; only the `enabled` field varies. If tier rows use a different selector than `[data-tier-index]`, match the file's actual selector.)

- [ ] **Step 2: Run, verify FAIL.** Run: `pnpm --filter widget-src test render-qb` — Expected: the "false" case fails (2 rows rendered).

- [ ] **Step 3: Implement.** In `render-qb.ts`, where tiers are iterated for rendering, filter first:

```ts
const visibleTiers = qb.tiers.filter((t) => t.enabled !== false);
```
Use `visibleTiers` for the tier-row rendering loop. IMPORTANT: keep tier **indices stable for selection** — if `selectedIndex` / `tr` lookups use `qb.tiers[idx]`, switch the render + selection to operate on `visibleTiers` consistently (so a disabled tier can't be selected and the default selected index points into `visibleTiers`). Do not change behavior when no tier is disabled.

- [ ] **Step 4: Run, verify PASS + full suite.** Run: `pnpm --filter widget-src test render-qb && pnpm --filter widget-src typecheck` — Expected: PASS, clean.

- [ ] **Step 5: Commit.**

```bash
git add apps/widget-src/src/render-qb.ts apps/widget-src/src/render-qb.test.ts
git commit -m "feat(widget): skip disabled QB tiers in render"
```

---

## Task 3: Thread `enabled` through admin serializers

**Files:**
- Modify: `apps/admin/app/lib/storefront-config.ts` (QB tier mapping)
- Modify: `apps/admin/app/lib/preview-config.ts` (if it reshapes tiers; otherwise no-op)
- Modify: `apps/admin/app/routes/app.quantity-breaks.new.tsx` and `app.quantity-breaks.$id.tsx` (tier parse in the action)
- Test: extend `apps/admin/test/storefront-config.test.ts`

- [ ] **Step 1: Write the failing test** — in `apps/admin/test/storefront-config.test.ts`, seed a QB whose tiers include one with `enabled: false` and one with `enabled` absent, then assert the serialized `cfg.quantityBreaks[0].tiers` preserves `enabled` on each (the widget does the filtering, not the server):

```ts
it("preserves the tier enabled flag through serialization", () => {
  // insert a QB with tiers: [{...,enabled:false},{...}] (no enabled on 2nd)
  // build config, then:
  expect(out.quantityBreaks[0].tiers[0].enabled).toBe(false);
  expect(out.quantityBreaks[0].tiers[1].enabled).toBeUndefined();
});
```

- [ ] **Step 2: Run, verify FAIL.** Run: `pnpm --filter admin test storefront-config` — Expected: FAIL (enabled dropped).

- [ ] **Step 3: Implement.** In `storefront-config.ts`, in the QB `tiers.map((tr) => ({ ... }))`, add `enabled: tr.enabled,` to the mapped tier object. In the route actions (`app.quantity-breaks.new.tsx` / `.$id.tsx`), where `tiersRaw.map((t) => ({ qty, discountType, ... }))` builds the tier objects for the repo, add `enabled: (t as { enabled?: boolean }).enabled,` so the form's per-tier enabled persists. In `preview-config.ts`, if `buildPreviewQbConfig` reshapes tiers, pass `enabled` through; if it spreads the tier object, no change needed (verify).

- [ ] **Step 4: Run, verify PASS + full suite.** Run: `pnpm --filter admin test && pnpm --filter admin typecheck` — Expected: 212+ pass, clean.

- [ ] **Step 5: Commit.**

```bash
git add apps/admin/app/lib/storefront-config.ts apps/admin/app/lib/preview-config.ts apps/admin/app/routes/app.quantity-breaks.new.tsx apps/admin/app/routes/app.quantity-breaks.\$id.tsx apps/admin/test/storefront-config.test.ts
git commit -m "feat(qb): persist + serialize per-tier enabled flag"
```

---

## Task 4: Pure tier-ops helper (TDD)

**Files:**
- Create: `apps/admin/app/lib/qb-tier-ops.ts`
- Test: `apps/admin/test/qb-tier-ops.test.ts`

- [ ] **Step 1: Write the failing test** `apps/admin/test/qb-tier-ops.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { reorderTiers, duplicateTier, setMostPopular, setTierEnabled } from "../app/lib/qb-tier-ops";

const t = (qty: number, extra: Record<string, unknown> = {}) => ({ qty, discountType: "percentage", discountValue: 0, label: "", isMostPopular: false, ...extra });

describe("qb-tier-ops", () => {
  it("reorderTiers moves an item from one index to another", () => {
    const out = reorderTiers([t(1), t(2), t(3)], 0, 2);
    expect(out.map((x) => x.qty)).toEqual([2, 3, 1]);
  });

  it("duplicateTier inserts a clone after the original with isMostPopular forced false", () => {
    const out = duplicateTier([t(1, { isMostPopular: true }), t(2)], 0);
    expect(out.map((x) => x.qty)).toEqual([1, 1, 2]);
    expect(out[1]!.isMostPopular).toBe(false);
    expect(out[0]).not.toBe(out[1]); // deep clone, not same ref
  });

  it("setMostPopular sets one tier popular and clears the rest", () => {
    const out = setMostPopular([t(1, { isMostPopular: true }), t(2), t(3)], 2);
    expect(out.map((x) => x.isMostPopular)).toEqual([false, false, true]);
  });

  it("setTierEnabled toggles the enabled flag on one tier only", () => {
    const out = setTierEnabled([t(1), t(2)], 1, false);
    expect(out[0]!.enabled).toBeUndefined();
    expect(out[1]!.enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** Run: `pnpm --filter admin test qb-tier-ops` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `apps/admin/app/lib/qb-tier-ops.ts` (generic over the tier shape so it works with `TierFormValue`):

```ts
// Pure array operations for the QB tier list. Generic so the same helpers work
// for the admin TierFormValue and any tier-like object. No React, no I/O.
export function reorderTiers<T>(tiers: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= tiers.length || to >= tiers.length) return tiers.slice();
  const next = tiers.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

export function duplicateTier<T extends { isMostPopular: boolean }>(tiers: T[], index: number): T[] {
  if (index < 0 || index >= tiers.length) return tiers.slice();
  const clone = { ...structuredClone(tiers[index]!), isMostPopular: false };
  const next = tiers.slice();
  next.splice(index + 1, 0, clone);
  return next;
}

export function setMostPopular<T extends { isMostPopular: boolean }>(tiers: T[], index: number): T[] {
  return tiers.map((t, i) => ({ ...t, isMostPopular: i === index }));
}

export function setTierEnabled<T extends { enabled?: boolean }>(tiers: T[], index: number, enabled: boolean): T[] {
  return tiers.map((t, i) => (i === index ? { ...t, enabled } : t));
}
```

- [ ] **Step 4: Run, verify PASS.** Run: `pnpm --filter admin test qb-tier-ops` — Expected: 4 pass.

- [ ] **Step 5: Commit.**

```bash
git add apps/admin/app/lib/qb-tier-ops.ts apps/admin/test/qb-tier-ops.test.ts
git commit -m "feat(admin): pure tier-ops helpers (reorder/duplicate/most-popular/enabled)"
```

---

## Task 5: `CollapsibleSection` component

**Files:**
- Create: `apps/admin/app/components/CollapsibleSection.tsx`

- [ ] **Step 1: Implement** `apps/admin/app/components/CollapsibleSection.tsx`:

```tsx
import { Card, Collapsible, Text, Icon } from "@shopify/polaris";
import { ChevronDownIcon, ChevronUpIcon } from "@shopify/polaris-icons";
import { useState, type ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  /** Optional control rendered at the right of the header (e.g. an enable Switch). */
  headerRight?: ReactNode;
  children: ReactNode;
};

// A Polaris-styled collapsible card used to build the QB editor's accordion
// groups. Header is a button (keyboard accessible); body uses Polaris Collapsible.
export function CollapsibleSection({ title, subtitle, defaultOpen = false, headerRight, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const id = `section-${title.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={id}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
        >
          <span>
            <Text as="h2" variant="headingMd">{title}</Text>
            {subtitle && <Text as="p" tone="subdued" variant="bodySm">{subtitle}</Text>}
          </span>
          <Icon source={open ? ChevronUpIcon : ChevronDownIcon} tone="subdued" />
        </button>
        {headerRight}
      </div>
      <Collapsible open={open} id={id} transition={{ duration: "150ms", timingFunction: "ease-in-out" }}>
        <div style={{ paddingTop: 16 }}>{children}</div>
      </Collapsible>
    </Card>
  );
}
```
(If `@shopify/polaris-icons` lacks `ChevronUpIcon`/`ChevronDownIcon` under those exact names, use the package's actual chevron export names — check `node_modules/@shopify/polaris-icons` exports.)

- [ ] **Step 2: Typecheck.** Run: `pnpm --filter admin typecheck` — Expected: clean.

- [ ] **Step 3: Commit.**

```bash
git add apps/admin/app/components/CollapsibleSection.tsx
git commit -m "feat(admin): CollapsibleSection accordion component"
```

---

## Task 6: Tier-row chrome in `QbTierBuilder`

**Files:**
- Modify: `apps/admin/app/components/QbTierBuilder.tsx`

- [ ] **Step 1: Add `enabled` to `TierFormValue` + default.** In `QbTierBuilder.tsx`, add `enabled?: boolean;` to `TierFormValue` and `enabled: true,` to `DEFAULT_TIER`.

- [ ] **Step 2: Rebuild each tier as a collapsible row with chrome.** Replace the current per-tier flat card with a row whose header has: a drag handle, an enable `Switch`, the `Tier {i+1}: Buy {qty}` label, a duplicate `Button` (icon), a ⭐ most-popular toggle `Button` (icon, filled when `isMostPopular`), and a chevron expand/collapse. The body (existing qty / discountType / discountValue / label inputs + Remove) shows only when expanded. Use the Task 4 helpers for the actions, calling the existing `onChange(tiers)`:

```tsx
import { reorderTiers, duplicateTier, setMostPopular, setTierEnabled } from "~/lib/qb-tier-ops";
import { Switch } from "@shopify/polaris"; // if no Switch, use Polaris `<Checkbox>` styled as a toggle, or the existing toggle pattern used elsewhere (e.g. StickyAtcCard)
// local UI state for which rows are open and drag source index:
const [openRows, setOpenRows] = useState<Record<number, boolean>>({});
const dragFrom = useRef<number | null>(null);
```
Row header pattern (per tier index `i`, value `tr`):
```tsx
<div
  draggable
  onDragStart={() => { dragFrom.current = i; }}
  onDragOver={(e) => e.preventDefault()}
  onDrop={() => { if (dragFrom.current !== null) { onChange(reorderTiers(tiers, dragFrom.current, i)); dragFrom.current = null; } }}
  style={{ display: "flex", alignItems: "center", gap: 10 }}
>
  <span aria-hidden style={{ cursor: "grab", color: "#9aa0a6" }}>⠿</span>
  {/* enable toggle */}
  <input type="checkbox" checked={tr.enabled !== false} onChange={(e) => onChange(setTierEnabled(tiers, i, e.currentTarget.checked))} aria-label={`Enable tier ${i + 1}`} />
  <span style={{ flex: 1, fontWeight: 600 }}>Tier {i + 1}: Buy {tr.qty}</span>
  <Button variant="tertiary" onClick={() => onChange(duplicateTier(tiers, i))} accessibilityLabel="Duplicate tier">⎘</Button>
  <Button variant="tertiary" onClick={() => onChange(setMostPopular(tiers, tr.isMostPopular ? -1 : i))} accessibilityLabel="Mark most popular">{tr.isMostPopular ? "★" : "☆"}</Button>
  <Button variant="tertiary" onClick={() => setOpenRows((s) => ({ ...s, [i]: !s[i] }))} accessibilityLabel="Expand tier">{openRows[i] ? "▲" : "▼"}</Button>
</div>
```
Wrap the existing input fields + Remove button in `{openRows[i] && (<div>...existing fields...</div>)}`. Keep the existing per-field `updateTier(i, patch)` calls unchanged. Remove the old inline "Popular" checkbox (its role is now the ⭐). Use Polaris `Button`/`Icon` instead of raw glyphs if the codebase prefers — match the existing component's Polaris usage; the glyphs above are acceptable placeholders if icons aren't already imported.

- [ ] **Step 3: Typecheck.** Run: `pnpm --filter admin typecheck` — Expected: clean.

- [ ] **Step 4: Manual sanity (described).** (No unit test — this is interactive UI; logic is covered by Task 4.) Confirm in your head: drag changes order via `reorderTiers`, duplicate via `duplicateTier`, ⭐ via `setMostPopular`, enable via `setTierEnabled`, all routed through `onChange`.

- [ ] **Step 5: Commit.**

```bash
git add apps/admin/app/components/QbTierBuilder.tsx
git commit -m "feat(admin): collapsible tier rows with drag/enable/duplicate/most-popular chrome"
```

---

## Task 7: Regroup `QbForm` into the 3 accordion groups

**Files:**
- Modify: `apps/admin/app/components/QbForm.tsx`

- [ ] **Step 1: Import the section component.** Add `import { CollapsibleSection } from "~/components/CollapsibleSection";` to `QbForm.tsx`.

- [ ] **Step 2: Wrap the existing cards into three groups.** Reorganize the render (do NOT change field logic, state, hidden inputs, or `onChange` handlers — only move JSX):
  - **Group 1 `CollapsibleSection title="Select Product & Basic Setup" defaultOpen`:** the Deal Name field (relabel the visible label to "Deal Name"), the Header Text field (relabel "Header Text") + the live arrow preview (Task 8), and the Apply-Deal-on visibility ChoiceList + bind-to-current-product + product/collection pickers (relabel header "Apply Deal on").
  - **Group 2 `CollapsibleSection title="Edit Tier Deals" defaultOpen`:** the `QbTierBuilder` + Add Tier button.
  - **Group 3:** a heading `<Text as="h2" variant="headingLg">Cherries on Top</Text>` with a subdued subtitle, followed by one `CollapsibleSection` per remaining card: Color & style (`SimpleQbStylePanel`), Free gift, Checkbox upsells (`QbUpsellsBuilder`), Add-ons (`WidgetAddonsCard`), Subscription (`SubscriptionPanel`), Sticky bar (`StickyAtcCard`), Settings (status + scheduling + combinable + sortOrder + Text overrides).
  Keep every existing hidden `<input>` and field exactly where its data is produced (they can live inside the relevant CollapsibleSection). The form id `QB_FORM_ID` and submit wiring stay unchanged.

- [ ] **Step 3: Typecheck + full admin tests.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, all green (no test asserts QbForm internal structure).

- [ ] **Step 4: Commit.**

```bash
git add apps/admin/app/components/QbForm.tsx
git commit -m "feat(admin): regroup QB editor into Select/Tiers/Cherries-on-Top accordions"
```

---

## Task 8: Header-text live arrow preview

**Files:**
- Modify: `apps/admin/app/components/QbForm.tsx`

- [ ] **Step 1: Add the preview next to Header Text.** In Group 1, render the Header Text input and, beside it, an arrow + a styled rendering of the current value:

```tsx
<div style={{ display: "flex", alignItems: "center", gap: 16 }}>
  <div style={{ flex: 1 }}>{/* existing Header Text TextField bound to values.headline */}</div>
  <span aria-hidden style={{ color: "#9aa0a6", fontSize: 18 }}>→</span>
  <Text as="span" variant="headingMd">{values.headline || "Choose your savings"}</Text>
</div>
```
Bind to the existing headline value (whatever the current state field is named — likely `values.headline`). Presentational only; no new state.

- [ ] **Step 2: Typecheck.** Run: `pnpm --filter admin typecheck` — Expected: clean.

- [ ] **Step 3: Commit.**

```bash
git add apps/admin/app/components/QbForm.tsx
git commit -m "feat(admin): live arrow preview for QB header text"
```

---

## Task 9: Sticky Save-as-draft / Publish footer

**Files:**
- Modify: `apps/admin/app/routes/app.quantity-breaks.new.tsx`
- Modify: `apps/admin/app/routes/app.quantity-breaks.$id.tsx`

- [ ] **Step 1: Add a sticky footer bar** in each route's page render, below the form column (or page-level), with two buttons:

```tsx
<div style={{ position: "sticky", bottom: 0, display: "flex", justifyContent: "flex-end", gap: 12, padding: "12px 0", background: "transparent" }}>
  <Button onClick={() => { setStatusAndSubmit("draft"); }}>Save as draft</Button>
  <Button variant="primary" onClick={() => { setStatusAndSubmit("active"); }}>Publish</Button>
</div>
```
Implement `setStatusAndSubmit(status)` to set the form's hidden `status` value to the given value, then submit the form via the existing `submitFormById(QB_FORM_ID)` (the same mechanism the current single save button uses). The QbForm already renders a hidden `status` input from `values.status`; the cleanest approach: lift `status` into the route via a small state or set the hidden input's value directly before submit. If `status` is owned inside `QbForm`, pass an `onRequestSave?: (status) => void` prop down, or expose a setter — choose the path that reuses the existing submit wiring with the fewest changes. The pre-existing inline save button can be removed or kept; the footer is the primary path.

- [ ] **Step 2: Typecheck + tests.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, green.

- [ ] **Step 3: Commit.**

```bash
git add apps/admin/app/routes/app.quantity-breaks.new.tsx apps/admin/app/routes/app.quantity-breaks.\$id.tsx
git commit -m "feat(admin): sticky Save-as-draft / Publish footer on QB editor"
```

---

## Task 10: Full verification

- [ ] **Step 1: Admin.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, all green.
- [ ] **Step 2: Widget.** Run: `pnpm --filter widget-src typecheck && pnpm --filter widget-src test && pnpm --filter widget-src build` — Expected: clean, green, build success.
- [ ] **Step 3: Manual (deployed or local).** On `/app/quantity-breaks/new`: the three accordion groups expand/collapse; tier rows drag-reorder, duplicate, enable-toggle, and ⭐ work and reflect in the live preview; a disabled tier disappears from the preview; the header-text arrow preview updates as you type; Save-as-draft saves `status=draft` and Publish saves `status=active`.
- [ ] **Step 4: Deploy (when approved).** `pnpm --filter admin build && cd apps/admin && pnpm run deploy` (admin-only change; no migration, no `shopify app deploy` needed unless the widget changed — the render-qb change DID, so also run `pnpm shopify app deploy --force` from repo root to ship the widget).

---

## Self-review notes
- **Spec coverage:** CollapsibleSection (T5), three-group regroup (T7), tier-row chrome incl. drag/enable/duplicate/⭐ (T4 helpers + T6), enabled flag end-to-end (T1 types, T2 widget, T3 serializers/parse), header-text arrow (T8), Save/Publish footer (T9). All spec sections covered.
- **No-migration** decision honored — `enabled` is a JSON tier property; absent = enabled, asserted in T2/T3 tests.
- **Type consistency:** `enabled?: boolean` identical in schema QbTier, widget QbTier, and TierFormValue; helper names `reorderTiers`/`duplicateTier`/`setMostPopular`/`setTierEnabled` consistent T4↔T6.
- **Widget ships:** render-qb changed → T10 step 4 runs `shopify app deploy`.
