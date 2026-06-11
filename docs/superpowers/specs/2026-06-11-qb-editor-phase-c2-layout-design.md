# QB Editor Redesign — Phase C2: Vertical / Horizontal template layout

**Date:** 2026-06-11
**Status:** Approved design, ready for implementation planning
**Part of:** the QB editor redesign. Phases A, B1–B4, C1 shipped. This is **C2**, the second of Phase C. Remaining: C3 (visual color-mapping customizer).

## Context

The Pumper reference offers a **Vertical / Horizontal** template-layout choice. Our schema already has `LayoutVariant = "list" | "grid"` and a `LayoutPresetPicker`, but the **QB widget ignores it** — `render-qb.ts` always wraps tiers in `<div class="pumper-qb-tiers">` (CSS `flex-direction: column`, i.e. vertical). `widget.ts` applies styleOverrides as CSS vars on the mount but does not apply the layout. The QB `styleOverrides` carry `layoutVariant` + `gridColumns`, and `borderRadius` (corner roundness) + `spacing` (breathing space) sliders already exist in `SimpleQbStylePanel`.

## Goal

Make the QB widget render a **Horizontal** (side-by-side) layout when chosen, and relabel the admin picker to Vertical/Horizontal. No schema change, no migration.

## Decisions (approved)
- **Reuse the existing enum, relabeled:** **Vertical = `list`**, **Horizontal = `grid`**.
- **Horizontal = a grid** with the existing **"Items per row"** (`gridColumns`) column count.

## Components

### 1. Widget — `apps/widget-src/src/render-qb.ts` + `extensions/theme-app-extension/assets/widget.css`
- In `render-qb.ts`, where the tiers container is built (`<div class="pumper-qb-tiers">${renderRows()}</div>`), add a modifier class + a CSS var when horizontal:
  - `const layout = qb.styleOverrides?.layoutVariant; const cols = Math.min(qb.styleOverrides?.gridColumns ?? 3, visibleTiers.length || 1);`
  - container = `<div class="pumper-qb-tiers${layout === "grid" ? " pumper-qb-tiers--horizontal" : ""}"${layout === "grid" ? ` style="--pumper-qb-cols:${cols}"` : ""}>`
  (Use the actual visible-tier count variable already in scope from B1, e.g. `visibleTiers`.)
- **CSS** (in `widget.css`, near the existing `.pumper-qb-tiers` rule):
  ```css
  .pumper-qb-tiers--horizontal { display: grid; grid-template-columns: repeat(var(--pumper-qb-cols, 3), 1fr); }
  @media (max-width: 480px) { .pumper-qb-tiers--horizontal { grid-template-columns: 1fr 1fr; } }
  ```
  The existing `.pumper-qb-tier` (flex column internally) renders fine inside a grid cell. The purchase-options block, CTA, and sticky bar remain full-width below the grid (they are siblings of `.pumper-qb-tiers`, unaffected).

### 2. Admin — `apps/admin/app/components/LayoutPresetPicker.tsx`
Relabel the two presets: `list` → **"Vertical"**, `grid` → **"Horizontal"** (keep the underlying values `list`/`grid`). Keep the existing mini-mockup thumbnails (stacked rows for Vertical, columns for Horizontal). The "Items per row" field (`gridColumns`) in `SimpleQbStylePanel` already renders when `layoutVariant === "grid"` — leave it (optionally relabel its caption to "Columns"). Corner-roundness + breathing-space sliders are unchanged.

## Data / preview
No schema change, no migration. `layoutVariant` + `gridColumns` already flow form → `styleOverrides` → storefront-config / preview → widget, so toggling Horizontal re-renders side-by-side immediately in the live preview.

## Error handling / edge cases
- `gridColumns` absent → default 3; clamped to the visible-tier count so a 2-tier QB never shows 3 empty columns.
- `layoutVariant` absent or `"list"` → plain vertical column (no modifier class), identical to today.
- Very narrow PDP / mobile → the breakpoint drops Horizontal to 2 columns to avoid cramping.
- A grid cell tier with a long title wraps within its cell (existing `.pumper-qb-tier-meta` flex handles it).

## Testing
- **Widget (TDD):** `render-qb` adds `pumper-qb-tiers--horizontal` and sets `--pumper-qb-cols` when `styleOverrides.layoutVariant === "grid"` (assert the container class + inline style); a `"list"` / absent layout renders `.pumper-qb-tiers` WITHOUT the modifier. Column count clamps to tier count (e.g. gridColumns 4 with 2 tiers → `--pumper-qb-cols:2`).
- **Regression:** existing widget (116) + admin (246) tests stay green; typechecks + builds clean.
- **Manual:** in the editor pick **Horizontal** → the live preview shows tiers in a row; change "Items per row" → the column count updates; pick **Vertical** → back to stacked.

## Out of scope
The richer two-card "Recommended" layout-selector visual (the existing thumbnails suffice); the visual color-mapping diagram + font controls (C3).
