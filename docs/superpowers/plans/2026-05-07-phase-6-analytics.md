# Phase 6 — Analytics Pipeline + Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture storefront events + paid-order revenue into D1, then render a full analytics dashboard at `/app` with KPI cards, recent-activity / conversions / sales charts, top-bundles table, and per-tier QB breakdown — all on free-tier Cloudflare Pages (no Analytics Engine, no cron).

**Architecture:** Three new D1 tables (`events` raw events, `revenue_daily` and `bundle_daily` rollups). `orders/paid` webhook synchronously upserts both rollup tables; `/api/storefront/event` writes raw events. Dashboard loader runs 6 parallel queries and renders Polaris Viz line charts + Polaris DataTables.

**Tech Stack:** Drizzle ORM over D1 (existing) · `@shopify/polaris-viz` (NEW dep) · Vitest with in-memory SQLite (existing test harness).

**Spec:** `docs/superpowers/specs/2026-05-07-phase-6-analytics-design.md`.

---

## Conventions

- Repo root: `/Users/sumit/Desktop/Shopify Apps/Bundler App`.
- Admin tests: `pnpm --filter admin test -- <pattern>` from repo root.
- Atomic commits per task; messages: `feat(scope): subject` / `test(scope): subject` / `chore(scope): subject`.

---

## Group A — Schema & dependency

### Task 1: D1 migration — analytics tables

**Files:**
- Modify: `apps/admin/drizzle/schema.ts`
- Create: `apps/admin/drizzle/migrations/0004_phase_6_analytics.sql` (auto-generated)

- [ ] **Step 1: Append three new tables to schema.ts**

Open `apps/admin/drizzle/schema.ts`. Add the import for `primaryKey` if not already present at the top:

```ts
import { sqliteTable, text, integer, real, index, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";
```

Append at the bottom of the file (after the existing `revenueDaily` placeholder if it exists; if a placeholder `revenue_daily` is already in the schema from CLAUDE.md spec template, replace it with this real definition):

```ts
export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["widget_impression", "widget_click", "add_to_cart"] }).notNull(),
  widgetType: text("widget_type", { enum: ["bundle", "qb", "mix_match"] }).notNull(),
  widgetId: text("widget_id").notNull(),
  productId: text("product_id"),
  tierQty: integer("tier_qty"),
  valueCents: integer("value_cents").notNull().default(0),
  ts: integer("ts").notNull(),
}, (t) => ({
  shopTsIdx: index("events_shop_ts_idx").on(t.shopId, t.ts),
  shopWidgetTsIdx: index("events_shop_widget_ts_idx").on(t.shopId, t.widgetId, t.ts),
}));

export const revenueDaily = sqliteTable("revenue_daily", {
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  totalRevenueCents: integer("total_revenue_cents").notNull().default(0),
  totalOrders: integer("total_orders").notNull().default(0),
  bundleRevenueCents: integer("bundle_revenue_cents").notNull().default(0),
  bundleOrders: integer("bundle_orders").notNull().default(0),
  qbRevenueCents: integer("qb_revenue_cents").notNull().default(0),
  qbOrders: integer("qb_orders").notNull().default(0),
}, (t) => ({
  pk: primaryKey({ columns: [t.shopId, t.date] }),
}));

export const bundleDaily = sqliteTable("bundle_daily", {
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  bundleId: text("bundle_id").notNull(),
  widgetType: text("widget_type", { enum: ["bundle", "qb", "mix_match"] }).notNull(),
  applicationCount: integer("application_count").notNull().default(0),
  revenueCents: integer("revenue_cents").notNull().default(0),
  orders: integer("orders").notNull().default(0),
}, (t) => ({
  pk: primaryKey({ columns: [t.shopId, t.date, t.bundleId] }),
  shopDateIdx: index("bundle_daily_shop_date_idx").on(t.shopId, t.date),
}));

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type RevenueDaily = typeof revenueDaily.$inferSelect;
export type NewRevenueDaily = typeof revenueDaily.$inferInsert;
export type BundleDaily = typeof bundleDaily.$inferSelect;
export type NewBundleDaily = typeof bundleDaily.$inferInsert;
```

- [ ] **Step 2: Generate the migration**

```bash
pnpm --filter admin run db:generate
```

Drizzle Kit emits a new migration file in `apps/admin/drizzle/migrations/`. If it isn't named `0004_phase_6_analytics.sql`, rename both the SQL file and the corresponding entry in `apps/admin/drizzle/migrations/meta/_journal.json` to `0004_phase_6_analytics`.

The SQL inside should look approximately like:

```sql
CREATE TABLE `events` (
  `id` text PRIMARY KEY NOT NULL,
  `shop_id` text NOT NULL,
  `type` text NOT NULL,
  `widget_type` text NOT NULL,
  `widget_id` text NOT NULL,
  `product_id` text,
  `tier_qty` integer,
  `value_cents` integer DEFAULT 0 NOT NULL,
  `ts` integer NOT NULL,
  FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `events_shop_ts_idx` ON `events` (`shop_id`,`ts`);
CREATE INDEX `events_shop_widget_ts_idx` ON `events` (`shop_id`,`widget_id`,`ts`);

CREATE TABLE `revenue_daily` (
  `shop_id` text NOT NULL,
  `date` text NOT NULL,
  `total_revenue_cents` integer DEFAULT 0 NOT NULL,
  `total_orders` integer DEFAULT 0 NOT NULL,
  `bundle_revenue_cents` integer DEFAULT 0 NOT NULL,
  `bundle_orders` integer DEFAULT 0 NOT NULL,
  `qb_revenue_cents` integer DEFAULT 0 NOT NULL,
  `qb_orders` integer DEFAULT 0 NOT NULL,
  PRIMARY KEY(`shop_id`, `date`),
  FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `bundle_daily` (
  `shop_id` text NOT NULL,
  `date` text NOT NULL,
  `bundle_id` text NOT NULL,
  `widget_type` text NOT NULL,
  `application_count` integer DEFAULT 0 NOT NULL,
  `revenue_cents` integer DEFAULT 0 NOT NULL,
  `orders` integer DEFAULT 0 NOT NULL,
  PRIMARY KEY(`shop_id`, `date`, `bundle_id`),
  FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `bundle_daily_shop_date_idx` ON `bundle_daily` (`shop_id`,`date`);
```

Accept whatever Drizzle Kit generates; the exact syntax may differ slightly.

- [ ] **Step 3: Apply migration locally**

```bash
pnpm --filter admin run db:migrate:local
```

Expected: success, no errors.

- [ ] **Step 4: Run existing admin tests to confirm nothing broke**

```bash
pnpm --filter admin test
```

Expected: all existing tests pass. New tables are picked up automatically by the in-memory SQLite migration helper.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/drizzle/schema.ts apps/admin/drizzle/migrations/
git commit -m "feat(db): add events + revenue_daily + bundle_daily for phase 6 analytics"
```

---

### Task 2: Install `@shopify/polaris-viz`

**Files:**
- Modify: `apps/admin/package.json`

- [ ] **Step 1: Install**

```bash
pnpm --filter admin add @shopify/polaris-viz
```

This adds the dependency and updates `pnpm-lock.yaml`.

- [ ] **Step 2: Verify it builds**

```bash
pnpm --filter admin build 2>&1 | tail -3
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/package.json pnpm-lock.yaml
git commit -m "chore(admin): add @shopify/polaris-viz for dashboard charts"
```

---

## Group B — Storefront event write path

### Task 3: `events-write.ts` helper

**Files:**
- Create: `apps/admin/app/lib/analytics/events-write.ts`
- Test: `apps/admin/test/analytics-events-write.test.ts`

- [ ] **Step 1: Create the test file**

Create `apps/admin/test/analytics-events-write.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "../drizzle/schema";
import { writeStorefrontEvent } from "../app/lib/analytics/events-write";

function setup() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  return { db, sqlite };
}

const SHOP = "s.myshopify.com";

describe("writeStorefrontEvent", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
    s.db.insert(schema.shops).values({ id: SHOP, scopes: "", installedAt: new Date() }).run();
  });

  it("inserts a row with all fields populated", async () => {
    await writeStorefrontEvent(s.db, SHOP, {
      type: "widget_impression",
      widgetType: "bundle",
      widgetId: "b1",
      productId: "p1",
      tierQty: 3,
      valueCents: 1234,
      ts: 1700000000000,
    });
    const rows = s.db.select().from(schema.events).all();
    expect(rows.length).toBe(1);
    expect(rows[0]!.shopId).toBe(SHOP);
    expect(rows[0]!.type).toBe("widget_impression");
    expect(rows[0]!.widgetType).toBe("bundle");
    expect(rows[0]!.widgetId).toBe("b1");
    expect(rows[0]!.productId).toBe("p1");
    expect(rows[0]!.tierQty).toBe(3);
    expect(rows[0]!.valueCents).toBe(1234);
    expect(rows[0]!.ts).toBe(1700000000000);
  });

  it("coerces missing optional fields to null/0", async () => {
    await writeStorefrontEvent(s.db, SHOP, {
      type: "widget_click",
      widgetType: "qb",
      widgetId: "q1",
      ts: 1700000000000,
    });
    const rows = s.db.select().from(schema.events).all();
    expect(rows[0]!.productId).toBeNull();
    expect(rows[0]!.tierQty).toBeNull();
    expect(rows[0]!.valueCents).toBe(0);
  });

  it("generates a unique id for each event", async () => {
    await writeStorefrontEvent(s.db, SHOP, { type: "add_to_cart", widgetType: "bundle", widgetId: "b1", ts: 1 });
    await writeStorefrontEvent(s.db, SHOP, { type: "add_to_cart", widgetType: "bundle", widgetId: "b1", ts: 2 });
    const rows = s.db.select().from(schema.events).all();
    expect(rows.length).toBe(2);
    expect(rows[0]!.id).not.toBe(rows[1]!.id);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm --filter admin test -- analytics-events-write
```

Expected: import error (function not exported).

- [ ] **Step 3: Implement events-write.ts**

Create `apps/admin/app/lib/analytics/events-write.ts`:

```ts
import { schema } from "~/db.server";

type EventInput = {
  type: "widget_impression" | "widget_click" | "add_to_cart";
  widgetType: "bundle" | "qb" | "mix_match";
  widgetId: string;
  productId?: string;
  tierQty?: number;
  valueCents?: number;
  ts: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function writeStorefrontEvent(db: any, shopId: string, event: EventInput): Promise<void> {
  await db.insert(schema.events).values({
    id: crypto.randomUUID(),
    shopId,
    type: event.type,
    widgetType: event.widgetType,
    widgetId: event.widgetId,
    productId: event.productId ?? null,
    tierQty: event.tierQty ?? null,
    valueCents: event.valueCents ?? 0,
    ts: event.ts,
  });
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm --filter admin test -- analytics-events-write
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/lib/analytics/events-write.ts apps/admin/test/analytics-events-write.test.ts
git commit -m "feat(analytics): writeStorefrontEvent inserts to events table"
```

---

### Task 4: Wire `/api/storefront/event` to write events

**Files:**
- Modify: `apps/admin/app/routes/api.storefront.event.tsx`
- Modify: `apps/admin/test/api-storefront-event.test.ts`

- [ ] **Step 1: Read existing route**

Read `apps/admin/app/routes/api.storefront.event.tsx` end-to-end. Note where the Phase 4 stub block lives (it currently checks `env.ANALYTICS` and writes a no-op data point).

- [ ] **Step 2: Add 1 failing test**

Append to `apps/admin/test/api-storefront-event.test.ts`:

```ts
  it("inserts a row in events table on a valid beacon", async () => {
    const ts = Date.now();
    const req = new Request("https://x/api/storefront/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "widget_impression", shop: SHOP, widgetType: "bundle", widgetId: "b1", productId: "p1", ts }),
    });
    const res = await action({ request: req, context: makeContext(s.db) } as never);
    expect((res as Response).status).toBe(204);
    const rows = s.db.select().from(schema.events).all();
    expect(rows.length).toBe(1);
    expect(rows[0]!.shopId).toBe(SHOP);
    expect(rows[0]!.type).toBe("widget_impression");
    expect(rows[0]!.ts).toBe(ts);
  });
```

- [ ] **Step 3: Run, expect failure**

```bash
pnpm --filter admin test -- api-storefront-event
```

Expected: the new test fails (no rows inserted yet) but the existing 4 tests still pass.

- [ ] **Step 4: Replace the route's no-op block with `writeStorefrontEvent`**

Open `apps/admin/app/routes/api.storefront.event.tsx`. Find the existing block that checks `env.ANALYTICS` (left over from Phase 4 stub) and replaces it with a call to `writeStorefrontEvent`. The full route looks roughly like:

```ts
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { type AppLoadContext } from "~/shopify.server";
import { getDb, schema } from "~/db.server";
import { writeStorefrontEvent } from "~/lib/analytics/events-write";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

const MAX_BODY = 4096;

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const env = ctx.cloudflare.env;
  const text = await request.text();
  if (text.length > MAX_BODY) {
    return new Response("Too large", { status: 413, headers: CORS_HEADERS });
  }
  let body: { type?: string; shop?: string; widgetType?: string; widgetId?: string; productId?: string; tierQty?: number; valueCents?: number; ts?: number };
  try {
    body = JSON.parse(text);
  } catch {
    return new Response("Bad JSON", { status: 400, headers: CORS_HEADERS });
  }

  const shop = (body.shop ?? "").toLowerCase();
  if (!shop) {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const db = getDb(env.DB);
  const row = (await db.select().from(schema.shops).where(eq(schema.shops.id, shop)).limit(1))[0];
  if (!row || row.uninstalledAt) {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Validate type / widgetType / widgetId
  const VALID_TYPES = ["widget_impression", "widget_click", "add_to_cart"] as const;
  const VALID_WIDGETS = ["bundle", "qb", "mix_match"] as const;
  if (!body.type || !(VALID_TYPES as readonly string[]).includes(body.type)) {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (!body.widgetType || !(VALID_WIDGETS as readonly string[]).includes(body.widgetType)) {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (!body.widgetId || typeof body.widgetId !== "string") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  const ts = typeof body.ts === "number" && Number.isFinite(body.ts) ? body.ts : Date.now();

  try {
    await writeStorefrontEvent(db, shop, {
      type: body.type as "widget_impression" | "widget_click" | "add_to_cart",
      widgetType: body.widgetType as "bundle" | "qb" | "mix_match",
      widgetId: body.widgetId,
      productId: body.productId,
      tierQty: body.tierQty,
      valueCents: body.valueCents,
      ts,
    });
  } catch (err) {
    // Fire-and-forget; never block the storefront on a beacon write
    // eslint-disable-next-line no-console
    console.warn("[event-write] failed:", err);
  }

  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
```

(If the existing route already handles HTTP basics well, just swap the analytics block.)

- [ ] **Step 5: Run, expect pass**

```bash
pnpm --filter admin test -- api-storefront-event
```

Expected: all 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/routes/api.storefront.event.tsx apps/admin/test/api-storefront-event.test.ts
git commit -m "feat(admin): /api/storefront/event writes to D1 events table"
```

---

## Group C — Order attribution + revenue rollup

### Task 5: `attribution.ts` (parse Shopify order JSON)

**Files:**
- Create: `apps/admin/app/lib/analytics/attribution.ts`
- Test: `apps/admin/test/analytics-attribution.test.ts`

- [ ] **Step 1: Create test file**

Create `apps/admin/test/analytics-attribution.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "../drizzle/schema";
import { parseOrderAttribution } from "../app/lib/analytics/attribution";

function setup() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  return db;
}

const SHOP = "s.myshopify.com";

function seedShop(db: ReturnType<typeof setup>) {
  db.insert(schema.shops).values({ id: SHOP, scopes: "", installedAt: new Date() }).run();
}

function seedBundle(db: ReturnType<typeof setup>, id: string, mode: "classic" | "mix_match" = "classic") {
  db.insert(schema.bundles).values({
    id, shopId: SHOP, name: id, status: "active",
    products: [], discountType: "percentage", discountValue: 10, combinable: false,
    triggerProductIds: [], styleOverrides: null, headline: null, ctaLabel: null,
    mode, collectionId: null, targetQty: null,
    createdAt: new Date(), updatedAt: new Date(),
  }).run();
}

function seedQb(db: ReturnType<typeof setup>, id: string) {
  db.insert(schema.quantityBreaks).values({
    id, shopId: SHOP, name: id, status: "active",
    productId: "p1", collectionId: null,
    tiers: [{ qty: 1, discountType: "percentage", discountValue: 0, label: "", isMostPopular: false }],
    combinable: false, styleOverrides: null,
    createdAt: new Date(), updatedAt: new Date(),
  }).run();
}

const lineWith = (bundleId: string, priceCents: number, qty = 1) => ({
  price_set: { shop_money: { amount: (priceCents / 100).toFixed(2), currency_code: "USD" } },
  quantity: qty,
  properties: [{ name: "_pumper_bundle_id", value: bundleId }],
});

const lineWithout = (priceCents: number, qty = 1) => ({
  price_set: { shop_money: { amount: (priceCents / 100).toFixed(2), currency_code: "USD" } },
  quantity: qty,
  properties: [],
});

describe("parseOrderAttribution", () => {
  let db: ReturnType<typeof setup>;
  beforeEach(() => { db = setup(); seedShop(db); });

  it("returns one entry for a single-bundle order", async () => {
    seedBundle(db, "b1");
    const order = { line_items: [lineWith("b1", 5000), lineWith("b1", 3000)] };
    const result = await parseOrderAttribution(db, SHOP, order);
    expect(result.totalCents).toBe(8000);
    expect(result.perBundle.length).toBe(1);
    expect(result.perBundle[0]!.bundleId).toBe("b1");
    expect(result.perBundle[0]!.widgetType).toBe("bundle");
    expect(result.perBundle[0]!.revenueCents).toBe(8000);
    expect(result.perBundle[0]!.units).toBe(2);
  });

  it("splits revenue between bundle and QB entries", async () => {
    seedBundle(db, "b1");
    seedQb(db, "q1");
    const order = { line_items: [lineWith("b1", 5000), lineWith("q1", 4000)] };
    const result = await parseOrderAttribution(db, SHOP, order);
    expect(result.totalCents).toBe(9000);
    expect(result.perBundle.length).toBe(2);
    const bundle = result.perBundle.find(p => p.bundleId === "b1")!;
    const qb = result.perBundle.find(p => p.bundleId === "q1")!;
    expect(bundle.widgetType).toBe("bundle");
    expect(qb.widgetType).toBe("qb");
  });

  it("identifies mix_match bundles correctly", async () => {
    seedBundle(db, "mm1", "mix_match");
    const order = { line_items: [lineWith("mm1", 2400), lineWith("mm1", 2400), lineWith("mm1", 2400)] };
    const result = await parseOrderAttribution(db, SHOP, order);
    expect(result.perBundle[0]!.widgetType).toBe("mix_match");
    expect(result.perBundle[0]!.revenueCents).toBe(7200);
    expect(result.perBundle[0]!.units).toBe(3);
  });

  it("returns empty perBundle and 0 totalCents when no _pumper_bundle_id lines", async () => {
    const order = { line_items: [lineWithout(5000), lineWithout(3000)] };
    const result = await parseOrderAttribution(db, SHOP, order);
    expect(result.totalCents).toBe(0);
    expect(result.perBundle).toEqual([]);
  });

  it("skips orphan bundle ids (deleted between cart-add and order paid)", async () => {
    seedBundle(db, "b1");
    const order = { line_items: [lineWith("b1", 5000), lineWith("orphan", 3000)] };
    const result = await parseOrderAttribution(db, SHOP, order);
    expect(result.totalCents).toBe(5000);
    expect(result.perBundle.length).toBe(1);
    expect(result.perBundle[0]!.bundleId).toBe("b1");
  });

  it("multiplies price × quantity correctly", async () => {
    seedBundle(db, "b1");
    const order = { line_items: [lineWith("b1", 1500, 3)] };  // 1500 cents × 3 qty
    const result = await parseOrderAttribution(db, SHOP, order);
    expect(result.totalCents).toBe(4500);
    expect(result.perBundle[0]!.units).toBe(3);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm --filter admin test -- analytics-attribution
```

Expected: import error.

- [ ] **Step 3: Implement attribution.ts**

Create `apps/admin/app/lib/analytics/attribution.ts`:

```ts
import { and, eq, inArray } from "drizzle-orm";
import { schema } from "~/db.server";

export type ParsedAttribution = {
  bundleId: string;
  widgetType: "bundle" | "qb" | "mix_match";
  revenueCents: number;
  units: number;
};

type ShopifyLineItem = {
  price_set: { shop_money: { amount: string } };
  quantity: number;
  properties: Array<{ name: string; value: string }>;
};

type ShopifyOrderPayload = { line_items: ShopifyLineItem[] };

function dollarsStrToCents(s: string): number {
  const parsed = parseFloat(s);
  if (Number.isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

function getBundleIdFromLine(line: ShopifyLineItem): string | null {
  const prop = (line.properties ?? []).find((p) => p.name === "_pumper_bundle_id");
  return prop?.value ?? null;
}

export async function parseOrderAttribution(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  shopId: string,
  order: ShopifyOrderPayload,
): Promise<{ totalCents: number; perBundle: ParsedAttribution[] }> {
  const grouped = new Map<string, { revenueCents: number; units: number }>();

  for (const line of order.line_items ?? []) {
    const bundleId = getBundleIdFromLine(line);
    if (!bundleId) continue;
    const linePriceCents = dollarsStrToCents(line.price_set.shop_money.amount) * line.quantity;
    const existing = grouped.get(bundleId);
    if (existing) {
      existing.revenueCents += linePriceCents;
      existing.units += line.quantity;
    } else {
      grouped.set(bundleId, { revenueCents: linePriceCents, units: line.quantity });
    }
  }

  if (grouped.size === 0) {
    return { totalCents: 0, perBundle: [] };
  }

  const ids = [...grouped.keys()];

  // Resolve widget type per bundle id
  const bundleRows = await db
    .select({ id: schema.bundles.id, mode: schema.bundles.mode })
    .from(schema.bundles)
    .where(and(eq(schema.bundles.shopId, shopId), inArray(schema.bundles.id, ids)));
  const qbRows = await db
    .select({ id: schema.quantityBreaks.id })
    .from(schema.quantityBreaks)
    .where(and(eq(schema.quantityBreaks.shopId, shopId), inArray(schema.quantityBreaks.id, ids)));

  const widgetTypeMap = new Map<string, "bundle" | "qb" | "mix_match">();
  for (const b of bundleRows) {
    widgetTypeMap.set(b.id, b.mode === "mix_match" ? "mix_match" : "bundle");
  }
  for (const q of qbRows) {
    widgetTypeMap.set(q.id, "qb");
  }

  const perBundle: ParsedAttribution[] = [];
  let totalCents = 0;
  for (const [bundleId, agg] of grouped.entries()) {
    const widgetType = widgetTypeMap.get(bundleId);
    if (!widgetType) continue;  // orphan: skip
    perBundle.push({ bundleId, widgetType, revenueCents: agg.revenueCents, units: agg.units });
    totalCents += agg.revenueCents;
  }

  return { totalCents, perBundle };
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm --filter admin test -- analytics-attribution
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/lib/analytics/attribution.ts apps/admin/test/analytics-attribution.test.ts
git commit -m "feat(analytics): parseOrderAttribution extracts bundle revenue from Shopify order"
```

---

### Task 6: `revenue-rollup.ts` (upsert daily rollups)

**Files:**
- Create: `apps/admin/app/lib/analytics/revenue-rollup.ts`
- Test: `apps/admin/test/analytics-revenue-rollup.test.ts`

- [ ] **Step 1: Create test file**

Create `apps/admin/test/analytics-revenue-rollup.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { eq, and } from "drizzle-orm";
import * as schema from "../drizzle/schema";
import { applyAttribution } from "../app/lib/analytics/revenue-rollup";

function setup() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  db.insert(schema.shops).values({ id: SHOP, scopes: "", installedAt: new Date() }).run();
  return db;
}

const SHOP = "s.myshopify.com";
const DATE = "2026-05-07";

describe("applyAttribution", () => {
  let db: ReturnType<typeof setup>;
  beforeEach(() => { db = setup(); });

  it("creates a new revenue_daily row on first attribution", async () => {
    await applyAttribution(db, SHOP, {
      totalCents: 5000,
      perBundle: [{ bundleId: "b1", widgetType: "bundle", revenueCents: 5000, units: 2 }],
    }, DATE);
    const rows = db.select().from(schema.revenueDaily).where(and(eq(schema.revenueDaily.shopId, SHOP), eq(schema.revenueDaily.date, DATE))).all();
    expect(rows.length).toBe(1);
    expect(rows[0]!.totalRevenueCents).toBe(5000);
    expect(rows[0]!.totalOrders).toBe(1);
    expect(rows[0]!.bundleRevenueCents).toBe(5000);
    expect(rows[0]!.bundleOrders).toBe(1);
    expect(rows[0]!.qbRevenueCents).toBe(0);
    expect(rows[0]!.qbOrders).toBe(0);
  });

  it("increments existing revenue_daily row on second attribution same day", async () => {
    await applyAttribution(db, SHOP, {
      totalCents: 5000,
      perBundle: [{ bundleId: "b1", widgetType: "bundle", revenueCents: 5000, units: 2 }],
    }, DATE);
    await applyAttribution(db, SHOP, {
      totalCents: 3000,
      perBundle: [{ bundleId: "b1", widgetType: "bundle", revenueCents: 3000, units: 1 }],
    }, DATE);
    const row = db.select().from(schema.revenueDaily).where(and(eq(schema.revenueDaily.shopId, SHOP), eq(schema.revenueDaily.date, DATE))).all()[0]!;
    expect(row.totalRevenueCents).toBe(8000);
    expect(row.totalOrders).toBe(2);
    expect(row.bundleOrders).toBe(2);
  });

  it("splits between bundle and qb on a mixed order", async () => {
    await applyAttribution(db, SHOP, {
      totalCents: 9000,
      perBundle: [
        { bundleId: "b1", widgetType: "bundle", revenueCents: 5000, units: 1 },
        { bundleId: "q1", widgetType: "qb", revenueCents: 4000, units: 1 },
      ],
    }, DATE);
    const row = db.select().from(schema.revenueDaily).where(and(eq(schema.revenueDaily.shopId, SHOP), eq(schema.revenueDaily.date, DATE))).all()[0]!;
    expect(row.totalRevenueCents).toBe(9000);
    expect(row.totalOrders).toBe(1);
    expect(row.bundleRevenueCents).toBe(5000);
    expect(row.bundleOrders).toBe(1);
    expect(row.qbRevenueCents).toBe(4000);
    expect(row.qbOrders).toBe(1);
  });

  it("upserts bundle_daily per bundle entry", async () => {
    await applyAttribution(db, SHOP, {
      totalCents: 9000,
      perBundle: [
        { bundleId: "b1", widgetType: "bundle", revenueCents: 5000, units: 1 },
        { bundleId: "q1", widgetType: "qb", revenueCents: 4000, units: 1 },
      ],
    }, DATE);
    const rows = db.select().from(schema.bundleDaily).where(eq(schema.bundleDaily.shopId, SHOP)).all();
    expect(rows.length).toBe(2);
    const b1 = rows.find(r => r.bundleId === "b1")!;
    expect(b1.applicationCount).toBe(1);
    expect(b1.revenueCents).toBe(5000);
    expect(b1.orders).toBe(1);
    expect(b1.widgetType).toBe("bundle");
  });

  it("bumps shops.attributedRevenueCents", async () => {
    await applyAttribution(db, SHOP, {
      totalCents: 5000,
      perBundle: [{ bundleId: "b1", widgetType: "bundle", revenueCents: 5000, units: 1 }],
    }, DATE);
    const shop = db.select().from(schema.shops).where(eq(schema.shops.id, SHOP)).all()[0]!;
    expect(shop.attributedRevenueCents).toBe(5000);
  });

  it("treats mix_match as bundle in revenue_daily aggregation", async () => {
    await applyAttribution(db, SHOP, {
      totalCents: 7200,
      perBundle: [{ bundleId: "mm1", widgetType: "mix_match", revenueCents: 7200, units: 3 }],
    }, DATE);
    const row = db.select().from(schema.revenueDaily).where(and(eq(schema.revenueDaily.shopId, SHOP), eq(schema.revenueDaily.date, DATE))).all()[0]!;
    expect(row.bundleRevenueCents).toBe(7200);
    expect(row.bundleOrders).toBe(1);
    expect(row.qbOrders).toBe(0);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm --filter admin test -- analytics-revenue-rollup
```

Expected: import error.

- [ ] **Step 3: Implement revenue-rollup.ts**

Create `apps/admin/app/lib/analytics/revenue-rollup.ts`:

```ts
import { and, eq, sql } from "drizzle-orm";
import { schema } from "~/db.server";
import type { ParsedAttribution } from "./attribution";

export async function applyAttribution(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  shopId: string,
  parsed: { totalCents: number; perBundle: ParsedAttribution[] },
  orderDate: string,
): Promise<void> {
  if (parsed.perBundle.length === 0) return;

  const bundleCents = parsed.perBundle
    .filter((p) => p.widgetType !== "qb")
    .reduce((s, p) => s + p.revenueCents, 0);
  const qbCents = parsed.perBundle
    .filter((p) => p.widgetType === "qb")
    .reduce((s, p) => s + p.revenueCents, 0);
  const hasBundle = bundleCents > 0 ? 1 : 0;
  const hasQb = qbCents > 0 ? 1 : 0;

  // 1. Upsert revenue_daily for (shopId, orderDate)
  await db
    .insert(schema.revenueDaily)
    .values({
      shopId,
      date: orderDate,
      totalRevenueCents: parsed.totalCents,
      totalOrders: 1,
      bundleRevenueCents: bundleCents,
      bundleOrders: hasBundle,
      qbRevenueCents: qbCents,
      qbOrders: hasQb,
    })
    .onConflictDoUpdate({
      target: [schema.revenueDaily.shopId, schema.revenueDaily.date],
      set: {
        totalRevenueCents: sql`${schema.revenueDaily.totalRevenueCents} + ${parsed.totalCents}`,
        totalOrders: sql`${schema.revenueDaily.totalOrders} + 1`,
        bundleRevenueCents: sql`${schema.revenueDaily.bundleRevenueCents} + ${bundleCents}`,
        bundleOrders: sql`${schema.revenueDaily.bundleOrders} + ${hasBundle}`,
        qbRevenueCents: sql`${schema.revenueDaily.qbRevenueCents} + ${qbCents}`,
        qbOrders: sql`${schema.revenueDaily.qbOrders} + ${hasQb}`,
      },
    });

  // 2. Upsert bundle_daily per perBundle entry
  for (const entry of parsed.perBundle) {
    await db
      .insert(schema.bundleDaily)
      .values({
        shopId,
        date: orderDate,
        bundleId: entry.bundleId,
        widgetType: entry.widgetType,
        applicationCount: 1,
        revenueCents: entry.revenueCents,
        orders: 1,
      })
      .onConflictDoUpdate({
        target: [schema.bundleDaily.shopId, schema.bundleDaily.date, schema.bundleDaily.bundleId],
        set: {
          applicationCount: sql`${schema.bundleDaily.applicationCount} + 1`,
          revenueCents: sql`${schema.bundleDaily.revenueCents} + ${entry.revenueCents}`,
          orders: sql`${schema.bundleDaily.orders} + 1`,
        },
      });
  }

  // 3. Bump shops.attributedRevenueCents
  await db
    .update(schema.shops)
    .set({
      attributedRevenueCents: sql`${schema.shops.attributedRevenueCents} + ${parsed.totalCents}`,
    })
    .where(eq(schema.shops.id, shopId));
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm --filter admin test -- analytics-revenue-rollup
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/lib/analytics/revenue-rollup.ts apps/admin/test/analytics-revenue-rollup.test.ts
git commit -m "feat(analytics): applyAttribution upserts revenue_daily + bundle_daily + shops counter"
```

---

### Task 7: `webhooks.orders.paid.tsx` route + tests

**Files:**
- Create: `apps/admin/app/routes/webhooks.orders.paid.tsx`
- Modify: `shopify.app.toml`
- Test: `apps/admin/test/webhooks-orders-paid.test.ts`

- [ ] **Step 1: Subscribe to topic in shopify.app.toml**

Open `shopify.app.toml`. Under `[webhooks]`, add a new subscription block. Place it after the existing `app/uninstalled` block:

```toml
  [[webhooks.subscriptions]]
  topics = ["orders/paid"]
  uri = "/webhooks/orders/paid"
```

- [ ] **Step 2: Read existing webhook pattern**

Read `apps/admin/app/routes/webhooks.app.uninstalled.tsx` to see the exact `authenticate.webhook` + `wasProcessed` / `markProcessed` pattern.

- [ ] **Step 3: Create test file**

Create `apps/admin/test/webhooks-orders-paid.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { eq, and } from "drizzle-orm";
import * as schema from "../drizzle/schema";

class InMemoryKV {
  private store = new Map<string, string>();
  async get(key: string) { return this.store.get(key) ?? null; }
  async put(key: string, val: string) { this.store.set(key, val); }
  async delete(key: string) { this.store.delete(key); }
}

function setup() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  db.insert(schema.shops).values({ id: SHOP, scopes: "", installedAt: new Date() }).run();
  db.insert(schema.bundles).values({
    id: "b1", shopId: SHOP, name: "B", status: "active",
    products: [], discountType: "percentage", discountValue: 10, combinable: false,
    triggerProductIds: [], styleOverrides: null, headline: null, ctaLabel: null,
    mode: "classic", collectionId: null, targetQty: null,
    createdAt: new Date(), updatedAt: new Date(),
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

const SHOP = "s.myshopify.com";

// authenticate.webhook is mocked at module load — see vi.mock below
vi.mock("~/shopify.server", () => ({
  authenticate: {
    webhook: vi.fn(async (request: Request) => ({
      topic: "ORDERS_PAID",
      shop: SHOP,
      payload: JSON.parse(await request.text()),
    })),
  },
}));

import { action } from "../app/routes/webhooks.orders.paid";

describe("/webhooks/orders/paid action", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => { s = setup(); });

  function makeReq(body: unknown, webhookId: string) {
    return new Request("https://x/webhooks/orders/paid", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Webhook-Id": webhookId,
      },
      body: JSON.stringify(body),
    });
  }

  it("attributes revenue when order has _pumper_bundle_id lines", async () => {
    const order = {
      processed_at: "2026-05-07T12:34:56Z",
      line_items: [{
        price_set: { shop_money: { amount: "50.00", currency_code: "USD" } },
        quantity: 1,
        properties: [{ name: "_pumper_bundle_id", value: "b1" }],
      }],
    };
    const res = await action({ request: makeReq(order, "wh-1"), context: makeContext(s.db) } as never);
    expect((res as Response).status).toBe(200);

    const rev = s.db.select().from(schema.revenueDaily).all();
    expect(rev.length).toBe(1);
    expect(rev[0]!.totalRevenueCents).toBe(5000);
  });

  it("returns 200 and no DB write when order has no attributable lines", async () => {
    const order = {
      processed_at: "2026-05-07T12:00:00Z",
      line_items: [{
        price_set: { shop_money: { amount: "20.00", currency_code: "USD" } },
        quantity: 1,
        properties: [],
      }],
    };
    const res = await action({ request: makeReq(order, "wh-2"), context: makeContext(s.db) } as never);
    expect((res as Response).status).toBe(200);
    const rev = s.db.select().from(schema.revenueDaily).all();
    expect(rev.length).toBe(0);
  });

  it("idempotent: second delivery of same webhook id is no-op", async () => {
    const order = {
      processed_at: "2026-05-07T12:00:00Z",
      line_items: [{
        price_set: { shop_money: { amount: "50.00", currency_code: "USD" } },
        quantity: 1,
        properties: [{ name: "_pumper_bundle_id", value: "b1" }],
      }],
    };
    const ctx = makeContext(s.db);
    await action({ request: makeReq(order, "wh-3"), context: ctx } as never);
    await action({ request: makeReq(order, "wh-3"), context: ctx } as never);  // duplicate id

    const rev = s.db.select().from(schema.revenueDaily).all();
    expect(rev.length).toBe(1);
    expect(rev[0]!.totalRevenueCents).toBe(5000);  // not 10000
  });

  it("falls back to created_at when processed_at missing", async () => {
    const order = {
      created_at: "2026-04-01T05:00:00Z",
      line_items: [{
        price_set: { shop_money: { amount: "50.00", currency_code: "USD" } },
        quantity: 1,
        properties: [{ name: "_pumper_bundle_id", value: "b1" }],
      }],
    };
    await action({ request: makeReq(order, "wh-4"), context: makeContext(s.db) } as never);
    const rev = s.db.select().from(schema.revenueDaily).all();
    expect(rev[0]!.date).toBe("2026-04-01");
  });
});
```

- [ ] **Step 4: Run, expect failure**

```bash
pnpm --filter admin test -- webhooks-orders-paid
```

Expected: import error.

- [ ] **Step 5: Implement the route**

Create `apps/admin/app/routes/webhooks.orders.paid.tsx`:

```ts
import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { wasProcessed, markProcessed } from "~/lib/webhooks/idempotency";
import { getDb } from "~/db.server";
import { parseOrderAttribution } from "~/lib/analytics/attribution";
import { applyAttribution } from "~/lib/analytics/revenue-rollup";

function deriveOrderDate(order: { processed_at?: string; created_at?: string }): string {
  const raw = order.processed_at ?? order.created_at;
  const date = raw ? new Date(raw) : new Date();
  // YYYY-MM-DD UTC
  return date.toISOString().slice(0, 10);
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { topic, shop, payload } = await authenticate.webhook(request, ctx);

  if (topic !== "ORDERS_PAID") {
    return new Response("Unexpected topic", { status: 400 });
  }

  if (await wasProcessed(ctx, request)) {
    return new Response(null, { status: 200 });
  }

  const db = getDb(ctx.cloudflare.env.DB);
  const parsed = await parseOrderAttribution(db, shop, payload as { line_items: Array<{ price_set: { shop_money: { amount: string } }; quantity: number; properties: Array<{ name: string; value: string }> }> });

  if (parsed.perBundle.length > 0) {
    const orderDate = deriveOrderDate(payload as { processed_at?: string; created_at?: string });
    await applyAttribution(db, shop, parsed, orderDate);
  }

  // Mark-processed only after successful write — transient failures replay via Shopify retry
  await markProcessed(ctx, request);
  return new Response(null, { status: 200 });
}
```

- [ ] **Step 6: Run, expect pass**

```bash
pnpm --filter admin test -- webhooks-orders-paid
```

Expected: all 4 tests pass.

- [ ] **Step 7: Run full admin test suite to confirm nothing broke**

```bash
pnpm --filter admin test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/admin/app/routes/webhooks.orders.paid.tsx apps/admin/test/webhooks-orders-paid.test.ts shopify.app.toml
git commit -m "feat(admin): orders/paid webhook attributes revenue to D1 rollups"
```

---

## Group D — Dashboard queries

### Task 8: `dashboard-query.ts` — KPIs + activity + conversions

**Files:**
- Create: `apps/admin/app/lib/analytics/dashboard-query.ts`
- Test: `apps/admin/test/analytics-dashboard-query.test.ts`

- [ ] **Step 1: Create test file**

Create `apps/admin/test/analytics-dashboard-query.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "../drizzle/schema";
import {
  getKpis,
  getActivitySeries,
  getConversionsAndSales,
  getTopBundles,
  getQbTierBreakdown,
  getBundleListForFilter,
} from "../app/lib/analytics/dashboard-query";

const SHOP = "s.myshopify.com";

function setup() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  db.insert(schema.shops).values({ id: SHOP, scopes: "", installedAt: new Date() }).run();
  return db;
}

function seedBundle(db: ReturnType<typeof setup>, id: string, name: string) {
  db.insert(schema.bundles).values({
    id, shopId: SHOP, name, status: "active",
    products: [], discountType: "percentage", discountValue: 10, combinable: false,
    triggerProductIds: [], styleOverrides: null, headline: null, ctaLabel: null,
    mode: "classic", collectionId: null, targetQty: null,
    createdAt: new Date(), updatedAt: new Date(),
  }).run();
}

function seedQb(db: ReturnType<typeof setup>, id: string, name: string) {
  db.insert(schema.quantityBreaks).values({
    id, shopId: SHOP, name, status: "active",
    productId: "p1", collectionId: null,
    tiers: [{ qty: 1, discountType: "percentage", discountValue: 0, label: "", isMostPopular: false }],
    combinable: false, styleOverrides: null,
    createdAt: new Date(), updatedAt: new Date(),
  }).run();
}

function seedRevenueDaily(db: ReturnType<typeof setup>, date: string, totalCents: number, bundleCents: number, qbCents: number) {
  db.insert(schema.revenueDaily).values({
    shopId: SHOP, date,
    totalRevenueCents: totalCents, totalOrders: 1,
    bundleRevenueCents: bundleCents, bundleOrders: bundleCents > 0 ? 1 : 0,
    qbRevenueCents: qbCents, qbOrders: qbCents > 0 ? 1 : 0,
  }).run();
}

function seedBundleDaily(db: ReturnType<typeof setup>, date: string, bundleId: string, widgetType: "bundle" | "qb" | "mix_match", revenueCents: number, orders: number, applicationCount: number) {
  db.insert(schema.bundleDaily).values({
    shopId: SHOP, date, bundleId, widgetType,
    applicationCount, revenueCents, orders,
  }).run();
}

function seedEvent(db: ReturnType<typeof setup>, ts: number, type: "widget_impression" | "widget_click" | "add_to_cart", widgetType: "bundle" | "qb" | "mix_match", widgetId: string, tierQty: number | null = null, valueCents = 0) {
  db.insert(schema.events).values({
    id: `e-${ts}-${widgetId}-${type}`, shopId: SHOP, type, widgetType, widgetId,
    productId: null, tierQty, valueCents, ts,
  }).run();
}

const RANGE = { startDate: "2026-05-01", endDate: "2026-05-07" };

describe("getKpis", () => {
  let db: ReturnType<typeof setup>;
  beforeEach(() => { db = setup(); });

  it("sums revenue and orders within range", async () => {
    seedRevenueDaily(db, "2026-05-01", 5000, 5000, 0);
    seedRevenueDaily(db, "2026-05-03", 3000, 0, 3000);
    seedRevenueDaily(db, "2026-04-28", 9999, 9999, 0);  // outside range, must be excluded
    const k = await getKpis(db, SHOP, RANGE);
    expect(k.totalRevenueCents).toBe(8000);
    expect(k.totalOrders).toBe(2);
  });

  it("returns sparkline series with one entry per day in range", async () => {
    seedRevenueDaily(db, "2026-05-03", 1000, 1000, 0);
    const k = await getKpis(db, SHOP, RANGE);
    const found = k.revenueSeries.find(s => s.date === "2026-05-03");
    expect(found?.cents).toBe(1000);
  });

  it("returns zeros for empty shop", async () => {
    const k = await getKpis(db, SHOP, RANGE);
    expect(k.totalRevenueCents).toBe(0);
    expect(k.totalOrders).toBe(0);
  });
});

describe("getActivitySeries", () => {
  let db: ReturnType<typeof setup>;
  beforeEach(() => { db = setup(); });

  it("returns per-day application counts", async () => {
    seedBundleDaily(db, "2026-05-01", "b1", "bundle", 5000, 1, 3);
    seedBundleDaily(db, "2026-05-01", "q1", "qb", 3000, 1, 5);
    const s = await getActivitySeries(db, SHOP, RANGE);
    const may1 = s.find(d => d.date === "2026-05-01")!;
    expect(may1.count).toBe(8);
    expect(may1.perBundle["b1"]).toBe(3);
    expect(may1.perBundle["q1"]).toBe(5);
  });

  it("filters by bundleIds when provided", async () => {
    seedBundleDaily(db, "2026-05-01", "b1", "bundle", 5000, 1, 3);
    seedBundleDaily(db, "2026-05-01", "q1", "qb", 3000, 1, 5);
    const s = await getActivitySeries(db, SHOP, RANGE, ["b1"]);
    const may1 = s.find(d => d.date === "2026-05-01")!;
    expect(may1.count).toBe(3);
  });
});

describe("getConversionsAndSales", () => {
  let db: ReturnType<typeof setup>;
  beforeEach(() => { db = setup(); });

  it("returns separate bundle and qb series", async () => {
    seedRevenueDaily(db, "2026-05-01", 8000, 5000, 3000);
    const r = await getConversionsAndSales(db, SHOP, RANGE);
    const may1 = r.conversions.find(c => c.date === "2026-05-01")!;
    expect(may1.bundleOrders).toBe(1);
    expect(may1.qbOrders).toBe(1);
    const sale1 = r.sales.find(c => c.date === "2026-05-01")!;
    expect(sale1.bundleCents).toBe(5000);
    expect(sale1.qbCents).toBe(3000);
  });
});

describe("getTopBundles", () => {
  let db: ReturnType<typeof setup>;
  beforeEach(() => { db = setup(); });

  it("returns bundles sorted by revenue descending", async () => {
    seedBundle(db, "b1", "Alpha");
    seedBundle(db, "b2", "Beta");
    seedBundleDaily(db, "2026-05-01", "b1", "bundle", 1000, 1, 1);
    seedBundleDaily(db, "2026-05-02", "b2", "bundle", 5000, 1, 1);
    const r = await getTopBundles(db, SHOP, RANGE);
    expect(r[0]!.bundleId).toBe("b2");
    expect(r[0]!.revenueCents).toBe(5000);
    expect(r[1]!.bundleId).toBe("b1");
  });

  it("falls back to '(deleted)' for missing bundle name", async () => {
    seedBundleDaily(db, "2026-05-01", "ghost", "bundle", 1000, 1, 1);
    const r = await getTopBundles(db, SHOP, RANGE);
    expect(r[0]!.name).toBe("(deleted)");
  });

  it("computes conversion rate", async () => {
    seedBundle(db, "b1", "B1");
    seedBundleDaily(db, "2026-05-01", "b1", "bundle", 1000, 5, 10);
    const r = await getTopBundles(db, SHOP, RANGE);
    expect(r[0]!.conversionRate).toBeCloseTo(0.5, 2);  // 5/10
  });
});

describe("getQbTierBreakdown", () => {
  let db: ReturnType<typeof setup>;
  beforeEach(() => { db = setup(); });

  it("groups events by widgetId + tierQty for QB add_to_cart", async () => {
    seedQb(db, "q1", "Q1");
    seedEvent(db, Date.parse("2026-05-01T00:00:00Z"), "add_to_cart", "qb", "q1", 1, 1000);
    seedEvent(db, Date.parse("2026-05-02T00:00:00Z"), "add_to_cart", "qb", "q1", 1, 1000);
    seedEvent(db, Date.parse("2026-05-02T00:00:00Z"), "add_to_cart", "qb", "q1", 2, 1800);
    seedEvent(db, Date.parse("2026-05-02T00:00:00Z"), "widget_click", "qb", "q1", 1, 0);  // not add_to_cart
    const r = await getQbTierBreakdown(db, SHOP, RANGE);
    expect(r.length).toBe(1);
    expect(r[0]!.qbId).toBe("q1");
    const tier1 = r[0]!.tiers.find(t => t.qty === 1)!;
    expect(tier1.addCount).toBe(2);
    const tier2 = r[0]!.tiers.find(t => t.qty === 2)!;
    expect(tier2.addCount).toBe(1);
  });
});

describe("getBundleListForFilter", () => {
  let db: ReturnType<typeof setup>;
  beforeEach(() => { db = setup(); });

  it("returns bundles + qbs together", async () => {
    seedBundle(db, "b1", "Alpha");
    seedQb(db, "q1", "Beta");
    const r = await getBundleListForFilter(db, SHOP);
    expect(r.length).toBe(2);
    expect(r.find(x => x.id === "b1")?.widgetType).toBe("bundle");
    expect(r.find(x => x.id === "q1")?.widgetType).toBe("qb");
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm --filter admin test -- analytics-dashboard-query
```

- [ ] **Step 3: Implement dashboard-query.ts**

Create `apps/admin/app/lib/analytics/dashboard-query.ts`:

```ts
import { and, between, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { schema } from "~/db.server";

export type DateRange = { startDate: string; endDate: string };

// 1. KPIs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getKpis(db: any, shopId: string, range: DateRange) {
  const rows: Array<{ date: string; totalRevenueCents: number; totalOrders: number; bundleOrders: number }> = await db
    .select({
      date: schema.revenueDaily.date,
      totalRevenueCents: schema.revenueDaily.totalRevenueCents,
      totalOrders: schema.revenueDaily.totalOrders,
      bundleOrders: schema.revenueDaily.bundleOrders,
    })
    .from(schema.revenueDaily)
    .where(
      and(
        eq(schema.revenueDaily.shopId, shopId),
        gte(schema.revenueDaily.date, range.startDate),
        lte(schema.revenueDaily.date, range.endDate),
      ),
    );

  const totalRevenueCents = rows.reduce((s, r) => s + r.totalRevenueCents, 0);
  const totalOrders = rows.reduce((s, r) => s + r.totalOrders, 0);
  const bundleOrders = rows.reduce((s, r) => s + r.bundleOrders, 0);
  const revenueSeries = rows.map((r) => ({ date: r.date, cents: r.totalRevenueCents }));
  const ordersSeries = rows.map((r) => ({ date: r.date, count: r.totalOrders }));

  return { totalRevenueCents, totalOrders, bundleOrders, revenueSeries, ordersSeries };
}

// 2. Activity
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getActivitySeries(db: any, shopId: string, range: DateRange, bundleIds?: string[]) {
  const baseConds = [
    eq(schema.bundleDaily.shopId, shopId),
    gte(schema.bundleDaily.date, range.startDate),
    lte(schema.bundleDaily.date, range.endDate),
  ];
  if (bundleIds && bundleIds.length > 0) {
    baseConds.push(inArray(schema.bundleDaily.bundleId, bundleIds));
  }

  const rows: Array<{ date: string; bundleId: string; applicationCount: number }> = await db
    .select({
      date: schema.bundleDaily.date,
      bundleId: schema.bundleDaily.bundleId,
      applicationCount: schema.bundleDaily.applicationCount,
    })
    .from(schema.bundleDaily)
    .where(and(...baseConds));

  const byDate = new Map<string, { count: number; perBundle: Record<string, number> }>();
  for (const r of rows) {
    const entry = byDate.get(r.date) ?? { count: 0, perBundle: {} };
    entry.count += r.applicationCount;
    entry.perBundle[r.bundleId] = (entry.perBundle[r.bundleId] ?? 0) + r.applicationCount;
    byDate.set(r.date, entry);
  }
  return [...byDate.entries()].map(([date, v]) => ({ date, ...v }));
}

// 3. Conversions + Sales
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getConversionsAndSales(db: any, shopId: string, range: DateRange) {
  const rows: Array<{ date: string; bundleOrders: number; qbOrders: number; bundleRevenueCents: number; qbRevenueCents: number }> = await db
    .select({
      date: schema.revenueDaily.date,
      bundleOrders: schema.revenueDaily.bundleOrders,
      qbOrders: schema.revenueDaily.qbOrders,
      bundleRevenueCents: schema.revenueDaily.bundleRevenueCents,
      qbRevenueCents: schema.revenueDaily.qbRevenueCents,
    })
    .from(schema.revenueDaily)
    .where(
      and(
        eq(schema.revenueDaily.shopId, shopId),
        gte(schema.revenueDaily.date, range.startDate),
        lte(schema.revenueDaily.date, range.endDate),
      ),
    );

  return {
    conversions: rows.map((r) => ({ date: r.date, bundleOrders: r.bundleOrders, qbOrders: r.qbOrders })),
    sales: rows.map((r) => ({ date: r.date, bundleCents: r.bundleRevenueCents, qbCents: r.qbRevenueCents })),
  };
}

// 4. Top bundles
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getTopBundles(db: any, shopId: string, range: DateRange) {
  const rows: Array<{ bundleId: string; widgetType: "bundle" | "qb" | "mix_match"; revenueCents: number; orders: number; applicationCount: number }> = await db
    .select({
      bundleId: schema.bundleDaily.bundleId,
      widgetType: schema.bundleDaily.widgetType,
      revenueCents: sql<number>`SUM(${schema.bundleDaily.revenueCents})`.as("revenueCents"),
      orders: sql<number>`SUM(${schema.bundleDaily.orders})`.as("orders"),
      applicationCount: sql<number>`SUM(${schema.bundleDaily.applicationCount})`.as("applicationCount"),
    })
    .from(schema.bundleDaily)
    .where(
      and(
        eq(schema.bundleDaily.shopId, shopId),
        gte(schema.bundleDaily.date, range.startDate),
        lte(schema.bundleDaily.date, range.endDate),
      ),
    )
    .groupBy(schema.bundleDaily.bundleId, schema.bundleDaily.widgetType)
    .orderBy(desc(sql`SUM(${schema.bundleDaily.revenueCents})`))
    .limit(10);

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.bundleId);
  const bundleNames: Array<{ id: string; name: string }> = await db
    .select({ id: schema.bundles.id, name: schema.bundles.name })
    .from(schema.bundles)
    .where(and(eq(schema.bundles.shopId, shopId), inArray(schema.bundles.id, ids)));
  const qbNames: Array<{ id: string; name: string }> = await db
    .select({ id: schema.quantityBreaks.id, name: schema.quantityBreaks.name })
    .from(schema.quantityBreaks)
    .where(and(eq(schema.quantityBreaks.shopId, shopId), inArray(schema.quantityBreaks.id, ids)));

  const nameMap = new Map<string, string>();
  for (const b of bundleNames) nameMap.set(b.id, b.name);
  for (const q of qbNames) nameMap.set(q.id, q.name);

  return rows.map((r) => ({
    bundleId: r.bundleId,
    widgetType: r.widgetType,
    name: nameMap.get(r.bundleId) ?? "(deleted)",
    revenueCents: r.revenueCents,
    orders: r.orders,
    applicationCount: r.applicationCount,
    conversionRate: r.applicationCount > 0 ? r.orders / r.applicationCount : 0,
  }));
}

// 5. QB tier breakdown
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getQbTierBreakdown(db: any, shopId: string, range: DateRange) {
  const startTs = Date.parse(range.startDate + "T00:00:00Z");
  const endTs = Date.parse(range.endDate + "T23:59:59Z");

  const rows: Array<{ widgetId: string; tierQty: number | null; addCount: number; valueCents: number }> = await db
    .select({
      widgetId: schema.events.widgetId,
      tierQty: schema.events.tierQty,
      addCount: sql<number>`COUNT(*)`.as("addCount"),
      valueCents: sql<number>`SUM(${schema.events.valueCents})`.as("valueCents"),
    })
    .from(schema.events)
    .where(
      and(
        eq(schema.events.shopId, shopId),
        eq(schema.events.widgetType, "qb"),
        eq(schema.events.type, "add_to_cart"),
        gte(schema.events.ts, startTs),
        lte(schema.events.ts, endTs),
      ),
    )
    .groupBy(schema.events.widgetId, schema.events.tierQty);

  if (rows.length === 0) return [];

  const ids = [...new Set(rows.map((r) => r.widgetId))];
  const qbNames: Array<{ id: string; name: string }> = await db
    .select({ id: schema.quantityBreaks.id, name: schema.quantityBreaks.name })
    .from(schema.quantityBreaks)
    .where(and(eq(schema.quantityBreaks.shopId, shopId), inArray(schema.quantityBreaks.id, ids)));
  const nameMap = new Map<string, string>();
  for (const q of qbNames) nameMap.set(q.id, q.name);

  const grouped = new Map<string, { qbId: string; qbName: string; tiers: Array<{ qty: number; addCount: number; estimatedRevenueCents: number }> }>();
  for (const r of rows) {
    const key = r.widgetId;
    const entry = grouped.get(key) ?? { qbId: r.widgetId, qbName: nameMap.get(r.widgetId) ?? "(deleted)", tiers: [] };
    entry.tiers.push({ qty: r.tierQty ?? 1, addCount: r.addCount, estimatedRevenueCents: r.valueCents });
    grouped.set(key, entry);
  }
  return [...grouped.values()];
}

// 6. Bundle list for filter
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getBundleListForFilter(db: any, shopId: string) {
  const bundles: Array<{ id: string; name: string; status: string; mode: string }> = await db
    .select({ id: schema.bundles.id, name: schema.bundles.name, status: schema.bundles.status, mode: schema.bundles.mode })
    .from(schema.bundles)
    .where(eq(schema.bundles.shopId, shopId));
  const qbs: Array<{ id: string; name: string; status: string }> = await db
    .select({ id: schema.quantityBreaks.id, name: schema.quantityBreaks.name, status: schema.quantityBreaks.status })
    .from(schema.quantityBreaks)
    .where(eq(schema.quantityBreaks.shopId, shopId));

  return [
    ...bundles.map((b) => ({
      id: b.id,
      name: b.name,
      widgetType: (b.mode === "mix_match" ? "mix_match" : "bundle") as "bundle" | "mix_match",
      status: b.status,
    })),
    ...qbs.map((q) => ({
      id: q.id,
      name: q.name,
      widgetType: "qb" as const,
      status: q.status,
    })),
  ];
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm --filter admin test -- analytics-dashboard-query
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/lib/analytics/dashboard-query.ts apps/admin/test/analytics-dashboard-query.test.ts
git commit -m "feat(analytics): dashboard-query module with 6 query helpers"
```

---

## Group E — Dashboard UI components

### Task 9: `DateRangePicker` component

**Files:**
- Create: `apps/admin/app/components/dashboard/DateRangePicker.tsx`

- [ ] **Step 1: Create the component**

Create `apps/admin/app/components/dashboard/DateRangePicker.tsx`:

```tsx
import { Select } from "@shopify/polaris";

export type DateRangeValue = "7d" | "30d" | "90d";

type Props = {
  value: DateRangeValue;
  onChange: (range: DateRangeValue) => void;
};

const OPTIONS = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
];

export function DateRangePicker({ value, onChange }: Props) {
  return (
    <div style={{ width: 180 }}>
      <Select
        label="Date range"
        labelHidden
        options={OPTIONS}
        value={value}
        onChange={(v) => onChange(v as DateRangeValue)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter admin typecheck
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/app/components/dashboard/DateRangePicker.tsx
git commit -m "feat(dashboard): DateRangePicker component"
```

---

### Task 10: `KpiCard` component

**Files:**
- Create: `apps/admin/app/components/dashboard/KpiCard.tsx`

- [ ] **Step 1: Create the component**

Create `apps/admin/app/components/dashboard/KpiCard.tsx`:

```tsx
import { Card, BlockStack, Text } from "@shopify/polaris";
import { SparkLineChart } from "@shopify/polaris-viz";

type SeriesPoint = { x: string; y: number };

type Props = {
  label: string;
  value: string;
  series: SeriesPoint[];
  changePct?: number;
};

export function KpiCard({ label, value, series, changePct }: Props) {
  const sparkData = [{ name: label, data: series }];
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm" tone="subdued">{label}</Text>
        <Text as="p" variant="heading2xl">{value}</Text>
        {typeof changePct === "number" && (
          <Text as="span" variant="bodySm" tone={changePct >= 0 ? "success" : "critical"}>
            {changePct >= 0 ? "+" : ""}{(changePct * 100).toFixed(1)}% vs previous
          </Text>
        )}
        <div style={{ height: 60 }}>
          <SparkLineChart data={sparkData} accessibilityLabel={`${label} trend`} />
        </div>
      </BlockStack>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter admin typecheck
```

Expected: pass. If Polaris Viz `SparkLineChart` props have changed in the installed version, adapt the accessor — refer to `node_modules/@shopify/polaris-viz/dist/components/SparkLineChart`.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/app/components/dashboard/KpiCard.tsx
git commit -m "feat(dashboard): KpiCard component with sparkline"
```

---

### Task 11: `ActivityChart` component (line chart + bundle filter)

**Files:**
- Create: `apps/admin/app/components/dashboard/ActivityChart.tsx`

- [ ] **Step 1: Create the component**

Create `apps/admin/app/components/dashboard/ActivityChart.tsx`:

```tsx
import { Card, BlockStack, InlineStack, Text, Checkbox } from "@shopify/polaris";
import { LineChart } from "@shopify/polaris-viz";

type Props = {
  series: Array<{ date: string; count: number; perBundle: Record<string, number> }>;
  bundles: Array<{ id: string; name: string; widgetType: string }>;
  selectedBundleIds: string[];
  onChange: (ids: string[]) => void;
};

export function ActivityChart({ series, bundles, selectedBundleIds, onChange }: Props) {
  const allSelected = selectedBundleIds.length === 0 || selectedBundleIds.length === bundles.length;
  const toggleAll = () => onChange(allSelected ? [bundles[0]?.id ?? ""] : []);
  const toggleOne = (id: string) => {
    const set = new Set(selectedBundleIds.length === 0 ? bundles.map((b) => b.id) : selectedBundleIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    const next = [...set];
    onChange(next.length === bundles.length ? [] : next);
  };

  const chartData = [{
    name: "Discounts applied",
    data: series.map((s) => ({ key: s.date, value: s.count })),
  }];

  if (series.length === 0 || series.every((s) => s.count === 0)) {
    return (
      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingMd">Recent activity</Text>
          <Text as="p" tone="subdued">No data yet — keep your bundles live and check back tomorrow.</Text>
        </BlockStack>
      </Card>
    );
  }

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h3" variant="headingMd">Recent activity — Discounts applied</Text>
        <div style={{ height: 280 }}>
          <LineChart data={chartData} />
        </div>
        <BlockStack gap="100">
          <Text as="span" variant="bodySm" tone="subdued">Bundles</Text>
          <InlineStack gap="200" wrap>
            <Checkbox label="All" checked={allSelected} onChange={toggleAll} />
            {bundles.map((b) => (
              <Checkbox
                key={b.id}
                label={b.name}
                checked={allSelected || selectedBundleIds.includes(b.id)}
                onChange={() => toggleOne(b.id)}
              />
            ))}
          </InlineStack>
        </BlockStack>
      </BlockStack>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter admin typecheck
git add apps/admin/app/components/dashboard/ActivityChart.tsx
git commit -m "feat(dashboard): ActivityChart line chart with bundle filter"
```

---

### Task 12: `ConversionsSalesPair` component

**Files:**
- Create: `apps/admin/app/components/dashboard/ConversionsSalesPair.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Card, BlockStack, Text, Grid } from "@shopify/polaris";
import { LineChart } from "@shopify/polaris-viz";

type Props = {
  conversions: Array<{ date: string; bundleOrders: number; qbOrders: number }>;
  sales: Array<{ date: string; bundleCents: number; qbCents: number }>;
  currency: string;
  locale: string;
};

function formatMoney(cents: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function ConversionsSalesPair({ conversions, sales, currency, locale }: Props) {
  const conversionData = [
    { name: "Bundles", data: conversions.map((c) => ({ key: c.date, value: c.bundleOrders })) },
    { name: "Quantity Breaks", data: conversions.map((c) => ({ key: c.date, value: c.qbOrders })) },
  ];
  const salesData = [
    { name: "Bundles", data: sales.map((c) => ({ key: c.date, value: c.bundleCents / 100 })) },
    { name: "Quantity Breaks", data: sales.map((c) => ({ key: c.date, value: c.qbCents / 100 })) },
  ];

  const totalConversions = conversions.reduce((s, c) => s + c.bundleOrders + c.qbOrders, 0);
  const totalSalesCents = sales.reduce((s, c) => s + c.bundleCents + c.qbCents, 0);

  return (
    <Grid>
      <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
        <Card>
          <BlockStack gap="300">
            <Text as="h3" variant="headingMd">Conversions over time</Text>
            <div style={{ height: 240 }}>
              <LineChart data={conversionData} />
            </div>
            <Text as="p" variant="bodySm" tone="subdued">
              Total: {totalConversions} orders
            </Text>
          </BlockStack>
        </Card>
      </Grid.Cell>
      <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
        <Card>
          <BlockStack gap="300">
            <Text as="h3" variant="headingMd">Sales over time</Text>
            <div style={{ height: 240 }}>
              <LineChart data={salesData} />
            </div>
            <Text as="p" variant="bodySm" tone="subdued">
              Total: {formatMoney(totalSalesCents, currency, locale)}
            </Text>
          </BlockStack>
        </Card>
      </Grid.Cell>
    </Grid>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter admin typecheck
git add apps/admin/app/components/dashboard/ConversionsSalesPair.tsx
git commit -m "feat(dashboard): ConversionsSalesPair side-by-side line charts"
```

---

### Task 13: `TopBundlesTable` component

**Files:**
- Create: `apps/admin/app/components/dashboard/TopBundlesTable.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Card, BlockStack, Text, DataTable } from "@shopify/polaris";

type Props = {
  rows: Array<{
    bundleId: string;
    widgetType: string;
    name: string;
    revenueCents: number;
    orders: number;
    applicationCount: number;
    conversionRate: number;
  }>;
  currency: string;
  locale: string;
};

function formatMoney(cents: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function TopBundlesTable({ rows, currency, locale }: Props) {
  if (rows.length === 0) {
    return (
      <Card>
        <BlockStack gap="200">
          <Text as="h3" variant="headingMd">Top bundles</Text>
          <Text as="p" tone="subdued">No bundles have generated revenue yet.</Text>
        </BlockStack>
      </Card>
    );
  }

  const tableRows = rows.map((r) => [
    r.name,
    r.widgetType,
    formatMoney(r.revenueCents, currency, locale),
    String(r.orders),
    String(r.applicationCount),
    `${(r.conversionRate * 100).toFixed(1)}%`,
  ]);

  return (
    <Card>
      <BlockStack gap="200">
        <Text as="h3" variant="headingMd">Top bundles</Text>
        <DataTable
          columnContentTypes={["text", "text", "numeric", "numeric", "numeric", "numeric"]}
          headings={["Name", "Type", "Revenue", "Orders", "Applied", "Conv. rate"]}
          rows={tableRows}
        />
      </BlockStack>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter admin typecheck
git add apps/admin/app/components/dashboard/TopBundlesTable.tsx
git commit -m "feat(dashboard): TopBundlesTable with revenue / orders / conversion rate"
```

---

### Task 14: `QbTierBreakdownTable` component

**Files:**
- Create: `apps/admin/app/components/dashboard/QbTierBreakdownTable.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Card, BlockStack, Text, DataTable } from "@shopify/polaris";

type Props = {
  rows: Array<{
    qbId: string;
    qbName: string;
    tiers: Array<{ qty: number; addCount: number; estimatedRevenueCents: number }>;
  }>;
  currency: string;
  locale: string;
};

function formatMoney(cents: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function QbTierBreakdownTable({ rows, currency, locale }: Props) {
  if (rows.length === 0) {
    return (
      <Card>
        <BlockStack gap="200">
          <Text as="h3" variant="headingMd">Quantity break tier breakdown</Text>
          <Text as="p" tone="subdued">No QB add-to-cart events captured yet.</Text>
        </BlockStack>
      </Card>
    );
  }

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h3" variant="headingMd">Quantity break tier breakdown</Text>
        {rows.map((qb) => (
          <BlockStack gap="200" key={qb.qbId}>
            <Text as="h4" variant="headingSm">{qb.qbName}</Text>
            <DataTable
              columnContentTypes={["text", "numeric", "numeric"]}
              headings={["Tier", "Adds", "Est. revenue"]}
              rows={qb.tiers
                .sort((a, b) => a.qty - b.qty)
                .map((t) => [
                  `Tier ${t.qty} (qty ${t.qty})`,
                  String(t.addCount),
                  formatMoney(t.estimatedRevenueCents, currency, locale),
                ])}
            />
          </BlockStack>
        ))}
      </BlockStack>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter admin typecheck
git add apps/admin/app/components/dashboard/QbTierBreakdownTable.tsx
git commit -m "feat(dashboard): QbTierBreakdownTable per-tier add count and revenue"
```

---

## Group F — Wire it all together

### Task 15: Rewrite `app._index.tsx` as the analytics dashboard

**Files:**
- Modify: `apps/admin/app/routes/app._index.tsx`

- [ ] **Step 1: Replace contents**

Replace the entire contents of `apps/admin/app/routes/app._index.tsx` with:

```tsx
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import { Page, Layout, BlockStack, Grid, InlineStack } from "@shopify/polaris";
import { PolarisVizProvider } from "@shopify/polaris-viz";
import "@shopify/polaris-viz/build/esm/styles.css";
import { eq } from "drizzle-orm";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb, schema } from "~/db.server";
import {
  getKpis,
  getActivitySeries,
  getConversionsAndSales,
  getTopBundles,
  getQbTierBreakdown,
  getBundleListForFilter,
} from "~/lib/analytics/dashboard-query";
import { KpiCard } from "~/components/dashboard/KpiCard";
import { ActivityChart } from "~/components/dashboard/ActivityChart";
import { ConversionsSalesPair } from "~/components/dashboard/ConversionsSalesPair";
import { TopBundlesTable } from "~/components/dashboard/TopBundlesTable";
import { QbTierBreakdownTable } from "~/components/dashboard/QbTierBreakdownTable";
import { DateRangePicker, type DateRangeValue } from "~/components/dashboard/DateRangePicker";

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);

  // Upsert shop row + clear uninstalledAt (existing pre-Phase-6 behavior)
  const db = getDb(ctx.cloudflare.env.DB);
  await db
    .insert(schema.shops)
    .values({
      id: session.shop,
      scopes: session.scope ?? "",
      installedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.shops.id,
      set: { scopes: session.scope ?? "", uninstalledAt: null },
    });

  const url = new URL(request.url);
  const rangeParam = (url.searchParams.get("range") ?? "7d") as DateRangeValue;
  const days = rangeParam === "30d" ? 30 : rangeParam === "90d" ? 90 : 7;
  const range = { startDate: dateNDaysAgo(days - 1), endDate: todayUtc() };

  const bundlesParam = url.searchParams.get("bundles") ?? "";
  const selectedBundleIds = bundlesParam ? bundlesParam.split(",").filter(Boolean) : [];

  const shopRow = (await db.select().from(schema.shops).where(eq(schema.shops.id, session.shop)).limit(1))[0];
  const currency = shopRow?.currency ?? "USD";
  const locale = shopRow?.primaryLocale ?? "en";

  const [kpis, activity, convSales, topBundles, qbTier, bundleList] = await Promise.all([
    getKpis(db, session.shop, range).catch(() => ({ totalRevenueCents: 0, totalOrders: 0, bundleOrders: 0, revenueSeries: [], ordersSeries: [] })),
    getActivitySeries(db, session.shop, range, selectedBundleIds.length > 0 ? selectedBundleIds : undefined).catch(() => []),
    getConversionsAndSales(db, session.shop, range).catch(() => ({ conversions: [], sales: [] })),
    getTopBundles(db, session.shop, range).catch(() => []),
    getQbTierBreakdown(db, session.shop, range).catch(() => []),
    getBundleListForFilter(db, session.shop).catch(() => []),
  ]);

  return json({
    shop: session.shop, currency, locale, rangeParam, selectedBundleIds,
    kpis, activity, convSales, topBundles, qbTier, bundleList,
  });
}

function formatMoney(cents: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export default function Dashboard() {
  const { currency, locale, rangeParam, selectedBundleIds, kpis, activity, convSales, topBundles, qbTier, bundleList } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const setRange = (range: DateRangeValue) => {
    const next = new URLSearchParams(searchParams);
    next.set("range", range);
    setSearchParams(next);
  };

  const setBundles = (ids: string[]) => {
    const next = new URLSearchParams(searchParams);
    if (ids.length === 0) next.delete("bundles");
    else next.set("bundles", ids.join(","));
    setSearchParams(next);
  };

  const aov = kpis.totalOrders > 0 ? kpis.totalRevenueCents / kpis.totalOrders : 0;

  return (
    <PolarisVizProvider>
      <Page title="Analytics">
        <BlockStack gap="500">
          <InlineStack align="end">
            <DateRangePicker value={rangeParam} onChange={setRange} />
          </InlineStack>

          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
              <KpiCard
                label="Total revenue"
                value={formatMoney(kpis.totalRevenueCents, currency, locale)}
                series={kpis.revenueSeries.map((s) => ({ x: s.date, y: s.cents / 100 }))}
              />
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
              <KpiCard
                label="Average order value"
                value={formatMoney(aov, currency, locale)}
                series={kpis.ordersSeries.map((s, i) => ({ x: s.date, y: s.count > 0 ? (kpis.revenueSeries[i]?.cents ?? 0) / s.count / 100 : 0 }))}
              />
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
              <KpiCard
                label="Total conversions"
                value={String(kpis.totalOrders)}
                series={kpis.ordersSeries.map((s) => ({ x: s.date, y: s.count }))}
              />
            </Grid.Cell>
          </Grid>

          <ActivityChart
            series={activity}
            bundles={bundleList}
            selectedBundleIds={selectedBundleIds}
            onChange={setBundles}
          />

          <ConversionsSalesPair
            conversions={convSales.conversions}
            sales={convSales.sales}
            currency={currency}
            locale={locale}
          />

          <TopBundlesTable rows={topBundles} currency={currency} locale={locale} />

          <QbTierBreakdownTable rows={qbTier} currency={currency} locale={locale} />
        </BlockStack>
      </Page>
    </PolarisVizProvider>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter admin typecheck
```

Expected: pass. If `@shopify/polaris-viz` styles import path differs, check `node_modules/@shopify/polaris-viz/build/` for the correct CSS file.

- [ ] **Step 3: Run tests**

```bash
pnpm --filter admin test
```

Expected: all tests still pass.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/routes/app._index.tsx
git commit -m "feat(admin): rewrite /app dashboard with full analytics layout"
```

---

## Group G — Final verify + deploy

### Task 16: Final verify

**No new files.**

- [ ] **Step 1: Full repo build**

```bash
pnpm --filter admin build
pnpm --filter widget-src build
cd extensions/discount-function && cargo build --target=wasm32-unknown-unknown --release && cd -
cd extensions/cart-transform-function && cargo build --target=wasm32-unknown-unknown --release && cd -
```

Expected: all 4 succeed.

- [ ] **Step 2: Full test pass**

```bash
pnpm --filter admin test
pnpm --filter widget-src test
cd extensions/discount-function && cargo test --release && cd -
cd extensions/cart-transform-function && cargo test --release && cd -
```

Expected: all green.

- [ ] **Step 3: Bundle size check**

```bash
pnpm --filter widget-src check:size
```

Expected: gzipped widget.js < 30000 bytes.

- [ ] **Step 4: Stop here** — leave actual deploy for the user.

```bash
git status
```

Expected: clean.

---

### Task 17: Manual gate (after deploy)

User-only after deployment:

- [ ] 1. Place a test order on `deepseatools.myshopify.com` containing a bundle. Within 5s, `revenue_daily` row appears in D1 (verify via `wrangler d1 execute bundler-prod --remote --command="SELECT * FROM revenue_daily ORDER BY date DESC LIMIT 5"`).
- [ ] 2. Same order's bundle appears in /app dashboard's Top Bundles within 1 refresh.
- [ ] 3. KPI cards reflect the order's revenue + orders count.
- [ ] 4. Visit a PDP — `POST /api/storefront/event` returns 204; `events` row appears in D1.
- [ ] 5. Filter Recent Activity to one bundle → URL gets `?bundles=` searchparam, chart updates.
- [ ] 6. Switch range 7d → 30d → 90d, all charts update.
- [ ] 7. Lighthouse on dashboard: Performance ≥ 90.
- [ ] 8. Refund the test order — verify revenue_daily does NOT decrement (expected; refund handling = Phase 8).

After all 8 pass:

```bash
git tag phase-6-complete && git push --tags
```

---

## Spec coverage check

| Spec § | Subject | Tasks |
|---|---|---|
| §3 file layout | All new + modified files | 1, 3, 5, 6, 7, 8, 9-15 |
| §4 schema | events / revenue_daily / bundle_daily | 1 |
| §5 webhook + attribution | parse + rollup + handler | 5, 6, 7 |
| §6 storefront event endpoint | events-write + route update | 3, 4 |
| §7 dashboard queries | 6 query helpers | 8 |
| §8 dashboard UI | 6 components + layout | 9, 10, 11, 12, 13, 14, 15 |
| §9 error handling | covered in tests + try/catch in loader | 4, 7, 15 |
| §10 testing | unit + integration | 3, 5, 6, 7, 8 |
| §11 out of scope | refunds / cron / pixel deferred | n/a |

---

**Plan complete.**
