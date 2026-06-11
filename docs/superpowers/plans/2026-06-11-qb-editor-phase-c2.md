# QB Editor Redesign — Phase C2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the QB widget render a Horizontal (side-by-side grid) tier layout when chosen, and relabel the admin picker Vertical/Horizontal.

**Architecture:** `render-qb` adds a `pumper-qb-tiers--horizontal` modifier class + a `--pumper-qb-cols` CSS var when `styleOverrides.layoutVariant === "grid"`; CSS lays the tiers out as a grid. The admin `LayoutPresetPicker` is relabeled (values stay `list`/`grid`). No schema change.

**Tech Stack:** vanilla-TS widget (tsup/vitest), Polaris admin. No new deps.

**Spec:** `docs/superpowers/specs/2026-06-11-qb-editor-phase-c2-layout-design.md`

**Commands:** widget `pnpm --filter widget-src test <pat>` / `typecheck` / `build` · admin `pnpm --filter admin typecheck` / `test`.

**Key facts:**
- `render-qb.ts` `renderAll()` builds the tiers container at line ~355: `<div class="pumper-qb-tiers">${renderRows()}</div>`. `renderRows()` maps over `visibleTiers` (the B1 filtered array, in scope in `renderQb`). `qb.styleOverrides` carries `layoutVariant?: "list"|"grid"` and `gridColumns?: number`.
- `widget.css` has `.pumper-qb-tiers { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }`.
- `LayoutPresetPicker.tsx` has a `PRESETS` array `[{ value: "list", label: "List", thumb }, { value: "grid", label: "Grid", thumb }]`.

---

## Task 1: Widget horizontal layout (TDD)

**Files:**
- Modify: `apps/widget-src/src/render-qb.ts`, `extensions/theme-app-extension/assets/widget.css`
- Test: extend `apps/widget-src/src/render-qb.test.ts`

- [ ] **Step 1: Write failing tests** in `render-qb.test.ts` (mirror the file's QB fixture; vary `styleOverrides`):
```ts
it("renders a horizontal grid when styleOverrides.layoutVariant is grid", () => {
  // QB with styleOverrides: { layoutVariant: "grid", gridColumns: 3 } and 4 tiers
  const container = mount.querySelector(".pumper-qb-tiers")!;
  expect(container.className).toContain("pumper-qb-tiers--horizontal");
  expect((container as HTMLElement).style.getPropertyValue("--pumper-qb-cols")).toBe("3");
});
it("clamps columns to the visible tier count", () => {
  // styleOverrides: { layoutVariant: "grid", gridColumns: 4 } but only 2 tiers
  const container = mount.querySelector(".pumper-qb-tiers")!;
  expect((container as HTMLElement).style.getPropertyValue("--pumper-qb-cols")).toBe("2");
});
it("stays a plain vertical column for list / absent layout", () => {
  // styleOverrides: null (or layoutVariant: "list")
  const container = mount.querySelector(".pumper-qb-tiers")!;
  expect(container.className).not.toContain("pumper-qb-tiers--horizontal");
});
```
(Use the file's real fixture shape; only `styleOverrides` + tier count vary. If `styleOverrides` is `null` in the base fixture, set it per-test.)

- [ ] **Step 2: Run, verify FAIL.** Run: `pnpm --filter widget-src test render-qb` — Expected: FAIL.

- [ ] **Step 3: Implement in `render-qb.ts` `renderAll()`.** Replace the tiers-container line with a layout-aware version:
```ts
const qbLayout = qb.styleOverrides?.layoutVariant;
const qbCols = Math.min(qb.styleOverrides?.gridColumns ?? 3, visibleTiers.length || 1);
const tiersClass = qbLayout === "grid" ? "pumper-qb-tiers pumper-qb-tiers--horizontal" : "pumper-qb-tiers";
const tiersStyle = qbLayout === "grid" ? ` style="--pumper-qb-cols:${qbCols}"` : "";
// ...in the template string:
//   <div class="${tiersClass}"${tiersStyle}>${renderRows()}</div>
```
Compute `qbLayout`/`qbCols`/`tiersClass`/`tiersStyle` just before the `mount.innerHTML = ...` template and interpolate them into the tiers `<div>`. Use the existing `visibleTiers` variable for the clamp (it's in scope in `renderQb`; if the container is built where `visibleTiers` isn't visible, compute the count from `qb.tiers.filter((t) => t.enabled !== false).length`).

- [ ] **Step 4: Add CSS.** In `extensions/theme-app-extension/assets/widget.css`, after the `.pumper-qb-tiers { ... }` rule add:
```css
.pumper-qb-tiers--horizontal { display: grid; grid-template-columns: repeat(var(--pumper-qb-cols, 3), 1fr); }
@media (max-width: 480px) { .pumper-qb-tiers--horizontal { grid-template-columns: 1fr 1fr; } }
```

- [ ] **Step 5: Run, verify PASS + build.** Run: `pnpm --filter widget-src test render-qb && pnpm --filter widget-src typecheck && pnpm --filter widget-src build` — Expected: pass, clean, build success (copies widget.js/css to extensions + admin/public).

- [ ] **Step 6: Commit (incl. rebuilt assets).**
```bash
git add apps/widget-src/src/render-qb.ts apps/widget-src/src/render-qb.test.ts extensions/theme-app-extension/assets apps/admin/public
git commit -m "feat(widget): horizontal (grid) QB tier layout"
```

---

## Task 2: Relabel the admin layout picker Vertical/Horizontal

**Files:**
- Modify: `apps/admin/app/components/LayoutPresetPicker.tsx`

- [ ] **Step 1: Relabel the presets.** In `LayoutPresetPicker.tsx`, change the `PRESETS` labels (keep the `value`s `list`/`grid`):
```ts
// { value: "list", label: "Vertical", thumb: ... }
// { value: "grid", label: "Horizontal", thumb: ... }
```
Edit the two `label:` strings only — leave the `value`s and `thumb`s as they are.

- [ ] **Step 2: (Optional) relabel the columns caption.** In `apps/admin/app/components/SimpleQbStylePanel.tsx`, the `gridColumns` `TextField` currently labeled "Items per row" may keep its label or change to "Columns" — leave as-is to minimize change (not required).

- [ ] **Step 3: Typecheck + tests.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, green.

- [ ] **Step 4: Commit.**
```bash
git add apps/admin/app/components/LayoutPresetPicker.tsx
git commit -m "feat(admin): relabel QB layout picker Vertical/Horizontal"
```

---

## Task 3: Full verification + deploy

- [ ] **Step 1: Widget.** Run: `pnpm --filter widget-src typecheck && pnpm --filter widget-src test && pnpm --filter widget-src build` — Expected: clean, green, build success.
- [ ] **Step 2: Admin.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, green.
- [ ] **Step 3: Manual.** In a QB editor → Color & style, pick **Horizontal** → the live preview shows tiers side-by-side; change "Items per row" → column count updates; on a narrow window the grid drops to 2 columns; pick **Vertical** → stacked again.
- [ ] **Step 4: Deploy (when approved).** Admin: `pnpm --filter admin build && cd apps/admin && pnpm run deploy`. Widget (render-qb + css changed): `pnpm shopify app deploy --force` from repo root.

---

## Self-review notes
- **Spec coverage:** widget horizontal class + cols var + clamp (T1), CSS grid + mobile breakpoint (T1 step 4), admin relabel (T2), verify+deploy (T3). All spec sections covered.
- **No schema change** — reuses `layoutVariant`/`gridColumns`; widget + admin only.
- **Type consistency:** class name `pumper-qb-tiers--horizontal` and CSS var `--pumper-qb-cols` identical in render-qb (T1 step 3) and CSS (T1 step 4) and the test (T1 step 1); values stay `list`/`grid` in the picker (T2).
- **Ships widget:** T3 step 4 runs `shopify app deploy` (render-qb + css changed).
