# Spec Amendments — Group A Pre-Decisions

**Date:** 2026-05-04
**Status:** Approved
**Applies to:** `CLAUDE.md` (canonical project spec)

These four decisions resolve issues that block Phase 0 of the build. They override the corresponding sections in `CLAUDE.md`. Future phase-local issues (Group B) are tracked in their respective phase design docs.

---

## Amendment 1 — Theme Scopes

**Original (CLAUDE.md §3, §4):**
```
scopes = "...,write_themes,read_themes,..."
```

**Amended:**
```
scopes = "read_products,write_products,read_orders,write_orders,write_discounts,read_discounts,read_themes,write_metaobjects,read_metaobjects,read_inventory,read_locales,read_markets"
```

`write_themes` is removed. `read_themes` is kept.

### Rationale

- **`write_themes`:** Never needed. Theme App Extensions are deployed via `shopify app deploy` and registered to Shopify's CDN, not injected into theme files. The merchant opts in via the theme editor, and Shopify writes the `settings_data.json` / `templates/product.json` entries internally. Requesting `write_themes` is a BFS review red flag.
- **`read_themes`:** Used during onboarding to auto-detect whether the merchant has (a) enabled the App Embed in their active theme and (b) added the Bundle Widget App Block to the product template. This drives the green-checkmark UX in the onboarding wizard. Read-only and well-justified.

### Implementation impact
- Update `apps/admin/wrangler.toml` `SCOPES` var.
- Update `shopify.app.toml` `[access_scopes]`.
- Onboarding wizard (Phase 1+) queries `themes` API to inspect the active theme's `settings_data.json` and `templates/product.json`.

---

## Amendment 2 — `shopifyDiscountId` Lives on `shops`

**Original (CLAUDE.md §5):**
- `bundles.shopifyDiscountId` (per-bundle column)
- `quantity_breaks.shopifyDiscountId` (per-QB column)

**Amended:**
- `shops.shopifyDiscountId` (one column, shop-scoped)
- `bundles.shopifyDiscountId` — **removed**
- `quantity_breaks.shopifyDiscountId` — **removed**

### Rationale

In the Shopify Functions discount model, the app calls `discountAutomaticAppCreate` **once per shop** to register one discount node that points to our Function. That single discount node handles every bundle and every QB for that shop. The Function reads which rules to apply from the shop metafield (`shop.pumper.config`).

Storing `shopifyDiscountId` per bundle/QB row was incorrect — every row would either hold `NULL` or a redundant copy of the same shop-wide ID.

### Implementation impact
- `apps/admin/drizzle/schema.ts`:
  ```ts
  export const shops = sqliteTable('shops', {
    // ...existing fields...
    shopifyDiscountId: text('shopify_discount_id'),  // GID of the single AppDiscountNode
  });
  ```
- Remove `shopifyDiscountId` from `bundles` and `quantityBreaks` tables.
- Discount node is created once during install (or on first bundle/QB save), ID stored on `shops`.
- Combinability nuance (do we need 2 discount nodes — one combinable, one not — to support per-bundle `combinable` boolean?) is **deferred to Phase 3 Group B**.

---

## Amendment 3 — Storefront `/config` Endpoint Security

**Original (CLAUDE.md §9):** Public CORS, KV-cached 60s, no shop validation.

**Amended:** Public CORS, KV-cached 60s, **with two added gates**:

1. **Shop installed check:** `shops` row must exist for `:shop` and `uninstalledAt IS NULL`. Return `404` otherwise. No KV write for unknown shops.
2. **Per-shop rate limit:** 1000 req/min per shop, enforced via Workers Rate Limiting API with `{ key: shop }`. Return `429` on exceed.

CORS remains `Access-Control-Allow-Origin: *` (no Origin/Referer lock-down). Origins vary across the merchant's primary domain, `*.myshopify.com`, custom domains, and App Proxy paths, and locking it down breaks legitimate traffic.

### Rationale

The data exposed in `/config` (bundle members, prices, tier discounts, free gifts) is already publicly visible on the merchant's PDP when rendered. There is no trade secret to protect. The real risks are:

- Cache poisoning / KV cost abuse via random shop names → mitigated by shop-installed check.
- DDoS-style request floods → mitigated by per-shop rate limit.

### Implementation impact
- `apps/admin/app/routes/api.storefront.config.$shop.tsx`:
  - Add shop-installed check before KV read/write.
  - Wrap with rate-limit middleware keyed on `shop`.
  - On rate-limit miss: return `429` with `Retry-After` header.
- `wrangler.toml`: add `[[unsafe.bindings]]` block for Rate Limiting API binding.

### Future-proofing
If we later add sensitive fields to the response, switch to App Proxy (Shopify HMAC-signed) or signed URLs. For v1 the data is public-rendered.

---

## Amendment 4 — Drop Web Pixel Extension; Events Fire From Widget

**Original (CLAUDE.md §2 repo structure, §12 analytics):**
- `extensions/web-pixel/` extension
- Web Pixel fires `widget_impression`, `widget_click`, `add_to_cart`

**Amended:**
- `extensions/web-pixel/` — **removed from v1 scope**
- All widget-side analytics events fire from `widget.js` via `navigator.sendBeacon('/api/storefront/event', payload)` → Worker → Analytics Engine.
- Purchase attribution remains in the `orders/paid` webhook (server-to-server).

### Rationale

Web Pixels are sandboxed — they run in a separate worker with no DOM access. They can only subscribe to Shopify's standard customer events (`product_viewed`, `cart_viewed`, `checkout_completed`, etc.). They cannot observe our widget's DOM, cannot detect impressions or clicks on it, and cannot read `window._pumperConfig`.

The two events Web Pixel could legitimately handle (`product_viewed`, `purchase`) are either:
- Not needed for v1 (`product_viewed` is a baseline metric, not core to bundle attribution), or
- Better handled server-side via webhook (`purchase` → `orders/paid` is more reliable).

Dropping Web Pixel removes one extension to maintain, deploy, and review.

### New endpoint: `/api/storefront/event`

Add to repo plan:

```
apps/admin/app/routes/api.storefront.event.tsx   # POST endpoint, accepts beacon payloads
```

Behavior:
- Method: `POST`, accepts `application/json` and `text/plain` (sendBeacon's default).
- Body: `AnalyticsEvent` (shared type from `shared/types/analytics-event.ts`).
- Validates `shop` exists in `shops` table. Drops event if not.
- Per-shop rate limit (10,000 events/min — looser than `/config` since this is high-volume).
- Writes to `env.ANALYTICS_QUEUE` (Cloudflare Queue) for async batch write to Analytics Engine.
- Returns `204 No Content` immediately (sendBeacon doesn't read response body).

### Implementation impact
- `apps/admin/app/routes/api.storefront.event.tsx` — new file.
- `extensions/theme-app-extension/assets/widget.ts` — fires events on impression (IntersectionObserver), tier select, add-to-cart click.
- Repo structure (CLAUDE.md §2): remove `extensions/web-pixel/` directory and references.
- Analytics types (`shared/types/analytics-event.ts`): unchanged shape, but `widget_impression` / `widget_click` / `add_to_cart` are now widget-emitted, `purchase` remains webhook-emitted.

---

---

## Amendment 5 — Admin App on Cloudflare Pages, Not Workers

**Original (CLAUDE.md §1, §3):** Admin app on Cloudflare Workers (`wrangler.toml` with `main = "./build/server/index.js"`).

**Amended:** Admin app on Cloudflare **Pages**.

### Rationale

The user pre-configured DNS: `bundler.deepseatools.in` is a CNAME pointing at `bundler-admin.pages.dev`. This commits us to Cloudflare Pages for the admin app. Pages supports the same bindings as Workers (D1, KV, R2, Queues, Analytics Engine, cron triggers). The Remix Cloudflare Pages adapter is mature and well-documented.

### Implementation impact

- Use `@remix-run/cloudflare-pages` adapter (not `@remix-run/cloudflare`).
- `wrangler.toml` uses Pages config keys: `pages_build_output_dir = "./build/client"` (instead of `main = "./build/server/index.js"`).
- Build output: `build/client/` (static assets) + `build/server/index.js` (becomes `_worker.js` Pages serves dynamic routes through).
- Deploy command: `wrangler pages deploy ./build/client --project-name=bundler-admin` (instead of `wrangler deploy`).
- Pages projects can have at most one queue consumer. We have one queue. Fine.
- Cron triggers and queue consumers work via `scheduled()` and `queue()` exports in the Pages Functions handler.

### Production hostnames

| Environment | Hostname |
|---|---|
| Production | `bundler.deepseatools.in` (CNAME → `bundler-admin.pages.dev`) |
| Dev tunnel | `bundler-dev.deepseatools.in` (cloudflared named tunnel → `localhost:8788`) |

---

## Amendment 6 — Drop `accessTokenEnc` from `shops`; Tokens Live Only in KV Session Storage

**Original (CLAUDE.md §5):**
```ts
export const shops = sqliteTable('shops', {
  id: text('id').primaryKey(),
  accessTokenEnc: text('access_token_enc').notNull(),
  // ...
});
```

**Amended:**
```ts
export const shops = sqliteTable('shops', {
  id: text('id').primaryKey(),
  // accessTokenEnc removed — tokens live in KV `SESSIONS`, AES-GCM encrypted
  // ...
});
```

### Rationale

`@shopify/shopify-app-remix` ships with a `SessionStorage` interface. We implement it backed by KV `SESSIONS`, with the access token field AES-GCM encrypted at rest using `DATABASE_ENCRYPTION_KEY` (32-byte hex Worker secret). The shopify-app-remix library handles token retrieval transparently for OAuth, webhooks, and Admin API calls via `shopify.unauthenticated.admin(shop)`.

Storing tokens twice (KV + D1) means:
- Two writes per OAuth round-trip.
- Two encryption keys to rotate.
- Drift risk between stores.
- Redundant encryption code paths.

The `shops` table holds only app-specific metadata: `id`, `installedAt`, `uninstalledAt`, `scopes`, `plan`, `planActivatedAt`, `trialEndsAt`, `shopifyChargeId`, `shopifyDiscountId` (Amendment 2), `currency`, `primaryLocale`, `attributedRevenueCents`. Source of truth for "is this shop installed" + app-specific metadata. Tokens are session-storage's job.

### Implementation impact

- Drop `accessTokenEnc` from `apps/admin/drizzle/schema.ts` `shops` table.
- Implement `KvSessionStorage` adapter (`apps/admin/app/session-storage.server.ts`) that satisfies the `@shopify/shopify-app-session-storage` interface. Uses KV `SESSIONS`. Encrypts the `accessToken` field of each Session with AES-GCM before write.
- Webhook handlers and cron jobs that need to call Admin API use `shopify.unauthenticated.admin(shop)` — no direct token reads from D1.

### Edge case: webhook arrives for an uninstalled shop

`shopify-app-remix` will fail to retrieve a session for an uninstalled shop (we delete the KV session on `app/uninstalled`). The webhook handler must handle the "no session" case gracefully — typically a 200 response with a logged warning, since the webhook is informational at that point.

---

## Summary of Files Changed by These Amendments

When Phase 0+ implementation begins, these CLAUDE.md sections are superseded by this document:

| CLAUDE.md section | Amendment |
|---|---|
| §1 tech stack | Admin app on Cloudflare Pages, not Workers (Amendment 5). |
| §2 repo structure | Remove `extensions/web-pixel/` (Amendment 4). Add `apps/admin/app/routes/api.storefront.event.tsx` (Amendment 4). Add `apps/admin/app/session-storage.server.ts` (Amendment 6). |
| §3 wrangler.toml | Use Pages config keys, remove `main`, add `pages_build_output_dir` (Amendment 5). Remove `write_themes` from `SCOPES` (Amendment 1). |
| §4 shopify.app.toml | Remove `write_themes` from `[access_scopes].scopes` (Amendment 1). |
| §5 schema | Move `shopifyDiscountId` from `bundles`/`quantityBreaks` to `shops` (Amendment 2). Drop `accessTokenEnc` from `shops` (Amendment 6). |
| §9 storefront config endpoint | Add shop-installed check + per-shop rate limit (Amendment 3). |
| §12 analytics pipeline | Drop Web Pixel; widget events via `sendBeacon` → `/api/storefront/event` → Queue → Analytics Engine (Amendment 4). |
| §14 deploy commands | `wrangler pages deploy` instead of `wrangler deploy` (Amendment 5). |
| §15 Phase 6 | Replace "Web Pixel Extension fires `add_to_cart`" with "widget fires events via `sendBeacon`" (Amendment 4). |

---

## Group B Issues (Deferred — Decided Per-Phase)

These do not block Phase 0. Each will be revisited when its phase begins:

- **Function combinability strategy** (Phase 3) — per-bundle `combinable` boolean may require 2 discount nodes per shop.
- **Metafield sharding** (Phase 3) — pick max N shards (e.g. 8 = 512KB) and hardcode in `input.graphql`.
- **Function instruction budget** (Phase 3) — pre-index bundles/QBs by product GID at sync time, not iteration in Function.
- **Inventory cache invalidation flooding** (Phase 4) — debounce per shop or split inventory into separate endpoint with shorter TTL.
- **Cart line attribute survival across 3rd-party drawers** (Phase 5) — test with each of the 8 supported drawers.
- **`customers/data_request` actual response** (Phase 1) — audit what PII we touch via `orders/paid` and respond with appropriate dump.
