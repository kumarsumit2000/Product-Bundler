# Phase 8.B: Bundle Shortcodes — Design Spec

**Date:** 2026-05-08
**Status:** Draft for review
**Parent phase:** Phase 8 — Polish for BFS (decomposed; this is sub-project B)
**Renamed from:** "Page builder integrations + bundle shortcodes". Page builder code dropped — the shortcode mechanism handles all non-PDP placement, including page builders that accept Custom HTML (GemPages, PageFly, etc.).

---

## 1. Goal

Let merchants render bundles, quantity breaks, and mix-and-match bundles on any page (homepage, blog post, custom page, page-builder section) by copying a small HTML snippet from the admin and pasting it wherever their theme accepts HTML.

## 2. Shortcode format

Plain HTML `<div>` with a single data attribute carrying the entity id:

| Entity | Shortcode |
|---|---|
| Classic bundle | `<div data-pumper-bundle="<bundle-id>"></div>` |
| Mix-and-match bundle | `<div data-pumper-mix-match="<bundle-id>"></div>` |
| Quantity break | `<div data-pumper-qb="<qb-id>"></div>` |

Plain HTML works in: theme Liquid (Liquid passes raw HTML through), Shopify rich-text editor (blog posts, custom pages), GemPages Custom HTML element, PageFly HTML block, and any other context that allows arbitrary HTML.

Bundle ids are ULIDs (already URL-safe and HTML-attribute-safe). No escaping needed.

## 3. Architecture

```
merchant edits bundle/QB → admin shows EmbedCodeCard with snippet
                                    ↓
                            Copy button → navigator.clipboard.writeText
                                    ↓
        merchant pastes snippet into homepage/blog/page-builder
                                    ↓
   widget.js loaded site-wide via App Embed
                                    ↓
   initWidget() scans for [data-pumper-bundle], [data-pumper-qb],
                          [data-pumper-mix-match] (plus existing .pumper-mount)
                                    ↓
   for each match: lookupBundle/lookupQb/lookupMixMatch by id
                                    ↓
   call existing renderBundle / renderQb / renderMixMatch
                                    ↓
   set data-pumper-rendered="1" so observer doesn't re-render
```

Three new selectors run alongside the existing `.pumper-mount` selector — both detection paths coexist. Existing PDP App Block flow is untouched.

## 4. New files (3)

### 4.1 `apps/widget-src/src/lookup.ts` (~30 LOC)

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

The mode filter on bundle vs mix-match prevents cross-rendering: pasting `data-pumper-bundle` for a mix-match-mode entity returns null (renders empty), and vice versa.

### 4.2 `apps/widget-src/src/lookup.test.ts` (~50 LOC)

Three unit tests:
1. `lookupBundle` returns matching classic bundle; null when not found; null when found-but-mix-match-mode
2. `lookupQb` returns matching QB by id; null when not found
3. `lookupMixMatch` returns matching mix-match bundle; null when not found; null when classic-mode

### 4.3 `apps/admin/app/components/EmbedCodeCard.tsx` (~45 LOC)

Polaris Card containing:
- `<Text as="h2" variant="headingMd">Embed code</Text>`
- `<Text as="p" tone="subdued">` with copy: "Paste this anywhere your theme accepts HTML — homepage, blog post, custom page, or a page builder's HTML element."
- `<TextField multiline={2} readOnly>` showing the snippet
- `<Button onClick={onCopy}>` toggles between "Copy" and "Copied!" via 1.5s timeout
- Uses `navigator.clipboard.writeText` with try/catch fallback (manual select still works because the field is selectable)

Single prop: `{ snippet: string }`. Used 3× in the admin (bundle edit, QB edit — and same component handles mix-match by virtue of the snippet string being passed in).

## 5. Modified files (4)

### 5.1 `apps/widget-src/src/widget.ts`

Replace the existing single-`mounts`-array path in `initWidget()` with a dual collection — both `.pumper-mount` and the three shortcode selectors:

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
  } else if (kind === "qb") {
    const q = lookupQb(cfg, id);
    if (!q) { el.innerHTML = ""; el.style.minHeight = ""; el.dataset.pumperRendered = "1"; return; }
    renderQb(el, q, cfg);
  } else {
    const m = lookupMixMatch(cfg, id);
    if (!m) { el.innerHTML = ""; el.style.minHeight = ""; el.dataset.pumperRendered = "1"; return; }
    renderMixMatch(el, m, cfg);
  }
  el.dataset.pumperRendered = "1";
}
```

Note: `data-pumper-rendered="1"` is set even when lookup returns null, so the MutationObserver doesn't repeatedly try to render an unresolvable shortcode (e.g. a deleted bundle whose snippet still lives on a blog post).

`initWidget()` collects shortcodes alongside existing mounts and short-circuits early if BOTH are empty. Both pass through the existing `fetchConfigOnce` + `setLocale` + `configureAnalytics` flow once.

`startObserver()` callback is updated to re-scan all 4 selectors on each idle tick (existing throttle preserved).

### 5.2 `apps/widget-src/src/widget.test.ts` (extend)

Five new tests added to the existing describe block:
1. Renders a classic bundle when `<div data-pumper-bundle="b1">` is present
2. Renders a QB when `<div data-pumper-qb="q1">` is present
3. Renders a mix-match when `<div data-pumper-mix-match="b2">` is present
4. Empties (no error, sets `data-pumper-rendered`) when shortcode references a nonexistent id
5. Cross-mode safety: `data-pumper-bundle="b2"` where b2 is mix-match-mode → renders empty (lookupBundle's mode filter)

### 5.3 `apps/admin/app/routes/app.bundles.$id.tsx`

Add to imports:
```ts
import { Layout } from "@shopify/polaris";
import { EmbedCodeCard } from "~/components/EmbedCodeCard";
```
(Layout likely already imported; merge.)

After the existing `<Layout.Section>` containing the bundle form, add a second section:
```tsx
const snippet = bundle.mode === "mix_match"
  ? `<div data-pumper-mix-match="${bundle.id}"></div>`
  : `<div data-pumper-bundle="${bundle.id}"></div>`;

// inside the render, after the existing form Layout.Section:
<Layout.Section>
  <EmbedCodeCard snippet={snippet} />
</Layout.Section>
```

### 5.4 `apps/admin/app/routes/app.quantity-breaks.$id.tsx`

Same shape:
```ts
import { EmbedCodeCard } from "~/components/EmbedCodeCard";

const snippet = `<div data-pumper-qb="${qb.id}"></div>`;

<Layout.Section>
  <EmbedCodeCard snippet={snippet} />
</Layout.Section>
```

## 6. Out of scope (deferred)

- Dedicated GemPages / PageFly SDK integrations — shortcode is universal; SDK plugins are not worth the maintenance burden until a merchant specifically requests one
- Shortcodes on the create pages (`new.tsx`) — entity has no id pre-save; merchant lands on edit page after save, where the EmbedCodeCard is visible
- Liquid-include alternative format (`{% render 'pumper-bundle' with id: '...' %}`) — page builders strip Liquid; HTML works everywhere including inside Liquid templates
- Shortcode lookup by handle/name instead of id — id is shorter, immutable, and merchant doesn't see the URL anyway
- Embed code analytics events — existing `widget_impression` / `widget_click` / `add_to_cart` events fire from the same render functions, so shortcode-rendered widgets get the same telemetry automatically

## 7. Risks

| Risk | Mitigation |
|---|---|
| Merchant pastes shortcode but App Embed is disabled in their theme → widget JS never loads | Documented in EmbedCodeCard helper text (future enhancement); for now, App Embed is enabled by default during install |
| Shortcode references deleted bundle — element shows empty space on the page | `el.dataset.pumperRendered = "1"` set even on null lookup so MutationObserver doesn't loop; merchant must remove stale snippet themselves (acceptable — same as if any HTML attribute referenced a missing record) |
| `navigator.clipboard.writeText` throws (insecure context, restrictive CSP) | try/catch swallows; TextField is selectable so manual copy still works; "Copied!" feedback simply doesn't fire |
| Cross-mode rendering (paste `data-pumper-bundle` for a mix-match) | `lookupBundle` and `lookupMixMatch` both filter by `mode` — wrong attribute returns null, element renders empty |
| Widget bundle size regression past 30KB gzipped | New code is ~50 LOC raw / ~200B gzipped; current 5.7KB → ~5.9KB. Well under budget. |
| Shortcode for entity from another shop's data leaks | Cached config (`cachedConfig`) only contains entities returned by `/api/storefront/config/<own-shop>`. Cross-shop ids never resolve. No new vector. |

## 8. Manual QA checklist (post-deploy)

- [ ] Edit a classic bundle → "Embed code" Card visible with `data-pumper-bundle="<id>"`
- [ ] Edit a mix-match bundle → uses `data-pumper-mix-match` attribute
- [ ] Edit a QB → uses `data-pumper-qb` attribute
- [ ] Click Copy → button shows "Copied!" for ~1.5s; pasting into a text editor produces the exact snippet
- [ ] On a real custom Shopify page (Pages → Add page, paste in HTML editor), bundle widget renders inline
- [ ] Same paste inside a GemPages Custom HTML element → renders (proves page-builder integration without dedicated code)
- [ ] Delete the bundle, refresh the page that has its shortcode → element renders empty, no console errors
- [ ] Create a NEW bundle, save → land on edit page, EmbedCodeCard immediately visible

## 9. File manifest

**Created (3):**
- `apps/widget-src/src/lookup.ts`
- `apps/widget-src/src/lookup.test.ts`
- `apps/admin/app/components/EmbedCodeCard.tsx`

**Modified (4):**
- `apps/widget-src/src/widget.ts` — dual-selector init + new renderShortcode dispatch + observer extension
- `apps/widget-src/src/widget.test.ts` — 5 new tests
- `apps/admin/app/routes/app.bundles.$id.tsx` — mount EmbedCodeCard with mode-aware snippet
- `apps/admin/app/routes/app.quantity-breaks.$id.tsx` — mount EmbedCodeCard
