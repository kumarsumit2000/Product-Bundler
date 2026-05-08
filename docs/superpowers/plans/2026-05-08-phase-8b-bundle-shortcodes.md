# Phase 8.B: Bundle Shortcodes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let merchants render bundles, quantity breaks, and mix-and-match bundles on any page (homepage, blog post, page-builder section) by copying a per-entity HTML snippet from the admin and pasting it wherever HTML is allowed.

**Architecture:** Plain HTML data-attribute shortcodes (`<div data-pumper-bundle="<id>"></div>`, `data-pumper-qb`, `data-pumper-mix-match`). Widget JS detects them via `[data-pumper-*]:not([data-pumper-rendered])` selectors alongside the existing `.pumper-mount` PDP path, looks up the entity by id from cached config, and routes to the existing renderer (no new render code). Admin shows the snippet via a new `EmbedCodeCard` component on the bundle/QB edit pages.

**Tech Stack:** TypeScript, vitest (jsdom), tsup for the widget bundle, Polaris v13 + Remix on the admin side.

**Reference docs:**
- Spec: [docs/superpowers/specs/2026-05-08-phase-8b-bundle-shortcodes-design.md](../specs/2026-05-08-phase-8b-bundle-shortcodes-design.md)
- Existing widget init: [apps/widget-src/src/widget.ts](../../../apps/widget-src/src/widget.ts)
- Existing match logic: [apps/widget-src/src/match.ts](../../../apps/widget-src/src/match.ts)
- Existing widget tests: [apps/widget-src/src/widget.test.ts](../../../apps/widget-src/src/widget.test.ts)
- Existing edit route example: [apps/admin/app/routes/app.bundles.$id.tsx](../../../apps/admin/app/routes/app.bundles.$id.tsx)

**Codebase conventions:**
- widget-src uses `vitest` with `environment: "jsdom"` (per-file via `// @vitest-environment jsdom` comment)
- `tsup` build emits IIFE to `extensions/theme-app-extension/assets/widget.js` (and copies to `apps/admin/public/widget.js` for admin preview)
- Run tests from `apps/widget-src/`: `pnpm test`. Run admin tests from `apps/admin/`: `pnpm vitest run`. Build widget: `pnpm build` (in widget-src).
- The `~` alias resolves to `apps/admin/app/`
- Commit straight to `main` (team workflow for this repo)

---

## File Structure

**Created (3):**
| Path | Responsibility |
|---|---|
| `apps/widget-src/src/lookup.ts` | `lookupBundle`, `lookupQb`, `lookupMixMatch` — find entity by id with mode-filter for bundle vs mix-match safety |
| `apps/widget-src/src/lookup.test.ts` | Unit tests for the 3 lookup functions |
| `apps/admin/app/components/EmbedCodeCard.tsx` | Polaris Card with TextField + Copy button. Single prop: `{ snippet: string }` |

**Modified (4):**
| Path | Change |
|---|---|
| `apps/widget-src/src/widget.ts` | Dual-selector dispatch: scan `.pumper-mount` AND 3 shortcode attribute selectors; route to renderShortcode helper |
| `apps/widget-src/src/widget.test.ts` | 5 new tests for the shortcode paths |
| `apps/admin/app/routes/app.bundles.$id.tsx` | Mount `<EmbedCodeCard>` after the existing form section, mode-aware snippet (`data-pumper-bundle` vs `data-pumper-mix-match`) |
| `apps/admin/app/routes/app.quantity-breaks.$id.tsx` | Mount `<EmbedCodeCard>` with `data-pumper-qb` snippet |

---

## Task 1: lookup module + tests

**Files:**
- Create: `apps/widget-src/src/lookup.ts`
- Create: `apps/widget-src/src/lookup.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/widget-src/src/lookup.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { lookupBundle, lookupQb, lookupMixMatch } from "./lookup";
import type { WidgetConfig } from "./types";

const SETTINGS: WidgetConfig["settings"] = {
  primaryColor: "#000", textColor: "#000", backgroundColor: "#fff",
  borderRadius: 8, fontFamily: "inherit",
  bundleHeadline: "x", qbHeadline: "y",
  showCompareAtPrice: true, currency: "USD", locale: "en",
};

const CONFIG: WidgetConfig = {
  shop: "s.myshopify.com",
  settings: SETTINGS,
  bundles: [
    {
      id: "b1", name: "Classic bundle", mode: "classic",
      products: [], collectionId: null, targetQty: null, collectionProducts: null,
      discountType: "percentage", discountValue: 10, combinable: false,
      triggerProductIds: [], headline: null, ctaLabel: null, styleOverrides: null,
    },
    {
      id: "b2", name: "Mix match bundle", mode: "mix_match",
      products: [], collectionId: "c1", targetQty: 3, collectionProducts: null,
      discountType: "percentage", discountValue: 20, combinable: false,
      triggerProductIds: [], headline: null, ctaLabel: null, styleOverrides: null,
    },
  ],
  quantityBreaks: [
    {
      id: "q1", name: "QB", productId: "gid://shopify/Product/1",
      productTitle: "P1", productImage: null,
      productVariants: [], tiers: [], combinable: false, styleOverrides: null,
    },
  ],
};

describe("lookupBundle", () => {
  it("returns matching classic bundle by id", () => {
    expect(lookupBundle(CONFIG, "b1")?.id).toBe("b1");
  });
  it("returns null when id not found", () => {
    expect(lookupBundle(CONFIG, "nonexistent")).toBeNull();
  });
  it("returns null when found id is mix-match mode (cross-mode safety)", () => {
    expect(lookupBundle(CONFIG, "b2")).toBeNull();
  });
});

describe("lookupQb", () => {
  it("returns matching QB by id", () => {
    expect(lookupQb(CONFIG, "q1")?.id).toBe("q1");
  });
  it("returns null when id not found", () => {
    expect(lookupQb(CONFIG, "nonexistent")).toBeNull();
  });
});

describe("lookupMixMatch", () => {
  it("returns matching mix-match bundle by id", () => {
    expect(lookupMixMatch(CONFIG, "b2")?.id).toBe("b2");
  });
  it("returns null when id not found", () => {
    expect(lookupMixMatch(CONFIG, "nonexistent")).toBeNull();
  });
  it("returns null when found id is classic mode (cross-mode safety)", () => {
    expect(lookupMixMatch(CONFIG, "b1")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/widget-src && pnpm test src/lookup.test.ts`
Expected: FAIL with `Failed to resolve import "./lookup"` (module does not exist).

- [ ] **Step 3: Implement lookup.ts**

Create `apps/widget-src/src/lookup.ts`:
```ts
import type { BundleConfig, QbConfig, WidgetConfig } from "./types";

export function lookupBundle(cfg: WidgetConfig, id: string): BundleConfig | null {
  return cfg.bundles.find((b) => b.id === id && b.mode === "classic") ?? null;
}

export function lookupQb(cfg: WidgetConfig, id: string): QbConfig | null {
  return cfg.quantityBreaks.find((q) => q.id === id) ?? null;
}

export function lookupMixMatch(cfg: WidgetConfig, id: string): BundleConfig | null {
  return cfg.bundles.find((b) => b.id === id && b.mode === "mix_match") ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/widget-src && pnpm test src/lookup.test.ts`
Expected: PASS — 8 tests green (3 lookupBundle + 2 lookupQb + 3 lookupMixMatch).

- [ ] **Step 5: Commit**

```bash
git add apps/widget-src/src/lookup.ts apps/widget-src/src/lookup.test.ts
git commit -m "feat(widget): add lookup helpers for bundle/QB/mix-match by id"
```

---

## Task 2: Widget shortcode dispatch

**Files:**
- Modify: `apps/widget-src/src/widget.ts`
- Modify: `apps/widget-src/src/widget.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `apps/widget-src/src/widget.test.ts` (inside the existing `describe("widget init", ...)` block, before the closing `});`):
```ts
  it("renders a classic bundle from data-pumper-bundle shortcode", async () => {
    document.body.innerHTML = `<div id="sc" data-pumper-bundle="b1"></div>`;
    await initWidget();
    const el = document.getElementById("sc")!;
    expect(el.dataset.pumperRendered).toBe("1");
    expect(el.innerHTML.length).toBeGreaterThan(0);
  });

  it("renders a QB from data-pumper-qb shortcode", async () => {
    document.body.innerHTML = `<div id="sc" data-pumper-qb="q1"></div>`;
    await initWidget();
    const el = document.getElementById("sc")!;
    expect(el.dataset.pumperRendered).toBe("1");
    expect(el.innerHTML.length).toBeGreaterThan(0);
  });

  it("renders a mix-match from data-pumper-mix-match shortcode", async () => {
    document.body.innerHTML = `<div id="sc" data-pumper-mix-match="b2"></div>`;
    await initWidget();
    const el = document.getElementById("sc")!;
    expect(el.dataset.pumperRendered).toBe("1");
  });

  it("empties shortcode element when id is unknown but still marks pumper-rendered", async () => {
    document.body.innerHTML = `<div id="sc" data-pumper-bundle="nonexistent"></div>`;
    await initWidget();
    const el = document.getElementById("sc")!;
    expect(el.dataset.pumperRendered).toBe("1");
    expect(el.innerHTML).toBe("");
  });

  it("cross-mode: data-pumper-bundle for a mix-match-mode entity renders empty", async () => {
    document.body.innerHTML = `<div id="sc" data-pumper-bundle="b2"></div>`;
    await initWidget();
    const el = document.getElementById("sc")!;
    expect(el.dataset.pumperRendered).toBe("1");
    expect(el.innerHTML).toBe("");
  });
```

The existing fixture `CONFIG` (declared at the top of the test file) has `b1` (classic), `b2` (mix_match), and `q1` (QB) — perfect for these cases. The fixture's `b2` mode might need to be set to `mix_match` if it isn't already; check it.

If `b2` doesn't exist in the existing fixture, extend `CONFIG.bundles` to include it. Likewise extend `CONFIG.quantityBreaks` to include a `q1` if missing. The existing fixture should already have `b1` and at least one classic bundle.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/widget-src && pnpm test src/widget.test.ts`
Expected: 5 new tests FAIL (`expect(el.dataset.pumperRendered).toBe("1")` returns undefined or empty because the shortcode selectors aren't yet wired into `initWidget`). Existing widget tests still pass.

- [ ] **Step 3: Update widget.ts**

In `apps/widget-src/src/widget.ts`:

1. Add to imports near the top:
```ts
import { lookupBundle, lookupQb, lookupMixMatch } from "./lookup";
```

2. Just above the `renderMount` function, add:
```ts
type ShortcodeKind = "bundle" | "qb" | "mix";
type ShortcodeSpec = { kind: ShortcodeKind; selector: string; attr: string };

const SHORTCODES: ShortcodeSpec[] = [
  { kind: "bundle", selector: "[data-pumper-bundle]:not([data-pumper-rendered])",    attr: "data-pumper-bundle"    },
  { kind: "qb",     selector: "[data-pumper-qb]:not([data-pumper-rendered])",        attr: "data-pumper-qb"        },
  { kind: "mix",    selector: "[data-pumper-mix-match]:not([data-pumper-rendered])", attr: "data-pumper-mix-match" },
];

function renderShortcode(el: HTMLElement, kind: ShortcodeKind, id: string, cfg: WidgetConfig): void {
  applyCssVars(el, cfg);
  if (kind === "bundle") {
    const b = lookupBundle(cfg, id);
    if (!b) { el.innerHTML = ""; el.style.minHeight = ""; el.dataset.pumperRendered = "1"; return; }
    renderBundle(el, b, cfg);
    el.dataset.pumperRendered = "1";
    return;
  }
  if (kind === "qb") {
    const q = lookupQb(cfg, id);
    if (!q) { el.innerHTML = ""; el.style.minHeight = ""; el.dataset.pumperRendered = "1"; return; }
    renderQb(el, q, cfg);
    el.dataset.pumperRendered = "1";
    return;
  }
  // kind === "mix"
  const m = lookupMixMatch(cfg, id);
  if (!m) { el.innerHTML = ""; el.style.minHeight = ""; el.dataset.pumperRendered = "1"; return; }
  renderMixMatch(el, m, cfg);
  el.dataset.pumperRendered = "1";
}

function collectShortcodes(): Array<{ el: HTMLElement; kind: ShortcodeKind; id: string }> {
  const out: Array<{ el: HTMLElement; kind: ShortcodeKind; id: string }> = [];
  for (const spec of SHORTCODES) {
    document.querySelectorAll<HTMLElement>(spec.selector).forEach((el) => {
      const id = el.getAttribute(spec.attr);
      if (id) out.push({ el, kind: spec.kind, id });
    });
  }
  return out;
}
```

3. In `initWidget()`, replace the body up to and including the `for (const m of mounts) renderMount(m, cfg);` line with:
```ts
export async function initWidget(): Promise<void> {
  const mounts = Array.from(document.querySelectorAll<HTMLElement>(".pumper-mount:not([data-pumper-rendered])"));
  const shortcodes = collectShortcodes();
  if (mounts.length === 0 && shortcodes.length === 0) return;

  const apiBase = (window._pumperConfig?.apiBase) ?? "https://bundler.deepseatools.in/api/storefront";
  const shopFromGlobal = window._pumperConfig?.shop;
  const shopFromMount = mounts[0]?.dataset.shop;
  const shop = shopFromGlobal ?? shopFromMount ?? "";
  if (!shop) return;

  configureAnalytics({ apiBase, shop });

  let cfg: WidgetConfig;
  try {
    cfg = await fetchConfigOnce(shop, apiBase);
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[pumper] config unreachable", e);
    }
    mounts.forEach((m) => { m.innerHTML = ""; m.style.minHeight = ""; });
    shortcodes.forEach((s) => { s.el.innerHTML = ""; s.el.style.minHeight = ""; });
    return;
  }

  setLocale(cfg.settings.locale ?? "en");

  for (const m of mounts) renderMount(m, cfg);
  for (const sc of shortcodes) renderShortcode(sc.el, sc.kind, sc.id, cfg);

  startObserver(cfg);

  // Expose re-render hook for preview iframe
  window._pumperRerender = () => {
    cachedConfig = null;
    document.querySelectorAll<HTMLElement>(".pumper-mount, [data-pumper-bundle], [data-pumper-qb], [data-pumper-mix-match]").forEach((m) => {
      m.removeAttribute("data-pumper-rendered");
    });
    void initWidget();
  };
}
```

4. Update `startObserver` callback to also catch shortcodes:
```ts
function startObserver(cfg: WidgetConfig): void {
  if (observerStarted) return;
  observerStarted = true;
  const cb = () => {
    document.querySelectorAll<HTMLElement>(".pumper-mount:not([data-pumper-rendered])").forEach((m) => {
      renderMount(m, cachedConfig ?? cfg);
    });
    for (const sc of collectShortcodes()) {
      renderShortcode(sc.el, sc.kind, sc.id, cachedConfig ?? cfg);
    }
  };
  const obs = new MutationObserver(() => {
    const ric = typeof window !== "undefined"
      ? (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback
      : undefined;
    if (ric) ric(cb); else setTimeout(cb, 100);
  });
  obs.observe(document.body, { childList: true, subtree: true });
}
```

The `shopFromMount` derivation is now nullable-safe (using `?.dataset.shop` since `mounts[0]` may be undefined when only shortcodes are present). Falls back to `window._pumperConfig.shop` set by App Embed Liquid.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/widget-src && pnpm test src/widget.test.ts`
Expected: PASS — 7 tests in `widget init` describe (2 existing + 5 new).

Run the full widget-src suite to catch regressions:
Run: `cd apps/widget-src && pnpm test`
Expected: ALL pass.

- [ ] **Step 5: Commit**

```bash
git add apps/widget-src/src/widget.ts apps/widget-src/src/widget.test.ts
git commit -m "feat(widget): detect shortcode attributes alongside .pumper-mount"
```

---

## Task 3: EmbedCodeCard component

**Files:**
- Create: `apps/admin/app/components/EmbedCodeCard.tsx`

No unit test for this component (admin workspace runs `environment: "node"` with no React renderer, consistent with the Phase 8.F precedent for ConfirmModal). Manual smoke covers behavior.

- [ ] **Step 1: Create EmbedCodeCard.tsx**

Create `apps/admin/app/components/EmbedCodeCard.tsx`:
```tsx
import { Card, BlockStack, InlineStack, Text, TextField, Button } from "@shopify/polaris";
import { useState } from "react";

type Props = { snippet: string };

export function EmbedCodeCard({ snippet }: Props) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API blocked (insecure context, restrictive CSP).
      // The TextField is selectable so manual copy still works.
    }
  };
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="h2" variant="headingMd">Embed code</Text>
        <Text as="p" tone="subdued">
          Paste this anywhere your theme accepts HTML — homepage, blog post, custom page,
          or a page builder&apos;s HTML element.
        </Text>
        <TextField
          label="Embed code"
          labelHidden
          value={snippet}
          readOnly
          autoComplete="off"
          multiline={2}
          onChange={() => { /* readOnly; satisfy required prop type */ }}
        />
        <InlineStack align="end">
          <Button onClick={onCopy} variant={copied ? "primary" : "secondary"}>
            {copied ? "Copied!" : "Copy"}
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: PASS — no new type errors.

- [ ] **Step 3: Run admin tests (regression check)**

Run: `cd apps/admin && pnpm vitest run`
Expected: PASS — all 184 existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/components/EmbedCodeCard.tsx
git commit -m "feat(admin): add EmbedCodeCard with copy-to-clipboard"
```

---

## Task 4: Mount EmbedCodeCard on bundle + QB edit pages

**Files:**
- Modify: `apps/admin/app/routes/app.bundles.$id.tsx`
- Modify: `apps/admin/app/routes/app.quantity-breaks.$id.tsx`

- [ ] **Step 1: Modify app.bundles.$id.tsx**

Read the file first to identify where the existing form `<Layout.Section>` ends. Run: `cat "apps/admin/app/routes/app.bundles.$id.tsx"`.

Add to imports:
```tsx
import { EmbedCodeCard } from "~/components/EmbedCodeCard";
```

Inside the default exported component (the React component that renders the page), where the bundle data is available from the loader (e.g. via `useLoaderData<typeof loader>()`), compute the snippet near the top of the component body:
```tsx
const snippet = bundle.mode === "mix_match"
  ? `<div data-pumper-mix-match="${bundle.id}"></div>`
  : `<div data-pumper-bundle="${bundle.id}"></div>`;
```

If the loader returns the bundle under a different key (e.g. `data.bundle` or destructured directly), use the appropriate variable. Inspect the existing destructuring of `useLoaderData` to find the right name.

In the JSX, after the existing `<Layout.Section>` containing the bundle form, add a second `<Layout.Section>`:
```tsx
<Layout.Section>
  <EmbedCodeCard snippet={snippet} />
</Layout.Section>
```

If the existing layout uses `<Layout.Section variant="oneThird">` for a sidebar (e.g. for `<PreviewPane>`), add the EmbedCodeCard section AFTER any oneThird sidebar but BEFORE the closing `</Layout>`. Standard Polaris pattern: full-width sections stack vertically.

- [ ] **Step 2: Modify app.quantity-breaks.$id.tsx**

Read the file: `cat "apps/admin/app/routes/app.quantity-breaks.$id.tsx"`.

Add to imports:
```tsx
import { EmbedCodeCard } from "~/components/EmbedCodeCard";
```

In the default exported component, near the top of the component body (after `useLoaderData`), compute:
```tsx
const snippet = `<div data-pumper-qb="${qb.id}"></div>`;
```

Use whatever variable name the loader returns (e.g. `qb`, `data.qb`, etc.).

After the existing `<Layout.Section>` with the QB form, add:
```tsx
<Layout.Section>
  <EmbedCodeCard snippet={snippet} />
</Layout.Section>
```

- [ ] **Step 3: Verify typecheck + tests**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: PASS.

Run: `cd apps/admin && pnpm vitest run`
Expected: PASS — 184 tests still pass.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/routes/app.bundles.$id.tsx apps/admin/app/routes/app.quantity-breaks.$id.tsx
git commit -m "feat(admin): mount EmbedCodeCard on bundle + QB edit pages"
```

---

## Task 5: Build widget + final sweep

**Files:** None directly (verification + build artifact)

- [ ] **Step 1: Run the full widget-src test suite**

Run: `cd apps/widget-src && pnpm test`
Expected: ALL pass — existing tests + 8 lookup tests + 5 widget shortcode tests.

- [ ] **Step 2: Rebuild the widget bundle**

Run: `cd apps/widget-src && pnpm build`
Expected: SUCCESS — `tsup` compiles to IIFE; `copy:to-admin` script writes the new `extensions/theme-app-extension/assets/widget.js` and `apps/admin/public/widget.js`.

- [ ] **Step 3: Verify the rebuilt widget contains shortcode selector strings**

Run: `grep -oE "data-pumper-bundle|data-pumper-qb|data-pumper-mix-match" extensions/theme-app-extension/assets/widget.js | sort -u`
Expected: 3 lines:
```
data-pumper-bundle
data-pumper-mix-match
data-pumper-qb
```

- [ ] **Step 4: Verify bundle size budget (<30KB gzipped)**

Run: `gzip -c extensions/theme-app-extension/assets/widget.js | wc -c`
Expected: < 7000 (current ~5700 + ~200B for shortcode logic). Well under 30720 (30KB budget).

- [ ] **Step 5: Run the full admin test suite (regression check)**

Run: `cd apps/admin && pnpm vitest run`
Expected: PASS — all 184 admin tests still pass.

- [ ] **Step 6: Run admin typecheck (regression check)**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Run admin build**

Run: `cd apps/admin && pnpm build`
Expected: SUCCESS — Remix client + server bundles compile.

- [ ] **Step 8: Commit the rebuilt widget**

If `git status` shows changes to `extensions/theme-app-extension/assets/widget.js` or `apps/admin/public/widget.js`:
```bash
git add extensions/theme-app-extension/assets/widget.js apps/admin/public/widget.js
git commit -m "chore(widget): rebuild with shortcode dispatch"
```

If only one of the two paths changed, only commit the changed path.

---

## Phase 8.B Done When

- All 5 tasks above checked off
- `cd apps/widget-src && pnpm test` green (existing + 13 new tests)
- `cd apps/admin && pnpm vitest run` green (184 tests; no regressions)
- `cd apps/admin && pnpm tsc --noEmit` green
- `cd apps/admin && pnpm build` green
- New `widget.js` committed; bundle still under 30KB gzipped
- 3 shortcode attribute strings present in the rebuilt widget IIFE

Manual QA (smoke checklist in spec §8) runs after the production deploy — verifies copy-to-clipboard, snippet renders on real custom Shopify pages, and cross-mode safety holds in production. Not blocking this phase's completion.
