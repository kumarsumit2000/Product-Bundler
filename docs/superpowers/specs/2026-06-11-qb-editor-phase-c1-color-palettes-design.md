# QB Editor Redesign — Phase C1: Color Palette presets

**Date:** 2026-06-11
**Status:** Approved design, ready for implementation planning
**Part of:** the QB editor redesign. Phases A (shell), B1–B4 (tier editor) shipped. This is **C1**, the first of Phase C (Color & Style). Remaining: C2 (Vertical/Horizontal layout), C3 (visual color-mapping customizer).

## Context

The Pumper reference shows a row of one-click **Color Palette** swatches that recolor the whole widget. Our styling already supports this: the QB form (`SimpleQbStylePanel` / `StylePanel`) holds a `StylePanelValues` object of absolute hex color strings (`primaryColor`, `cardsBg`, `tierBg`, `selectedBg`, `borderColor`, `blockTitleColor`, `titleColor`, `subtitleColor`, `priceColor`, `labelBg`, `labelText`, `badgeBg`, `badgeText`, …), which serialize into `StyleOverrides` and are honored by the widget. There is no palette concept yet — only individual color pickers.

## Goal

Add a row of ~12 one-click color palettes in the Color & Style panel that set a coordinated set of `StyleOverrides` colors. No widget change, no schema change.

## Decisions (approved)
- Each palette is derived from a single **accent** color via a `mixHex` tint helper (DRY, consistent), not hand-authored per-field.
- Applying a palette **overwrites the coordinated color fields**; the existing individual pickers remain for fine-tuning.
- No stored "selected palette" id — the active palette is highlighted by matching `values.primaryColor === accent`.

## Components

### 1. `apps/admin/app/lib/qb-palettes.ts` (new, pure, fully unit-tested)
- `mixHex(hex: string, pct: number): string` — mix `hex` toward white by `pct` (0–100); returns a `#rrggbb` string. (`pct=0` → the color, `pct=100` → white.) Parse 3- or 6-digit hex defensively; clamp.
- `QB_PALETTES: { id: string; name: string; accent: string }[]` — ~12 accents matching the reference swatch row: e.g. `noir #1a1a1a`, `forest #2f7d4f`, `teal #0d9488`, `navy #1e3a8a`, `blue #2563eb`, `periwinkle #6366f1`, `purple #7c3aed`, `magenta #be185d`, `crimson #b91c1c`, `orange #ea580c`, `cocoa #7c4a2d`, `sand #b08968`. (Exact set may be tuned; ~12 distinct accents.)
- `applyPalette(accent: string): Partial<StylePanelValues>` — returns the coordinated color fields:
  - `primaryColor = accent`
  - `cardsBg = "#ffffff"`, `selectedBg = "#ffffff"`
  - `tierBg = mixHex(accent, 90)` (light accent fill)
  - `borderColor = mixHex(accent, 70)`
  - `blockTitleColor = "#1a1a1a"`, `titleColor = "#1a1a1a"`, `priceColor = "#1a1a1a"`
  - `subtitleColor = "#6b7280"`
  - `labelBg = mixHex(accent, 82)`, `labelText = accent`
  - `badgeBg = mixHex(accent, 82)`, `badgeText = accent`
  - (Use the exact `StylePanelValues` field names; only color fields — do not touch layout/font/size fields.)

### 2. `SimpleQbStylePanel.tsx` — "Color Palettes" swatch row
Above the individual `ColorSwatchPicker`s, render a labeled "Color Palettes" row of duotone swatch buttons (one per `QB_PALETTES` entry). Each button shows the accent and its light tint (`mixHex(accent, 90)`) as a split/duotone circle. `onClick` calls the panel's existing `onChange(applyPalette(accent))` so the coordinated colors merge into the style form (the live preview re-renders immediately). Highlight the active swatch when `values.primaryColor === accent` (a ring/border). The component receives `values` (it already does) to read `primaryColor` for the highlight.

## Data / widget
No schema change, no migration, no widget change. Palettes set existing `StylePanelValues` → `StyleOverrides` color fields the widget already renders.

## Error handling / edge cases
- `mixHex` on a malformed hex → fall back to returning the input (never throw); the palette accents are all valid 6-digit hex.
- Applying a palette overwrites only the listed color fields; layout/radius/spacing/font fields are untouched.
- A merchant's later individual-picker edit drops the "active palette" highlight (because `primaryColor` no longer matches) — expected.

## Testing
- **Admin (TDD):** `mixHex` (`mixHex("#000000", 50) === "#808080"`; `mixHex("#ffffff", 50) === "#ffffff"`; `mixHex("#7b1e2a", 100) === "#ffffff"`; `mixHex("#7b1e2a", 0) === "#7b1e2a"`); `applyPalette("#2563eb")` returns `primaryColor: "#2563eb"`, `cardsBg: "#ffffff"`, `tierBg: mixHex("#2563eb",90)`, `labelText: "#2563eb"`, and does NOT include any layout/font key.
- **Regression:** existing 241 admin tests stay green; admin typecheck + build clean. (Widget unchanged → no widget test.)
- **Manual:** open Color & Style, click a palette → the whole live preview recolors coherently; click a different one → recolors; fine-tune one picker → the active-palette ring clears.

## Out of scope
Vertical/Horizontal template layout (C2); the visual color-mapping diagram + font `Aa` controls (C3); dark-card-background palettes (all palettes keep a white card with tinted tiers); persisting which palette is selected.
