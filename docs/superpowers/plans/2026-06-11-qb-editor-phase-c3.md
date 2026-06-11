# QB Editor Redesign — Phase C3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the QB editor the full "Customize" panel (all element colors + per-text-element font size/weight) by extracting the existing grouped color+font UI into a shared `StyleSections` component and rendering it in the QB style panel.

**Architecture:** Extract the "Colors" + "Typography" blocks (and their `colorGroup`/`typographyRow` helpers) from `StylePanel` into a presentational `StyleSections` component. `StylePanel` uses it (behavior-identical → bundles unaffected). `SimpleQbStylePanel` renders it below its C1 palette row + C2 layout picker. No schema/widget change — the fields, serialization, and widget CSS vars already exist.

**Tech Stack:** Remix + Polaris, vitest. No new deps, no schema/widget change.

**Spec:** `docs/superpowers/specs/2026-06-11-qb-editor-phase-c3-customize-panel-design.md`

**Commands:** admin `pnpm --filter admin typecheck` / `test` / `build`.

**Key facts (from `apps/admin/app/components/StylePanel.tsx`):**
- `StylePanelValues` carries all color + font fields. `StylePanel({ values, onChange })` where `onChange: (next: StylePanelValues) => void`.
- Helpers: `colorGroup(title, fields)` (lines 94–111), `typographyRow(title, sizeKey, styleKey)` (lines 113–143), both closing over a local `set(k, v) = onChange({ ...values, [k]: v })` (lines 91–92). `FONT_STYLE_OPTIONS` is a module constant in StylePanel.tsx.
- The "Colors" block = `<BlockStack gap="300"><Text as="h3">Colors</Text>{colorGroup("General",[...])}…{colorGroup("Upsell",[...])}</BlockStack>` (lines 239–273). The "Typography" block = `<BlockStack gap="300"><Text as="h3">Typography</Text><div style=grid>{typographyRow(...)×7}</div></BlockStack>` (lines 275–286).
- `SimpleQbStylePanel({ values, onChange })` where `onChange: (patch: Partial<StylePanelValues>) => void`. It currently renders the C1 palette row, the `LayoutPresetPicker`, "Items per row", ~10 inline `ColorSwatchPicker`s, and radius/spacing fields.

---

## Task 1: Extract `StyleSections` + refactor `StylePanel`

**Files:**
- Create: `apps/admin/app/components/StyleSections.tsx`
- Modify: `apps/admin/app/components/StylePanel.tsx`

- [ ] **Step 1: Create `StyleSections.tsx`.** A presentational component that renders the Colors + Typography blocks. Copy the helpers + the two blocks verbatim from `StylePanel`:
```tsx
import { BlockStack, InlineStack, Text, TextField, Select } from "@shopify/polaris";
import { ColorSwatchPicker } from "./ColorSwatchPicker";
import type { StylePanelValues } from "./StylePanel";

const FONT_STYLE_OPTIONS = [
  { label: "Regular", value: "regular" },
  { label: "Medium", value: "medium" },
  { label: "Semibold", value: "semibold" },
  { label: "Bold", value: "bold" },
];

type Props = {
  values: StylePanelValues;
  onChange: (next: StylePanelValues) => void;
};

export function StyleSections({ values, onChange }: Props) {
  const set = <K extends keyof StylePanelValues>(k: K, v: StylePanelValues[K]) =>
    onChange({ ...values, [k]: v });

  const colorGroup = (title: string, fields: Array<{ key: keyof StylePanelValues; label: string }>) => (
    <BlockStack gap="200">
      <Text as="h4" variant="headingSm">{title}</Text>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
        {fields.map((f) => (
          <ColorSwatchPicker key={f.key as string} label={f.label} value={values[f.key] as string} onChange={(v) => set(f.key, v as never)} />
        ))}
      </div>
    </BlockStack>
  );

  const typographyRow = (title: string, sizeKey: keyof StylePanelValues, styleKey: keyof StylePanelValues) => (
    <BlockStack gap="100">
      <Text as="h4" variant="headingSm">{title}</Text>
      <InlineStack gap="300">
        <div style={{ flex: 1 }}>
          <TextField label="Font size" type="number" min={10} max={48} value={values[sizeKey] as string} onChange={(v) => set(sizeKey, v as never)} suffix="px" autoComplete="off" />
        </div>
        <div style={{ flex: 1 }}>
          <Select label="Font style" options={FONT_STYLE_OPTIONS} value={values[styleKey] as string} onChange={(v) => set(styleKey, v as never)} />
        </div>
      </InlineStack>
    </BlockStack>
  );

  return (
    <>
      <BlockStack gap="300">
        <Text as="h3" variant="headingMd">Colors</Text>
        {colorGroup("General", [
          { key: "cardsBg", label: "Cards bg" },
          { key: "selectedBg", label: "Selected bg" },
          { key: "borderColor", label: "Border color" },
          { key: "blockTitleColor", label: "Block title" },
        ])}
        {colorGroup("Bar texts", [
          { key: "titleColor", label: "Title" },
          { key: "subtitleColor", label: "Subtitle" },
          { key: "priceColor", label: "Price" },
          { key: "fullPriceColor", label: "Full price" },
        ])}
        {colorGroup("Label", [
          { key: "labelBg", label: "Background" },
          { key: "labelText", label: "Text" },
        ])}
        {colorGroup("Badge", [
          { key: "badgeBg", label: "Background" },
          { key: "badgeText", label: "Text" },
        ])}
        {colorGroup("Free gift", [
          { key: "freeGiftBg", label: "Background" },
          { key: "freeGiftText", label: "Text" },
          { key: "freeGiftSelectedBg", label: "Selected bg" },
          { key: "freeGiftSelectedText", label: "Selected text" },
        ])}
        {colorGroup("Upsell", [
          { key: "upsellBg", label: "Background" },
          { key: "upsellText", label: "Text" },
          { key: "upsellSelectedBg", label: "Selected bg" },
          { key: "upsellSelectedText", label: "Selected text" },
        ])}
      </BlockStack>
      <BlockStack gap="300">
        <Text as="h3" variant="headingMd">Typography</Text>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {typographyRow("Block title", "blockTitleFontSize", "blockTitleFontStyle")}
          {typographyRow("Title", "titleFontSize", "titleFontStyle")}
          {typographyRow("Subtitle", "subtitleFontSize", "subtitleFontStyle")}
          {typographyRow("Label", "labelFontSize", "labelFontStyle")}
          {typographyRow("Free gift", "freeGiftFontSize", "freeGiftFontStyle")}
          {typographyRow("Upsell", "upsellFontSize", "upsellFontStyle")}
          {typographyRow("Unit label", "unitLabelFontSize", "unitLabelFontStyle")}
        </div>
      </BlockStack>
    </>
  );
}
```
IMPORTANT: READ `StylePanel.tsx` first and copy the EXACT `colorGroup`/`typographyRow` field lists + `FONT_STYLE_OPTIONS` values (the above mirrors lines 94–143 + 239–286; if any label/key differs in the real file, use the real one). If `FONT_STYLE_OPTIONS` is exported from StylePanel, import it instead of redefining.

- [ ] **Step 2: Refactor `StylePanel.tsx` to use it.** Add `import { StyleSections } from "./StyleSections";`. Replace the inline "Colors" `BlockStack` (lines ~239–273) AND the "Typography" `BlockStack` (lines ~275–286) with a single `<StyleSections values={values} onChange={onChange} />`. Then delete the now-unused `colorGroup` and `typographyRow` local helpers (lines ~94–143) and the `FONT_STYLE_OPTIONS` constant IF it's no longer referenced in StylePanel (keep it if StylePanel still uses it elsewhere). Leave the accordion shell, `LayoutPresetPicker`, "Items per row", and radius/spacing sliders untouched.

- [ ] **Step 3: Typecheck + tests.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, all 246 green (StylePanel renders the identical field set; the refactor is structural).

- [ ] **Step 4: Commit.**
```bash
git add apps/admin/app/components/StyleSections.tsx apps/admin/app/components/StylePanel.tsx
git commit -m "refactor(admin): extract StyleSections (colors + typography) from StylePanel"
```

---

## Task 2: Render `StyleSections` in `SimpleQbStylePanel`

**Files:**
- Modify: `apps/admin/app/components/SimpleQbStylePanel.tsx`

- [ ] **Step 1: Read the file.** Identify (a) the C1 palette swatch row, (b) the `LayoutPresetPicker` + "Items per row", (c) the ~10 inline `ColorSwatchPicker`s (General/Bar-texts/Label/Badge subset), (d) the radius/spacing fields.

- [ ] **Step 2: Add the import.** `import { StyleSections } from "./StyleSections";`.

- [ ] **Step 3: Remove the duplicate inline color pickers.** Delete the ~10 inline `ColorSwatchPicker`s (the General/Bar-texts/Label/Badge/savings-badge subset) — `StyleSections` renders the complete grouped set, so these would be duplicates. KEEP: the palette swatch row, the `LayoutPresetPicker`, "Items per row", and the radius/spacing fields. (If `ColorSwatchPicker` becomes unused after removal, drop its import.)

- [ ] **Step 4: Render `StyleSections`.** Below the layout + radius/spacing controls (inside the panel's top-level `BlockStack`), add:
```tsx
<StyleSections values={values} onChange={onChange} />
```
`SimpleQbStylePanel`'s `onChange` is `(patch: Partial<StylePanelValues>) => void`; a full-object call is a valid partial, so passing `onChange` directly typechecks (param contravariance). If TS objects, wrap: `onChange={(next) => onChange(next)}`.

- [ ] **Step 5: Typecheck + tests.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, green.

- [ ] **Step 6: Commit.**
```bash
git add apps/admin/app/components/SimpleQbStylePanel.tsx
git commit -m "feat(qb): full Customize panel (grouped colors + font controls) in QB editor"
```

---

## Task 3: Full verification + deploy

- [ ] **Step 1: Admin.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, 246 green.
- [ ] **Step 2: Build.** Run: `pnpm --filter admin build` — Expected: success.
- [ ] **Step 3: Manual.** In a QB editor → Color & style: the panel now shows the palette row, Vertical/Horizontal, radius/spacing, the full grouped colors (General/Bar texts/Label/Badge/Free gift/Upsell), and per-element font size+weight. Change the Title font size/weight and a Free-gift color → the live preview updates. Open a bundle's Style panel → renders identically to before (no regression).
- [ ] **Step 4: Deploy (when approved).** Admin-only change — no widget/function change. `pnpm --filter admin build && cd apps/admin && pnpm run deploy`. (No `shopify app deploy` needed.)

---

## Self-review notes
- **Spec coverage:** extract `StyleSections` + refactor `StylePanel` (T1), render in `SimpleQbStylePanel` + remove duplicate pickers (T2), verify+deploy (T3). All spec sections covered.
- **No schema/widget change** — admin-only; T3 deploys Pages only. Fields/serialization/widget vars already exist.
- **Bundles regression-safe:** T1's StylePanel refactor renders the same field set via `StyleSections`; the 246-test suite + typecheck guard it.
- **Type consistency:** `StyleSections` props `{ values: StylePanelValues; onChange: (next: StylePanelValues) => void }` consistent T1↔T2; field keys copied verbatim from StylePanel; `onChange` partial/full nuance addressed in T2 step 4.
- **No duplicate fields:** T2 step 3 removes the slim panel's inline pickers so the grouped set isn't doubled.
