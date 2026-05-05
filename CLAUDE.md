# Project: Bundle Pumper Clone — Shopify Bundle & Quantity Breaks App

> **AMENDMENTS NOTE:** Group A pre-decisions amend several sections of this spec. See [`docs/superpowers/specs/2026-05-04-spec-amendments-group-a.md`](docs/superpowers/specs/2026-05-04-spec-amendments-group-a.md). When the amendments doc and this file conflict, the amendments doc wins. Specifically:
>
> - **§3, §4 scopes:** `write_themes` removed (Amendment 1).
> - **§5 schema:** `shopifyDiscountId` lives on `shops`, not `bundles`/`quantity_breaks` (Amendment 2). `accessTokenEnc` removed from `shops` — tokens live in KV `SESSIONS`, AES-GCM encrypted (Amendment 6).
> - **§9 storefront config:** add shop-installed check + per-shop rate limit (Amendment 3).
> - **§12 analytics:** Web Pixel dropped; widget events fire via `sendBeacon` → `/api/storefront/event` (Amendment 4).
> - **§1, §3, §14 platform:** admin app on Cloudflare Pages, not Workers (Amendment 5).
>
> This file is the canonical spec for Claude Code. Read it fully before writing any code. Do not skip sections. When ambiguity arises, prefer the patterns in this doc over generic Shopify examples found online — those are usually for Node/Vercel deployments and we are Cloudflare-native.

---

## 0. North Star

We are cloning the feature set of **Pumper Bundles Quantity Breaks** (Shopify App Store, BFS-certified, ~2,800 reviews, $9.99–$49.99/mo tiers) and shipping a Built for Shopify-grade competitor.

**Two product surfaces:**
1. **Bundle Builder** — merchant picks 2+ products, customer sees a "buy together" widget on the PDP, all variants add to cart with a discount applied.
2. **Quantity Breaks** — same product tiered pricing (1 = $20, 2 = $18 ea, 3 = $15 ea), with optional Free Gift / BOGO at qualifying tiers.

**Constraints that drive every architectural choice:**
- 100% Cloudflare-hosted for all code we operate (Workers, D1, KV, R2, Analytics Engine, Queues, Pages).
- Shopify Functions (Discount, Cart Transform) and Theme App Extensions live in our repo but are deployed to Shopify's infrastructure via `shopify app deploy`.
- Built for Shopify (BFS) compliance from day one — no theme.liquid edits, no Draft Orders for discount logic, no Script Editor, embedded admin only, Polaris UI, Core Web Vitals not regressed.
- Storefront widget JS budget: <30KB gzipped, <200ms render, zero CLS.

---

## 1. Tech Stack (locked — do not deviate without flagging)

| Concern | Choice |
|---|---|
| Admin app framework | Remix (Vite) with `@remix-run/cloudflare` adapter |
| Admin UI | Shopify Polaris v13 + App Bridge React v4 |
| Auth | `@shopify/shopify-app-remix` (session tokens, OAuth) |
| Storefront widget | Vanilla TS compiled to single IIFE bundle, no React |
| Discount logic | Shopify Function in **Rust** (compiled to Wasm) |
| Cart merging | Shopify Cart Transform Function in **Rust** |
| Analytics on storefront | Shopify Web Pixel Extension (sandboxed) |
| Theme integration | Theme App Extension (App Embed + App Block, Liquid + TS) |
| Primary DB | Cloudflare D1 (SQLite) via Drizzle ORM |
| Sessions/tokens | Cloudflare KV |
| Analytics events | Cloudflare Analytics Engine |
| Async work | Cloudflare Queues + Cron Triggers |
| Asset hosting (widget JS/CSS) | Cloudflare R2 + Pages (CDN) |
| Per-shop rate limiting | Workers Rate Limiting API |
| Local tunnel | `cloudflared` (preferred) or `ngrok` fallback |
| Package manager | `pnpm` |
| Node version | Node 20+ for tooling only; runtime is Workers (V8) |
| TypeScript | strict mode, `noUncheckedIndexedAccess: true` |

---

## 2. Repository Structure

```
pumper-clone/
├── apps/
│   └── admin/                          # Remix app (the merchant-facing admin UI)
│       ├── app/
│       │   ├── routes/
│       │   │   ├── _index.tsx                    # redirect to /app
│       │   │   ├── auth.$.tsx                    # OAuth callback (Shopify)
│       │   │   ├── webhooks.$.tsx                # Shopify webhook handler (HMAC verify, dispatch)
│       │   │   ├── app.tsx                       # embedded admin shell (App Bridge provider, Polaris frame)
│       │   │   ├── app._index.tsx                # dashboard: revenue attribution, quick stats
│       │   │   ├── app.bundles._index.tsx        # bundle list view
│       │   │   ├── app.bundles.new.tsx           # create bundle wizard
│       │   │   ├── app.bundles.$id.tsx           # edit bundle
│       │   │   ├── app.quantity-breaks._index.tsx
│       │   │   ├── app.quantity-breaks.new.tsx
│       │   │   ├── app.quantity-breaks.$id.tsx
│       │   │   ├── app.analytics.tsx             # detailed revenue charts (queries Analytics Engine)
│       │   │   ├── app.settings.tsx              # global styling, language, integrations
│       │   │   ├── app.billing.tsx               # plan picker, billing API integration
│       │   │   └── api.storefront.config.$shop.tsx  # public-ish JSON endpoint widget calls
│       │   ├── shopify.server.ts                 # Shopify app instance, auth, billing config
│       │   ├── db.server.ts                      # Drizzle client bound to D1
│       │   ├── kv.server.ts                      # KV helpers (sessions, settings cache)
│       │   ├── analytics.server.ts               # Analytics Engine write helpers
│       │   ├── queue.server.ts                   # Queue producers
│       │   └── lib/
│       │       ├── billing.ts                    # plan definitions, usage caps
│       │       ├── webhooks/
│       │       │   ├── app-uninstalled.ts
│       │       │   ├── shop-redact.ts            # GDPR mandatory
│       │       │   ├── customers-redact.ts       # GDPR mandatory
│       │       │   ├── customers-data-request.ts # GDPR mandatory
│       │       │   ├── orders-paid.ts            # revenue attribution
│       │       │   └── inventory-levels-update.ts
│       │       └── shopify-graphql/              # generated types from Admin API schema
│       ├── drizzle/
│       │   ├── schema.ts                         # Drizzle schema (see §5)
│       │   └── migrations/                       # generated SQL migrations for D1
│       ├── public/                               # static assets served by Workers
│       ├── wrangler.toml                         # Worker config (D1, KV, R2, Queues bindings)
│       ├── vite.config.ts
│       ├── package.json
│       └── tsconfig.json
│
├── extensions/
│   ├── discount-function/                        # Shopify Function — Rust
│   │   ├── src/main.rs
│   │   ├── input.graphql                         # discount Function input query
│   │   ├── shopify.extension.toml
│   │   └── Cargo.toml
│   │
│   ├── cart-transform-function/                  # Shopify Function — Rust
│   │   ├── src/main.rs
│   │   ├── input.graphql
│   │   ├── shopify.extension.toml
│   │   └── Cargo.toml
│   │
│   ├── theme-app-extension/                      # Storefront widget
│   │   ├── blocks/
│   │   │   ├── bundle-widget.liquid              # PDP App Block
│   │   │   ├── quantity-break-widget.liquid      # PDP App Block
│   │   │   └── app-embed.liquid                  # site-wide embed (cart drawer hook)
│   │   ├── assets/
│   │   │   ├── widget.ts                         # source — compiled to widget.js
│   │   │   ├── widget.css
│   │   │   ├── cart-drawer-bridge.ts             # detects 3rd-party drawers, re-binds
│   │   │   └── tsup.config.ts                    # bundles widget.ts → widget.js (<30KB target)
│   │   ├── locales/
│   │   │   ├── en.default.json
│   │   │   ├── fr.json
│   │   │   ├── de.json
│   │   │   └── ...                               # 11 langs (matches Pumper)
│   │   └── shopify.extension.toml
│   │
│   └── web-pixel/                                # Analytics events (add_to_cart attribution)
│       ├── src/index.ts
│       └── shopify.extension.toml
│
├── shared/                                       # types shared between admin & widget
│   ├── types/
│   │   ├── bundle.ts
│   │   ├── quantity-break.ts
│   │   ├── analytics-event.ts
│   │   └── widget-config.ts
│   └── package.json
│
├── shopify.app.toml                              # app-level config (scopes, webhooks, name)
├── pnpm-workspace.yaml
├── package.json
├── README.md
└── CLAUDE.md                                     # this file
```

---

## 3. Cloudflare Bindings (apps/admin/wrangler.toml)

```toml
name = "pumper-admin"
main = "./build/server/index.js"
compatibility_date = "2026-04-01"
compatibility_flags = ["nodejs_compat"]

[vars]
SHOPIFY_APP_URL = "https://admin.pumper-clone.app"
SCOPES = "read_products,write_products,read_orders,write_orders,write_discounts,read_discounts,write_themes,read_themes,write_metaobjects,read_metaobjects,read_inventory,read_locales,read_markets"

# Secrets (set via `wrangler secret put`):
# - SHOPIFY_API_KEY
# - SHOPIFY_API_SECRET
# - SHOPIFY_WEBHOOK_SECRET   (computed; verify HMAC)
# - DATABASE_ENCRYPTION_KEY  (for tokens at rest in KV)

[[d1_databases]]
binding = "DB"
database_name = "pumper-prod"
database_id = "REPLACE_ME"

[[kv_namespaces]]
binding = "SESSIONS"
id = "REPLACE_ME"

[[kv_namespaces]]
binding = "SHOP_SETTINGS_CACHE"   # widget config cached at edge, 60s TTL
id = "REPLACE_ME"

[[r2_buckets]]
binding = "ASSETS"
bucket_name = "pumper-widget-assets"

[[queues.producers]]
binding = "ANALYTICS_QUEUE"
queue = "pumper-analytics"

[[queues.consumers]]
queue = "pumper-analytics"
max_batch_size = 100
max_batch_timeout = 30

[analytics_engine_datasets]
binding = "ANALYTICS"
dataset = "pumper_events"

[triggers]
crons = ["0 * * * *", "0 2 * * *"]   # hourly aggregation, nightly cleanup
```

---

## 4. Shopify App Config (shopify.app.toml)

```toml
name = "Pumper Clone — Bundles & Quantity Breaks"
client_id = "REPLACE_ME"
application_url = "https://admin.pumper-clone.app"
embedded = true

[access_scopes]
scopes = "read_products,write_products,read_orders,write_orders,write_discounts,read_discounts,write_themes,read_themes,write_metaobjects,read_metaobjects,read_inventory,read_locales,read_markets"

[auth]
redirect_urls = [
  "https://admin.pumper-clone.app/auth/callback",
  "https://admin.pumper-clone.app/auth/shopify/callback",
  "https://admin.pumper-clone.app/api/auth/callback"
]

[webhooks]
api_version = "2026-01"

  [[webhooks.subscriptions]]
  topics = ["app/uninstalled"]
  uri = "/webhooks/app-uninstalled"

  [[webhooks.subscriptions]]
  topics = ["shop/redact", "customers/redact", "customers/data_request"]
  uri = "/webhooks/gdpr"

  [[webhooks.subscriptions]]
  topics = ["orders/paid"]
  uri = "/webhooks/orders-paid"

  [[webhooks.subscriptions]]
  topics = ["inventory_levels/update"]
  uri = "/webhooks/inventory"

[pos]
embedded = false

[build]
automatically_update_urls_on_dev = true
dev_store_url = "REPLACE_ME.myshopify.com"
```

---

## 5. Database Schema (D1 via Drizzle)

`apps/admin/drizzle/schema.ts`:

```ts
import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// One row per installed shop
export const shops = sqliteTable('shops', {
  id: text('id').primaryKey(),                    // shop domain e.g. zipcushions.myshopify.com
  accessTokenEnc: text('access_token_enc').notNull(),  // encrypted with DATABASE_ENCRYPTION_KEY
  scopes: text('scopes').notNull(),
  installedAt: integer('installed_at', { mode: 'timestamp' }).notNull(),
  uninstalledAt: integer('uninstalled_at', { mode: 'timestamp' }),
  plan: text('plan').notNull().default('free'),   // free | starter | growth | unlimited
  planActivatedAt: integer('plan_activated_at', { mode: 'timestamp' }),
  trialEndsAt: integer('trial_ends_at', { mode: 'timestamp' }),
  shopifyChargeId: text('shopify_charge_id'),
  currency: text('currency').notNull().default('USD'),
  primaryLocale: text('primary_locale').notNull().default('en'),
  // soft cap for usage-based gating
  attributedRevenueCents: integer('attributed_revenue_cents').notNull().default(0),
});

export const bundles = sqliteTable('bundles', {
  id: text('id').primaryKey(),                    // ULID
  shopId: text('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: text('status').notNull().default('draft'),  // draft | active | paused
  // products[] = ordered list of { productId, variantId|null, qty }
  products: text('products', { mode: 'json' }).$type<BundleProduct[]>().notNull(),
  // discount config
  discountType: text('discount_type').notNull(),  // percentage | flat | fixed_total
  discountValue: real('discount_value').notNull(),
  combinable: integer('combinable', { mode: 'boolean' }).notNull().default(false),
  // placement
  triggerProductIds: text('trigger_product_ids', { mode: 'json' }).$type<string[]>().notNull(),
  // styling overrides (null = inherit from shop settings)
  styleOverrides: text('style_overrides', { mode: 'json' }).$type<StyleOverrides | null>(),
  // copy
  headline: text('headline'),
  ctaLabel: text('cta_label'),
  // shopify discount node id (created via discountAutomaticAppCreate)
  shopifyDiscountId: text('shopify_discount_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  shopIdx: index('bundles_shop_idx').on(t.shopId),
  statusIdx: index('bundles_status_idx').on(t.shopId, t.status),
}));

export const quantityBreaks = sqliteTable('quantity_breaks', {
  id: text('id').primaryKey(),
  shopId: text('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: text('status').notNull().default('draft'),
  productId: text('product_id').notNull(),        // single product OR collection
  collectionId: text('collection_id'),
  // tiers[] = [{ qty, discountType, discountValue, label, isMostPopular, freeGiftVariantId? }]
  tiers: text('tiers', { mode: 'json' }).$type<QbTier[]>().notNull(),
  combinable: integer('combinable', { mode: 'boolean' }).notNull().default(false),
  styleOverrides: text('style_overrides', { mode: 'json' }).$type<StyleOverrides | null>(),
  shopifyDiscountId: text('shopify_discount_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  shopIdx: index('qb_shop_idx').on(t.shopId),
  productIdx: index('qb_product_idx').on(t.shopId, t.productId),
}));

export const shopSettings = sqliteTable('shop_settings', {
  shopId: text('shop_id').primaryKey().references(() => shops.id, { onDelete: 'cascade' }),
  // global widget styling
  primaryColor: text('primary_color').notNull().default('#7B1E2A'),
  textColor: text('text_color').notNull().default('#1A1A1A'),
  backgroundColor: text('background_color').notNull().default('#FFFFFF'),
  borderRadius: integer('border_radius').notNull().default(8),
  fontFamily: text('font_family').notNull().default('inherit'),
  // copy
  bundleHeadline: text('bundle_headline').notNull().default('Frequently bought together'),
  qbHeadline: text('qb_headline').notNull().default('Choose your savings'),
  // toggles
  showCompareAtPrice: integer('show_compare_at_price', { mode: 'boolean' }).notNull().default(true),
  enableBOGO: integer('enable_bogo', { mode: 'boolean' }).notNull().default(true),
  // custom CSS escape hatch (sanitized server-side)
  customCss: text('custom_css'),
});

// Daily revenue rollup (one row per shop per day) — populated by cron from Analytics Engine
export const revenueDaily = sqliteTable('revenue_daily', {
  shopId: text('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),                   // YYYY-MM-DD UTC
  bundleRevenueCents: integer('bundle_revenue_cents').notNull().default(0),
  qbRevenueCents: integer('qb_revenue_cents').notNull().default(0),
  bundleOrders: integer('bundle_orders').notNull().default(0),
  qbOrders: integer('qb_orders').notNull().default(0),
}, (t) => ({
  pk: uniqueIndex('revenue_daily_pk').on(t.shopId, t.date),
}));

// Types referenced above (also lives in /shared/types)
export type BundleProduct = {
  productId: string;        // gid://shopify/Product/123
  variantId: string | null;
  qty: number;
};

export type QbTier = {
  qty: number;
  discountType: 'percentage' | 'flat' | 'fixed_per_unit';
  discountValue: number;
  label: string;            // e.g. "10% OFF"
  isMostPopular: boolean;
  freeGiftVariantId?: string;   // gid://shopify/ProductVariant/...
  bogoTargetVariantId?: string;
};

export type StyleOverrides = Partial<{
  primaryColor: string;
  textColor: string;
  backgroundColor: string;
  borderRadius: number;
}>;
```

Drizzle config in `apps/admin/drizzle.config.ts`. Run migrations via `wrangler d1 migrations apply pumper-prod`.

---

## 6. Shopify Function — Discount (Rust)

`extensions/discount-function/src/main.rs` is the **highest-risk** code in the project. It runs inside Shopify's checkout, has no network access, and a strict execution time budget. Get this right before anything else.

**Approach:**
1. Read shop's bundles & quantity breaks from a **metafield on the shop** (we sync DB → metafield via Admin API on every save). Functions cannot call our API.
2. Match cart line items against bundle/QB rules.
3. Return `discountApplicationStrategy: FIRST` with one or more `Discount` objects.

**Pseudocode:**

```rust
use shopify_function::prelude::*;
use shopify_function::Result;

#[derive(Deserialize)]
struct Config {
    bundles: Vec<BundleRule>,
    quantity_breaks: Vec<QbRule>,
}

#[derive(Deserialize)]
struct BundleRule {
    id: String,
    products: Vec<BundleProduct>,
    discount_type: String,
    discount_value: f64,
    combinable: bool,
}

#[shopify_function]
fn run(input: input::ResponseData) -> Result<output::FunctionRunResult> {
    let config: Config = serde_json::from_str(
        input.shop.metafield.as_ref().map(|m| m.value.as_str()).unwrap_or("{}")
    )?;

    let mut discounts = Vec::new();

    // Bundle matching: are all required products in cart?
    for bundle in &config.bundles {
        if let Some(targets) = match_bundle(&input.cart.lines, bundle) {
            let value = compute_bundle_discount(bundle, &targets);
            discounts.push(output::Discount {
                message: Some(format!("Bundle: {}", bundle.id)),
                targets,
                value,
            });
        }
    }

    // Quantity break matching: per-line qty hits a tier
    for qb in &config.quantity_breaks {
        for line in &input.cart.lines {
            if let Some(tier) = match_qb_tier(line, qb) {
                discounts.push(output::Discount {
                    message: Some(format!("QB: {} x{}", qb.id, tier.qty)),
                    targets: vec![target_from_line(line)],
                    value: compute_tier_value(tier),
                });
            }
        }
    }

    let strategy = if config.bundles.iter().all(|b| b.combinable)
                && config.quantity_breaks.iter().all(|q| q.combinable) {
        output::DiscountApplicationStrategy::ALL
    } else {
        output::DiscountApplicationStrategy::FIRST
    };

    Ok(output::FunctionRunResult { discounts, discount_application_strategy: strategy })
}
```

**Input GraphQL** (`input.graphql`):
```graphql
query Input {
  cart {
    lines {
      id
      quantity
      merchandise {
        ... on ProductVariant {
          id
          product { id }
        }
      }
      cost { amountPerQuantity { amount currencyCode } }
    }
  }
  shop {
    metafield(namespace: "pumper", key: "config") { value }
  }
  presentmentCurrencyRate
}
```

**Critical:** the metafield sync from D1 → Shopify is the cache invalidation problem. Every bundle save in admin must:
1. Write to D1.
2. Call `metafieldsSet` mutation on the Admin API to update `shop.pumper.config`.
3. If size exceeds 64KB metafield limit, shard across `pumper.config_1`, `pumper.config_2`, etc., and adjust Function input query.

---

## 7. Cart Transform Function (Rust)

`extensions/cart-transform-function/src/main.rs`:

Merges bundle line items into a single visual line with a parent/child relationship so the cart shows "Bundle: T-shirt + Shoes — $39.83" instead of two separate lines, while inventory is still tracked correctly.

Operations:
- `merge`: combine N line items into 1 parent line with attached children.
- `expand`: opposite (we won't use this for v1).
- `update`: modify line attributes.

The merge happens at cart-level after the customer adds bundle components together. Triggered when our Storefront API embed adds N variants in one `cartLinesAdd` mutation with a shared `_pumper_bundle_id` attribute.

---

## 8. Theme App Extension (Storefront Widget)

`extensions/theme-app-extension/blocks/bundle-widget.liquid`:

```liquid
{% comment %}
  Bundle widget — App Block, draggable into PDP via theme editor.
  Renders from window._pumperConfig (set by app-embed.liquid).
{% endcomment %}

<div
  class="pumper-bundle-mount"
  data-product-id="{{ product.id }}"
  data-product-handle="{{ product.handle }}"
  data-shop="{{ shop.permanent_domain }}"
  data-currency="{{ cart.currency.iso_code }}"
  data-locale="{{ request.locale.iso_code }}"
></div>

{% schema %}
{
  "name": "Pumper Bundle",
  "target": "section",
  "enabled_on": { "templates": ["product"] },
  "settings": [
    { "type": "checkbox", "id": "show_compare_at", "label": "Show compare-at price", "default": true },
    { "type": "color", "id": "accent", "label": "Accent color override" }
  ]
}
{% endschema %}
```

`extensions/theme-app-extension/blocks/app-embed.liquid`:

```liquid
{% comment %} App Embed — runs site-wide once. Loads widget bundle, exposes API. {% endcomment %}
<script>
  window._pumperConfig = {
    shop: "{{ shop.permanent_domain }}",
    locale: "{{ request.locale.iso_code }}",
    currency: "{{ cart.currency.iso_code }}",
    cdnUrl: "{{ 'widget.js' | asset_url }}",
    apiBase: "https://admin.pumper-clone.app/api/storefront"
  };
</script>
<script src="{{ 'widget.js' | asset_url }}" defer></script>
<link rel="stylesheet" href="{{ 'widget.css' | asset_url }}">

{% schema %}
{ "name": "Pumper App Embed", "target": "head" }
{% endschema %}
```

`extensions/theme-app-extension/assets/widget.ts` (compiled to `widget.js` via tsup, target <30KB gzipped):

```ts
type WidgetConfig = { /* fetched from /api/storefront/config/:shop */ };

class PumperWidget {
  private config: WidgetConfig | null = null;
  private cache = new Map<string, WidgetConfig>();

  async init() {
    const mounts = document.querySelectorAll<HTMLElement>('.pumper-bundle-mount, .pumper-qb-mount');
    if (!mounts.length) return;

    const shop = (window as any)._pumperConfig.shop;
    this.config = await this.fetchConfig(shop);

    mounts.forEach(el => this.render(el));
    this.observeCartDrawer();
  }

  private async fetchConfig(shop: string): Promise<WidgetConfig> {
    if (this.cache.has(shop)) return this.cache.get(shop)!;
    const apiBase = (window as any)._pumperConfig.apiBase;
    const res = await fetch(`${apiBase}/config/${shop}`, { credentials: 'omit' });
    const data = await res.json();
    this.cache.set(shop, data);
    return data;
  }

  private render(el: HTMLElement) {
    const productId = el.dataset.productId!;
    const matchingBundle = this.config!.bundles.find(b =>
      b.triggerProductIds.includes(productId)
    );
    const matchingQb = this.config!.quantityBreaks.find(q => q.productId === productId);

    if (matchingBundle) this.renderBundle(el, matchingBundle);
    if (matchingQb) this.renderQb(el, matchingQb);
  }

  private renderBundle(el: HTMLElement, bundle: any) {
    // build DOM, attach event handlers, call /cart/add.js with bundle attrs
  }

  private renderQb(el: HTMLElement, qb: any) {
    // tier selector, "MOST POPULAR" badge, free gift note, BOGO logic
  }

  private observeCartDrawer() {
    // MutationObserver pattern (you've used this before in your DPO work)
    // Detects cart drawer DOM mutations from 3rd-party apps and re-renders any QB widgets
    // that landed in the drawer (e.g., "you may also like" section).
    const obs = new MutationObserver(() => {
      document.querySelectorAll('.pumper-qb-mount:not([data-pumper-rendered])')
        .forEach(el => this.render(el as HTMLElement));
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }
}

document.addEventListener('DOMContentLoaded', () => new PumperWidget().init());
```

**Cart drawer integrations** — supported on day one (matching Pumper):
- Slide Cart, Upcart, qikify, Monster Cart, AMP Slider Cart, Opus Cart, Releasit COD, EasyCOD.
Each has a known DOM signature and re-render event. Document each in `cart-drawer-bridge.ts`.

---

## 9. Public Storefront Config Endpoint

`apps/admin/app/routes/api.storefront.config.$shop.tsx`:

```ts
import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';

export async function loader({ params, context, request }: LoaderFunctionArgs) {
  const shop = params.shop!;
  const env = context.cloudflare.env;

  // Edge cache (60s)
  const cached = await env.SHOP_SETTINGS_CACHE.get(`config:${shop}`, 'json');
  if (cached) return jsonWithCors(cached);

  const db = drizzle(env.DB);
  const [bundles, qbs, settings] = await Promise.all([
    db.select().from(bundlesTable).where(and(eq(bundlesTable.shopId, shop), eq(bundlesTable.status, 'active'))),
    db.select().from(qbTable).where(and(eq(qbTable.shopId, shop), eq(qbTable.status, 'active'))),
    db.select().from(shopSettingsTable).where(eq(shopSettingsTable.shopId, shop)).get(),
  ]);

  const payload = { bundles, quantityBreaks: qbs, settings };
  await env.SHOP_SETTINGS_CACHE.put(`config:${shop}`, JSON.stringify(payload), { expirationTtl: 60 });

  return jsonWithCors(payload);
}

function jsonWithCors(data: unknown) {
  return json(data, {
    headers: {
      'Access-Control-Allow-Origin': '*',           // public read-only
      'Cache-Control': 'public, max-age=60, s-maxage=60',
    },
  });
}
```

Cache invalidation: every bundle/QB save deletes `config:${shop}` from KV.

---

## 10. Webhooks

All webhooks land at `/webhooks/$` and are dispatched by topic. HMAC verification first, always.

```ts
// apps/admin/app/routes/webhooks.$.tsx
export async function action({ request, context, params }: ActionFunctionArgs) {
  const env = context.cloudflare.env;
  const rawBody = await request.text();
  const hmac = request.headers.get('X-Shopify-Hmac-Sha256');
  if (!await verifyHmac(rawBody, hmac, env.SHOPIFY_API_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const topic = request.headers.get('X-Shopify-Topic')!;
  const shop = request.headers.get('X-Shopify-Shop-Domain')!;
  const payload = JSON.parse(rawBody);

  // Hand off to Queue for async processing — return 200 fast
  await env.ANALYTICS_QUEUE.send({ topic, shop, payload });
  return new Response('OK', { status: 200 });
}
```

Queue consumer dispatches by topic:
- `app/uninstalled` → soft delete shop, schedule data purge in 30 days
- `shop/redact` → hard delete all data for shop (GDPR, 48h SLA)
- `customers/redact` → no-op (we don't store customer PII) but must respond 200
- `customers/data_request` → no-op (same reason), respond 200
- `orders/paid` → parse `discount_applications`, attribute revenue to bundle/QB if matched, write to Analytics Engine + update `shops.attributedRevenueCents`
- `inventory_levels/update` → invalidate `config:${shop}` KV cache so widget re-fetches stock state

---

## 11. Billing

`apps/admin/app/lib/billing.ts`:

```ts
export const PLANS = {
  free:      { name: 'Free',      revenueCapCents: 30_000,  priceCents: 0 },
  starter:   { name: 'Starter',   revenueCapCents: 100_000, priceCents: 999,  trialDays: 14 },
  growth:    { name: 'Growth',    revenueCapCents: 500_000, priceCents: 2999, trialDays: 14 },
  unlimited: { name: 'Unlimited', revenueCapCents: null,    priceCents: 4999, trialDays: 14 },
} as const;
```

Use Shopify's GraphQL `appSubscriptionCreate` mutation. Confirmation URL → merchant approves → webhook returns charge ID → store on `shops.shopifyChargeId`.

When `attributedRevenueCents` exceeds plan cap, show a Polaris banner in admin prompting upgrade. Do **not** disable the widget — that would break merchants' stores. Instead, gate new bundle creation.

---

## 12. Analytics Pipeline

Three event types written to Analytics Engine from the storefront (via Web Pixel) and from `orders/paid` webhook:

```ts
// shared/types/analytics-event.ts
export type AnalyticsEvent =
  | { type: 'widget_impression'; shop: string; productId: string; widgetType: 'bundle' | 'qb'; widgetId: string; ts: number }
  | { type: 'widget_click';      shop: string; productId: string; widgetType: 'bundle' | 'qb'; widgetId: string; tierQty?: number; ts: number }
  | { type: 'add_to_cart';       shop: string; widgetId: string; widgetType: 'bundle' | 'qb'; valueCents: number; ts: number }
  | { type: 'purchase';          shop: string; orderId: string; widgetId: string; widgetType: 'bundle' | 'qb'; valueCents: number; ts: number };
```

Write to Analytics Engine:
```ts
env.ANALYTICS.writeDataPoint({
  blobs: [event.type, event.shop, event.widgetId, event.widgetType],
  doubles: [event.valueCents ?? 0],
  indexes: [event.shop],
});
```

Hourly cron aggregates from Analytics Engine SQL API → writes to `revenueDaily` table for fast admin dashboard queries.

---

## 13. Admin UI Pages (Polaris)

Each route follows this pattern:

```tsx
import { Page, Card, BlockStack, Layout } from '@shopify/polaris';
import { authenticate } from '~/shopify.server';

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  // fetch shop's bundles from D1
  return json({ bundles: await db.select()... });
}

export default function BundlesIndex() {
  const { bundles } = useLoaderData<typeof loader>();
  return (
    <Page
      title="Bundles"
      primaryAction={{ content: 'Create bundle', url: '/app/bundles/new' }}
    >
      <Layout>
        <Layout.Section>
          {bundles.length === 0 ? <EmptyState /> : <BundleList bundles={bundles} />}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

**Required pages (UX detail in §13.x):**
- 13.1 Dashboard — KPIs (revenue last 30d, top bundles, conversion rate)
- 13.2 Bundle list — search, filter by status, bulk pause/activate
- 13.3 Bundle create/edit — 3-step wizard (products → discount → placement & style)
- 13.4 QB list — same patterns
- 13.5 QB create/edit — tier builder with "MOST POPULAR" toggle, BOGO/free gift slot per tier
- 13.6 Analytics — Recharts/Polaris Viz for revenue trends, per-bundle breakdown
- 13.7 Settings — global styling, language, integrations
- 13.8 Billing — current plan, usage bar, upgrade CTA

Use `@shopify/app-bridge-react` for navigation, toast, modals. Never use raw `<a href>` for cross-page nav inside the embedded admin.

---

## 14. Build / Dev / Deploy

**Local dev:**
```bash
pnpm install
pnpm --filter admin db:migrate                 # apply D1 migrations to local SQLite
cloudflared tunnel --url http://localhost:8788  # get a stable HTTPS tunnel
pnpm dev                                        # runs `shopify app dev` + `wrangler dev` in parallel
```

**Build:**
```bash
pnpm --filter admin build                       # Remix → Worker bundle
pnpm --filter discount-function build           # cargo build --release --target wasm32-wasip1
pnpm --filter cart-transform-function build
pnpm --filter theme-app-extension build         # tsup bundles widget.ts
```

**Deploy:**
```bash
shopify app deploy                              # uploads Functions + Theme App Extension to Shopify
wrangler deploy --env production                # deploys admin Worker
wrangler d1 migrations apply pumper-prod --remote
```

CI/CD: GitHub Actions runs both on push to `main`. See §16.

---

## 15. Phased Build Plan

Build in this order. Do not skip ahead — each phase produces a testable deliverable.

**Phase 0 — Scaffold (1-2 days)**
- Initialize monorepo with pnpm workspaces
- `npm init @shopify/app@latest` then port to Cloudflare Workers
- Verify "Hello World" admin route loads inside Shopify admin iframe
- Set up D1, KV, R2, Queues bindings; run a no-op migration; confirm wrangler deploy works

**Phase 1 — Auth & Shop Lifecycle (3-4 days)**
- OAuth install flow, store shop + encrypted token in D1
- `app/uninstalled` webhook with HMAC verify
- All four GDPR webhooks responding 200
- Shop session retrieval helper

**Phase 2 — Bundle CRUD Admin (1 week)**
- D1 schema + Drizzle migrations
- Polaris-based bundle list, create wizard, edit form
- Product picker using App Bridge `ResourcePicker`
- Save → write to D1, sync to shop metafield via Admin API

**Phase 3 — Discount Function (1-2 weeks, highest risk)**
- Rust function reading shop metafield config
- Bundle matching logic, percentage/flat/fixed_total math
- Quantity break tier matching
- Local Function testing with `shopify app function run`
- Deploy to dev store, test end-to-end checkout

**Phase 4 — Storefront Widget (1-2 weeks)**
- Theme App Extension scaffolding
- App Embed loads widget on all pages
- App Block renders on PDP
- `widget.ts` bundles to <30KB, fetches `/api/storefront/config/:shop`
- Bundle widget UI: thumbnails, total, "Add all to cart"
- QB widget UI: tier selector, MOST POPULAR badge

**Phase 5 — Cart Transform + Free Gift / BOGO (1 week)**
- Cart Transform Function merges bundle lines visually
- QB tier with `freeGiftVariantId` adds $0 line via Cart Transform
- BOGO logic in Function

**Phase 6 — Analytics (1 week)**
- Web Pixel Extension fires `add_to_cart` with bundle attribution
- `orders/paid` webhook attributes revenue
- Analytics Engine writes
- Hourly cron aggregates to `revenueDaily`
- Dashboard charts in admin

**Phase 7 — Billing (3-4 days)**
- 4 plan tiers wired to `appSubscriptionCreate`
- Usage tracking against `attributedRevenueCents`
- Upgrade prompts at 80%/100% of cap

**Phase 8 — Polish for BFS (1-2 weeks)**
- Cart drawer integrations (Slide Cart, Upcart, qikify, etc.)
- Page builder integrations (GemPages, PageFly)
- 11 language translations
- Accessibility audit (you know this drill — WCAG 2.1 AA)
- Lighthouse run on test store, ensure no CLS, LCP not regressed
- Polaris design review
- Privacy policy, support page, listing copy/screenshots

**Phase 9 — Submit to BFS (1 week of back-and-forth)**
- Initial review usually catches 3-5 issues; fix and resubmit
- Once approved, can use "Built for Shopify" badge in listing

**Total realistic timeline: 8-12 weeks for one experienced dev (you).**

---

## 16. CI/CD (.github/workflows/deploy.yml)

```yaml
name: Deploy
on:
  push: { branches: [main] }
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - uses: dtolnay/rust-toolchain@stable
        with: { targets: wasm32-wasip1 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
      - run: pnpm build
      - name: Deploy Shopify extensions
        env: { SHOPIFY_CLI_PARTNERS_TOKEN: ${{ secrets.SHOPIFY_PARTNERS_TOKEN }} }
        run: pnpm shopify app deploy --force
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          workingDirectory: apps/admin
          command: deploy --env production
      - name: Apply D1 migrations
        env: { CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }} }
        run: cd apps/admin && pnpm wrangler d1 migrations apply pumper-prod --remote
```

---

## 17. Things Claude Code Must Get Right

These are the failure modes I'm most worried about. Treat them as hard constraints:

1. **Never touch `theme.liquid` or any theme file directly.** All storefront integration is via Theme App Extension blocks. Period.
2. **HMAC verify every webhook before parsing the body.** Shopify will send unsigned probes during BFS review.
3. **Idempotent webhook handlers.** Shopify retries on non-2xx and sometimes on 2xx. Use `X-Shopify-Webhook-Id` as a dedupe key in KV with 7-day TTL.
4. **Never block on 3rd-party API calls inside Shopify Functions.** Functions have no network. Period.
5. **Encrypt access tokens at rest in D1.** Use AES-GCM with `DATABASE_ENCRYPTION_KEY` from Worker secrets. Never log them.
6. **Sanitize `customCss`** before serving — strip `@import`, `expression()`, `javascript:` URLs, and `behavior:` (IE legacy but reviewers test for it).
7. **Storefront API endpoint must work without authentication** but rate-limit per shop (1000 req/min) using Workers Rate Limiting API.
8. **Widget JS must defer-load** (`<script defer>`), no document.write, no synchronous XHR.
9. **CLS = 0.** Reserve widget space with min-height before content loads, use skeleton states.
10. **No `document.write`. No global namespace pollution beyond `window._pumper`.**
11. **Test on B2B and Markets stores** before submitting to BFS — these have currency conversion edge cases that break naive discount math.
12. **Inventory awareness** — when a bundle component is OOS, hide the bundle in widget AND make Function return no discount (don't let customer add OOS items to cart).

---

## 18. Out of Scope for v1 (defer)

- Bundle scheduling (start/end dates)
- A/B testing of widget variants
- Subscription bundles (Recharge integration)
- Bundle recommendations via ML (Phase 2 differentiation)
- POS support
- Multi-currency manual overrides (we rely on Shopify Markets auto-conversion)

---

## 19. Reference Docs to Read First

Before writing any code, Claude Code should read:
- shopify.dev/docs/apps/build/discounts/build-discount-function
- shopify.dev/docs/apps/build/product-merchandising/bundles/cart-transform
- shopify.dev/docs/apps/build/online-store/theme-app-extensions
- shopify.dev/docs/api/shopify-app-remix
- developers.cloudflare.com/d1/
- developers.cloudflare.com/workers/runtime-apis/bindings/analytics-engine/
- remix.run/docs/en/main/guides/vite (Cloudflare adapter)

---

## 20. Definition of Done for v1

- Merchant installs app, walks through onboarding in <5 min
- Creates a 2-product bundle with 20% off
- Widget appears on PDP, customer adds bundle, discount applies at checkout
- Order completes, revenue attribution shows on dashboard within 5 min
- Merchant can create a quantity break with 3 tiers and a free gift on tier 3
- All 11 languages render correctly
- Lighthouse PDP score on test theme: Performance ≥90, no CLS regression vs baseline
- All BFS automated checks pass in Partners dashboard
- GDPR webhooks return 200 within 5s in load test (100 RPS)
- Listing copy, 3 screenshots, demo video uploaded to Partner dashboard
