# Phase 1 — Webhook Lifecycle & GDPR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 3 GDPR webhook handlers, generic webhook idempotency, and KV cleanup helper. Polish `app/uninstalled` to fully purge sessions.

**Architecture:** Each webhook route exports a pure handler function (testable in isolation) and a thin `action` wrapper that calls `authenticate.webhook` then the pure function. Idempotency check happens before any side effect; mark as processed only after success. KV cleanup walks the `shop-index:*` entries we already maintain in `KvSessionStorage`.

**Tech Stack:** Same as Phase 0 — Remix on Cloudflare Pages, `@shopify/shopify-app-remix`, Drizzle/D1, KV, Vitest.

**Spec this plan implements:** [`docs/superpowers/specs/2026-05-06-phase-1-webhooks-design.md`](../specs/2026-05-06-phase-1-webhooks-design.md)

---

## Task 1: Extract KV mock helper for test reuse

**Files:**
- Create: `apps/admin/test/helpers/kv-mock.ts`
- Modify: `apps/admin/test/session-storage.server.test.ts`

The existing `session-storage.server.test.ts` defines `InMemoryKV` inline. We'll extract it so Phase 1 tests can reuse it.

- [ ] **Step 1: Create `apps/admin/test/helpers/kv-mock.ts`**

```ts
export class InMemoryKV {
  private store = new Map<string, { value: string; metadata?: unknown; expirationTtl?: number }>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key)?.value ?? null;
  }

  async put(
    key: string,
    value: string,
    options?: { expirationTtl?: number; metadata?: unknown },
  ): Promise<void> {
    this.store.set(key, { value, ...options });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list({ prefix }: { prefix?: string } = {}): Promise<{ keys: { name: string }[] }> {
    const all = Array.from(this.store.keys());
    const filtered = prefix ? all.filter((k) => k.startsWith(prefix)) : all;
    return { keys: filtered.map((name) => ({ name })) };
  }

  rawGet(key: string): string | null {
    return this.store.get(key)?.value ?? null;
  }

  getOptions(key: string): { expirationTtl?: number } | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    return { expirationTtl: entry.expirationTtl };
  }
}
```

- [ ] **Step 2: Update `apps/admin/test/session-storage.server.test.ts` to import the helper**

Replace the inline `class InMemoryKV { ... }` block (lines 8-32) with:
```ts
import { InMemoryKV } from "./helpers/kv-mock";
```

- [ ] **Step 3: Run all tests to verify nothing broke**

```bash
cd apps/admin
pnpm test
```

Expected: all 15 Phase 0 tests still pass.

- [ ] **Step 4: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/test/helpers/kv-mock.ts apps/admin/test/session-storage.server.test.ts
git commit -m "test(admin): extract InMemoryKV mock to shared helper"
```

---

## Task 2: Idempotency helper (TDD)

**Files:**
- Create: `apps/admin/test/idempotency.test.ts`
- Create: `apps/admin/app/lib/webhooks/idempotency.ts`

- [ ] **Step 1: Write failing tests**

`apps/admin/test/idempotency.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryKV } from "./helpers/kv-mock";
import { wasProcessed, markProcessed } from "../app/lib/webhooks/idempotency";

function makeCtx(kv: InMemoryKV) {
  return {
    cloudflare: {
      env: {
        SHOP_SETTINGS_CACHE: kv as unknown as KVNamespace,
      },
    },
  } as unknown as Parameters<typeof wasProcessed>[0];
}

function makeRequest(webhookId: string | null): Request {
  const headers = new Headers();
  if (webhookId !== null) headers.set("X-Shopify-Webhook-Id", webhookId);
  return new Request("https://example.com/webhook", { method: "POST", headers });
}

describe("idempotency", () => {
  let kv: InMemoryKV;

  beforeEach(() => {
    kv = new InMemoryKV();
  });

  it("returns false when X-Shopify-Webhook-Id header is missing", async () => {
    const result = await wasProcessed(makeCtx(kv), makeRequest(null));
    expect(result).toBe(false);
  });

  it("returns false for an unseen webhook ID", async () => {
    const result = await wasProcessed(makeCtx(kv), makeRequest("wh-abc-123"));
    expect(result).toBe(false);
  });

  it("returns true after markProcessed", async () => {
    const ctx = makeCtx(kv);
    const req = makeRequest("wh-abc-123");
    await markProcessed(ctx, req);
    const result = await wasProcessed(ctx, req);
    expect(result).toBe(true);
  });

  it("treats different webhook IDs independently", async () => {
    const ctx = makeCtx(kv);
    await markProcessed(ctx, makeRequest("wh-id-1"));
    const result = await wasProcessed(ctx, makeRequest("wh-id-2"));
    expect(result).toBe(false);
  });

  it("sets a 7-day TTL when marking", async () => {
    const ctx = makeCtx(kv);
    await markProcessed(ctx, makeRequest("wh-ttl-test"));
    const opts = kv.getOptions("webhook-id:wh-ttl-test");
    expect(opts?.expirationTtl).toBe(60 * 60 * 24 * 7);
  });

  it("markProcessed is a no-op when header is missing", async () => {
    const ctx = makeCtx(kv);
    await markProcessed(ctx, makeRequest(null));
    const all = await kv.list();
    expect(all.keys.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/admin
pnpm test idempotency
```

Expected: 6 failing tests (module doesn't exist).

- [ ] **Step 3: Implement `apps/admin/app/lib/webhooks/idempotency.ts`**

```ts
import type { AppLoadContext } from "~/shopify.server";

const PREFIX = "webhook-id:";
const TTL_SECONDS = 60 * 60 * 24 * 7;

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

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm test idempotency
```

Expected: 6 passing tests.

- [ ] **Step 5: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/lib/webhooks/idempotency.ts apps/admin/test/idempotency.test.ts
git commit -m "feat(admin): add webhook idempotency helper (TDD)"
```

---

## Task 3: purgeKvForShop helper (TDD)

**Files:**
- Create: `apps/admin/test/purge-kv-for-shop.test.ts`
- Create: `apps/admin/app/lib/webhooks/cleanup.ts`

- [ ] **Step 1: Write failing tests**

`apps/admin/test/purge-kv-for-shop.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryKV } from "./helpers/kv-mock";
import { purgeKvForShop } from "../app/lib/webhooks/cleanup";

describe("purgeKvForShop", () => {
  let kv: InMemoryKV;

  beforeEach(() => {
    kv = new InMemoryKV();
  });

  it("deletes all session and shop-index entries for a shop", async () => {
    await kv.put("session:offline_test.myshopify.com", "encrypted-blob-1");
    await kv.put("session:online_test.myshopify.com_user1", "encrypted-blob-2");
    await kv.put("shop-index:test.myshopify.com:offline_test.myshopify.com", "1");
    await kv.put("shop-index:test.myshopify.com:online_test.myshopify.com_user1", "1");
    await kv.put("session:offline_other.myshopify.com", "should-survive");
    await kv.put("shop-index:other.myshopify.com:offline_other.myshopify.com", "1");

    await purgeKvForShop(kv as unknown as KVNamespace, "test.myshopify.com");

    expect(await kv.get("session:offline_test.myshopify.com")).toBeNull();
    expect(await kv.get("session:online_test.myshopify.com_user1")).toBeNull();
    expect(await kv.get("shop-index:test.myshopify.com:offline_test.myshopify.com")).toBeNull();
    expect(await kv.get("shop-index:test.myshopify.com:online_test.myshopify.com_user1")).toBeNull();
    // Other shop's data must survive
    expect(await kv.get("session:offline_other.myshopify.com")).toBe("should-survive");
    expect(await kv.get("shop-index:other.myshopify.com:offline_other.myshopify.com")).toBe("1");
  });

  it("is a no-op when the shop has no entries", async () => {
    await kv.put("session:offline_other.myshopify.com", "untouched");
    await purgeKvForShop(kv as unknown as KVNamespace, "nonexistent.myshopify.com");
    expect(await kv.get("session:offline_other.myshopify.com")).toBe("untouched");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/admin
pnpm test purge-kv
```

Expected: 2 failing tests.

- [ ] **Step 3: Implement `apps/admin/app/lib/webhooks/cleanup.ts`**

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

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm test purge-kv
```

Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/lib/webhooks/cleanup.ts apps/admin/test/purge-kv-for-shop.test.ts
git commit -m "feat(admin): add purgeKvForShop helper for webhook cleanup (TDD)"
```

---

## Task 4: shop/redact webhook handler (TDD)

**Files:**
- Create: `apps/admin/test/webhooks-shop-redact.test.ts`
- Create: `apps/admin/app/routes/webhooks.shop.redact.tsx`

- [ ] **Step 1: Write failing tests for the pure handler**

`apps/admin/test/webhooks-shop-redact.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { InMemoryKV } from "./helpers/kv-mock";
import { handleShopRedact } from "../app/routes/webhooks.shop.redact";
import * as schema from "../drizzle/schema";

function setupDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  return { db, sqlite };
}

function makeCtx(opts: {
  db: ReturnType<typeof setupDb>["db"];
  sessions: InMemoryKV;
  cache: InMemoryKV;
}) {
  return {
    cloudflare: {
      env: {
        DB: opts.db as unknown as D1Database,
        SESSIONS: opts.sessions as unknown as KVNamespace,
        SHOP_SETTINGS_CACHE: opts.cache as unknown as KVNamespace,
      },
    },
  } as unknown as Parameters<typeof handleShopRedact>[0];
}

describe("handleShopRedact", () => {
  let setup: ReturnType<typeof setupDb>;
  let sessions: InMemoryKV;
  let cache: InMemoryKV;

  beforeEach(async () => {
    setup = setupDb();
    sessions = new InMemoryKV();
    cache = new InMemoryKV();

    // Seed a shop row
    await setup.db.insert(schema.shops).values({
      id: "test.myshopify.com",
      scopes: "read_products",
      installedAt: new Date(),
    });

    // Seed sessions
    await sessions.put("session:offline_test.myshopify.com", "blob");
    await sessions.put("shop-index:test.myshopify.com:offline_test.myshopify.com", "1");

    // Seed widget config cache
    await cache.put("config:test.myshopify.com", '{"bundles":[]}');
  });

  it("deletes the shop row from D1", async () => {
    const ctx = makeCtx({ db: setup.db, sessions, cache });
    await handleShopRedact(ctx, "test.myshopify.com");
    const rows = await setup.db.select().from(schema.shops);
    expect(rows.length).toBe(0);
  });

  it("purges all KV session entries for the shop", async () => {
    const ctx = makeCtx({ db: setup.db, sessions, cache });
    await handleShopRedact(ctx, "test.myshopify.com");
    expect(await sessions.get("session:offline_test.myshopify.com")).toBeNull();
    expect(await sessions.get("shop-index:test.myshopify.com:offline_test.myshopify.com")).toBeNull();
  });

  it("deletes the widget config cache entry", async () => {
    const ctx = makeCtx({ db: setup.db, sessions, cache });
    await handleShopRedact(ctx, "test.myshopify.com");
    expect(await cache.get("config:test.myshopify.com")).toBeNull();
  });

  it("does not affect other shops' data", async () => {
    await setup.db.insert(schema.shops).values({
      id: "other.myshopify.com",
      scopes: "read_products",
      installedAt: new Date(),
    });
    await sessions.put("session:offline_other.myshopify.com", "other-blob");
    await sessions.put("shop-index:other.myshopify.com:offline_other.myshopify.com", "1");

    const ctx = makeCtx({ db: setup.db, sessions, cache });
    await handleShopRedact(ctx, "test.myshopify.com");

    const remainingShops = await setup.db.select().from(schema.shops);
    expect(remainingShops.length).toBe(1);
    expect(remainingShops[0]!.id).toBe("other.myshopify.com");
    expect(await sessions.get("session:offline_other.myshopify.com")).toBe("other-blob");
  });
});
```

- [ ] **Step 2: Install `better-sqlite3` for D1 in-memory testing**

```bash
cd apps/admin
pnpm add -D better-sqlite3 @types/better-sqlite3
```

Expected: installs successfully.

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm test webhooks-shop-redact
```

Expected: 4 failing tests (module doesn't exist).

- [ ] **Step 4: Implement `apps/admin/app/routes/webhooks.shop.redact.tsx`**

```tsx
import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb, schema } from "~/db.server";
import { wasProcessed, markProcessed } from "~/lib/webhooks/idempotency";
import { purgeKvForShop } from "~/lib/webhooks/cleanup";

export async function handleShopRedact(
  ctx: AppLoadContext,
  shop: string,
): Promise<void> {
  const db = getDb(ctx.cloudflare.env.DB);
  await db.delete(schema.shops).where(eq(schema.shops.id, shop));
  await purgeKvForShop(ctx.cloudflare.env.SESSIONS, shop);
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${shop}`);
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { topic, shop } = await authenticate.webhook(request, ctx);

  if (topic !== "SHOP_REDACT") {
    return new Response("Unexpected topic", { status: 400 });
  }

  if (await wasProcessed(ctx, request)) {
    return new Response(null, { status: 200 });
  }

  await handleShopRedact(ctx, shop);
  await markProcessed(ctx, request);
  return new Response(null, { status: 200 });
}
```

- [ ] **Step 5: Run tests, verify pass**

```bash
pnpm test webhooks-shop-redact
```

Expected: 4 passing tests.

- [ ] **Step 6: Run typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/routes/webhooks.shop.redact.tsx apps/admin/test/webhooks-shop-redact.test.ts apps/admin/package.json pnpm-lock.yaml
git commit -m "feat(admin): add shop/redact webhook handler with hard delete (TDD)"
```

---

## Task 5: customers/redact webhook handler (TDD)

**Files:**
- Create: `apps/admin/test/webhooks-customers-redact.test.ts`
- Create: `apps/admin/app/routes/webhooks.customers.redact.tsx`

- [ ] **Step 1: Write failing tests**

`apps/admin/test/webhooks-customers-redact.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleCustomersRedact } from "../app/routes/webhooks.customers.redact";

describe("handleCustomersRedact", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("logs the redact event with shop and customerId", () => {
    handleCustomersRedact("test.myshopify.com", { customer: { id: 12345 } });
    expect(console.log).toHaveBeenCalledWith(
      JSON.stringify({ event: "customers_redact", shop: "test.myshopify.com", customerId: 12345 }),
    );
  });

  it("logs even when customerId is missing from payload", () => {
    handleCustomersRedact("test.myshopify.com", {});
    expect(console.log).toHaveBeenCalledWith(
      JSON.stringify({ event: "customers_redact", shop: "test.myshopify.com", customerId: undefined }),
    );
  });

  it("does not throw on null payload", () => {
    expect(() => handleCustomersRedact("test.myshopify.com", null)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/admin
pnpm test webhooks-customers-redact
```

Expected: 3 failing tests.

- [ ] **Step 3: Implement `apps/admin/app/routes/webhooks.customers.redact.tsx`**

```tsx
import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { wasProcessed, markProcessed } from "~/lib/webhooks/idempotency";

type CustomerRedactPayload = {
  customer?: { id?: number };
} | null;

export function handleCustomersRedact(shop: string, payload: unknown): void {
  const p = payload as CustomerRedactPayload;
  console.log(
    JSON.stringify({
      event: "customers_redact",
      shop,
      customerId: p?.customer?.id,
    }),
  );
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { topic, shop, payload } = await authenticate.webhook(request, ctx);

  if (topic !== "CUSTOMERS_REDACT") {
    return new Response("Unexpected topic", { status: 400 });
  }

  if (await wasProcessed(ctx, request)) {
    return new Response(null, { status: 200 });
  }

  handleCustomersRedact(shop, payload);
  await markProcessed(ctx, request);
  return new Response(null, { status: 200 });
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm test webhooks-customers-redact
```

Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/routes/webhooks.customers.redact.tsx apps/admin/test/webhooks-customers-redact.test.ts
git commit -m "feat(admin): add customers/redact webhook handler (log-only, TDD)"
```

---

## Task 6: customers/data-request webhook handler (TDD)

**Files:**
- Create: `apps/admin/test/webhooks-customers-data-request.test.ts`
- Create: `apps/admin/app/routes/webhooks.customers.data-request.tsx`

- [ ] **Step 1: Write failing tests**

`apps/admin/test/webhooks-customers-data-request.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleCustomersDataRequest } from "../app/routes/webhooks.customers.data-request";

describe("handleCustomersDataRequest", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("logs the data request event with shop and customerId", () => {
    handleCustomersDataRequest("test.myshopify.com", { customer: { id: 67890 } });
    expect(console.log).toHaveBeenCalledWith(
      JSON.stringify({ event: "customers_data_request", shop: "test.myshopify.com", customerId: 67890 }),
    );
  });

  it("logs even when customerId is missing", () => {
    handleCustomersDataRequest("test.myshopify.com", {});
    expect(console.log).toHaveBeenCalledWith(
      JSON.stringify({ event: "customers_data_request", shop: "test.myshopify.com", customerId: undefined }),
    );
  });

  it("does not throw on null payload", () => {
    expect(() => handleCustomersDataRequest("test.myshopify.com", null)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/admin
pnpm test webhooks-customers-data-request
```

Expected: 3 failing tests.

- [ ] **Step 3: Implement `apps/admin/app/routes/webhooks.customers.data-request.tsx`**

```tsx
import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { wasProcessed, markProcessed } from "~/lib/webhooks/idempotency";

type CustomerDataRequestPayload = {
  customer?: { id?: number };
} | null;

export function handleCustomersDataRequest(shop: string, payload: unknown): void {
  const p = payload as CustomerDataRequestPayload;
  console.log(
    JSON.stringify({
      event: "customers_data_request",
      shop,
      customerId: p?.customer?.id,
    }),
  );
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { topic, shop, payload } = await authenticate.webhook(request, ctx);

  if (topic !== "CUSTOMERS_DATA_REQUEST") {
    return new Response("Unexpected topic", { status: 400 });
  }

  if (await wasProcessed(ctx, request)) {
    return new Response(null, { status: 200 });
  }

  handleCustomersDataRequest(shop, payload);
  await markProcessed(ctx, request);
  return new Response(null, { status: 200 });
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm test webhooks-customers-data-request
```

Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/routes/webhooks.customers.data-request.tsx apps/admin/test/webhooks-customers-data-request.test.ts
git commit -m "feat(admin): add customers/data_request webhook handler (log-only, TDD)"
```

---

## Task 7: Polish app/uninstalled with idempotency + KV cleanup

**Files:**
- Modify: `apps/admin/app/routes/webhooks.app.uninstalled.tsx`

- [ ] **Step 1: Replace `apps/admin/app/routes/webhooks.app.uninstalled.tsx` content**

```tsx
import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb, schema } from "~/db.server";
import { wasProcessed, markProcessed } from "~/lib/webhooks/idempotency";
import { purgeKvForShop } from "~/lib/webhooks/cleanup";

export async function handleAppUninstalled(
  ctx: AppLoadContext,
  shop: string,
): Promise<void> {
  const db = getDb(ctx.cloudflare.env.DB);
  await db
    .update(schema.shops)
    .set({ uninstalledAt: new Date() })
    .where(eq(schema.shops.id, shop));
  await purgeKvForShop(ctx.cloudflare.env.SESSIONS, shop);
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { topic, shop } = await authenticate.webhook(request, ctx);

  if (topic !== "APP_UNINSTALLED") {
    return new Response("Unexpected topic", { status: 400 });
  }

  if (await wasProcessed(ctx, request)) {
    return new Response(null, { status: 200 });
  }

  await handleAppUninstalled(ctx, shop);
  await markProcessed(ctx, request);
  return new Response(null, { status: 200 });
}
```

- [ ] **Step 2: Run typecheck and tests**

```bash
cd apps/admin
pnpm typecheck && pnpm test
```

Expected: clean typecheck, all 32 tests pass (15 Phase 0 + 17 Phase 1).

- [ ] **Step 3: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/routes/webhooks.app.uninstalled.tsx
git commit -m "feat(admin): polish app/uninstalled with idempotency + KV session purge"
```

---

## Task 8: Update shopify.app.toml with GDPR webhook subscriptions

**Files:**
- Modify: `shopify.app.toml`

- [ ] **Step 1: Add 3 GDPR subscription blocks**

Open `shopify.app.toml`. Replace the entire `[webhooks]` section with:

```toml
[webhooks]
api_version = "2026-01"

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

- [ ] **Step 2: Push config to Partner dashboard**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
pnpm shopify app deploy --no-release --force
```

Expected: `Released a new version of your app to development.` Output mentions a new version like `product-bundler-N`.

- [ ] **Step 3: Commit**

```bash
git add shopify.app.toml
git commit -m "feat: add GDPR webhook subscriptions to Shopify app config"
```

---

## Task 9: Build, deploy, smoke test

**Files:** none (deployment + verification)

- [ ] **Step 1: Build the app**

```bash
cd apps/admin
pnpm build
```

Expected: clean build to `build/client/` and `build/server/index.js`.

- [ ] **Step 2: Deploy to Cloudflare Pages**

```bash
CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=e3dfc3a3d6ef58eb226c8eaeec1ab73f \
  pnpm exec wrangler pages deploy ./build/client \
  --project-name=bundler-admin --branch=main --commit-dirty=false
```

Expected: `✨ Deployment complete! Take a peek over at https://<id>.bundler-admin.pages.dev`.

- [ ] **Step 3: Wait for deployment to propagate (check status code)**

```bash
until curl -sI https://bundler.deepseatools.in/webhooks/shop/redact | grep -q "HTTP"; do sleep 2; done
echo "Live"
```

Expected: prints "Live" within 30s.

- [ ] **Step 4: Export Shopify API secret for smoke tests**

```bash
export SHOPIFY_API_SECRET=$(grep SHOPIFY_API_SECRET apps/admin/.dev.vars | cut -d= -f2)
```

This loads the secret from `.dev.vars` (gitignored) into the shell session. Smoke-test commands below reference `$SHOPIFY_API_SECRET`.

- [ ] **Step 5: Smoke-test app/uninstalled webhook**

```bash
shopify webhook trigger \
  --topic=app/uninstalled \
  --address=https://bundler.deepseatools.in/webhooks/app/uninstalled \
  --api-version=2026-01 \
  --delivery-method=http \
  --shared-secret="$SHOPIFY_API_SECRET"
```

Expected: `Webhook delivered successfully.` HTTP 200 response. (If your shared secret was rotated, replace with current value.)

- [ ] **Step 6: Smoke-test shop/redact webhook**

```bash
shopify webhook trigger \
  --topic=shop/redact \
  --address=https://bundler.deepseatools.in/webhooks/shop/redact \
  --api-version=2026-01 \
  --delivery-method=http \
  --shared-secret="$SHOPIFY_API_SECRET"
```

Expected: `Webhook delivered successfully.` HTTP 200.

- [ ] **Step 7: Smoke-test customers/redact webhook**

```bash
shopify webhook trigger \
  --topic=customers/redact \
  --address=https://bundler.deepseatools.in/webhooks/customers/redact \
  --api-version=2026-01 \
  --delivery-method=http \
  --shared-secret="$SHOPIFY_API_SECRET"
```

Expected: HTTP 200.

- [ ] **Step 8: Smoke-test customers/data_request webhook**

```bash
shopify webhook trigger \
  --topic=customers/data_request \
  --address=https://bundler.deepseatools.in/webhooks/customers/data-request \
  --api-version=2026-01 \
  --delivery-method=http \
  --shared-secret="$SHOPIFY_API_SECRET"
```

Expected: HTTP 200.

- [ ] **Step 9: Verify dedupe — re-fire app/uninstalled**

Same command as Step 5. Expected: HTTP 200, but server logs (via `wrangler pages deployment tail`) show the dedupe hit (handler exits early without re-processing).

- [ ] **Step 10: Tag Phase 1 complete**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git tag phase-1-complete
git push origin main --tags
```

Expected: tag pushed, GitHub repo shows `phase-1-complete` tag.

---

## Phase 1 Done Checklist

After all 9 tasks complete, every item below must be true:

- [ ] `shopify.app.toml` has 4 webhook subscriptions; pushed via `shopify app deploy`.
- [ ] `webhooks.shop.redact.tsx` implemented + 4 tests passing.
- [ ] `webhooks.customers.redact.tsx` implemented + 3 tests passing.
- [ ] `webhooks.customers.data-request.tsx` implemented + 3 tests passing.
- [ ] `webhooks.app.uninstalled.tsx` polished with idempotency + KV cleanup.
- [ ] `idempotency.ts` helper + 6 tests passing.
- [ ] `cleanup.ts` helper + 2 tests passing.
- [ ] `pnpm test` shows 33 tests passing (15 Phase 0 + 18 Phase 1 — six idempotency, two cleanup, four shop/redact, three customers/redact, three customers/data-request).
- [ ] `pnpm typecheck` clean.
- [ ] Production deploy succeeds; all 4 webhooks return 200 within 5s when triggered.
- [ ] Re-firing same webhook ID returns 200 immediately (dedupe verified).
- [ ] Phase 1 design + plan committed; tag `phase-1-complete` pushed.
