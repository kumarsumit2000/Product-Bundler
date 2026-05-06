# Phase 1 — Webhook Lifecycle & GDPR Compliance

**Date:** 2026-05-06
**Status:** Approved (pending user spec review)
**Depends on:** [2026-05-04-phase-0-scaffold-design.md](./2026-05-04-phase-0-scaffold-design.md), [2026-05-04-spec-amendments-group-a.md](./2026-05-04-spec-amendments-group-a.md)
**Estimated duration:** 2-3 days

---

## 1. Scope & Goal

Production-ready webhook handling for Shopify app lifecycle events. By the end of Phase 1:

- All 3 GDPR webhooks live and responding 200 within 5s.
- All webhook handlers idempotent (Shopify retries don't double-process).
- `app/uninstalled` handler fully cleans up KV sessions in addition to setting `uninstalledAt`.
- All webhook handlers HMAC-verified before any side effects via `@shopify/shopify-app-remix`'s `authenticate.webhook`.

### What Phase 0 already delivered (not redone here)

- OAuth install flow with KV-backed session storage.
- `shops` row upsert in D1 on first install.
- `app/uninstalled` webhook with HMAC verification setting `uninstalledAt`.

### What Phase 1 adds

- 3 new GDPR webhook routes (`shop/redact`, `customers/redact`, `customers/data_request`).
- Generic idempotency middleware applied to all webhook handlers.
- `app/uninstalled` polish: also delete KV session entries for the shop.
- Helper for purging all KV data tied to a shop.

### Deferred to later phases

- `orders/paid` → Phase 6 (analytics/revenue attribution).
- `inventory_levels/update` → Phase 4 (widget cache invalidation).
- Async queue dispatch for webhook processing → Phase 6 (Workers Paid plan).

---

## 2. Repo Additions

```
apps/admin/app/
├── routes/
│   ├── webhooks.app.uninstalled.tsx         # exists; polish to delete sessions + idempotency
│   ├── webhooks.shop.redact.tsx             # NEW — hard-delete shop data
│   ├── webhooks.customers.redact.tsx        # NEW — log-only no-op (no PII stored)
│   └── webhooks.customers.data-request.tsx  # NEW — log-only no-op
└── lib/webhooks/
    ├── hmac.ts                              # exists; unchanged
    ├── idempotency.ts                       # NEW — wasProcessed / markProcessed
    └── cleanup.ts                           # NEW — purgeKvForShop
└── test/
    ├── idempotency.test.ts                  # NEW — 5 tests
    ├── purge-kv-for-shop.test.ts            # NEW — 2 tests
    ├── webhooks-shop-redact.test.ts         # NEW — 4 tests
    ├── webhooks-customers-redact.test.ts    # NEW — 3 tests
    └── webhooks-customers-data-request.test.ts  # NEW — 3 tests
```

URI format matches Shopify's topic naming: `customers/data_request` topic → `/webhooks/customers/data-request` URI (Shopify uses underscore in topic, hyphen in URI).

---

## 3. Per-Handler Logic

### 3.1 `webhooks.shop.redact.tsx` — Hard delete

Shopify sends `shop/redact` 48 hours after a shop uninstalls. We must hard-delete every trace of that shop within 30 days.

```ts
import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb, schema } from "~/db.server";
import { eq } from "drizzle-orm";
import { wasProcessed, markProcessed } from "~/lib/webhooks/idempotency";
import { purgeKvForShop } from "~/lib/webhooks/cleanup";

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { topic, shop } = await authenticate.webhook(request, ctx);

  if (topic !== "SHOP_REDACT") {
    return new Response("Unexpected topic", { status: 400 });
  }

  if (await wasProcessed(ctx, request)) {
    return new Response(null, { status: 200 });
  }

  const db = getDb(ctx.cloudflare.env.DB);
  await db.delete(schema.shops).where(eq(schema.shops.id, shop));
  await purgeKvForShop(ctx.cloudflare.env.SESSIONS, shop);
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${shop}`);

  await markProcessed(ctx, request);
  return new Response(null, { status: 200 });
}
```

D1 `delete` cascades to `bundles`, `quantity_breaks`, `shop_settings`, `revenue_daily` (all have `onDelete: 'cascade'` per CLAUDE.md §5). Tables don't exist yet in Phase 1 but cascade is configured for when they do.

### 3.2 `webhooks.customers.redact.tsx` — Log-only no-op

We don't store customer PII (no orders/customers tables). Required to respond 200 within 5s for compliance.

```ts
export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { topic, shop, payload } = await authenticate.webhook(request, ctx);

  if (topic !== "CUSTOMERS_REDACT") {
    return new Response("Unexpected topic", { status: 400 });
  }

  if (await wasProcessed(ctx, request)) {
    return new Response(null, { status: 200 });
  }

  console.log(JSON.stringify({
    event: "customers_redact",
    shop,
    customerId: (payload as { customer?: { id?: number } })?.customer?.id,
  }));

  await markProcessed(ctx, request);
  return new Response(null, { status: 200 });
}
```

### 3.3 `webhooks.customers.data-request.tsx` — Log-only no-op

Same shape as `customers/redact`. Customer requesting copy of their data; we have none.

```ts
// Identical structure to customers/redact except topic check is "CUSTOMERS_DATA_REQUEST"
// and log event is "customers_data_request"
```

### 3.4 `webhooks.app.uninstalled.tsx` — Polish existing

Currently sets `uninstalledAt` and best-effort deletes one session. Add:
- Idempotency check before side effects, mark after.
- Replace single-session delete with `purgeKvForShop` (handles online + offline + multiple sessions).

```ts
export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { topic, shop } = await authenticate.webhook(request, ctx);

  if (topic !== "APP_UNINSTALLED") {
    return new Response("Unexpected topic", { status: 400 });
  }

  if (await wasProcessed(ctx, request)) {
    return new Response(null, { status: 200 });
  }

  const db = getDb(ctx.cloudflare.env.DB);
  await db
    .update(schema.shops)
    .set({ uninstalledAt: new Date() })
    .where(eq(schema.shops.id, shop));

  await purgeKvForShop(ctx.cloudflare.env.SESSIONS, shop);

  await markProcessed(ctx, request);
  return new Response(null, { status: 200 });
}
```

### 3.5 `purgeKvForShop` helper

`apps/admin/app/lib/webhooks/cleanup.ts`:

```ts
export async function purgeKvForShop(kv: KVNamespace, shop: string): Promise<void> {
  const indexList = await kv.list({ prefix: `shop-index:${shop}:` });
  await Promise.all(
    indexList.keys.map(async ({ name }) => {
      const sessionId = name.slice(`shop-index:${shop}:`.length);
      await kv.delete(`session:${sessionId}`);
      await kv.delete(name);
    }),
  );
}
```

---

## 4. Idempotency Layer

### 4.1 Implementation

`apps/admin/app/lib/webhooks/idempotency.ts`:

```ts
import type { AppLoadContext } from "~/shopify.server";

const PREFIX = "webhook-id:";
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function wasProcessed(
  ctx: AppLoadContext,
  request: Request,
): Promise<boolean> {
  const id = request.headers.get("X-Shopify-Webhook-Id");
  if (!id) return false;
  const existing = await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.get(PREFIX + id);
  return existing !== null;
}

export async function markProcessed(
  ctx: AppLoadContext,
  request: Request,
): Promise<void> {
  const id = request.headers.get("X-Shopify-Webhook-Id");
  if (!id) return;
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.put(PREFIX + id, "1", {
    expirationTtl: TTL_SECONDS,
  });
}
```

### 4.2 Storage choice

Reusing `SHOP_SETTINGS_CACHE` KV namespace (already provisioned in Phase 0). Webhook ID dedupe entries:
- Prefixed `webhook-id:` to avoid collision with widget config (`config:<shop>`).
- 7-day TTL — well under Shopify's retry window (max ~48 hours of retries).

Avoiding a new KV namespace = less infrastructure to provision and bind.

### 4.3 Order of operations: dedupe BEFORE side effects, mark AFTER

```ts
if (await wasProcessed(ctx, request)) return 200;
// ... side effects ...
await markProcessed(ctx, request);
return 200;
```

If marking happened before the side effect ran and the side effect threw, a retry would skip a real failure. Marking after means: a retry while side effect is in flight will double-process. Acceptable for Phase 1 (no-ops + idempotent deletes). For Phase 6 `orders/paid` (revenue attribution), we'll add transactional check (D1 unique constraint or compare-and-swap pattern) — note in §10/§17.3 amendments when Phase 6 starts.

### 4.4 Missing-header behavior

`X-Shopify-Webhook-Id` is always present in production. If missing, the request is either a test (`shopify webhook trigger`) or malformed. Letting them through with a warning log is safer than blocking — test webhooks should still trigger handlers during development.

### 4.5 Race condition window

KV `get` then `put` is not atomic. Two concurrent retries with the same ID both see "not processed", both run, both mark. Acceptable for Phase 1. Production retry interval is minutes, handlers complete in <1s, window is tiny in practice.

---

## 5. `shopify.app.toml` Update

Add 3 GDPR subscriptions:

```toml
[[webhooks.subscriptions]]
topics = ["app/uninstalled"]
uri = "/webhooks/app/uninstalled"

[[webhooks.subscriptions]]
topics = ["shop/redact"]
uri = "/webhooks/shop/redact"

[[webhooks.subscriptions]]
topics = ["customers/redact"]
uri = "/webhooks/customers/redact"

[[webhooks.subscriptions]]
topics = ["customers/data_request"]
uri = "/webhooks/customers/data-request"
```

Push to Partner dashboard with `shopify app deploy`. Each topic gets its own subscription block (one URI per topic) for clean separation of handler routes.

---

## 6. Testing Strategy

### 6.1 Test coverage

| Test file | Tests |
|---|---|
| `idempotency.test.ts` | 6: missing header, unseen ID, mark+check round-trip, isolation between IDs, TTL value, markProcessed no-op without header |
| `purge-kv-for-shop.test.ts` | 2: shop with multiple sessions purges all, shop with zero sessions is no-op |
| `webhooks-shop-redact.test.ts` | 4: HMAC reject (401), idempotent dedupe, D1 row deleted, KV sessions purged |
| `webhooks-customers-redact.test.ts` | 3: HMAC reject, idempotent, no side effects |
| `webhooks-customers-data-request.test.ts` | 3: HMAC reject, idempotent, no side effects |

Total Phase 1 tests: 18 new tests on top of Phase 0's 15. Phase 1 done at 33 total.

### 6.2 Test infrastructure

- **In-memory KV mock** from Phase 0 (`InMemoryKV` class) — re-export from a shared test helper file (`test/helpers/kv-mock.ts`) to avoid duplicating across tests.
- **Drizzle `:memory:` SQLite** for D1 mocking — using `better-sqlite3` driver in tests (or `@miniflare/d1` if simpler). Decided: use `drizzle-orm/better-sqlite3` for consistency with the production schema generator.
- **Pure handler functions:** route handlers factored into `handleShopRedact(ctx, shop)`, `handleCustomersRedact(ctx, shop, customerId)`, etc. — testable directly without `authenticate.webhook` runtime.

### 6.3 Manual smoke test (post-deploy)

```bash
# Trigger each webhook against production
shopify webhook trigger --topic=app/uninstalled --address=https://bundler.deepseatools.in/webhooks/app/uninstalled
shopify webhook trigger --topic=shop/redact --address=https://bundler.deepseatools.in/webhooks/shop/redact
shopify webhook trigger --topic=customers/redact --address=https://bundler.deepseatools.in/webhooks/customers/redact
shopify webhook trigger --topic=customers/data_request --address=https://bundler.deepseatools.in/webhooks/customers/data-request
```

For each: verify 200 response within 5s; verify D1/KV state matches expectation. Re-fire same webhook: verify dedupe hit (still 200, no double-processing).

---

## 7. Risks & Contingencies

### Risk 1: `authenticate.webhook` doesn't match our route paths

`@shopify/shopify-app-remix` expects topic-to-URI mapping from `shopify.app.toml`. We use `/webhooks/shop/redact` matching topic `shop/redact`. Standard Shopify convention. If broken: fallback is handle HMAC manually using existing `verifyShopifyHmac` helper from Phase 0. Probability: low.

### Risk 2: 5-second SLA exceeded under cold start

Pages Functions cold start: ~50-100ms. Handlers do 1-2 KV/D1 ops at <50ms each. Total well under 5s. Probability: very low.

### Risk 3: D1 cascade behavior under concurrent uninstall + shop/redact

If `app/uninstalled` and `shop/redact` arrive within seconds of each other: uninstalled sets `uninstalledAt`, redact deletes the row. Drizzle's `update` then `delete` on the same row are sequential operations; D1 handles them. Probability: low.

### Risk 4: `customers/redact` payload shape changes

Shopify could change payload structure. We only log it for audit; no parsing depends on shape. Probability: low.

---

## 8. Done Criteria

Every item must be true to declare Phase 1 complete:

- [ ] `shopify.app.toml` has 4 webhook subscriptions; pushed via `shopify app deploy`.
- [ ] `webhooks.shop.redact.tsx` implemented + 4 tests passing.
- [ ] `webhooks.customers.redact.tsx` implemented + 3 tests passing.
- [ ] `webhooks.customers.data-request.tsx` implemented + 3 tests passing.
- [ ] `webhooks.app.uninstalled.tsx` polished with idempotency + KV cleanup.
- [ ] `idempotency.ts` helper + 6 tests passing.
- [ ] `cleanup.ts` helper + 2 tests passing.
- [ ] `pnpm test` shows 33 tests passing (15 Phase 0 + 18 Phase 1).
- [ ] `pnpm typecheck` clean.
- [ ] Production deploy succeeds.
- [ ] Manual `shopify webhook trigger` for all 4 topics returns 200 within 5s.
- [ ] Re-firing same webhook ID returns 200 immediately (dedupe verified via Cloudflare logs).
- [ ] Phase 1 design + plan committed; tag `phase-1-complete`.

---

## 9. What Phase 1 Does NOT Include

- `orders/paid` webhook → Phase 6.
- `inventory_levels/update` webhook → Phase 4.
- Webhook idempotency for Shopify-managed-install token-exchange flow → Phase 6 (when needed; current flow uses classic OAuth).
- Async queue-based dispatch for slow handlers → Phase 6 (when Workers Paid is enabled).
- Bundle CRUD (`bundles` table doesn't exist yet — `shop/redact` cascade is configured but not exercisable until Phase 2).
