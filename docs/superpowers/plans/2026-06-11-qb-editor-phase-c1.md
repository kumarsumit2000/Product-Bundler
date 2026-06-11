# QB Editor Redesign — Phase C1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a row of ~12 one-click color-palette swatches to the QB Color & Style panel that recolor the whole widget via a coordinated set of `StyleOverrides` fields.

**Architecture:** A pure `qb-palettes.ts` module (a `mixHex` tint helper + 12 accent palettes + `applyPalette(accent)` returning coordinated `StylePanelValues` color fields) drives a duotone swatch row in `SimpleQbStylePanel`. No schema change, no widget change.

**Tech Stack:** Remix + Polaris, vitest. No new deps.

**Spec:** `docs/superpowers/specs/2026-06-11-qb-editor-phase-c1-color-palettes-design.md`

**Commands:** admin `pnpm --filter admin test <pat>` / `typecheck` / `build`.

**Key facts:**
- `StylePanelValues` (in `apps/admin/app/components/StylePanel.tsx`) has hex-string fields: `primaryColor`, `cardsBg`, `tierBg`, `selectedBg`, `borderColor`, `blockTitleColor`, `titleColor`, `subtitleColor`, `priceColor`, `labelBg`, `labelText`, `badgeBg`, `badgeText` (among others).
- `SimpleQbStylePanel({ values, onChange })` — `onChange(patch: Partial<StylePanelValues>)`. So `onChange(applyPalette(accent))` merges colors into the form; the live preview re-renders automatically.

---

## Task 1: `qb-palettes.ts` — mixHex + palettes + applyPalette (TDD)

**Files:**
- Create: `apps/admin/app/lib/qb-palettes.ts`
- Test: `apps/admin/test/qb-palettes.test.ts`

- [ ] **Step 1: Write the failing test** `apps/admin/test/qb-palettes.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mixHex, applyPalette, QB_PALETTES } from "../app/lib/qb-palettes";

describe("mixHex", () => {
  it("mixes toward white by pct", () => {
    expect(mixHex("#000000", 50)).toBe("#808080");
    expect(mixHex("#000000", 0)).toBe("#000000");
    expect(mixHex("#7b1e2a", 100)).toBe("#ffffff");
    expect(mixHex("#ffffff", 50)).toBe("#ffffff");
  });
  it("returns the input on malformed hex", () => {
    expect(mixHex("nope", 50)).toBe("nope");
  });
});

describe("applyPalette", () => {
  it("returns coordinated color fields with the accent as primary", () => {
    const p = applyPalette("#2563eb");
    expect(p.primaryColor).toBe("#2563eb");
    expect(p.cardsBg).toBe("#ffffff");
    expect(p.selectedBg).toBe("#ffffff");
    expect(p.tierBg).toBe(mixHex("#2563eb", 90));
    expect(p.borderColor).toBe(mixHex("#2563eb", 70));
    expect(p.labelText).toBe("#2563eb");
    expect(p.labelBg).toBe(mixHex("#2563eb", 82));
    expect(p.subtitleColor).toBe("#6b7280");
  });
  it("does not include layout/font keys", () => {
    const p = applyPalette("#2563eb") as Record<string, unknown>;
    expect(p.layoutVariant).toBeUndefined();
    expect(p.gridColumns).toBeUndefined();
    expect(p.borderRadius).toBeUndefined();
  });
});

describe("QB_PALETTES", () => {
  it("has ~12 distinct valid accents", () => {
    expect(QB_PALETTES.length).toBeGreaterThanOrEqual(10);
    for (const p of QB_PALETTES) expect(p.accent).toMatch(/^#[0-9a-f]{6}$/i);
    expect(new Set(QB_PALETTES.map((p) => p.accent)).size).toBe(QB_PALETTES.length);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** Run: `pnpm --filter admin test qb-palettes` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `apps/admin/app/lib/qb-palettes.ts`:
```ts
import type { StylePanelValues } from "../components/StylePanel";

// Mix a #rrggbb (or #rgb) color toward white by `pct` (0–100). Returns #rrggbb.
// On malformed input, returns the input unchanged (never throws).
export function mixHex(hex: string, pct: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  let h = m[1]!;
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const t = Math.max(0, Math.min(100, pct)) / 100;
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  const to2 = (n: number) => n.toString(16).padStart(2, "0");
  return `#${to2(mix(r))}${to2(mix(g))}${to2(mix(b))}`;
}

export type QbPalette = { id: string; name: string; accent: string };

export const QB_PALETTES: QbPalette[] = [
  { id: "noir", name: "Noir", accent: "#1a1a1a" },
  { id: "forest", name: "Forest", accent: "#2f7d4f" },
  { id: "teal", name: "Teal", accent: "#0d9488" },
  { id: "navy", name: "Navy", accent: "#1e3a8a" },
  { id: "blue", name: "Blue", accent: "#2563eb" },
  { id: "periwinkle", name: "Periwinkle", accent: "#6366f1" },
  { id: "purple", name: "Purple", accent: "#7c3aed" },
  { id: "magenta", name: "Magenta", accent: "#be185d" },
  { id: "crimson", name: "Crimson", accent: "#b91c1c" },
  { id: "orange", name: "Orange", accent: "#ea580c" },
  { id: "cocoa", name: "Cocoa", accent: "#7c4a2d" },
  { id: "sand", name: "Sand", accent: "#b08968" },
];

// Coordinated color scheme derived from one accent. Only color fields — leaves
// layout / radius / spacing / font fields untouched.
export function applyPalette(accent: string): Partial<StylePanelValues> {
  return {
    primaryColor: accent,
    cardsBg: "#ffffff",
    selectedBg: "#ffffff",
    tierBg: mixHex(accent, 90),
    borderColor: mixHex(accent, 70),
    blockTitleColor: "#1a1a1a",
    titleColor: "#1a1a1a",
    priceColor: "#1a1a1a",
    subtitleColor: "#6b7280",
    labelBg: mixHex(accent, 82),
    labelText: accent,
    badgeBg: mixHex(accent, 82),
    badgeText: accent,
  };
}
```
(If `StylePanelValues` does not contain one of these exact keys, READ `StylePanel.tsx` and drop/rename that key to match — do not invent keys.)

- [ ] **Step 4: Run, verify PASS.** Run: `pnpm --filter admin test qb-palettes && pnpm --filter admin typecheck` — Expected: pass, clean.

- [ ] **Step 5: Commit.**
```bash
git add apps/admin/app/lib/qb-palettes.ts apps/admin/test/qb-palettes.test.ts
git commit -m "feat(qb): color-palette presets — mixHex + applyPalette helpers"
```

---

## Task 2: Color Palettes swatch row in `SimpleQbStylePanel`

**Files:**
- Modify: `apps/admin/app/components/SimpleQbStylePanel.tsx`

- [ ] **Step 1: Import the palettes.** Add `import { QB_PALETTES, applyPalette, mixHex } from "~/lib/qb-palettes";` to `SimpleQbStylePanel.tsx`.

- [ ] **Step 2: Render the swatch row.** Near the top of the panel (after the "Appearance" heading, before the `LayoutPresetPicker`), add a labeled "Color Palettes" row of duotone swatch buttons:
```tsx
<BlockStack gap="100">
  <Text as="span" variant="bodySm" tone="subdued">Color palettes</Text>
  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
    {QB_PALETTES.map((p) => {
      const active = values.primaryColor === p.accent;
      return (
        <button
          key={p.id}
          type="button"
          aria-label={p.name}
          title={p.name}
          onClick={() => onChange(applyPalette(p.accent))}
          style={{
            width: 30, height: 30, borderRadius: 999, cursor: "pointer", padding: 0,
            border: active ? "2px solid #1a1a1a" : "2px solid #e5e7eb",
            boxShadow: active ? "0 0 0 2px #fff inset" : undefined,
            background: `linear-gradient(135deg, ${p.accent} 0 50%, ${mixHex(p.accent, 88)} 50% 100%)`,
          }}
        />
      );
    })}
  </div>
</BlockStack>
```

- [ ] **Step 3: Typecheck + tests.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, all green (no test asserts the panel's structure).

- [ ] **Step 4: Commit.**
```bash
git add apps/admin/app/components/SimpleQbStylePanel.tsx
git commit -m "feat(qb): Color Palettes swatch row in the Appearance panel"
```

---

## Task 3: Full verification + deploy

- [ ] **Step 1: Admin.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, green (241 + new palette tests).
- [ ] **Step 2: Build.** Run: `pnpm --filter admin build` — Expected: success.
- [ ] **Step 3: Manual.** In a QB editor → Color & style: click a palette → the live preview recolors coherently (tier bg light-tinted, accent on the selected border/button/badge); click another → recolors; edit one color picker → the active-palette ring clears.
- [ ] **Step 4: Deploy (when approved).** Admin-only change — no widget/function change. `pnpm --filter admin build && cd apps/admin && pnpm run deploy`. (No `shopify app deploy` needed.)

---

## Self-review notes
- **Spec coverage:** `mixHex` + `QB_PALETTES` + `applyPalette` (T1), swatch row with active highlight (T2), verify+deploy (T3). All spec sections covered.
- **No widget/schema change** — admin-only; T3 deploys Pages only.
- **Field-name safety:** T1 note says to drop/rename any key not present in the real `StylePanelValues` (the listed keys were confirmed present: primaryColor/cardsBg/tierBg/selectedBg/borderColor/blockTitleColor/titleColor/subtitleColor/priceColor/labelBg/labelText/badgeBg/badgeText).
- **Type consistency:** `mixHex`/`applyPalette`/`QB_PALETTES` names consistent T1↔T2; `applyPalette` returns `Partial<StylePanelValues>`, matching `onChange`'s parameter.
