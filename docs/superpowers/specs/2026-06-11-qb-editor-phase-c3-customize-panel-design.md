# QB Editor Redesign — Phase C3: Full "Customize" panel (grouped colors + font controls)

**Date:** 2026-06-11
**Status:** Approved design, ready for implementation planning
**Part of:** the QB editor redesign. Phases A, B1–B4, C1 (palettes), C2 (layout) shipped. This is **C3**, the last of Phase C. After this: Phase D (Advanced Settings).

## Context

The full styling pipeline already exists end-to-end:
- `StylePanelValues` / `QbFormValues` already carry **all** color + font fields (`blockTitleFontSize`, `titleFontStyle`, `freeGiftSelectedBg`, `upsellSelectedText`, … — confirmed in `StylePanel.tsx` and `QbForm.tsx`, where `QbFormValues = StylePanelValues & {...}`).
- `buildStyleOverrides` (`preview-overrides.ts`) serializes every font field; `widget.ts` applies every font CSS var (`--pumper-title-fs/fw`, `--pumper-savings-fs`, …) and color var. So the widget already honors these.
- The full `StylePanel` (`apps/admin/app/components/StylePanel.tsx`) renders the complete UI: 6 grouped color sections (General / Bar texts / Label / Badge / Free gift / Upsell) + a Typography section of 7 per-element font rows (size + weight). Its internal helpers are `colorGroup(title, fields)` (lines 94–111) and `typographyRow(title, sizeKey, styleKey)` (lines 113–143); the rendered "Colors" + "Typography" blocks are lines 239–286.

**The only gap:** the QB form renders the slim `SimpleQbStylePanel` (only ~10 colors, no font controls), so QB merchants can't reach most colors or any font control. C1 (palette row) and C2 (Vertical/Horizontal picker) added their controls to `SimpleQbStylePanel`.

## Goal

Give the QB editor the full Pumper-style "Customize" capability — every element color (incl. selected / free-gift / upsell states) + per-text-element font size & weight — by reusing the existing pipeline. No schema change, no widget change.

## Decisions (approved)
- Deliver the **full grouped Customize panel** (all colors + font Aa controls), NOT a literal click-the-mockup canvas (eye-candy over the same fields; the labeled grouped panel delivers identical capability with far less risk).
- Reuse the existing `StylePanelValues` fields + serialization + widget vars — no new data.

## Components

### 1. `apps/admin/app/components/StyleSections.tsx` (new, extracted, presentational)
Props `{ values: StylePanelValues; onChange: (next: StylePanelValues) => void }`. Internals copied verbatim from `StylePanel`:
- a local `set(k, v) = onChange({ ...values, [k]: v })`,
- the `colorGroup(title, fields)` helper,
- the `typographyRow(title, sizeKey, styleKey)` helper (uses `FONT_STYLE_OPTIONS`),
- renders the **"Colors"** `BlockStack` (the 6 `colorGroup(...)` calls — General/Bar texts/Label/Badge/Free gift/Upsell, exactly as lines 241–272) and the **"Typography"** `BlockStack` (the 7 `typographyRow(...)` calls, lines 277–285).
Move the `FONT_STYLE_OPTIONS` constant into (or import it into) this file. Pure presentational; no state.

### 2. `apps/admin/app/components/StylePanel.tsx` — refactor to use `StyleSections`
Replace the inline "Colors" + "Typography" blocks (lines 239–286) and the now-unused `colorGroup`/`typographyRow` helpers with `<StyleSections values={values} onChange={onChange} />`. Keep StylePanel's accordion shell, `LayoutPresetPicker`, Items-per-row, and the radius/spacing sliders unchanged. This is behavior-identical — **bundles (which use StylePanel) are unaffected**.

### 3. `apps/admin/app/components/SimpleQbStylePanel.tsx` — add the full sections
Below the existing content (palette swatch row from C1, the Vertical/Horizontal `LayoutPresetPicker` from C2, "Items per row", and the existing color pickers + radius/spacing), render `<StyleSections values={values} onChange={onChange} />`. To avoid a duplicated, smaller set of color pickers, **remove the slim panel's own ~10 inline `ColorSwatchPicker`s** (the General/Bar-texts/Label/Badge subset) since `StyleSections` now renders the complete grouped set; keep the palette row, layout picker, and radius/spacing. (SimpleQbStylePanel's `onChange` is `(patch: Partial<StylePanelValues>) => void`; pass it to `StyleSections` directly — a full-object call is a valid partial. If TS objects to the signature, wrap: `onChange={(next) => onChange(next)}`.)

## Data / widget
No schema change, no migration, no widget change. `QbFormValues` already carries every field; serialization + widget application already exist. The live preview updates on every color/font edit.

## Error handling / edge cases
- Font size fields are numeric strings ("14"); empty = widget falls back to its CSS default (existing `setVar` skips undefined/empty). Unchanged behavior.
- Removing the slim panel's duplicate color pickers must not drop any field the widget reads — `StyleSections` covers a superset of those keys, so no field becomes unreachable.
- `StylePanel` refactor must keep the exact same rendered fields (regression-checked by the existing admin test suite + typecheck).

## Testing
- **Admin:** a light render test for `StyleSections` (renders the group headings "General"/"Typography" and a known field, e.g. a "Free gift" swatch), OR rely on typecheck + the existing 246 tests since this is presentational reuse. `StylePanel` + `SimpleQbStylePanel` continue to typecheck and render.
- **Regression:** existing 246 admin + 124 widget tests stay green; admin typecheck + build clean. (No widget change → no new widget test.)
- **Manual:** in the QB editor, set the Title font size/weight and the Free-gift / Upsell / Badge colors → the live preview updates; a bundle's Style panel renders identically to before.

## Out of scope
The literal mini-widget-mockup-with-pointer-lines canvas (the grouped labeled panel delivers the same capability); Phase D (Advanced Settings).
