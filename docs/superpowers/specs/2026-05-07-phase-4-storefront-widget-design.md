# Phase 4 — Storefront Widget (with Live Admin Preview + Mix & Match)

**Status:** Approved 2026-05-07
**Phase:** 4 of 9 (per CLAUDE.md §15)
**Estimate:** ~3-3.5 weeks (extended from spec's 1-2 weeks to include live admin preview + Mix & Match bundle type)

---

## 1. Goal

Make the bundles, quantity breaks, and Mix & Match offers stored in D1 actually appear on the merchant's storefront, with merchants able to preview the widget live as they edit, and customers able to add bundles to their cart with the discount automatically applying at checkout (already wired in Phase 3).

---

## 2. Scope

### In scope

- **Storefront widget** rendered on PDPs via Theme App Extension App Block + App Embed:
  - Classic bundle widget (stacked vertical layout)
  - Quantity Break widget (stacked tier card layout)
  - Mix & Match widget (inline grid layout — third bundle type, the competitor-parity addition)
- **Live admin preview** — iframe pane on bundle/QB edit pages that renders the actual widget with form-state config, updating within 300ms of edits.
- **`/api/storefront/config/:shop`** public endpoint with 60s KV cache.
- **`/api/storefront/event`** beacon receiver (stub — full analytics pipeline lands in Phase 6).
- **Hybrid add-to-cart**: native theme drawer events with 800ms fallback to `/cart` redirect.
- **OOS handling**: tier-level disable for QB, badge-and-disable for partial bundles, full hide when no items available.
- **Variant change handling** for the three most common theme patterns.
- **CLS-zero rendering**: skeleton + reserved `min-height` until config arrives.
- **Schema migration** to add Mix & Match columns to `bundles` table.
- **`collections/update` webhook subscription** to invalidate `config:${shop}` KV cache when a collection's products change (Mix & Match cache freshness).

### Out of scope (explicitly deferred)

- Cart drawer integrations for 3rd-party drawers (Slide Cart, Upcart, qikify, Monster Cart, etc.) → **Phase 8**
- 11-language i18n translations (English-only widget; `t()` helper in place so Phase 8 just drops locale JSON files) → **Phase 8**
- Custom CSS escape hatch → **Phase 8**
- Cart Transform Function (visual line merging) → **Phase 5**
- Free Gift / BOGO mechanics on QB tiers → **Phase 5**
- Web Pixel Extension (dropped permanently per Amendment 4 — replaced by `sendBeacon` to our own endpoint)
- Bundle scheduling, A/B tests, subscription bundles → CLAUDE.md §18

---

## 3. Architecture

### File layout

```
extensions/theme-app-extension/                  # NEW — Shopify-deployed
├── blocks/
│   ├── app-embed.liquid                         # site-wide, loads widget.js once
│   ├── bundle-widget.liquid                     # PDP App Block
│   ├── qb-widget.liquid                         # PDP App Block
│   └── mix-match-widget.liquid                  # PDP App Block
├── assets/
│   ├── widget.ts                                # entry point, lifecycle
│   ├── widget.css                               # scoped via .pumper- prefix
│   ├── render-bundle.ts                         # bundle widget render fn
│   ├── render-qb.ts                             # QB widget render fn
│   ├── render-mix-match.ts                      # mix & match render fn
│   ├── add-to-cart.ts                           # hybrid add flow
│   ├── analytics.ts                             # sendBeacon helpers
│   ├── i18n.ts                                  # t() helper, en strings
│   ├── match.ts                                 # match config to current product
│   └── tsup.config.ts                           # bundles → widget.js
├── locales/
│   └── en.default.json
└── shopify.extension.toml

apps/admin/app/routes/
├── api.storefront.config.$shop.tsx              # NEW — public widget config (60s KV)
├── api.storefront.event.tsx                     # NEW — beacon receiver
├── webhooks.collections-update.tsx              # NEW — invalidates KV cache on collection edit
├── app.preview.$type.$id.tsx                    # NEW — preview iframe HTML doc (initial config in loader; updates via postMessage)
├── app.bundles.$id.tsx                          # MODIFIED — adds PreviewPane
├── app.bundles.new.tsx                          # MODIFIED — adds PreviewPane
├── app.quantity-breaks.$id.tsx                  # MODIFIED — adds PreviewPane
└── app.quantity-breaks.new.tsx                  # MODIFIED — adds PreviewPane

apps/admin/app/components/
├── PreviewPane.tsx                              # NEW — iframe wrapper + postMessage
├── BundleForm.tsx                               # MODIFIED — Mix & Match mode toggle, collection picker, targetQty input
└── QbForm.tsx                                   # unchanged structurally

apps/admin/app/lib/
├── bundles/
│   ├── repo.ts                                  # MODIFIED — handle mode, collectionId, targetQty
│   ├── validate.ts                              # MODIFIED — Mix & Match rules
│   └── preview-config.ts                        # NEW — form-state → widget config shape
├── quantity-breaks/
│   └── preview-config.ts                        # NEW
├── shopify-product-fetch.ts                     # NEW — batch product+variant+inventory fetch
└── metafield-sync.ts                            # MODIFIED — include mode/collectionId/targetQty in shop metafield JSON
```

### Code-sharing strategy

The widget is a single `widget.js` IIFE produced by tsup. The same file loads in three contexts:

1. **Storefront PDP** — via `app-embed.liquid` `<script src="{{ 'widget.js' | asset_url }}" defer></script>`. Fetches config from `/api/storefront/config/:shop`.
2. **Admin preview iframe** — via `<script>` in the preview HTML doc. Detects `window._pumperPreview === true` and reads config from `window._pumperPreviewConfig` instead of fetching.
3. **Tests** — imported by Vitest, mounted on JSDOM DOM with stubbed config.

Render functions take `(mountElement, matchedItem | null, config)` — no globals, easy to mock.

### Discount Function compatibility (carries over from Phase 3)

The Discount Function reads `shop.pumper.config` metafield. Phase 4 extends `metafieldSync` to include the new Mix & Match fields:

```ts
// shop metafield JSON (already synced on every save)
{
  bundles: [{
    id, mode, products, collectionId, targetQty,
    discountType, discountValue, combinable
  }],
  quantityBreaks: [...]
}
```

The Rust function gets a corresponding update in Phase 4 to handle Mix & Match matching: cart contains N items where productId ∈ collection AND each item has `_pumper_bundle_id == bundle.id` line property → apply discount. The widget tags every Mix & Match line with the same `_pumper_bundle_id` on add-to-cart.

---

## 4. Schema changes

### D1 migration (`drizzle/migrations/0005_mix_match.sql`)

```sql
ALTER TABLE bundles ADD COLUMN mode TEXT NOT NULL DEFAULT 'classic';
ALTER TABLE bundles ADD COLUMN collection_id TEXT;
ALTER TABLE bundles ADD COLUMN target_qty INTEGER;
```

### Drizzle schema update (`apps/admin/drizzle/schema.ts`)

Add to `bundles` table:
```ts
mode: text("mode", { enum: ["classic", "mix_match"] }).notNull().default("classic"),
collectionId: text("collection_id"),
targetQty: integer("target_qty"),
```

### Validation rules (`apps/admin/app/lib/bundles/validate.ts`)

| Mode | `products` | `collectionId` | `targetQty` |
|---|---|---|---|
| `classic` | required, length ≥ 2 | must be empty | must be empty |
| `mix_match` | must be empty | required | required, ≥ 2 |

`triggerProductIds` is optional in both modes. For `mix_match` with empty `triggerProductIds`, widget shows on every product in `collectionId` (collection-membership data comes from the storefront config payload).

---

## 5. Storefront config payload

`GET /api/storefront/config/:shop`

Response shape:

```ts
{
  shop: string,
  settings: {
    primaryColor: string,
    textColor: string,
    backgroundColor: string,
    borderRadius: number,
    fontFamily: string,
    bundleHeadline: string,
    qbHeadline: string,
    showCompareAtPrice: boolean,
    currency: string,        // shop primary currency
    locale: string           // shop primary locale
  },
  bundles: Array<{
    id: string,
    name: string,
    mode: 'classic' | 'mix_match',
    products: Array<{        // [] for mix_match
      productId: string,
      variantId: string | null,
      qty: number,
      title: string,
      image: string | null,
      available: boolean,
      priceCents: number
    }>,
    collectionId: string | null,
    targetQty: number | null,
    collectionProducts: Array<{    // mix_match only — top 12 by collection's manual sort order, falls back to BEST_SELLING if collection sort is auto-set; query: collection(id).products(first:12, sortKey: MANUAL)
      productId, variantId, title, image, available, priceCents
    }> | null,
    discountType: 'percentage' | 'flat' | 'fixed_total',
    discountValue: number,
    combinable: boolean,
    triggerProductIds: string[],
    headline: string | null,
    ctaLabel: string | null,
    styleOverrides: object | null
  }>,
  quantityBreaks: Array<{
    id: string,
    name: string,
    productId: string,
    productTitle: string,
    productImage: string | null,
    productVariants: Array<{
      variantId: string,
      title: string,
      available: boolean,
      priceCents: number
    }>,
    tiers: Array<{
      qty: number,
      discountType: 'percentage' | 'flat' | 'fixed_per_unit',
      discountValue: number,
      label: string,
      isMostPopular: boolean,
      available: boolean   // computed: variant has stock ≥ tier.qty
    }>,
    combinable: boolean,
    styleOverrides: object | null
  }>
}
```

### Caching

- Single KV key: `config:${shop}` in `SHOP_SETTINGS_CACHE` namespace.
- TTL: 60s.
- Cache-busted on: any bundle/QB save (already wired in Phase 2/3 admin actions), `inventory_levels/update` webhook (already wired Phase 1), new `collections/update` webhook (added in Phase 4 — low priority, eventual consistency acceptable).
- Negative cache (no active offers): 30s TTL with empty arrays. Prevents every PDP page load from hitting D1.

### CORS

```
Access-Control-Allow-Origin: *
Cache-Control: public, max-age=60, s-maxage=60
```

### Rate limit & shop-installed gate (Amendment 3)

- Workers Rate Limiting API: 1000 req/min per shop. 429 on exceed.
- Shop must exist in `shops` with non-null `installedAt` and null `uninstalledAt`. Otherwise 404.

---

## 6. Widget rendering & lifecycle

### Mount points (Liquid templates)

```liquid
<div class="pumper-mount"
     data-pumper-type="bundle"
     data-product-id="{{ product.id }}"
     data-shop="{{ shop.permanent_domain }}"></div>
```

Equivalents for `qb` and `mix_match`.

**Mount-type → bundle-mode mapping:**

| `data-pumper-type` | Matches |
|---|---|
| `bundle`     | `bundles` rows where `mode === 'classic'` |
| `qb`         | `quantityBreaks` rows |
| `mix_match`  | `bundles` rows where `mode === 'mix_match'` |

`bundle-widget.liquid` and `mix-match-widget.liquid` are separate App Blocks because merchants drag them onto the PDP independently — they may have a classic bundle on one product and a Mix & Match offer on another.

### Lifecycle (`widget.ts`)

```ts
async function init() {
  const mounts = document.querySelectorAll<HTMLElement>('.pumper-mount:not([data-pumper-rendered])');
  if (!mounts.length) return;

  const shop = (window as any)._pumperConfig?.shop ?? mounts[0].dataset.shop!;
  const config = await fetchConfig(shop);

  for (const el of mounts) renderMount(el, config);
  observeForLateInsertedMounts(config);
}

function renderMount(el: HTMLElement, config: Config) {
  const type = el.dataset.pumperType;
  const productId = `gid://shopify/Product/${el.dataset.productId}`;
  el.style.minHeight = '180px';
  el.dataset.pumperRendered = '1';

  if (type === 'bundle')    renderBundle(el, matchBundle(config, productId), config);
  if (type === 'qb')        renderQb(el, matchQb(config, productId), config);
  if (type === 'mix_match') renderMixMatch(el, matchMixMatch(config, productId), config);
}
```

### State pattern

| Widget | State | Re-render trigger |
|---|---|---|
| Bundle | none | n/a (rendered once) |
| QB | `selectedTierIndex: number` | Tier row click |
| Mix & Match | `selectedVariantIds: string[]` | Item click |

Each render function is called with `(mountEl, item, config)` — closure scope holds state for that mount. Re-render = full subtree replacement (`mountEl.innerHTML = newMarkup`).

### DOM strategy

- Event delegation at `mountEl` level — single click handler dispatches by `data-action` attribute (`select-tier`, `toggle-mm-item`, `add-to-cart`, `open-drawer`).
- Element count per mount ≤ ~20 nodes. Full innerHTML replacement is <2ms.

### CSS scoping

- All classes prefixed `.pumper-`.
- CSS custom properties for theming, set inline on mount element from `config.settings`:
  ```css
  --pumper-primary: #7B1E2A;
  --pumper-text: #1A1A1A;
  --pumper-bg: #FFFFFF;
  --pumper-radius: 8px;
  --pumper-font: inherit;
  ```
- No `!important`. Theme color/font collision risk accepted (Phase 8 adds custom CSS escape hatch).

### Loading state

- Mount renders inline skeleton (`<div class="pumper-skeleton">` animated gradient) immediately on `init()` while config fetches.
- `min-height: 180px` reserved on mount element → CLS 0 even if config takes 500ms.
- On config arrival, skeleton replaced with widget.

### Bundle size budget

- Target: 30KB gzipped JS.
- Projected: 15-18KB gzipped.
- Enforced by `scripts/check-bundle-size.sh` in CI — fails build at >30KB.
- CSS file separate, ~3KB gzipped, not counted in JS budget.

### MutationObserver

- Observes `document.body` (`childList: true, subtree: true`).
- When new `.pumper-mount:not([data-pumper-rendered])` appears (e.g. cart drawer opens with a "you may also like" carousel), runs render on those mounts.
- Throttled to once per 100ms via `requestIdleCallback`.

---

## 7. Live admin preview iframe

### Edit page layout

Polaris two-column `Layout`:
- Left (2/3 width): existing form (`<BundleForm>` / `<QbForm>`).
- Right (1/3 width, sticky): `<PreviewPane type="bundle" scratchId={bundle?.id ?? "new"} formData={formState} />`.

### `<PreviewPane>` component

```tsx
function PreviewPane({ type, scratchId, formData }: PreviewPaneProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const debouncedData = useDebounce(formData, 300);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'pumper:preview', config: buildPreviewConfig(formData) },
      window.location.origin,
    );
  }, [debouncedData]);

  return (
    <Card>
      <iframe
        ref={iframeRef}
        src={`/app/preview/${type}/${scratchId}`}
        style={{ width: '100%', height: '500px', border: 0 }}
        sandbox="allow-scripts allow-same-origin"
      />
    </Card>
  );
}
```

### Preview HTML doc (`app.preview.$type.$id.tsx`)

Loader: Shopify session-authenticated. Validates `type ∈ {bundle, qb, mix_match}` and `id`. Returns:

```ts
{ shop: string, type: string, mockProduct: { id, title, priceCents }, initialConfig: Config }
```

For `mix_match` previews, loader fetches `collectionProducts` (top 12) for the form's `collectionId`. For `bundle`/`qb` previews, mockProduct is derived from form's first product.

Component returns minimal HTML doc:
```tsx
return (
  <html>
    <head>
      <link rel="stylesheet" href={cdnUrl('widget.css')} />
      <style>{`body{margin:0;padding:16px;font-family:system-ui;background:#fff}`}</style>
    </head>
    <body>
      <div className="pumper-preview-context">
        <h3>{mockProduct.title}</h3>
        <p>{formatPrice(mockProduct.priceCents)}</p>
      </div>
      <div className="pumper-mount" data-pumper-type={type} data-product-id={mockProduct.id} data-shop={shop} />
      <script dangerouslySetInnerHTML={{ __html: `
        window._pumperPreview = true;
        window._pumperPreviewConfig = ${JSON.stringify(initialConfig)};
        window.addEventListener('message', (e) => {
          if (e.data?.type === 'pumper:preview') {
            window._pumperPreviewConfig = e.data.config;
            window._pumperRerender?.();
          }
        });
      `}} />
      <script src={cdnUrl('widget.js')} defer />
    </body>
  </html>
);
```

### Widget code's preview branch

```ts
async function fetchConfig(shop: string): Promise<Config> {
  if ((window as any)._pumperPreview) {
    return (window as any)._pumperPreviewConfig;
  }
  const res = await fetch(`${apiBase}/config/${shop}`, { credentials: 'omit' });
  if (!res.ok) throw new Error('Config fetch failed');
  return res.json();
}
```

After `init()` completes, expose `window._pumperRerender = () => init()` so postMessage updates trigger re-render.

### Inventory in preview

Always renders `available: true` for all products. We're showing the merchant what the widget WILL look like to a customer with stock available. OOS is verified manually on the dev store.

### Token gate

`/app/preview/...` is auth-protected by Shopify session. The iframe inherits cookies via `sandbox="allow-scripts allow-same-origin"`. No additional token needed because session = sufficient gating.

---

## 8. Add-to-cart flow

### Hybrid behavior (`add-to-cart.ts`)

```ts
export async function addBundleToCart(bundleId: string, lines: CartLine[]) {
  emit('widget_click', { widgetType: 'bundle', widgetId: bundleId });

  const drawerWillOpen = new Promise<boolean>((resolve) => {
    const onCartChange = () => resolve(true);
    document.addEventListener('cart:refresh', onCartChange, { once: true });
    document.addEventListener('cart:update', onCartChange, { once: true });
    setTimeout(() => resolve(false), 800);
  });

  const res = await fetch('/cart/add.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({
      items: lines.map(l => ({
        id: l.variantId,
        quantity: l.qty,
        properties: { _pumper_bundle_id: bundleId },
      })),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err.description ?? 'Could not add to cart' };
  }

  emit('add_to_cart', { widgetType: 'bundle', widgetId: bundleId, valueCents: totalCents });

  document.dispatchEvent(new CustomEvent('cart:refresh'));
  document.dispatchEvent(new CustomEvent('cart:update'));

  if (!(await drawerWillOpen)) {
    window.location.href = '/cart';
  }

  return { ok: true };
}
```

### Per-widget specifics

| Widget | Lines added |
|---|---|
| Classic bundle | One line per `bundle.products[i]` with the configured variantId + qty |
| QB | One line: tier's qty of the configured product variant |
| Mix & Match | One line per `selectedVariantIds[i]` with qty 1 each |

All lines from the same bundle share `_pumper_bundle_id` line property → Cart Transform Function (Phase 5) merges them visually; `orders/paid` webhook (Phase 1) attributes revenue.

### Concurrent click protection

CTA disables for 1.5s after click (or until response, whichever later).

---

## 9. Analytics events

### Event types (`analytics.ts`)

```ts
type Event =
  | { type: 'widget_impression'; shop; widgetType; widgetId; productId; ts }
  | { type: 'widget_click';      shop; widgetType; widgetId; productId; tierQty?; ts }
  | { type: 'add_to_cart';       shop; widgetType; widgetId; valueCents; ts };
```

### Emit function

```ts
function emit(type: Event['type'], data: any) {
  if ((window as any)._pumperPreview) return;
  const payload = JSON.stringify({ type, shop, ...data, ts: Date.now() });
  navigator.sendBeacon?.(`${apiBase}/event`, payload) ||
    fetch(`${apiBase}/event`, { method: 'POST', body: payload, keepalive: true });
}
```

### Trigger rules

- `widget_impression`: once per mount per page load, fired when widget enters viewport (IntersectionObserver, `threshold: 0.5`).
- `widget_click`: tier select (QB), Mix & Match item toggle, bundle CTA actual click (not hover).
- `add_to_cart`: only after `/cart/add.js` 2xx success.

### `/api/storefront/event` endpoint (Phase 4 stub)

```ts
export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env;
  const body = await request.text();
  if (body.length > 4096) return new Response('Too large', { status: 413 });
  let event: any;
  try { event = JSON.parse(body); } catch { return new Response('Bad JSON', { status: 400 }); }

  // Drop silently if shop not installed
  const shop = await isInstalled(env, event.shop);
  if (!shop) return new Response(null, { status: 204 });

  // Optional Analytics Engine write (Phase 6 wires the binding fully)
  if (env.ANALYTICS) {
    env.ANALYTICS.writeDataPoint({
      blobs: [event.type, event.shop, event.widgetId ?? '', event.widgetType ?? ''],
      doubles: [event.valueCents ?? 0, event.tierQty ?? 0],
      indexes: [event.shop],
    });
  }
  return new Response(null, { status: 204 });
}
```

CORS: `*`, no credentials. `OPTIONS` returns 204.

Per-shop rate limit: 1000 events/min via Workers Rate Limiting API. Drops silently above limit.

---

## 10. Error handling & edge cases

### Widget config fetch failure
- 3-attempt exponential backoff (200ms, 600ms, 1800ms).
- All fail → mount stays empty, no skeleton freeze, `console.warn('[pumper] config unreachable')` for merchant debugging.

### Empty config (no active offers)
- Mounts cleared (`min-height` removed, no DOM noise).

### Variant selection on PDP

Listen for theme variant-change events:
- `document.addEventListener('variant:change', handler)` — Dawn 2.0+
- `MutationObserver` on `<form action>` for URL `?variant=` param changes
- `theme.PUB.publish` (older Dawn)

On variant change → re-render mount with new variant's data from `config.bundles[*].products[*]` / `config.quantityBreaks[*].productVariants[*]`. No config refetch.

### OOS rendering policy

| Widget | Rule |
|---|---|
| Bundle | Every component OOS → "hide" = mount innerHTML emptied + `min-height` cleared (DOM element retained for re-render if state changes). ≥1 component OOS → render with red OOS badge on row, disable CTA with "1 item out of stock — bundle unavailable". |
| QB | Per-tier disable. Tier row greyed with "Only N left" badge if `available === false`. Click is no-op. Other tiers remain functional. |
| Mix & Match | Greyed item, no checkmark, click no-op. If fewer-than-`targetQty` items in stock total → entire widget shows "Not enough items in stock" with disabled CTA. |

All inventory state from `config.bundles[*].products[*].available` / `config.quantityBreaks[*].productVariants[*].available` — pre-fetched by admin worker.

### Add-to-cart failures
- 422 (race condition): in-widget toast "Sorry, [item] is no longer available." Force config refetch.
- Network error: toast "Couldn't connect — please try again."
- Success but no drawer in 800ms: redirect to `/cart` per hybrid agreement.

### Multi-currency (Shopify Markets)
- Config payload prices in shop primary currency (cents).
- Widget reads `window.Shopify.currency.rate` and `.active`. Renders converted prices via `Intl.NumberFormat`.
- Discount Function handles checkout-side math via `presentmentCurrencyRate` (already wired Phase 3).

### B2B pricing
- v1: B2B prices may not match exactly (config has base prices). Phase 8: detect via `window.ShopifyAnalytics.meta.page.customerType`.

### Page Builder (GemPages, PageFly)
- `app-embed.liquid` runs site-wide → widget JS loads regardless of template.
- App Block may not be drag-droppable in page builder editors → merchant guidance Phase 8.

### Concurrent add clicks
- CTA disabled for 1.5s after click or until response.

### Mix & Match collection drift
- 60s cache TTL accepted as sync window for collection membership changes.
- New `collections/update` webhook subscription added in Phase 4 to invalidate cache (handler at `webhooks.collections-update.tsx` deletes `config:${shop}` KV key).

---

## 11. Testing

### Unit tests (Vitest, plain Node)

| File | Coverage |
|---|---|
| `match.test.ts` | `matchBundle`/`matchQb`/`matchMixMatch` against config + productId |
| `render-bundle.test.ts` | JSDOM mount; assert DOM structure, CTA, total, OOS state |
| `render-qb.test.ts` | JSDOM; click tier → re-render; CTA qty updated |
| `render-mix-match.test.ts` | JSDOM; click 3 items → CTA enables; 4th click rejected |
| `add-to-cart.test.ts` | Mock `fetch` + `dispatchEvent`; verify `_pumper_bundle_id`; verify hybrid fallback timer |
| `analytics.test.ts` | Mock `sendBeacon`; verify event shape; preview branch is no-op |
| `validate.test.ts` (extension) | Mix & Match validation rules |

### Integration tests (Vitest, plain Node, in-memory SQLite)

| File | Coverage |
|---|---|
| `api.storefront.config.test.ts` | Loader payload shape; KV cache hit/miss; CORS; un-installed → 404; rate limit |
| `api.storefront.event.test.ts` | Beacon write; oversized rejected; bad JSON rejected; un-installed dropped |
| `api.preview.test.ts` | Preview route auth gate; iframe HTML doc renders correct initial config |

### Manual gate (must pass before Phase 4 merge)

1. Install on `deepseatools.myshopify.com`, drop App Blocks via theme editor.
2. Classic bundle (2 products, 10% off) renders on PDP <200ms after page interactive, no CLS.
3. "Add bundle to cart" → modern theme drawer opens, OR `/cart` redirect works.
4. Checkout — discount applies (re-verify Phase 3 with cart-line property attached).
5. QB with 3 tiers renders, tier selection works, "MOST POPULAR" badge displays correctly.
6. Mix & Match: pick collection, targetQty=3, 20% off. Visit collection product → inline grid renders. Pick 3 → CTA enables → add → 3 lines in cart with `_pumper_bundle_id`, 20% off applied at checkout.
7. Live preview: edit a bundle, change `primaryColor` → iframe widget updates within 300ms.
8. OOS gate: zero out a variant in admin, refresh PDP within 60s → OOS row badge / disabled CTA.
9. Lighthouse on PDP: Performance ≥ 90, CLS = 0, LCP not regressed vs theme baseline.
10. Mobile (320px wide): all 3 widget types render without overflow.

### Browser support

Modern evergreen (Chrome/Edge/Firefox/Safari latest 2 versions). No polyfills.

### CI bundle-size gate

`scripts/check-bundle-size.sh`: fails if gzipped `widget.js` > 30000 bytes.

---

## 12. Out-of-scope reminder

| Feature | Phase |
|---|---|
| Cart Transform Function (visual line merging) | 5 |
| Free Gift / BOGO on QB tiers | 5 |
| Cart drawer integrations (Slide Cart, Upcart, etc.) | 8 |
| 11-language i18n locales | 8 |
| Custom CSS escape hatch | 8 |
| Web Pixel Extension | dropped (Amendment 4) |
| Bundle scheduling | CLAUDE.md §18 (deferred indefinitely) |
| ML-based recommendations | CLAUDE.md §18 |
