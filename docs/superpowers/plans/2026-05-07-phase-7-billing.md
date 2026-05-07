# Phase 7: Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 4-tier billing (free/$0, starter/$19, growth/$49, unlimited/$99) with monthly order caps, $0.05/order overage on paid plans, 7-day trial, and a 50-order lifetime gate on the free plan that blocks *new* bundle/QB creation only.

**Architecture:** Plan state lives in `shops` table (3 new columns). Source of truth for plan changes is the `app_subscriptions/update` webhook. Order-counter increments happen in `orders/paid` after revenue attribution; lazy 30-day reset on read; overage submission via `appUsageRecordCreate` with `ctx.waitUntil()` to stay under Shopify's webhook SLA. UI uses Polaris (`InlineGrid` for plan cards, `Banner` for usage warnings, `EmptyState` for the free-tier gate).

**Tech Stack:** Remix (Cloudflare adapter), Drizzle ORM over D1, Polaris v13, App Bridge React v4, Shopify Admin GraphQL Admin API (`appSubscriptionCreate` / `appSubscriptionCancel` / `appUsageRecordCreate`), vitest with in-memory better-sqlite3.

**Reference docs:**
- shopify.dev/docs/api/admin-graphql/latest/mutations/appSubscriptionCreate
- shopify.dev/docs/api/admin-graphql/latest/mutations/appUsageRecordCreate
- shopify.dev/docs/apps/billing/subscriptions/usage-charges
- Phase 7 design spec: [docs/superpowers/specs/2026-05-07-phase-7-billing-design.md](../specs/2026-05-07-phase-7-billing-design.md)

**Codebase patterns to follow:**
- Webhook handlers: HMAC verify via `authenticate.webhook(request, ctx)` → idempotency check via `wasProcessed/markProcessed` → handler logic → `markProcessed` → 200 response. See [apps/admin/app/routes/webhooks.app.uninstalled.tsx](../../../apps/admin/app/routes/webhooks.app.uninstalled.tsx).
- DB tests: `Database(":memory:")` + `drizzle()` + `migrate()` against `./drizzle/migrations`. See [apps/admin/test/webhooks-orders-paid.test.ts](../../../apps/admin/test/webhooks-orders-paid.test.ts).
- KV mock: `InMemoryKV` from [apps/admin/test/helpers/kv-mock.ts](../../../apps/admin/test/helpers/kv-mock.ts).
- Loader patterns with onConflictDoUpdate for shop upsert: [apps/admin/app/routes/app._index.tsx:40-50](../../../apps/admin/app/routes/app._index.tsx).

---

## File Structure

**New files:**
| Path | Responsibility |
|---|---|
| `apps/admin/drizzle/migrations/0005_phase_7_billing.sql` | ALTER TABLE shops: 3 new columns |
| `apps/admin/app/lib/billing/plans.ts` | `PLANS` constant, `getPlan`, `isPaidPlan` |
| `apps/admin/app/lib/billing/usage.ts` | `getUsage`, `incrementOrderCount`, `lazyResetIfDue` |
| `apps/admin/app/lib/billing/subscription.ts` | `createSubscription`, `cancelSubscription`, `submitOverageCharge` |
| `apps/admin/app/lib/billing/gating.ts` | `canCreateNew(usage)` |
| `apps/admin/app/components/UsageBanner.tsx` | Polaris Banner with 80%/100% logic |
| `apps/admin/app/routes/app.billing.tsx` | Plan picker page (loader/action/render) |
| `apps/admin/app/routes/app.billing.callback.tsx` | Post-approval redirect handler |
| `apps/admin/app/routes/webhooks.app-subscriptions.update.tsx` | Subscription status webhook |
| `apps/admin/test/billing-plans.test.ts` | Unit tests for plans.ts |
| `apps/admin/test/billing-usage.test.ts` | Unit tests for usage.ts |
| `apps/admin/test/billing-gating.test.ts` | Unit tests for gating.ts |
| `apps/admin/test/billing-subscription.test.ts` | Unit tests for subscription.ts (mocked admin) |
| `apps/admin/test/webhooks-app-subscriptions-update.test.ts` | Webhook handler tests |

**Modified files:**
| Path | Change |
|---|---|
| `apps/admin/drizzle/schema.ts` | Add 3 columns to `shops` table |
| `apps/admin/app/routes/webhooks.orders.paid.tsx` | Call `incrementOrderCount` + maybe `submitOverageCharge` |
| `apps/admin/test/webhooks-orders-paid.test.ts` | New assertions for counter + overage |
| `apps/admin/app/routes/app._index.tsx` | Mount `UsageBanner` |
| `apps/admin/app/routes/app.bundles._index.tsx` | Mount `UsageBanner` |
| `apps/admin/app/routes/app.quantity-breaks._index.tsx` | Mount `UsageBanner` |
| `apps/admin/app/routes/app.bundles.new.tsx` | Gate via `canCreateNew` in action + render |
| `apps/admin/app/routes/app.quantity-breaks.new.tsx` | Same gate |
| `apps/admin/app/routes/app.tsx` | Add Billing NavMenu link |
| `shopify.app.toml` | Add `app_subscriptions/update` subscription |

---

## Task 1: Schema migration — add billing columns to shops

**Files:**
- Create: `apps/admin/drizzle/migrations/0005_phase_7_billing.sql`
- Modify: `apps/admin/drizzle/schema.ts`

- [ ] **Step 1: Write the migration SQL**

Create `apps/admin/drizzle/migrations/0005_phase_7_billing.sql`:
```sql
ALTER TABLE `shops` ADD `monthly_order_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `shops` ADD `lifetime_order_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `shops` ADD `monthly_order_reset_at` integer;
```

- [ ] **Step 2: Add columns to Drizzle schema**

In `apps/admin/drizzle/schema.ts`, add after the existing `attributedRevenueCents` line in the `shops` table definition (around line 18):
```ts
  monthlyOrderCount: integer("monthly_order_count").notNull().default(0),
  lifetimeOrderCount: integer("lifetime_order_count").notNull().default(0),
  monthlyOrderResetAt: integer("monthly_order_reset_at", { mode: "timestamp" }),
```

- [ ] **Step 3: Verify migrations run cleanly via vitest setup**

Run: `cd apps/admin && pnpm vitest run test/idempotency.test.ts`
Expected: PASS — confirms `migrate()` against `./drizzle/migrations` succeeds with the new file.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/drizzle/migrations/0005_phase_7_billing.sql apps/admin/drizzle/schema.ts
git commit -m "feat(billing): add order-counter columns to shops"
```

---

## Task 2: plans.ts — plan definitions

**Files:**
- Create: `apps/admin/app/lib/billing/plans.ts`
- Test: `apps/admin/test/billing-plans.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/test/billing-plans.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { PLANS, getPlan, isPaidPlan } from "../app/lib/billing/plans";

describe("PLANS", () => {
  it("has 4 tiers with correct prices in cents", () => {
    expect(PLANS.free.priceCents).toBe(0);
    expect(PLANS.starter.priceCents).toBe(1900);
    expect(PLANS.growth.priceCents).toBe(4900);
    expect(PLANS.unlimited.priceCents).toBe(9900);
  });

  it("has correct order caps", () => {
    expect(PLANS.free.orderCap).toBe(50);
    expect(PLANS.starter.orderCap).toBe(300);
    expect(PLANS.growth.orderCap).toBe(1000);
    expect(PLANS.unlimited.orderCap).toBe(3000);
  });

  it("free plan uses lifetime cap; paid plans do not", () => {
    expect(PLANS.free.isLifetimeCap).toBe(true);
    expect(PLANS.starter.isLifetimeCap).toBe(false);
    expect(PLANS.growth.isLifetimeCap).toBe(false);
    expect(PLANS.unlimited.isLifetimeCap).toBe(false);
  });

  it("paid plans charge $0.05 per order overage; free plan zero", () => {
    expect(PLANS.free.overageCents).toBe(0);
    expect(PLANS.starter.overageCents).toBe(5);
    expect(PLANS.growth.overageCents).toBe(5);
    expect(PLANS.unlimited.overageCents).toBe(5);
  });

  it("paid plans give 7-day trial; free is 0", () => {
    expect(PLANS.free.trialDays).toBe(0);
    expect(PLANS.starter.trialDays).toBe(7);
    expect(PLANS.growth.trialDays).toBe(7);
    expect(PLANS.unlimited.trialDays).toBe(7);
  });
});

describe("getPlan", () => {
  it("returns the plan for a valid id", () => {
    expect(getPlan("starter").name).toBe("Starter");
  });
  it("throws on invalid id", () => {
    expect(() => getPlan("nonsense")).toThrow();
  });
});

describe("isPaidPlan", () => {
  it("returns false for free, true for paid tiers", () => {
    expect(isPaidPlan("free")).toBe(false);
    expect(isPaidPlan("starter")).toBe(true);
    expect(isPaidPlan("growth")).toBe(true);
    expect(isPaidPlan("unlimited")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/admin && pnpm vitest run test/billing-plans.test.ts`
Expected: FAIL with "Failed to resolve import" or similar.

- [ ] **Step 3: Implement plans.ts**

Create `apps/admin/app/lib/billing/plans.ts`:
```ts
export type PlanId = "free" | "starter" | "growth" | "unlimited";

export type Plan = {
  id: PlanId;
  name: string;
  priceCents: number;
  orderCap: number;
  isLifetimeCap: boolean;
  overageCents: number;
  trialDays: number;
};

export const PLANS: Record<PlanId, Plan> = {
  free:      { id: "free",      name: "Free",      priceCents: 0,    orderCap: 50,   isLifetimeCap: true,  overageCents: 0, trialDays: 0 },
  starter:   { id: "starter",   name: "Starter",   priceCents: 1900, orderCap: 300,  isLifetimeCap: false, overageCents: 5, trialDays: 7 },
  growth:    { id: "growth",    name: "Growth",    priceCents: 4900, orderCap: 1000, isLifetimeCap: false, overageCents: 5, trialDays: 7 },
  unlimited: { id: "unlimited", name: "Unlimited", priceCents: 9900, orderCap: 3000, isLifetimeCap: false, overageCents: 5, trialDays: 7 },
};

const VALID_IDS: ReadonlySet<string> = new Set(Object.keys(PLANS));

export function getPlan(id: string): Plan {
  if (!VALID_IDS.has(id)) {
    throw new Error(`Unknown plan id: ${id}`);
  }
  return PLANS[id as PlanId];
}

export function isPaidPlan(id: PlanId): boolean {
  return id !== "free";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/admin && pnpm vitest run test/billing-plans.test.ts`
Expected: PASS, all assertions green.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/lib/billing/plans.ts apps/admin/test/billing-plans.test.ts
git commit -m "feat(billing): add PLANS constant + getPlan/isPaidPlan"
```

---

## Task 3: usage.ts — `lazyResetIfDue`

**Files:**
- Create: `apps/admin/app/lib/billing/usage.ts`
- Test: `apps/admin/test/billing-usage.test.ts`

- [ ] **Step 1: Write the failing test (lazyResetIfDue only)**

Create `apps/admin/test/billing-usage.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import Database from "better-sqlite3";
import * as schema from "../drizzle/schema";
import { lazyResetIfDue } from "../app/lib/billing/usage";

const SHOP = "s.myshopify.com";

function setup() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  return { db, sqlite };
}

function insertShop(db: ReturnType<typeof setup>["db"], overrides: Partial<typeof schema.shops.$inferInsert> = {}) {
  db.insert(schema.shops).values({
    id: SHOP,
    scopes: "",
    installedAt: new Date(),
    plan: "starter",
    monthlyOrderCount: 100,
    lifetimeOrderCount: 100,
    monthlyOrderResetAt: new Date("2026-06-01T00:00:00Z"),
    ...overrides,
  }).run();
}

describe("lazyResetIfDue", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => { s = setup(); });

  it("no-op when monthlyOrderResetAt is in the future", async () => {
    insertShop(s.db);
    const now = new Date("2026-05-15T00:00:00Z"); // before resetAt
    const reset = await lazyResetIfDue(s.db, SHOP, now);
    expect(reset).toBe(false);
    const row = s.db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)).get();
    expect(row!.monthlyOrderCount).toBe(100);
    expect(row!.monthlyOrderResetAt!.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("advances by exactly 30d, zeroes monthlyOrderCount, leaves lifetime alone", async () => {
    insertShop(s.db);
    const now = new Date("2026-06-02T00:00:00Z"); // 1 day past reset
    const reset = await lazyResetIfDue(s.db, SHOP, now);
    expect(reset).toBe(true);
    const row = s.db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)).get();
    expect(row!.monthlyOrderCount).toBe(0);
    expect(row!.lifetimeOrderCount).toBe(100); // untouched
    expect(row!.monthlyOrderResetAt!.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("advances multiple cycles in one shot when shop dormant 90+ days", async () => {
    insertShop(s.db);
    const now = new Date("2026-09-15T00:00:00Z"); // ~3.5 cycles past 2026-06-01
    const reset = await lazyResetIfDue(s.db, SHOP, now);
    expect(reset).toBe(true);
    const row = s.db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)).get();
    expect(row!.monthlyOrderCount).toBe(0);
    // 2026-06-01 + 4*30d = 2026-09-29
    expect(row!.monthlyOrderResetAt!.toISOString()).toBe("2026-09-29T00:00:00.000Z");
  });

  it("no-op when monthlyOrderResetAt is null (free plan)", async () => {
    insertShop(s.db, { plan: "free", monthlyOrderResetAt: null });
    const now = new Date("2026-06-02T00:00:00Z");
    const reset = await lazyResetIfDue(s.db, SHOP, now);
    expect(reset).toBe(false);
    const row = s.db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)).get();
    expect(row!.monthlyOrderCount).toBe(100); // untouched
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/admin && pnpm vitest run test/billing-usage.test.ts`
Expected: FAIL with "Failed to resolve import" for `lazyResetIfDue`.

- [ ] **Step 3: Implement lazyResetIfDue**

Create `apps/admin/app/lib/billing/usage.ts`:
```ts
import { eq } from "drizzle-orm";
import type { DB } from "~/db.server";
import { schema } from "~/db.server";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function lazyResetIfDue(db: DB, shop: string, now: Date): Promise<boolean> {
  const row = (await db.select().from(schema.shops).where(eq(schema.shops.id, shop)).limit(1))[0];
  if (!row || !row.monthlyOrderResetAt) return false;
  if (row.monthlyOrderResetAt.getTime() > now.getTime()) return false;

  // Advance by 30d increments until > now (handles dormant shops crossing multiple cycles)
  let nextReset = row.monthlyOrderResetAt.getTime();
  while (nextReset <= now.getTime()) {
    nextReset += THIRTY_DAYS_MS;
  }

  await db
    .update(schema.shops)
    .set({ monthlyOrderCount: 0, monthlyOrderResetAt: new Date(nextReset) })
    .where(eq(schema.shops.id, shop));
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/admin && pnpm vitest run test/billing-usage.test.ts`
Expected: PASS — 4 assertions green.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/lib/billing/usage.ts apps/admin/test/billing-usage.test.ts
git commit -m "feat(billing): add lazyResetIfDue with 30d cycle advance"
```

---

## Task 4: usage.ts — `incrementOrderCount`

**Files:**
- Modify: `apps/admin/app/lib/billing/usage.ts`
- Modify: `apps/admin/test/billing-usage.test.ts`

- [ ] **Step 1: Append failing tests for incrementOrderCount**

Append to `apps/admin/test/billing-usage.test.ts`:
```ts
import { incrementOrderCount } from "../app/lib/billing/usage";

describe("incrementOrderCount", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => { s = setup(); });

  it("increments both counters on free plan; never returns overage", async () => {
    s.db.insert(schema.shops).values({
      id: SHOP, scopes: "", installedAt: new Date(),
      plan: "free", monthlyOrderCount: 0, lifetimeOrderCount: 49, monthlyOrderResetAt: null,
    }).run();
    const result = await incrementOrderCount(s.db, SHOP);
    expect(result.overageOrders).toBe(0);
    expect(result.isOverFreeCap).toBe(false);
    const row = s.db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)).get();
    expect(row!.monthlyOrderCount).toBe(1);
    expect(row!.lifetimeOrderCount).toBe(50);
  });

  it("returns isOverFreeCap=true when free shop crosses 50", async () => {
    s.db.insert(schema.shops).values({
      id: SHOP, scopes: "", installedAt: new Date(),
      plan: "free", monthlyOrderCount: 0, lifetimeOrderCount: 50, monthlyOrderResetAt: null,
    }).run();
    const result = await incrementOrderCount(s.db, SHOP);
    expect(result.isOverFreeCap).toBe(true);
    expect(result.overageOrders).toBe(0); // no overage on free
  });

  it("returns overageOrders=0 when paid shop is below cap", async () => {
    s.db.insert(schema.shops).values({
      id: SHOP, scopes: "", installedAt: new Date(),
      plan: "starter", monthlyOrderCount: 100, lifetimeOrderCount: 100,
      monthlyOrderResetAt: new Date("2099-01-01T00:00:00Z"),
    }).run();
    const result = await incrementOrderCount(s.db, SHOP);
    expect(result.overageOrders).toBe(0);
    const row = s.db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)).get();
    expect(row!.monthlyOrderCount).toBe(101);
  });

  it("returns overageOrders=1 the moment paid shop crosses cap", async () => {
    s.db.insert(schema.shops).values({
      id: SHOP, scopes: "", installedAt: new Date(),
      plan: "starter", monthlyOrderCount: 300, lifetimeOrderCount: 300,
      monthlyOrderResetAt: new Date("2099-01-01T00:00:00Z"),
    }).run();
    const result = await incrementOrderCount(s.db, SHOP);
    expect(result.overageOrders).toBe(1);
    const row = s.db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)).get();
    expect(row!.monthlyOrderCount).toBe(301);
  });

  it("returns overageOrders=1 even when already over cap (each over-cap order bills)", async () => {
    s.db.insert(schema.shops).values({
      id: SHOP, scopes: "", installedAt: new Date(),
      plan: "starter", monthlyOrderCount: 350, lifetimeOrderCount: 350,
      monthlyOrderResetAt: new Date("2099-01-01T00:00:00Z"),
    }).run();
    const result = await incrementOrderCount(s.db, SHOP);
    expect(result.overageOrders).toBe(1);
  });

  it("triggers lazy reset before incrementing", async () => {
    s.db.insert(schema.shops).values({
      id: SHOP, scopes: "", installedAt: new Date(),
      plan: "starter", monthlyOrderCount: 290, lifetimeOrderCount: 290,
      monthlyOrderResetAt: new Date("2020-01-01T00:00:00Z"), // way in the past
    }).run();
    const result = await incrementOrderCount(s.db, SHOP);
    expect(result.overageOrders).toBe(0); // counter reset to 0, then ++ to 1, under cap
    const row = s.db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)).get();
    expect(row!.monthlyOrderCount).toBe(1);
    expect(row!.lifetimeOrderCount).toBe(291);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/admin && pnpm vitest run test/billing-usage.test.ts`
Expected: FAIL — `incrementOrderCount` not exported.

- [ ] **Step 3: Implement incrementOrderCount**

Append to `apps/admin/app/lib/billing/usage.ts`:
```ts
import { PLANS, type PlanId } from "~/lib/billing/plans";

export type IncrementResult = {
  overageOrders: number;
  isOverFreeCap: boolean;
};

export async function incrementOrderCount(db: DB, shop: string): Promise<IncrementResult> {
  await lazyResetIfDue(db, shop, new Date());

  const before = (await db.select().from(schema.shops).where(eq(schema.shops.id, shop)).limit(1))[0];
  if (!before) return { overageOrders: 0, isOverFreeCap: false };

  const planId = before.plan as PlanId;
  const plan = PLANS[planId] ?? PLANS.free;
  const newMonthly = before.monthlyOrderCount + 1;
  const newLifetime = before.lifetimeOrderCount + 1;

  await db
    .update(schema.shops)
    .set({ monthlyOrderCount: newMonthly, lifetimeOrderCount: newLifetime })
    .where(eq(schema.shops.id, shop));

  const isOverFreeCap = plan.isLifetimeCap && newLifetime > plan.orderCap;
  const overageOrders = !plan.isLifetimeCap && newMonthly > plan.orderCap ? 1 : 0;

  return { overageOrders, isOverFreeCap };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/admin && pnpm vitest run test/billing-usage.test.ts`
Expected: PASS — all increment tests green plus existing reset tests.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/lib/billing/usage.ts apps/admin/test/billing-usage.test.ts
git commit -m "feat(billing): add incrementOrderCount with lazy-reset + overage detection"
```

---

## Task 5: usage.ts — `getUsage`

**Files:**
- Modify: `apps/admin/app/lib/billing/usage.ts`
- Modify: `apps/admin/test/billing-usage.test.ts`

- [ ] **Step 1: Append failing tests for getUsage**

Append to `apps/admin/test/billing-usage.test.ts`:
```ts
import { getUsage } from "../app/lib/billing/usage";

describe("getUsage", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => { s = setup(); });

  it("returns 0% on a fresh free shop", async () => {
    s.db.insert(schema.shops).values({
      id: SHOP, scopes: "", installedAt: new Date(),
      plan: "free", monthlyOrderCount: 0, lifetimeOrderCount: 0, monthlyOrderResetAt: null,
    }).run();
    const u = await getUsage(s.db, SHOP);
    expect(u.plan).toBe("free");
    expect(u.percentUsed).toBe(0);
    expect(u.overOnce).toBe(false);
    expect(u.isLifetimeCap).toBe(true);
    expect(u.orderCap).toBe(50);
    expect(u.resetAt).toBeNull();
  });

  it("computes percentUsed for free plan from lifetimeOrderCount", async () => {
    s.db.insert(schema.shops).values({
      id: SHOP, scopes: "", installedAt: new Date(),
      plan: "free", monthlyOrderCount: 0, lifetimeOrderCount: 40, monthlyOrderResetAt: null,
    }).run();
    const u = await getUsage(s.db, SHOP);
    expect(u.percentUsed).toBe(80);
    expect(u.overOnce).toBe(false);
  });

  it("computes percentUsed for paid plan from monthlyOrderCount", async () => {
    s.db.insert(schema.shops).values({
      id: SHOP, scopes: "", installedAt: new Date(),
      plan: "growth", monthlyOrderCount: 800, lifetimeOrderCount: 5000,
      monthlyOrderResetAt: new Date("2099-01-01T00:00:00Z"),
    }).run();
    const u = await getUsage(s.db, SHOP);
    expect(u.percentUsed).toBe(80);
    expect(u.overOnce).toBe(false);
    expect(u.orderCap).toBe(1000);
  });

  it("overOnce=true at 100%, percentUsed can exceed 100", async () => {
    s.db.insert(schema.shops).values({
      id: SHOP, scopes: "", installedAt: new Date(),
      plan: "starter", monthlyOrderCount: 450, lifetimeOrderCount: 450,
      monthlyOrderResetAt: new Date("2099-01-01T00:00:00Z"),
    }).run();
    const u = await getUsage(s.db, SHOP);
    expect(u.percentUsed).toBe(150);
    expect(u.overOnce).toBe(true);
  });

  it("overOnce=true exactly at 100%", async () => {
    s.db.insert(schema.shops).values({
      id: SHOP, scopes: "", installedAt: new Date(),
      plan: "starter", monthlyOrderCount: 300, lifetimeOrderCount: 300,
      monthlyOrderResetAt: new Date("2099-01-01T00:00:00Z"),
    }).run();
    const u = await getUsage(s.db, SHOP);
    expect(u.percentUsed).toBe(100);
    expect(u.overOnce).toBe(true);
  });

  it("returns sensible defaults for unknown shop", async () => {
    const u = await getUsage(s.db, "unknown.myshopify.com");
    expect(u.plan).toBe("free");
    expect(u.percentUsed).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/admin && pnpm vitest run test/billing-usage.test.ts`
Expected: FAIL — `getUsage` not exported.

- [ ] **Step 3: Implement getUsage**

Append to `apps/admin/app/lib/billing/usage.ts`:
```ts
export type UsageSnapshot = {
  plan: PlanId;
  monthlyOrderCount: number;
  lifetimeOrderCount: number;
  orderCap: number;
  isLifetimeCap: boolean;
  percentUsed: number;
  overOnce: boolean;
  resetAt: Date | null;
};

export async function getUsage(db: DB, shop: string): Promise<UsageSnapshot> {
  const row = (await db.select().from(schema.shops).where(eq(schema.shops.id, shop)).limit(1))[0];
  if (!row) {
    return {
      plan: "free",
      monthlyOrderCount: 0,
      lifetimeOrderCount: 0,
      orderCap: PLANS.free.orderCap,
      isLifetimeCap: true,
      percentUsed: 0,
      overOnce: false,
      resetAt: null,
    };
  }
  const planId = (row.plan as PlanId) in PLANS ? (row.plan as PlanId) : "free";
  const plan = PLANS[planId];
  const usedCount = plan.isLifetimeCap ? row.lifetimeOrderCount : row.monthlyOrderCount;
  const percentUsed = plan.orderCap > 0 ? Math.floor((usedCount / plan.orderCap) * 100) : 0;
  return {
    plan: planId,
    monthlyOrderCount: row.monthlyOrderCount,
    lifetimeOrderCount: row.lifetimeOrderCount,
    orderCap: plan.orderCap,
    isLifetimeCap: plan.isLifetimeCap,
    percentUsed,
    overOnce: percentUsed >= 100,
    resetAt: row.monthlyOrderResetAt,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/admin && pnpm vitest run test/billing-usage.test.ts`
Expected: PASS — all usage.ts tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/lib/billing/usage.ts apps/admin/test/billing-usage.test.ts
git commit -m "feat(billing): add getUsage snapshot helper"
```

---

## Task 6: gating.ts — free-tier creation gate

**Files:**
- Create: `apps/admin/app/lib/billing/gating.ts`
- Test: `apps/admin/test/billing-gating.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/test/billing-gating.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { canCreateNew } from "../app/lib/billing/gating";
import type { UsageSnapshot } from "../app/lib/billing/usage";

function snapshot(overrides: Partial<UsageSnapshot> = {}): UsageSnapshot {
  return {
    plan: "free",
    monthlyOrderCount: 0,
    lifetimeOrderCount: 0,
    orderCap: 50,
    isLifetimeCap: true,
    percentUsed: 0,
    overOnce: false,
    resetAt: null,
    ...overrides,
  };
}

describe("canCreateNew", () => {
  it("free plan with 49 lifetime orders → allowed", () => {
    const r = canCreateNew(snapshot({ lifetimeOrderCount: 49 }));
    expect(r.allowed).toBe(true);
  });

  it("free plan with exactly 50 lifetime orders → blocked", () => {
    const r = canCreateNew(snapshot({ lifetimeOrderCount: 50 }));
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.upgradeUrl).toBe("/app/billing");
      expect(r.reason).toMatch(/free/i);
    }
  });

  it("free plan with 100 lifetime orders → blocked", () => {
    const r = canCreateNew(snapshot({ lifetimeOrderCount: 100 }));
    expect(r.allowed).toBe(false);
  });

  it("starter plan with any count → allowed", () => {
    const r = canCreateNew(snapshot({ plan: "starter", isLifetimeCap: false, lifetimeOrderCount: 5000 }));
    expect(r.allowed).toBe(true);
  });

  it("growth plan with any count → allowed", () => {
    const r = canCreateNew(snapshot({ plan: "growth", isLifetimeCap: false, lifetimeOrderCount: 99999 }));
    expect(r.allowed).toBe(true);
  });

  it("unlimited plan with any count → allowed", () => {
    const r = canCreateNew(snapshot({ plan: "unlimited", isLifetimeCap: false, lifetimeOrderCount: 99999 }));
    expect(r.allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/admin && pnpm vitest run test/billing-gating.test.ts`
Expected: FAIL — `canCreateNew` not exported.

- [ ] **Step 3: Implement gating.ts**

Create `apps/admin/app/lib/billing/gating.ts`:
```ts
import type { UsageSnapshot } from "~/lib/billing/usage";

export type GateResult =
  | { allowed: true }
  | { allowed: false; reason: string; upgradeUrl: string };

export function canCreateNew(usage: UsageSnapshot): GateResult {
  if (usage.plan === "free" && usage.lifetimeOrderCount >= 50) {
    return {
      allowed: false,
      reason: "Free plan allows up to 50 orders. Upgrade to create more bundles or quantity breaks.",
      upgradeUrl: "/app/billing",
    };
  }
  return { allowed: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/admin && pnpm vitest run test/billing-gating.test.ts`
Expected: PASS — all 6 gating tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/lib/billing/gating.ts apps/admin/test/billing-gating.test.ts
git commit -m "feat(billing): add canCreateNew free-tier gate"
```

---

## Task 7: subscription.ts — `createSubscription`

**Files:**
- Create: `apps/admin/app/lib/billing/subscription.ts`
- Test: `apps/admin/test/billing-subscription.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/test/billing-subscription.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { createSubscription } from "../app/lib/billing/subscription";

type GqlMock = ReturnType<typeof vi.fn>;
function makeAdmin(graphql: GqlMock) {
  // mimics shape returned by authenticate.admin → { admin: { graphql } }
  return { graphql } as unknown as Parameters<typeof createSubscription>[0];
}

describe("createSubscription", () => {
  it("calls appSubscriptionCreate with correct variables for starter", async () => {
    const graphql = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          appSubscriptionCreate: {
            appSubscription: { id: "gid://shopify/AppSubscription/123" },
            confirmationUrl: "https://shopify.example/confirm/abc",
            userErrors: [],
          },
        },
      }),
    });

    const result = await createSubscription(
      makeAdmin(graphql),
      "s.myshopify.com",
      "starter",
      "https://app.example/billing/callback",
    );

    expect(result.confirmationUrl).toBe("https://shopify.example/confirm/abc");
    expect(result.chargeId).toBe("gid://shopify/AppSubscription/123");

    expect(graphql).toHaveBeenCalledOnce();
    const [, opts] = graphql.mock.calls[0]!;
    expect(opts.variables.name).toBe("Starter");
    expect(opts.variables.test).toBe(true); // dev store testing
    expect(opts.variables.trialDays).toBe(7);
    expect(opts.variables.returnUrl).toBe("https://app.example/billing/callback");
    expect(opts.variables.lineItems).toHaveLength(2);
    const recurringLine = opts.variables.lineItems.find((l: { plan: { appRecurringPricingDetails?: unknown }}) => l.plan.appRecurringPricingDetails);
    expect(recurringLine.plan.appRecurringPricingDetails.price.amount).toBe("19.00");
    expect(recurringLine.plan.appRecurringPricingDetails.price.currencyCode).toBe("USD");
    const usageLine = opts.variables.lineItems.find((l: { plan: { appUsagePricingDetails?: unknown }}) => l.plan.appUsagePricingDetails);
    expect(usageLine.plan.appUsagePricingDetails.cappedAmount.amount).toBe("10000.00");
    expect(usageLine.plan.appUsagePricingDetails.terms).toMatch(/0\.05.*order/i);
  });

  it("throws when userErrors present", async () => {
    const graphql = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          appSubscriptionCreate: {
            appSubscription: null,
            confirmationUrl: null,
            userErrors: [{ field: ["name"], message: "App is not configured for billing" }],
          },
        },
      }),
    });
    await expect(
      createSubscription(makeAdmin(graphql), "s.myshopify.com", "growth", "https://app.example/cb"),
    ).rejects.toThrow(/not configured/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/admin && pnpm vitest run test/billing-subscription.test.ts`
Expected: FAIL — `createSubscription` not exported.

- [ ] **Step 3: Implement createSubscription**

Create `apps/admin/app/lib/billing/subscription.ts`:
```ts
import { PLANS, type PlanId } from "~/lib/billing/plans";

// Loose admin shape — matches the surface we use from @shopify/shopify-app-remix.
// Real type is AdminApiContext from server SDK; tests pass a mock with the same `graphql` method.
export type AdminLike = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<{ json: () => Promise<{ data?: unknown; errors?: unknown }> }>;
};

const APP_SUBSCRIPTION_CREATE = `#graphql
  mutation AppSubscriptionCreate(
    $name: String!
    $returnUrl: URL!
    $trialDays: Int
    $test: Boolean
    $lineItems: [AppSubscriptionLineItemInput!]!
  ) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      trialDays: $trialDays
      test: $test
      lineItems: $lineItems
    ) {
      appSubscription { id }
      confirmationUrl
      userErrors { field message }
    }
  }
`;

export async function createSubscription(
  admin: AdminLike,
  shop: string,
  planId: Exclude<PlanId, "free">,
  returnUrl: string,
): Promise<{ confirmationUrl: string; chargeId: string }> {
  const plan = PLANS[planId];
  const baseAmount = (plan.priceCents / 100).toFixed(2);
  const overageAmount = (plan.overageCents / 100).toFixed(2);

  const variables = {
    name: plan.name,
    returnUrl,
    trialDays: plan.trialDays,
    // Set true for dev stores; Shopify ignores on production stores.
    test: true,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: baseAmount, currencyCode: "USD" },
            interval: "EVERY_30_DAYS",
          },
        },
      },
      {
        plan: {
          appUsagePricingDetails: {
            cappedAmount: { amount: "10000.00", currencyCode: "USD" },
            terms: `$${overageAmount} per order over the ${plan.orderCap} included orders`,
          },
        },
      },
    ],
  };

  const resp = await admin.graphql(APP_SUBSCRIPTION_CREATE, { variables });
  const body = (await resp.json()) as {
    data?: {
      appSubscriptionCreate?: {
        appSubscription: { id: string } | null;
        confirmationUrl: string | null;
        userErrors: Array<{ field: string[]; message: string }>;
      };
    };
  };

  const out = body.data?.appSubscriptionCreate;
  if (!out || out.userErrors.length > 0) {
    const msg = out?.userErrors.map((e) => e.message).join("; ") ?? "Unknown error";
    throw new Error(`appSubscriptionCreate failed: ${msg}`);
  }
  if (!out.appSubscription || !out.confirmationUrl) {
    throw new Error("appSubscriptionCreate returned no subscription/confirmationUrl");
  }
  return { confirmationUrl: out.confirmationUrl, chargeId: out.appSubscription.id };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/admin && pnpm vitest run test/billing-subscription.test.ts`
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/lib/billing/subscription.ts apps/admin/test/billing-subscription.test.ts
git commit -m "feat(billing): add createSubscription with recurring + usage line items"
```

---

## Task 8: subscription.ts — `cancelSubscription`

**Files:**
- Modify: `apps/admin/app/lib/billing/subscription.ts`
- Modify: `apps/admin/test/billing-subscription.test.ts`

- [ ] **Step 1: Append failing test**

Append to `apps/admin/test/billing-subscription.test.ts`:
```ts
import { cancelSubscription } from "../app/lib/billing/subscription";

describe("cancelSubscription", () => {
  it("calls appSubscriptionCancel with the chargeId", async () => {
    const graphql = vi.fn().mockResolvedValue({
      json: async () => ({
        data: { appSubscriptionCancel: { appSubscription: { id: "gid://shopify/AppSubscription/123", status: "CANCELLED" }, userErrors: [] } },
      }),
    });
    await cancelSubscription(makeAdmin(graphql), "gid://shopify/AppSubscription/123");
    expect(graphql).toHaveBeenCalledOnce();
    const [, opts] = graphql.mock.calls[0]!;
    expect(opts.variables.id).toBe("gid://shopify/AppSubscription/123");
  });

  it("throws when userErrors present", async () => {
    const graphql = vi.fn().mockResolvedValue({
      json: async () => ({
        data: { appSubscriptionCancel: { appSubscription: null, userErrors: [{ field: ["id"], message: "Subscription not found" }] } },
      }),
    });
    await expect(
      cancelSubscription(makeAdmin(graphql), "gid://shopify/AppSubscription/999"),
    ).rejects.toThrow(/not found/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/admin && pnpm vitest run test/billing-subscription.test.ts`
Expected: FAIL — `cancelSubscription` not exported.

- [ ] **Step 3: Implement cancelSubscription**

Append to `apps/admin/app/lib/billing/subscription.ts`:
```ts
const APP_SUBSCRIPTION_CANCEL = `#graphql
  mutation AppSubscriptionCancel($id: ID!) {
    appSubscriptionCancel(id: $id) {
      appSubscription { id status }
      userErrors { field message }
    }
  }
`;

export async function cancelSubscription(admin: AdminLike, chargeId: string): Promise<void> {
  const resp = await admin.graphql(APP_SUBSCRIPTION_CANCEL, { variables: { id: chargeId } });
  const body = (await resp.json()) as {
    data?: { appSubscriptionCancel?: { userErrors: Array<{ field: string[]; message: string }> } };
  };
  const errors = body.data?.appSubscriptionCancel?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`appSubscriptionCancel failed: ${errors.map((e) => e.message).join("; ")}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/admin && pnpm vitest run test/billing-subscription.test.ts`
Expected: PASS — cancel tests green plus existing create tests.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/lib/billing/subscription.ts apps/admin/test/billing-subscription.test.ts
git commit -m "feat(billing): add cancelSubscription"
```

---

## Task 9: subscription.ts — `submitOverageCharge`

**Files:**
- Modify: `apps/admin/app/lib/billing/subscription.ts`
- Modify: `apps/admin/test/billing-subscription.test.ts`

- [ ] **Step 1: Append failing test**

Append to `apps/admin/test/billing-subscription.test.ts`:
```ts
import { submitOverageCharge } from "../app/lib/billing/subscription";

describe("submitOverageCharge", () => {
  it("queries activeSubscriptions, finds usage line item, then calls appUsageRecordCreate", async () => {
    const graphql = vi.fn()
      .mockResolvedValueOnce({
        json: async () => ({
          data: {
            currentAppInstallation: {
              activeSubscriptions: [
                {
                  id: "gid://shopify/AppSubscription/123",
                  lineItems: [
                    { id: "gid://shopify/AppSubscriptionLineItem/r1", plan: { pricingDetails: { __typename: "AppRecurringPricing" } } },
                    { id: "gid://shopify/AppSubscriptionLineItem/u1", plan: { pricingDetails: { __typename: "AppUsagePricing" } } },
                  ],
                },
              ],
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          data: { appUsageRecordCreate: { appUsageRecord: { id: "gid://shopify/AppUsageRecord/x" }, userErrors: [] } },
        }),
      });

    await submitOverageCharge(makeAdmin(graphql), "gid://shopify/AppSubscription/123", 5, "Order overage: 1 order @ $0.05");

    expect(graphql).toHaveBeenCalledTimes(2);
    const [, createOpts] = graphql.mock.calls[1]!;
    expect(createOpts.variables.subscriptionLineItemId).toBe("gid://shopify/AppSubscriptionLineItem/u1");
    expect(createOpts.variables.price.amount).toBe("0.05");
    expect(createOpts.variables.description).toBe("Order overage: 1 order @ $0.05");
  });

  it("does not throw on errors (fire-and-forget) — logs only", async () => {
    const graphql = vi.fn().mockRejectedValue(new Error("network"));
    // should resolve, not reject
    await expect(
      submitOverageCharge(makeAdmin(graphql), "gid://shopify/AppSubscription/123", 5, "x"),
    ).resolves.toBeUndefined();
  });

  it("does not throw when subscription has no usage line", async () => {
    const graphql = vi.fn().mockResolvedValueOnce({
      json: async () => ({
        data: {
          currentAppInstallation: {
            activeSubscriptions: [
              {
                id: "gid://shopify/AppSubscription/123",
                lineItems: [
                  { id: "gid://shopify/AppSubscriptionLineItem/r1", plan: { pricingDetails: { __typename: "AppRecurringPricing" } } },
                ],
              },
            ],
          },
        },
      }),
    });
    await expect(
      submitOverageCharge(makeAdmin(graphql), "gid://shopify/AppSubscription/123", 5, "x"),
    ).resolves.toBeUndefined();
    expect(graphql).toHaveBeenCalledOnce(); // didn't proceed to mutation
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/admin && pnpm vitest run test/billing-subscription.test.ts`
Expected: FAIL — `submitOverageCharge` not exported.

- [ ] **Step 3: Implement submitOverageCharge**

Append to `apps/admin/app/lib/billing/subscription.ts`:
```ts
const ACTIVE_SUBSCRIPTIONS_QUERY = `#graphql
  query ActiveSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        lineItems {
          id
          plan { pricingDetails { __typename } }
        }
      }
    }
  }
`;

const APP_USAGE_RECORD_CREATE = `#graphql
  mutation AppUsageRecordCreate(
    $subscriptionLineItemId: ID!
    $price: MoneyInput!
    $description: String!
  ) {
    appUsageRecordCreate(
      subscriptionLineItemId: $subscriptionLineItemId
      price: $price
      description: $description
    ) {
      appUsageRecord { id }
      userErrors { field message }
    }
  }
`;

export async function submitOverageCharge(
  admin: AdminLike,
  chargeId: string,
  overageCents: number,
  description: string,
): Promise<void> {
  try {
    const lookupResp = await admin.graphql(ACTIVE_SUBSCRIPTIONS_QUERY);
    const lookupBody = (await lookupResp.json()) as {
      data?: {
        currentAppInstallation?: {
          activeSubscriptions: Array<{
            id: string;
            lineItems: Array<{ id: string; plan: { pricingDetails: { __typename: string } } }>;
          }>;
        };
      };
    };
    const sub = lookupBody.data?.currentAppInstallation?.activeSubscriptions.find((s) => s.id === chargeId);
    if (!sub) {
      console.warn(`[billing] submitOverageCharge: subscription ${chargeId} not active; skipping`);
      return;
    }
    const usageLine = sub.lineItems.find((li) => li.plan.pricingDetails.__typename === "AppUsagePricing");
    if (!usageLine) {
      console.warn(`[billing] submitOverageCharge: subscription ${chargeId} has no usage line item; skipping`);
      return;
    }
    const amount = (overageCents / 100).toFixed(2);
    const createResp = await admin.graphql(APP_USAGE_RECORD_CREATE, {
      variables: {
        subscriptionLineItemId: usageLine.id,
        price: { amount, currencyCode: "USD" },
        description,
      },
    });
    const createBody = (await createResp.json()) as {
      data?: { appUsageRecordCreate?: { userErrors: Array<{ field: string[]; message: string }> } };
    };
    const errors = createBody.data?.appUsageRecordCreate?.userErrors ?? [];
    if (errors.length > 0) {
      console.warn(`[billing] appUsageRecordCreate userErrors: ${errors.map((e) => e.message).join("; ")}`);
    }
  } catch (err) {
    console.error("[billing] submitOverageCharge failed", err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/admin && pnpm vitest run test/billing-subscription.test.ts`
Expected: PASS — all subscription.ts tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/lib/billing/subscription.ts apps/admin/test/billing-subscription.test.ts
git commit -m "feat(billing): add submitOverageCharge with line-item lookup"
```

---

## Task 10: UsageBanner component

**Files:**
- Create: `apps/admin/app/components/UsageBanner.tsx`

This is a presentational component with branching on `UsageSnapshot`. No DB, no test (UI smoke-tested via the routes in Tasks 11/16).

- [ ] **Step 1: Create component**

Create `apps/admin/app/components/UsageBanner.tsx`:
```tsx
import { Banner } from "@shopify/polaris";
import { Link } from "@remix-run/react";
import type { UsageSnapshot } from "~/lib/billing/usage";

type Props = { usage: UsageSnapshot };

export function UsageBanner({ usage }: Props) {
  if (usage.percentUsed < 80) return null;

  if (usage.plan === "free" && usage.percentUsed >= 100) {
    return (
      <Banner tone="critical" title="You've hit your free plan limit">
        <p>
          You've used all 50 orders included in the free plan. Upgrade to keep creating
          new bundles and quantity breaks.{" "}
          <Link to="/app/billing">Upgrade now</Link>
        </p>
      </Banner>
    );
  }

  if (usage.percentUsed >= 100) {
    return (
      <Banner tone="warning" title="You're past your monthly cap — overage charges active">
        <p>
          Each order over your {usage.orderCap}-order cap is billed at $0.05.{" "}
          <Link to="/app/billing">View plans</Link>
        </p>
      </Banner>
    );
  }

  // 80% – 99%
  return (
    <Banner tone="warning" title="You've used 80% of your monthly orders">
      <p>
        You've used {usage.percentUsed}% of your {usage.orderCap}-order plan.{" "}
        <Link to="/app/billing">View plans</Link>
      </p>
    </Banner>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: PASS — no type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/app/components/UsageBanner.tsx
git commit -m "feat(billing): add UsageBanner component"
```

---

## Task 11: app.billing.tsx — plan picker page

**Files:**
- Create: `apps/admin/app/routes/app.billing.tsx`

- [ ] **Step 1: Create the route file**

Create `apps/admin/app/routes/app.billing.tsx`:
```tsx
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  InlineGrid,
  Text,
  Button,
  Banner,
  ProgressBar,
  Badge,
  InlineStack,
} from "@shopify/polaris";
import { eq } from "drizzle-orm";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb, schema } from "~/db.server";
import { PLANS, type PlanId, isPaidPlan } from "~/lib/billing/plans";
import { getUsage } from "~/lib/billing/usage";
import { createSubscription, cancelSubscription } from "~/lib/billing/subscription";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);

  const shopRow = (
    await db.select().from(schema.shops).where(eq(schema.shops.id, session.shop)).limit(1)
  )[0];
  const usage = await getUsage(db, session.shop);

  return json({
    plan: usage.plan,
    usage,
    trialEndsAt: shopRow?.trialEndsAt?.toISOString() ?? null,
    chargeId: shopRow?.shopifyChargeId ?? null,
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session, admin } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);

  const form = await request.formData();
  const targetPlan = (form.get("planId") as PlanId) ?? "free";

  const shopRow = (
    await db.select().from(schema.shops).where(eq(schema.shops.id, session.shop)).limit(1)
  )[0];
  if (!shopRow) return json({ error: "Shop not found" }, { status: 404 });

  const currentPlan = shopRow.plan as PlanId;
  if (targetPlan === currentPlan) {
    return json({ error: "Already on this plan" }, { status: 400 });
  }

  if (targetPlan === "free") {
    if (shopRow.shopifyChargeId) {
      await cancelSubscription(admin, shopRow.shopifyChargeId);
    }
    await db
      .update(schema.shops)
      .set({ plan: "free", shopifyChargeId: null, trialEndsAt: null, monthlyOrderResetAt: null })
      .where(eq(schema.shops.id, session.shop));
    return redirect("/app/billing");
  }

  const returnUrl = `${ctx.cloudflare.env.SHOPIFY_APP_URL}/app/billing/callback`;
  const { confirmationUrl, chargeId } = await createSubscription(admin, session.shop, targetPlan, returnUrl);
  await db
    .update(schema.shops)
    .set({ shopifyChargeId: chargeId })
    .where(eq(schema.shops.id, session.shop));
  return redirect(confirmationUrl);
}

export default function BillingPage() {
  const { plan, usage, trialEndsAt } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";
  const currentPlan = PLANS[plan];

  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000))
    : 0;
  const trialActive = trialDaysLeft > 0;

  const usageLabel = currentPlan.isLifetimeCap
    ? `${usage.lifetimeOrderCount} / ${currentPlan.orderCap} orders (lifetime)`
    : `${usage.monthlyOrderCount} / ${currentPlan.orderCap} orders this month`;

  function handleSelect(planId: PlanId) {
    fetcher.submit({ planId }, { method: "post" });
  }

  return (
    <Page title="Billing">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="200">
            <InlineStack gap="200" blockAlign="center">
              <Text as="h2" variant="headingMd">
                {currentPlan.name} — ${(currentPlan.priceCents / 100).toFixed(0)}/mo
              </Text>
              {trialActive && <Badge tone="success">Free trial</Badge>}
            </InlineStack>
            {trialActive && (
              <Text as="p" tone="subdued">
                Free trial · {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} remaining ·
                First charge {new Date(trialEndsAt!).toLocaleDateString()}
              </Text>
            )}
            <Text as="p">{usageLabel}</Text>
            <ProgressBar progress={Math.min(100, usage.percentUsed)} size="small" />
            {!currentPlan.isLifetimeCap && usage.resetAt && (
              <Text as="p" tone="subdued">
                Resets {new Date(usage.resetAt).toLocaleDateString()}
              </Text>
            )}
          </BlockStack>
        </Card>

        <InlineGrid columns={{ xs: 1, md: 4 }} gap="300">
          {(Object.values(PLANS) as Array<typeof PLANS[PlanId]>).map((p) => {
            const isCurrent = p.id === plan;
            const isHigher = p.priceCents > currentPlan.priceCents;
            const isFreeDowngrade = p.id === "free" && isPaidPlan(plan);
            return (
              <Card key={p.id}>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">{p.name}</Text>
                  <Text as="p" variant="heading2xl">
                    ${(p.priceCents / 100).toFixed(0)}<Text as="span" variant="bodyMd">/mo</Text>
                  </Text>
                  <Text as="p">
                    {p.orderCap} orders{p.isLifetimeCap ? " (lifetime)" : "/month"}
                  </Text>
                  <Text as="p" tone="subdued">
                    {p.id === "free"
                      ? "Lifetime cap — upgrade to continue"
                      : `$${(p.overageCents / 100).toFixed(2)} per extra order`}
                  </Text>
                  <BlockStack gap="100">
                    <Text as="p">• All bundle types</Text>
                    <Text as="p">• All QB tiers</Text>
                    <Text as="p">• Free gift + BOGO</Text>
                    <Text as="p">• Analytics dashboard</Text>
                  </BlockStack>
                  {isCurrent ? (
                    <Button disabled>Current plan</Button>
                  ) : isFreeDowngrade ? (
                    <Button tone="critical" loading={isSubmitting} onClick={() => handleSelect(p.id)}>
                      Cancel subscription
                    </Button>
                  ) : isHigher ? (
                    <Button variant="primary" loading={isSubmitting} onClick={() => handleSelect(p.id)}>
                      Upgrade
                    </Button>
                  ) : (
                    <Button loading={isSubmitting} onClick={() => handleSelect(p.id)}>
                      Downgrade
                    </Button>
                  )}
                </BlockStack>
              </Card>
            );
          })}
        </InlineGrid>

        <Banner tone="info">
          <p>
            Charges appear on your Shopify invoice. 7-day free trial on first paid subscription.
          </p>
        </Banner>
      </BlockStack>
    </Page>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: PASS — no type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/app/routes/app.billing.tsx
git commit -m "feat(billing): add /app/billing plan picker page"
```

---

## Task 12: app.billing.callback.tsx — post-approval handler

**Files:**
- Create: `apps/admin/app/routes/app.billing.callback.tsx`

The plan flip happens via webhook. This route just lands the merchant after they approve in Shopify.

- [ ] **Step 1: Create the route file**

Create `apps/admin/app/routes/app.billing.callback.tsx`:
```tsx
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import { authenticate, type AppLoadContext } from "~/shopify.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  await authenticate.admin(request, ctx);
  // The actual plan flip happens via app_subscriptions/update webhook.
  // Here we just bounce the merchant back to the billing page where
  // they'll see "Pending" until the webhook arrives.
  return redirect("/app/billing");
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/app/routes/app.billing.callback.tsx
git commit -m "feat(billing): add /app/billing/callback redirect handler"
```

---

## Task 13: webhooks.app-subscriptions.update.tsx — subscription status webhook

**Files:**
- Create: `apps/admin/app/routes/webhooks.app-subscriptions.update.tsx`
- Create: `apps/admin/test/webhooks-app-subscriptions-update.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/test/webhooks-app-subscriptions-update.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import Database from "better-sqlite3";
import * as schema from "../drizzle/schema";
import { InMemoryKV } from "./helpers/kv-mock";

const SHOP = "s.myshopify.com";

function setup() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  db.insert(schema.shops).values({
    id: SHOP,
    scopes: "",
    installedAt: new Date(),
    plan: "free",
  }).run();
  return { db, sqlite };
}

function makeContext(db: ReturnType<typeof setup>["db"]) {
  const kv = new InMemoryKV();
  return {
    cloudflare: {
      env: {
        DB: db as unknown as D1Database,
        SHOP_SETTINGS_CACHE: kv as unknown as KVNamespace,
        SHOPIFY_API_SECRET: "test-secret",
      },
    },
  } as never;
}

vi.mock("~/shopify.server", () => ({
  authenticate: {
    webhook: vi.fn(async (request: Request) => ({
      topic: "APP_SUBSCRIPTIONS_UPDATE",
      shop: SHOP,
      payload: JSON.parse(await request.text()),
    })),
  },
}));

import { action } from "../app/routes/webhooks.app-subscriptions.update";

function makeReq(body: unknown, webhookId: string) {
  return new Request("https://x/webhooks/app-subscriptions/update", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Webhook-Id": webhookId },
    body: JSON.stringify(body),
  });
}

describe("webhooks.app-subscriptions.update", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => { s = setup(); });

  it("ACTIVE first time → sets plan, planActivatedAt, trialEndsAt, monthlyOrderResetAt, chargeId", async () => {
    const payload = {
      app_subscription: {
        admin_graphql_api_id: "gid://shopify/AppSubscription/abc",
        name: "Starter",
        status: "ACTIVE",
        trial_days: 7,
        line_items: [{ plan: { pricing_details: { __typename: "AppRecurringPricing", price: { amount: "19.00", currency_code: "USD" } } } }],
      },
    };
    const res = await action({ request: makeReq(payload, "wh-act-1"), context: makeContext(s.db) } as never);
    expect((res as Response).status).toBe(200);
    const row = s.db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)).get();
    expect(row!.plan).toBe("starter");
    expect(row!.shopifyChargeId).toBe("gid://shopify/AppSubscription/abc");
    expect(row!.planActivatedAt).toBeTruthy();
    expect(row!.trialEndsAt).toBeTruthy();
    expect(row!.monthlyOrderResetAt).toBeTruthy();
  });

  it("CANCELLED → reverts to free, clears chargeId/trial/reset", async () => {
    s.db.update(schema.shops).set({
      plan: "growth",
      shopifyChargeId: "gid://shopify/AppSubscription/abc",
      trialEndsAt: new Date("2026-05-15T00:00:00Z"),
      monthlyOrderResetAt: new Date("2026-06-01T00:00:00Z"),
    }).where(eq(schema.shops.id, SHOP)).run();

    const payload = { app_subscription: { admin_graphql_api_id: "gid://shopify/AppSubscription/abc", name: "Growth", status: "CANCELLED", line_items: [] } };
    const res = await action({ request: makeReq(payload, "wh-cancel"), context: makeContext(s.db) } as never);
    expect((res as Response).status).toBe(200);
    const row = s.db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)).get();
    expect(row!.plan).toBe("free");
    expect(row!.shopifyChargeId).toBeNull();
    expect(row!.trialEndsAt).toBeNull();
    expect(row!.monthlyOrderResetAt).toBeNull();
  });

  it("EXPIRED → reverts to free", async () => {
    s.db.update(schema.shops).set({ plan: "starter", shopifyChargeId: "gid://shopify/X" }).where(eq(schema.shops.id, SHOP)).run();
    const payload = { app_subscription: { admin_graphql_api_id: "gid://shopify/X", name: "Starter", status: "EXPIRED", line_items: [] } };
    await action({ request: makeReq(payload, "wh-exp"), context: makeContext(s.db) } as never);
    const row = s.db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)).get();
    expect(row!.plan).toBe("free");
  });

  it("FROZEN → keeps plan", async () => {
    s.db.update(schema.shops).set({ plan: "starter", shopifyChargeId: "gid://shopify/X" }).where(eq(schema.shops.id, SHOP)).run();
    const payload = { app_subscription: { admin_graphql_api_id: "gid://shopify/X", name: "Starter", status: "FROZEN", line_items: [] } };
    await action({ request: makeReq(payload, "wh-frozen"), context: makeContext(s.db) } as never);
    const row = s.db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)).get();
    expect(row!.plan).toBe("starter");
    expect(row!.shopifyChargeId).toBe("gid://shopify/X");
  });

  it("idempotent — same webhook id processed once", async () => {
    const payload = {
      app_subscription: {
        admin_graphql_api_id: "gid://shopify/AppSubscription/abc",
        name: "Starter",
        status: "ACTIVE",
        trial_days: 7,
        line_items: [{ plan: { pricing_details: { __typename: "AppRecurringPricing", price: { amount: "19.00", currency_code: "USD" } } } }],
      },
    };
    const ctx = makeContext(s.db);
    await action({ request: makeReq(payload, "wh-dup"), context: ctx } as never);
    // change DB state to verify second call doesn't reapply
    s.db.update(schema.shops).set({ plan: "free" }).where(eq(schema.shops.id, SHOP)).run();
    await action({ request: makeReq(payload, "wh-dup"), context: ctx } as never);
    const row = s.db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)).get();
    expect(row!.plan).toBe("free"); // second call was no-op due to idempotency
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/admin && pnpm vitest run test/webhooks-app-subscriptions-update.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler**

Create `apps/admin/app/routes/webhooks.app-subscriptions.update.tsx`:
```ts
import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { wasProcessed, markProcessed } from "~/lib/webhooks/idempotency";
import { getDb, schema } from "~/db.server";
import { PLANS, type PlanId } from "~/lib/billing/plans";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function planIdFromName(name: string): PlanId {
  const lower = name.toLowerCase();
  if (lower in PLANS) return lower as PlanId;
  return "free";
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { topic, shop, payload } = await authenticate.webhook(request, ctx);

  if (topic !== "APP_SUBSCRIPTIONS_UPDATE") {
    return new Response("Unexpected topic", { status: 400 });
  }
  if (await wasProcessed(ctx, request)) {
    return new Response(null, { status: 200 });
  }

  const sub = (payload as {
    app_subscription?: {
      admin_graphql_api_id: string;
      name: string;
      status: string;
      trial_days?: number;
    };
  }).app_subscription;

  if (!sub) {
    await markProcessed(ctx, request);
    return new Response(null, { status: 200 });
  }

  const db = getDb(ctx.cloudflare.env.DB);
  const now = new Date();

  if (sub.status === "ACTIVE") {
    const planId = planIdFromName(sub.name);
    const trialDays = sub.trial_days ?? 0;
    await db
      .update(schema.shops)
      .set({
        plan: planId,
        shopifyChargeId: sub.admin_graphql_api_id,
        planActivatedAt: now,
        trialEndsAt: trialDays > 0 ? new Date(now.getTime() + trialDays * 86_400_000) : null,
        monthlyOrderResetAt: new Date(now.getTime() + THIRTY_DAYS_MS),
        // Reset monthly counter on (re)activation so a clean cycle starts
        monthlyOrderCount: 0,
      })
      .where(eq(schema.shops.id, shop));
  } else if (sub.status === "CANCELLED" || sub.status === "EXPIRED" || sub.status === "DECLINED") {
    await db
      .update(schema.shops)
      .set({
        plan: "free",
        shopifyChargeId: null,
        trialEndsAt: null,
        monthlyOrderResetAt: null,
      })
      .where(eq(schema.shops.id, shop));
  } else if (sub.status === "FROZEN") {
    console.warn(`[billing] subscription frozen for ${shop} (charge ${sub.admin_graphql_api_id})`);
  } else {
    // PENDING, ACCEPTED, etc — log only
    console.log(`[billing] app_subscriptions/update status=${sub.status} for ${shop}`);
  }

  await markProcessed(ctx, request);
  return new Response(null, { status: 200 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/admin && pnpm vitest run test/webhooks-app-subscriptions-update.test.ts`
Expected: PASS — all 5 webhook tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/routes/webhooks.app-subscriptions.update.tsx apps/admin/test/webhooks-app-subscriptions-update.test.ts
git commit -m "feat(billing): add app_subscriptions/update webhook handler"
```

---

## Task 14: Wire `incrementOrderCount` + `submitOverageCharge` into orders/paid

**Files:**
- Modify: `apps/admin/app/routes/webhooks.orders.paid.tsx`
- Modify: `apps/admin/test/webhooks-orders-paid.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `apps/admin/test/webhooks-orders-paid.test.ts`:
```ts
import { eq } from "drizzle-orm";

describe("billing integration in orders/paid", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => { s = setup(); });

  it("increments lifetimeOrderCount on every paid order", async () => {
    const order = {
      processed_at: "2026-05-07T12:00:00Z",
      line_items: [{
        price_set: { shop_money: { amount: "20.00", currency_code: "USD" } },
        quantity: 1,
        properties: [],
      }],
    };
    await action({ request: makeReq(order, "wh-cnt-1"), context: makeContext(s.db) } as never);
    const row = s.db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)).get();
    expect(row!.lifetimeOrderCount).toBe(1);
    expect(row!.monthlyOrderCount).toBe(1);
  });

  it("does not double-count on duplicate webhook id", async () => {
    const order = {
      processed_at: "2026-05-07T12:00:00Z",
      line_items: [{ price_set: { shop_money: { amount: "20.00", currency_code: "USD" } }, quantity: 1, properties: [] }],
    };
    const ctx = makeContext(s.db);
    await action({ request: makeReq(order, "wh-dup-cnt"), context: ctx } as never);
    await action({ request: makeReq(order, "wh-dup-cnt"), context: ctx } as never);
    const row = s.db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)).get();
    expect(row!.lifetimeOrderCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/admin && pnpm vitest run test/webhooks-orders-paid.test.ts`
Expected: FAIL — counters stay at 0.

- [ ] **Step 3: Modify the orders/paid handler**

Replace the contents of `apps/admin/app/routes/webhooks.orders.paid.tsx` with:
```ts
import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { wasProcessed, markProcessed } from "~/lib/webhooks/idempotency";
import { getDb, schema } from "~/db.server";
import { parseOrderAttribution } from "~/lib/analytics/attribution";
import { applyAttribution } from "~/lib/analytics/revenue-rollup";
import { incrementOrderCount } from "~/lib/billing/usage";
import { submitOverageCharge } from "~/lib/billing/subscription";
import { PLANS, type PlanId } from "~/lib/billing/plans";

function deriveOrderDate(order: { processed_at?: string; created_at?: string }): string {
  const raw = order.processed_at ?? order.created_at;
  const date = raw ? new Date(raw) : new Date();
  return date.toISOString().slice(0, 10);
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { topic, shop, payload, admin } = await authenticate.webhook(request, ctx);

  if (topic !== "ORDERS_PAID") {
    return new Response("Unexpected topic", { status: 400 });
  }
  if (await wasProcessed(ctx, request)) {
    return new Response(null, { status: 200 });
  }

  const db = getDb(ctx.cloudflare.env.DB);

  const parsed = await parseOrderAttribution(
    db,
    shop,
    payload as {
      line_items: Array<{
        price_set: { shop_money: { amount: string } };
        quantity: number;
        properties: Array<{ name: string; value: string }>;
      }>;
    },
  );

  if (parsed.perBundle.length > 0) {
    const orderDate = deriveOrderDate(payload as { processed_at?: string; created_at?: string });
    await applyAttribution(db, shop, parsed, orderDate);
  }

  const incResult = await incrementOrderCount(db, shop);

  if (incResult.overageOrders > 0) {
    const shopRow = (await db.select().from(schema.shops).where(eq(schema.shops.id, shop)).limit(1))[0];
    if (shopRow?.shopifyChargeId && admin) {
      const planId = (shopRow.plan as PlanId) in PLANS ? (shopRow.plan as PlanId) : "free";
      const overageCents = PLANS[planId].overageCents;
      const description = `Order overage: 1 order @ $${(overageCents / 100).toFixed(2)}`;
      // Fire-and-forget so we stay under Shopify's 5s webhook SLA.
      // ctx.cloudflare may have waitUntil if running on Workers/Pages; otherwise we await directly.
      const wu = (ctx.cloudflare as unknown as { ctx?: { waitUntil?: (p: Promise<unknown>) => void } }).ctx?.waitUntil;
      const promise = submitOverageCharge(admin, shopRow.shopifyChargeId, overageCents, description);
      if (typeof wu === "function") wu(promise);
      else await promise;
    }
  }

  await markProcessed(ctx, request);
  return new Response(null, { status: 200 });
}
```

Also update the test file's `vi.mock("~/shopify.server", ...)` to expose `admin` on the webhook return so the existing tests still pass; in `apps/admin/test/webhooks-orders-paid.test.ts`, change:
```ts
vi.mock("~/shopify.server", () => ({
  authenticate: {
    webhook: vi.fn(async (request: Request) => ({
      topic: "ORDERS_PAID",
      shop: SHOP,
      payload: JSON.parse(await request.text()),
      admin: undefined, // not exercised by these tests
    })),
  },
}));
```

- [ ] **Step 4: Run all orders/paid tests**

Run: `cd apps/admin && pnpm vitest run test/webhooks-orders-paid.test.ts`
Expected: PASS — both new counter tests AND all existing revenue-attribution tests still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/routes/webhooks.orders.paid.tsx apps/admin/test/webhooks-orders-paid.test.ts
git commit -m "feat(billing): increment order counter + submit overage from orders/paid"
```

---

## Task 15: Gate `app.bundles.new` with `canCreateNew`

**Files:**
- Modify: `apps/admin/app/routes/app.bundles.new.tsx`

We need to import gating helpers, gate the action, and render an EmptyState when blocked.

- [ ] **Step 1: Read current file to identify the existing loader/action/component**

Run: `cat "apps/admin/app/routes/app.bundles.new.tsx" | head -40`
Expected: Loader uses `authenticate.admin`, action saves a bundle, default export renders form.

- [ ] **Step 2: Add gating to loader and action**

In `apps/admin/app/routes/app.bundles.new.tsx`, replace the loader and action with:
```ts
import { getUsage } from "~/lib/billing/usage";
import { canCreateNew } from "~/lib/billing/gating";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const usage = await getUsage(db, session.shop);
  const gate = canCreateNew(usage);
  return json({ gate });
}
```

Then in the existing action, after `await authenticate.admin(...)` and before any DB write, insert:
```ts
const usage = await getUsage(db, session.shop);
const gate = canCreateNew(usage);
if (!gate.allowed) {
  return json({ errors: { _form: gate.reason } }, { status: 403 });
}
```

(Note: the action's existing `getDb` call must come before the gate check; reorder if needed.)

- [ ] **Step 3: Render EmptyState when blocked**

In the default export, near the top of the render function, add:
```tsx
import { EmptyState, Page, Layout, Card } from "@shopify/polaris";

// inside the component, after useLoaderData:
const { gate } = useLoaderData<typeof loader>();
if (!gate.allowed) {
  return (
    <Page title="Create bundle" backAction={{ content: "Bundles", url: "/app/bundles" }}>
      <Layout>
        <Layout.Section>
          <Card>
            <EmptyState
              heading="Free plan limit reached"
              action={{ content: "Upgrade to create more", url: "/app/billing" }}
              image=""
            >
              <p>{gate.reason}</p>
            </EmptyState>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

- [ ] **Step 4: Run typecheck**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/routes/app.bundles.new.tsx
git commit -m "feat(billing): gate bundle creation on free-tier 50-order cap"
```

---

## Task 16: Gate `app.quantity-breaks.new` with `canCreateNew`

**Files:**
- Modify: `apps/admin/app/routes/app.quantity-breaks.new.tsx`

Same shape as Task 15, applied to the QB route.

- [ ] **Step 1: Add gating to loader**

In `apps/admin/app/routes/app.quantity-breaks.new.tsx`, replace the loader with:
```ts
import { getUsage } from "~/lib/billing/usage";
import { canCreateNew } from "~/lib/billing/gating";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const usage = await getUsage(db, session.shop);
  const gate = canCreateNew(usage);
  return json({ gate });
}
```

- [ ] **Step 2: Add gating to action**

In the existing action, after `getDb(...)` and before `qbRepo.create(...)`, insert:
```ts
const usage = await getUsage(db, session.shop);
const gate = canCreateNew(usage);
if (!gate.allowed) {
  return json({ errors: { _form: gate.reason } }, { status: 403 });
}
```

- [ ] **Step 3: Render EmptyState when blocked**

In the default export `QbNew`, after the existing `useActionData` line, add:
```tsx
import { EmptyState, Card } from "@shopify/polaris";

const { gate } = useLoaderData<typeof loader>();
if (!gate.allowed) {
  return (
    <Page title="Create quantity break" backAction={{ content: "Quantity Breaks", url: "/app/quantity-breaks" }}>
      <Layout>
        <Layout.Section>
          <Card>
            <EmptyState
              heading="Free plan limit reached"
              action={{ content: "Upgrade to create more", url: "/app/billing" }}
              image=""
            >
              <p>{gate.reason}</p>
            </EmptyState>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

Also add `useLoaderData` to the existing `@remix-run/react` import at the top of the file if not already present.

- [ ] **Step 4: Run typecheck**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/routes/app.quantity-breaks.new.tsx
git commit -m "feat(billing): gate QB creation on free-tier 50-order cap"
```

---

## Task 17: Mount UsageBanner on dashboard, bundles list, QB list

**Files:**
- Modify: `apps/admin/app/routes/app._index.tsx`
- Modify: `apps/admin/app/routes/app.bundles._index.tsx`
- Modify: `apps/admin/app/routes/app.quantity-breaks._index.tsx`

- [ ] **Step 1: Modify app._index.tsx loader to include usage**

In `apps/admin/app/routes/app._index.tsx`:
1. Add import at top: `import { getUsage } from "~/lib/billing/usage";` and `import { UsageBanner } from "~/components/UsageBanner";`
2. In the loader, after `const db = getDb(...)`, add: `const usage = await getUsage(db, session.shop);`
3. In the final `return json({ ... })`, add `usage` to the returned object.
4. In the default export, after `useLoaderData`, destructure `usage` and render `<UsageBanner usage={usage} />` as the first element inside the existing top-level `<BlockStack>` (or wrap if needed).

- [ ] **Step 2: Modify app.bundles._index.tsx the same way**

In `apps/admin/app/routes/app.bundles._index.tsx`:
1. Add the two imports.
2. In the loader, after `getDb`, add: `const usage = await getUsage(db, session.shop);`
3. Add `usage` to the loader's returned JSON.
4. In the default export, destructure `usage` from `useLoaderData`, and add `<UsageBanner usage={usage} />` immediately above the `<Page>` tag's children — wrap the existing return in a fragment if needed:
   ```tsx
   return (
     <Page title="Bundles" primaryAction={...}>
       <UsageBanner usage={usage} />
       {/* existing Card / IndexTable */}
     </Page>
   );
   ```
   (Polaris `Page` accepts multiple children; the banner will render above the card.)

- [ ] **Step 3: Modify app.quantity-breaks._index.tsx the same way**

Same pattern as Step 2 for `apps/admin/app/routes/app.quantity-breaks._index.tsx`.

- [ ] **Step 4: Run typecheck**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Run all tests**

Run: `cd apps/admin && pnpm vitest run`
Expected: PASS — no regression.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/routes/app._index.tsx apps/admin/app/routes/app.bundles._index.tsx apps/admin/app/routes/app.quantity-breaks._index.tsx
git commit -m "feat(billing): mount UsageBanner on dashboard + list pages"
```

---

## Task 18: Add Billing nav link

**Files:**
- Modify: `apps/admin/app/routes/app.tsx`

- [ ] **Step 1: Add the nav link**

In `apps/admin/app/routes/app.tsx`, in the `<NavMenu>` block (around line 52-55), add a Billing link as the last item:
```tsx
<NavMenu>
  <Link to="/app" rel="home">Dashboard</Link>
  <Link to="/app/bundles">Bundles</Link>
  <Link to="/app/quantity-breaks">Quantity Breaks</Link>
  <Link to="/app/billing">Billing</Link>
</NavMenu>
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/app/routes/app.tsx
git commit -m "feat(billing): add Billing nav link"
```

---

## Task 19: Subscribe to `app_subscriptions/update` webhook

**Files:**
- Modify: `shopify.app.toml`

- [ ] **Step 1: Add the subscription block**

In `shopify.app.toml`, inside the `[webhooks]` section (after the `collections/update` block on line 27-29), add:
```toml
  [[webhooks.subscriptions]]
  topics = ["app_subscriptions/update"]
  uri = "/webhooks/app-subscriptions/update"
```

- [ ] **Step 2: Commit**

```bash
git add shopify.app.toml
git commit -m "feat(billing): subscribe to app_subscriptions/update webhook"
```

---

## Task 20: Full test sweep

- [ ] **Step 1: Run the full vitest suite**

Run: `cd apps/admin && pnpm vitest run`
Expected: ALL pass — no regression in any existing test (Phase 4/5/6 tests included).

- [ ] **Step 2: Run typecheck**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: PASS — no type errors.

- [ ] **Step 3: Run lint**

Run: `cd apps/admin && pnpm lint`
Expected: PASS (or pre-existing warnings only — no new errors).

- [ ] **Step 4: Build admin app**

Run: `cd apps/admin && pnpm build`
Expected: SUCCESS — Remix bundle compiles without errors.

If any step fails, stop and report the failure.

---

## Task 21: Manual gate (cannot be automated)

These checkpoints require a real Shopify dev store and Partner dashboard access. Document results inline; do NOT mark this task complete until all 5 pass.

> **Note:** Checkpoints 2 and onwards depend on `orders/paid` webhook delivery, which is currently blocked pending Protected Customer Data approval (per CLAUDE.md note in shopify.app.toml). After PCD approval, re-enable the `orders/paid` subscription block in shopify.app.toml and run `shopify app deploy --force` before running these checkpoints.

- [ ] **Checkpoint 1: Fresh install defaults to free**

  1. Install the app on a clean dev store
  2. Open the embedded admin → /app/billing
  3. Verify: "Free — $0/mo" shows as current plan, progress bar at 0/50

- [ ] **Checkpoint 2: Paid order increments lifetimeOrderCount**

  Requires PCD-approved `orders/paid` subscription.

  1. Place a test order on the dev store with a bundle
  2. Watch logs for `incrementOrderCount` execution
  3. Query D1: `SELECT lifetime_order_count, monthly_order_count FROM shops WHERE id = '<shop>';` — both should be 1

- [ ] **Checkpoint 3: Upgrade flow + webhook activation**

  1. From /app/billing, click "Upgrade" on Starter
  2. Approve charge in Shopify's confirmation page
  3. Land on /app/billing/callback → redirected to /app/billing
  4. Within ~30s, the page should show "Starter — $19/mo" with "Free trial · 7 days remaining"
  5. Query D1: `plan = 'starter'`, `shopify_charge_id` is set, `trial_ends_at` is ~7d in the future, `monthly_order_reset_at` is ~30d in the future

- [ ] **Checkpoint 4: Manual usage charge via GraphiQL**

  Requires the chargeId from checkpoint 3.

  1. Open Shopify Admin → Apps → your app → "Usage charges" or use Partners GraphiQL
  2. Run a test `appUsageRecordCreate` with `subscriptionLineItemId` (from `currentAppInstallation.activeSubscriptions.lineItems` query) and `price: { amount: "0.05", currencyCode: "USD" }`
  3. Verify the usage record appears on the dev store's billing page (Settings → Billing in dev store)

- [ ] **Checkpoint 5: Cancellation flow**

  1. From Partners dashboard, find the dev store's active subscription and cancel it
  2. Verify the `app_subscriptions/update` webhook fires with `status: CANCELLED`
  3. Within ~30s, /app/billing should show "Free — $0/mo" as current plan again
  4. Query D1: `plan = 'free'`, `shopify_charge_id IS NULL`, `trial_ends_at IS NULL`, `monthly_order_reset_at IS NULL`

If any checkpoint fails, file an issue describing exactly what was observed vs expected and do NOT mark Phase 7 complete.

---

## Phase 7 Done When

- All 21 tasks above are checked off
- Full vitest suite green
- Typecheck + lint + build green
- All 5 manual checkpoints verified on a real dev store (or 1 + 3 verified pre-PCD; 2/4/5 documented as PCD-blocked)
